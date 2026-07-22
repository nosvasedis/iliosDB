import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import {
    AlertTriangle,
    Camera,
    CheckCircle2,
    Focus,
    ImagePlus,
    Loader2,
    RefreshCw,
    Scan,
    Sparkles,
    SwitchCamera,
    Target,
    X,
    Zap,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import {
    computeObjectCoverCrop,
    describeCameraError,
    getAdaptiveDecodeInterval,
    isCurrentScannerSession,
    isDuplicateScan,
} from '../features/scanning/scannerEngine';
import {
    DecoderWorkerResponse,
    ScannerCapabilities,
    ScannerStatus,
} from '../features/scanning/scannerTypes';
import { SCANNER_COPY, SCANNER_STATUS_COPY } from '../features/scanning/scannerCopy';
import { findProductByScannedCode } from '../utils/pricingEngine';
import SkuColorizedText from './SkuColorizedText';

interface Props {
    onScan: (result: string) => void;
    onClose: () => void;
    continuous?: boolean;
    products?: Product[];
}

interface BarcodeDetectorResult {
    rawValue?: string;
}

interface BarcodeDetectorInstance {
    detect(source: HTMLVideoElement): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorConstructor {
    new(options: { formats: string[] }): BarcodeDetectorInstance;
    getSupportedFormats(): Promise<string[]>;
}

type VideoWithFrameCallback = HTMLVideoElement & {
    requestVideoFrameCallback?: (callback: (now: number) => void) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
};

const EMPTY_CAPABILITIES: ScannerCapabilities = {
    torch: false,
    zoom: null,
    continuousFocus: false,
    tapToFocus: false,
};

export default function BarcodeScanner({ onScan, onClose, continuous = false, products }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const reticleRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const trackRef = useRef<MediaStreamTrack | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const workerReadyRef = useRef(false);
    const workerInFlightRef = useRef(false);
    const nativeDetectorRef = useRef<BarcodeDetectorInstance | null>(null);
    const nativeInFlightRef = useRef(false);
    const nativeLastAttemptRef = useRef(0);
    const nextWorkerAttemptRef = useRef(0);
    const workerIntervalRef = useRef(140);
    const frameCallbackRef = useRef<number | null>(null);
    const fallbackTimerRef = useRef<number | null>(null);
    const successTimerRef = useRef<number | null>(null);
    const photoRetryTimerRef = useRef<number | null>(null);
    const sessionRef = useRef(0);
    const requestRef = useRef(0);
    const attemptRef = useRef(0);
    const startedAtRef = useRef(0);
    const pauseUntilRef = useRef(0);
    const lastAcceptedRef = useRef<{ text: string; at: number } | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const onScanRef = useRef(onScan);
    const onCloseRef = useRef(onClose);
    const continuousRef = useRef(continuous);
    const activeCameraIdRef = useRef('');
    const wasCameraActiveBeforeHideRef = useRef(false);
    const scheduleFrameRef = useRef<(sessionId: number) => void>(() => undefined);

    const [status, setStatus] = useState<ScannerStatus>('opening');
    const [errorDetail, setErrorDetail] = useState('');
    const [lastScan, setLastScan] = useState('');
    const [guidance, setGuidance] = useState<string>(SCANNER_COPY.initialGuidance);
    const [capabilities, setCapabilities] = useState<ScannerCapabilities>(EMPTY_CAPABILITIES);
    const [torchOn, setTorchOn] = useState(false);
    const [zoom, setZoom] = useState(1.2);
    const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
    const [activeCameraId, setActiveCameraId] = useState('');
    const [workerGeneration, setWorkerGeneration] = useState(0);

    useEffect(() => {
        onScanRef.current = onScan;
        onCloseRef.current = onClose;
        continuousRef.current = continuous;
    }, [onScan, onClose, continuous]);

    const stopFrameLoop = useCallback(() => {
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (frameCallbackRef.current !== null && video?.cancelVideoFrameCallback) {
            video.cancelVideoFrameCallback(frameCallbackRef.current);
        }
        if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
        frameCallbackRef.current = null;
        fallbackTimerRef.current = null;
    }, []);

    const stopCamera = useCallback(() => {
        stopFrameLoop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        trackRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setTorchOn(false);
    }, [stopFrameLoop]);

    const closeScanner = useCallback(() => {
        sessionRef.current += 1;
        stopCamera();
        onCloseRef.current();
    }, [stopCamera]);

    const playSuccessFeedback = useCallback(async () => {
        if ('vibrate' in navigator) navigator.vibrate([30, 45, 30]);
        try {
            const AudioContextConstructor = window.AudioContext || (window as typeof window & {
                webkitAudioContext?: typeof AudioContext;
            }).webkitAudioContext;
            if (!AudioContextConstructor) return;
            const context = audioContextRef.current ?? new AudioContextConstructor();
            audioContextRef.current = context;
            if (context.state === 'suspended') await context.resume();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1050, context.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1650, context.currentTime + 0.09);
            gain.gain.setValueAtTime(0.07, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.18);
        } catch {
            // Feedback is deliberately best-effort; decoding must never depend on audio.
        }
    }, []);

    const acceptResult = useCallback((rawValue: string) => {
        const text = rawValue.trim();
        if (!text) return;
        const now = Date.now();
        if (isDuplicateScan(text, lastAcceptedRef.current, now)) return;

        lastAcceptedRef.current = { text, at: now };
        pauseUntilRef.current = performance.now() + (continuousRef.current ? 650 : 1000);
        setLastScan(text);
        setStatus('success');
        setGuidance(SCANNER_COPY.capturedGuidance);
        void playSuccessFeedback();

        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        if (continuousRef.current) {
            onScanRef.current(text);
            successTimerRef.current = window.setTimeout(() => {
                setStatus('ready');
                setGuidance(SCANNER_COPY.nextGuidance);
            }, 650);
        } else {
            // Let the lock-on animation complete before handing off to the matched product.
            successTimerRef.current = window.setTimeout(() => {
                onScanRef.current(text);
                closeScanner();
            }, 720);
        }
    }, [closeScanner, playSuccessFeedback]);

    const captureCameraFrame = useCallback((fullFrame: boolean): ImageData | null => {
        const video = videoRef.current;
        const viewport = viewportRef.current;
        const reticle = reticleRef.current;
        if (!video || !viewport || !reticle || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
        if (!video.videoWidth || !video.videoHeight) return null;

        const viewportBounds = viewport.getBoundingClientRect();
        const reticleBounds = reticle.getBoundingClientRect();
        const digitalZoom = capabilities.zoom ? 1 : zoom;
        const source = fullFrame
            ? { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight }
            : computeObjectCoverCrop({
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                viewportWidth: viewportBounds.width,
                viewportHeight: viewportBounds.height,
                target: {
                    x: reticleBounds.left - viewportBounds.left,
                    y: reticleBounds.top - viewportBounds.top,
                    width: reticleBounds.width,
                    height: reticleBounds.height,
                },
                paddingRatio: 0.25,
                digitalZoom,
            });

        // ROI remains native-resolution. Only the occasional whole-frame safety pass is capped.
        const scale = fullFrame ? Math.min(1, 1600 / Math.max(source.width, source.height)) : 1;
        const outputWidth = Math.max(1, Math.round(source.width * scale));
        const outputHeight = Math.max(1, Math.round(source.height * scale));
        const canvas = canvasRef.current ?? document.createElement('canvas');
        canvasRef.current = canvas;
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        context.drawImage(
            video,
            source.x,
            source.y,
            source.width,
            source.height,
            0,
            0,
            outputWidth,
            outputHeight,
        );
        return context.getImageData(0, 0, outputWidth, outputHeight);
    }, [capabilities.zoom, zoom]);

    const dispatchFrameToWorker = useCallback((now: number) => {
        if (!workerReadyRef.current || workerInFlightRef.current || now < nextWorkerAttemptRef.current) return;
        if (now < pauseUntilRef.current) return;

        attemptRef.current += 1;
        const fullFrame = attemptRef.current % 5 === 0;
        const image = captureCameraFrame(fullFrame);
        if (!image || !workerRef.current) return;

        const enhanced = now - startedAtRef.current >= 600 && attemptRef.current % 2 === 0;
        if (enhanced) setStatus((current) => current === 'success' ? current : 'difficult-print');
        const requestId = ++requestRef.current;
        workerInFlightRef.current = true;
        workerRef.current.postMessage({
            type: 'decode',
            sessionId: sessionRef.current,
            requestId,
            width: image.width,
            height: image.height,
            rgba: image.data.buffer,
            enhanced,
            fullFrame,
            source: 'camera',
        }, [image.data.buffer]);
    }, [captureCameraFrame]);

    const processVideoFrame = useCallback((now: number, sessionId: number) => {
        if (sessionId !== sessionRef.current || !trackRef.current || trackRef.current.readyState !== 'live') return;
        scheduleFrameRef.current(sessionId);

        const video = videoRef.current;
        const detector = nativeDetectorRef.current;
        if (
            detector &&
            video &&
            !nativeInFlightRef.current &&
            now >= pauseUntilRef.current &&
            now - nativeLastAttemptRef.current >= 100
        ) {
            nativeLastAttemptRef.current = now;
            nativeInFlightRef.current = true;
            detector.detect(video)
                .then((results) => {
                    if (sessionId === sessionRef.current) acceptResult(results[0]?.rawValue ?? '');
                })
                .catch(() => undefined)
                .finally(() => { nativeInFlightRef.current = false; });
        }

        dispatchFrameToWorker(now);
        if (now - startedAtRef.current > 600 && status !== 'success') {
            setStatus((current) => current === 'ready' ? 'difficult-print' : current);
        }
    }, [acceptResult, dispatchFrameToWorker, status]);

    useEffect(() => {
        scheduleFrameRef.current = (sessionId: number) => {
            const video = videoRef.current as VideoWithFrameCallback | null;
            if (!video || sessionId !== sessionRef.current) return;
            if (video.requestVideoFrameCallback) {
                frameCallbackRef.current = video.requestVideoFrameCallback((now) => processVideoFrame(now, sessionId));
            } else {
                fallbackTimerRef.current = window.setTimeout(
                    () => processVideoFrame(performance.now(), sessionId),
                    100,
                );
            }
        };
    }, [processVideoFrame]);

    const initializeCapabilities = useCallback(async (track: MediaStreamTrack) => {
        const getCapabilities = (track as MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> }).getCapabilities;
        const raw = getCapabilities ? getCapabilities.call(track) as Record<string, any> : {};
        const focusModes = Array.isArray(raw.focusMode) ? raw.focusMode as string[] : [];
        const zoomCapability = raw.zoom && typeof raw.zoom.min === 'number'
            ? {
                min: raw.zoom.min as number,
                max: raw.zoom.max as number,
                step: Math.max(raw.zoom.step as number || 0.1, 0.05),
            }
            : null;
        const nextCapabilities: ScannerCapabilities = {
            torch: Boolean(raw.torch),
            zoom: zoomCapability,
            continuousFocus: focusModes.includes('continuous'),
            tapToFocus: focusModes.includes('single-shot') || Boolean(raw.pointsOfInterest),
        };
        setCapabilities(nextCapabilities);

        if (nextCapabilities.continuousFocus) {
            try {
                await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] });
            } catch { /* Capability reports are advisory on some Android devices. */ }
        }

        if (zoomCapability) {
            const startZoom = Math.min(zoomCapability.max, Math.max(zoomCapability.min, 1.2));
            try {
                await track.applyConstraints({ advanced: [{ zoom: startZoom } as MediaTrackConstraintSet] });
                setZoom(startZoom);
            } catch {
                setCapabilities((current) => ({ ...current, zoom: null }));
                setZoom(1.2);
            }
        } else {
            setZoom(1.2);
        }
    }, []);

    const startCamera = useCallback(async (deviceId?: string) => {
        const sessionId = ++sessionRef.current;
        stopCamera();
        attemptRef.current = 0;
        setCapabilities(EMPTY_CAPABILITIES);
        setErrorDetail('');
        setStatus('opening');
        setGuidance(SCANNER_COPY.startingGuidance);

        if (!navigator.mediaDevices?.getUserMedia) {
            setStatus('camera-unavailable');
            setErrorDetail(SCANNER_COPY.cameraUnsupported);
            return;
        }

        const preferred: MediaStreamConstraints = {
            audio: false,
            video: deviceId
                ? {
                    deviceId: { exact: deviceId },
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                    frameRate: { ideal: 30, max: 30 },
                }
                : {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                    frameRate: { ideal: 30, max: 30 },
                },
        };

        let stream: MediaStream;
        try {
            try {
                stream = await navigator.mediaDevices.getUserMedia(preferred);
            } catch (error) {
                if ((error as { name?: string })?.name !== 'OverconstrainedError') throw error;
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } },
                });
            }

            if (sessionId !== sessionRef.current) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            const video = videoRef.current;
            if (!video) throw new Error('Scanner view is not mounted.');
            streamRef.current = stream;
            trackRef.current = stream.getVideoTracks()[0] ?? null;
            video.srcObject = stream;
            if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
                await new Promise<void>((resolve, reject) => {
                    const handleMetadata = () => {
                        window.clearTimeout(timeout);
                        resolve();
                    };
                    const timeout = window.setTimeout(() => {
                        video.removeEventListener('loadedmetadata', handleMetadata);
                        reject(new Error('Camera metadata timed out.'));
                    }, 5000);
                    video.addEventListener('loadedmetadata', handleMetadata, { once: true });
                });
            }
            await video.play();
            if (!trackRef.current) throw new Error('Camera returned no video track.');
            await initializeCapabilities(trackRef.current);
            const settings = trackRef.current.getSettings();
            const resolvedCameraId = settings.deviceId ?? deviceId ?? '';
            activeCameraIdRef.current = resolvedCameraId;
            setActiveCameraId(resolvedCameraId);
            const devices = await navigator.mediaDevices.enumerateDevices();
            setCameras(devices.filter((item) => item.kind === 'videoinput'));
            startedAtRef.current = performance.now();
            nextWorkerAttemptRef.current = startedAtRef.current;
            setStatus(workerReadyRef.current ? 'ready' : 'warming');
            setGuidance(SCANNER_COPY.readyGuidance);
            scheduleFrameRef.current(sessionId);
        } catch (error) {
            if (sessionId !== sessionRef.current) return;
            stopCamera();
            const info = describeCameraError(error);
            setStatus(info.status);
            setErrorDetail(info.detail);
        }
    }, [initializeCapabilities, stopCamera]);

    useEffect(() => {
        const worker = new Worker(new URL('../features/scanning/qrDecoder.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        worker.onmessage = (event: MessageEvent<DecoderWorkerResponse>) => {
            const message = event.data;
            if (message.type === 'ready') {
                workerReadyRef.current = true;
                setStatus((current) => current === 'warming' ? 'ready' : current);
                return;
            }
            if (message.type === 'init-error') {
                workerReadyRef.current = false;
                setErrorDetail(SCANNER_COPY.engineLoadFailure);
                setStatus((current) => current === 'opening' ? current : 'error');
                return;
            }

            workerInFlightRef.current = false;
            if (!isCurrentScannerSession(message.sessionId, sessionRef.current)) return;
            if (message.type === 'decode-error') {
                nextWorkerAttemptRef.current = performance.now() + 250;
                return;
            }

            workerIntervalRef.current = getAdaptiveDecodeInterval(message.durationMs);
            nextWorkerAttemptRef.current = performance.now() + workerIntervalRef.current;
            if (message.text) {
                acceptResult(message.text);
                if (message.source === 'photo' && continuousRef.current) {
                    window.setTimeout(() => void startCamera(activeCameraIdRef.current || undefined), 720);
                }
                return;
            }
            if (message.source === 'photo') {
                pauseUntilRef.current = 0;
                setStatus('error');
                setErrorDetail(SCANNER_COPY.photoNotFound);
                return;
            }
            if (message.brightness < 58) {
                setGuidance(SCANNER_COPY.darkGuidance);
            } else if (message.sharpness < 5.5) {
                setGuidance(SCANNER_COPY.softGuidance);
            } else if (performance.now() - startedAtRef.current > 1200) {
                setGuidance(SCANNER_COPY.closerGuidance);
            }
        };
        worker.onerror = () => {
            workerReadyRef.current = false;
            workerInFlightRef.current = false;
            setErrorDetail(SCANNER_COPY.engineStopped);
            setStatus('error');
        };

        return () => {
            worker.terminate();
            workerRef.current = null;
            workerReadyRef.current = false;
            workerInFlightRef.current = false;
        };
    }, [acceptResult, startCamera, workerGeneration]);

    useEffect(() => {
        let cancelled = false;
        const initializeNativeDetector = async () => {
            const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
            if (!Detector) return;
            try {
                const formats = await Detector.getSupportedFormats();
                if (!cancelled && formats.includes('qr_code')) {
                    nativeDetectorRef.current = new Detector({ formats: ['qr_code'] });
                }
            } catch {
                nativeDetectorRef.current = null;
            }
        };
        void initializeNativeDetector();
        return () => {
            cancelled = true;
            nativeDetectorRef.current = null;
        };
    }, []);

    useEffect(() => {
        void startCamera();
        return () => {
            sessionRef.current += 1;
            stopCamera();
        };
    }, [startCamera, stopCamera]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                wasCameraActiveBeforeHideRef.current = trackRef.current?.readyState === 'live';
                sessionRef.current += 1;
                stopCamera();
            } else if (wasCameraActiveBeforeHideRef.current) {
                wasCameraActiveBeforeHideRef.current = false;
                void startCamera(activeCameraIdRef.current || undefined);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [startCamera, stopCamera]);

    useEffect(() => () => {
        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        if (photoRetryTimerRef.current !== null) window.clearTimeout(photoRetryTimerRef.current);
        const context = audioContextRef.current;
        if (context && context.state !== 'closed') void context.close();
    }, []);

    const toggleTorch = async () => {
        const track = trackRef.current;
        if (!track || !capabilities.torch) return;
        const next = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
            setTorchOn(next);
        } catch {
            setGuidance(SCANNER_COPY.torchFailure);
        }
    };

    const handleZoomChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(event.target.value);
        setZoom(value);
        if (!capabilities.zoom || !trackRef.current) return;
        try {
            await trackRef.current.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
        } catch {
            setGuidance(SCANNER_COPY.zoomFailure);
        }
    };

    const switchCamera = () => {
        if (cameras.length < 2) return;
        const currentIndex = cameras.findIndex((camera) => camera.deviceId === activeCameraId);
        const next = cameras[(currentIndex + 1 + cameras.length) % cameras.length];
        if (next) void startCamera(next.deviceId);
    };

    const retryScanner = () => {
        if (!workerReadyRef.current) setWorkerGeneration((generation) => generation + 1);
        void startCamera(activeCameraIdRef.current || undefined);
    };

    const tapToFocus = async (event: React.PointerEvent<HTMLDivElement>) => {
        if (!capabilities.tapToFocus || !trackRef.current) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        try {
            await trackRef.current.applyConstraints({
                advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] } as MediaTrackConstraintSet],
            });
            setGuidance(SCANNER_COPY.focusingGuidance);
        } catch {
            // Some browsers expose focus capability but reject point coordinates.
        }
    };

    const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !workerRef.current) return;
        pauseUntilRef.current = Number.POSITIVE_INFINITY;
        setStatus('difficult-print');
        setGuidance(SCANNER_COPY.photoGuidance);
        try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) throw new Error('Photo canvas unavailable.');
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const photoSession = ++sessionRef.current;

            const sendWhenAvailable = () => {
                if (!workerRef.current || photoSession !== sessionRef.current) return;
                if (workerInFlightRef.current) {
                    photoRetryTimerRef.current = window.setTimeout(sendWhenAvailable, 40);
                    return;
                }
                workerInFlightRef.current = true;
                workerRef.current.postMessage({
                    type: 'decode',
                    sessionId: photoSession,
                    requestId: ++requestRef.current,
                    width: image.width,
                    height: image.height,
                    rgba: image.data.buffer,
                    enhanced: true,
                    fullFrame: true,
                    source: 'photo',
                }, [image.data.buffer]);
            };
            sendWhenAvailable();
        } catch {
            pauseUntilRef.current = 0;
            setStatus('error');
            setErrorDetail(SCANNER_COPY.photoReadFailure);
        }
    };

    const isCameraError = ['permission-denied', 'camera-busy', 'camera-unavailable', 'error'].includes(status);
    const zoomMinimum = capabilities.zoom?.min ?? 1;
    const zoomMaximum = capabilities.zoom ? Math.min(capabilities.zoom.max, 5) : 2.5;
    const zoomStep = capabilities.zoom?.step ?? 0.1;
    const activeStage = status === 'opening' ? 0 : status === 'warming' ? 1 : 2;
    const isEnhancing = status === 'difficult-print';
    const reticleColor = status === 'success'
        ? 'border-emerald-200'
        : isEnhancing ? 'border-amber-300' : 'border-emerald-400';
    const lastScanMatch = lastScan && products
        ? findProductByScannedCode(lastScan, products)
        : null;
    const lastScanMaster = lastScanMatch?.product.sku || lastScan;
    const lastScanSuffix = lastScanMatch
        ? (lastScanMatch.variant?.suffix || '')
        : undefined;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ilios-vision-title"
            className="ilios-scanner-shell fixed inset-0 z-[250] flex flex-col overflow-hidden bg-black font-sans text-white select-none"
        >
            <header
                className="absolute inset-x-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-black/45 px-4 pb-4 backdrop-blur-xl sm:px-6"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
            >
                <div className="flex min-w-0 items-center gap-3">
                    <div className={`rounded-2xl border p-2.5 transition-all duration-500 ${status === 'success' ? 'border-emerald-200/60 bg-emerald-300/25 shadow-[0_0_30px_rgba(110,231,183,0.38)]' : 'border-emerald-400/30 bg-emerald-400/15 shadow-[0_0_24px_rgba(16,185,129,0.2)]'}`}>
                        <Target className={`${status === 'success' ? 'text-emerald-200' : 'text-emerald-400'} transition-colors`} size={23} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h1 id="ilios-vision-title" className="truncate text-lg font-black leading-none tracking-tight sm:text-xl">Ilios Vision</h1>
                        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[9px] font-black uppercase tracking-[0.18em] text-white/60">
                            <span className={`h-1.5 w-1.5 rounded-full ${status === 'success' ? 'bg-emerald-200' : isEnhancing ? 'bg-amber-400 ilios-status-dot' : 'bg-emerald-500 ilios-status-dot'}`} />
                            {capabilities.zoom ? SCANNER_COPY.opticalZoom : SCANNER_COPY.digitalZoom} · {zoom.toFixed(1)}×
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {cameras.length > 1 && (
                        <button type="button" onClick={switchCamera} aria-label={SCANNER_COPY.aria.switchCamera} className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white/80 transition hover:bg-white/20 active:scale-95">
                            <SwitchCamera size={21} />
                        </button>
                    )}
                    {capabilities.torch && (
                        <button
                            type="button"
                            onClick={() => void toggleTorch()}
                            aria-label={torchOn ? SCANNER_COPY.aria.torchOff : SCANNER_COPY.aria.torchOn}
                            aria-pressed={torchOn}
                            className={`rounded-2xl border p-3 transition ${torchOn ? 'border-amber-300 bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.45)]' : 'border-white/10 bg-white/10 text-white/70 hover:bg-white/20'}`}
                        >
                            <Zap size={21} className={torchOn ? 'fill-current' : ''} />
                        </button>
                    )}
                    <button type="button" onClick={closeScanner} aria-label={SCANNER_COPY.aria.close} className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white transition hover:bg-red-500/25 hover:text-red-300 active:scale-95">
                        <X size={21} />
                    </button>
                </div>
            </header>

            <div
                ref={viewportRef}
                className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#050706] touch-none"
                onPointerUp={(event) => void tapToFocus(event)}
            >
                <video
                    ref={videoRef}
                    className={`h-full w-full origin-center object-cover contrast-110 transition-[transform,filter] duration-500 motion-reduce:transition-none ${status === 'success' ? 'brightness-75 saturate-50 blur-[1px]' : 'brightness-110 saturate-100'}`}
                    style={{ transform: capabilities.zoom ? undefined : `scale(${zoom})` }}
                    playsInline
                    muted
                    autoPlay
                    aria-label={SCANNER_COPY.aria.preview}
                />

                <div
                    className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${status === 'success' ? 'opacity-100' : 'opacity-60'}`}
                    style={{ background: 'radial-gradient(circle at 50% 48%, rgba(16,185,129,0.10), transparent 42%)' }}
                />

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div
                        ref={reticleRef}
                        className={`relative aspect-square w-[min(68vw,19rem)] transition-all duration-500 motion-reduce:transition-none ${status === 'success' ? 'ilios-reticle-locked scale-[1.04]' : isEnhancing ? 'ilios-reticle-enhancing' : 'ilios-reticle-breathe'}`}
                        aria-hidden="true"
                    >
                        <div className={`ilios-reticle-corner absolute left-0 top-0 h-14 w-14 rounded-tl-[2rem] border-l-4 border-t-4 ${reticleColor}`} />
                        <div className={`ilios-reticle-corner absolute right-0 top-0 h-14 w-14 rounded-tr-[2rem] border-r-4 border-t-4 ${reticleColor}`} />
                        <div className={`ilios-reticle-corner absolute bottom-0 left-0 h-14 w-14 rounded-bl-[2rem] border-b-4 border-l-4 ${reticleColor}`} />
                        <div className={`ilios-reticle-corner absolute bottom-0 right-0 h-14 w-14 rounded-br-[2rem] border-b-4 border-r-4 ${reticleColor}`} />
                        <div className={`absolute inset-3 rounded-[1.6rem] border transition-colors duration-500 ${isEnhancing ? 'border-amber-200/15' : 'border-white/10'}`} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-25">
                            <div className="h-px w-8 bg-white" />
                            <div className="absolute h-8 w-px bg-white" />
                        </div>
                        {status !== 'success' && !isCameraError && (
                            <div className={`ilios-scan-beam absolute inset-x-4 h-px bg-gradient-to-r from-transparent ${isEnhancing ? 'via-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.95)]' : 'via-emerald-200 shadow-[0_0_20px_rgba(52,211,153,0.95)]'} to-transparent motion-reduce:hidden`} />
                        )}
                    </div>

                    {!isCameraError && status !== 'success' && (
                        <div key={status} className="ilios-status-card mt-7 w-[min(86vw,22rem)] rounded-3xl border border-white/10 bg-black/60 px-4 py-3.5 text-center shadow-2xl backdrop-blur-xl">
                            <p className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-white/85">
                                {status === 'opening' || status === 'warming'
                                    ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none text-emerald-400" />
                                    : isEnhancing ? <Sparkles size={13} className="text-amber-300" />
                                        : capabilities.tapToFocus ? <Focus size={13} className="text-emerald-400" /> : <Scan size={13} className="text-emerald-400" />}
                                {SCANNER_STATUS_COPY[status]}
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden="true">
                                <div className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[8px] font-black uppercase tracking-wide transition-all ${activeStage >= 0 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/5 text-white/30'}`}>
                                    <Camera size={11} /> {SCANNER_COPY.cameraStage}
                                </div>
                                <div className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[8px] font-black uppercase tracking-wide transition-all ${activeStage >= 1 ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/5 text-white/30'}`}>
                                    <Sparkles size={11} /> {SCANNER_COPY.analysisStage}
                                </div>
                                <div className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-[8px] font-black uppercase tracking-wide transition-all ${activeStage >= 2 ? (isEnhancing ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200') : 'bg-white/5 text-white/30'}`}>
                                    <Scan size={11} /> {SCANNER_COPY.scanningStage}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {status === 'success' && (
                    <div className="ilios-success-backdrop pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/55 px-6 backdrop-blur-[2px]">
                        <div className="ilios-success-card flex w-full max-w-xs flex-col items-center rounded-[2.25rem] border border-emerald-200/25 bg-black/65 px-6 py-7 text-center shadow-[0_24px_80px_rgba(5,150,105,0.38)] backdrop-blur-xl">
                            <div className="ilios-success-mark relative flex h-24 w-24 items-center justify-center">
                                <span className="ilios-success-ring absolute inset-0 rounded-full border border-emerald-200/45" />
                                <span className="ilios-success-ring ilios-success-ring-delayed absolute inset-2 rounded-full border border-emerald-300/35" />
                                <span className="absolute inset-3 rounded-full bg-emerald-300/15 shadow-[0_0_45px_rgba(110,231,183,0.35)]" />
                                <CheckCircle2 size={56} strokeWidth={2.4} className="relative text-emerald-200" />
                            </div>
                            <p className="mt-4 flex items-center gap-2 text-[10px] font-black tracking-[0.24em] text-emerald-200">
                                <Sparkles size={13} /> {SCANNER_COPY.detected}
                            </p>
                            <div className="mt-3 max-w-full rounded-2xl border border-white/80 bg-white px-4 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.28)]">
                                <SkuColorizedText
                                    sku={lastScanMaster}
                                    suffix={lastScanSuffix}
                                    gender={lastScanMatch?.product.gender}
                                    className="block break-all text-2xl leading-tight sm:text-3xl"
                                    masterClassName="text-slate-900"
                                />
                            </div>
                            <p className="mt-2 text-xs font-semibold text-white/55">{continuous ? SCANNER_COPY.nextGuidance : SCANNER_COPY.transferring}</p>
                            <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="ilios-success-progress h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-emerald-200" />
                            </div>
                        </div>
                    </div>
                )}

                {isCameraError && (
                    <div className="animate-in fade-in zoom-in-95 absolute inset-x-5 top-1/2 z-20 mx-auto max-w-md -translate-y-1/2 rounded-[2rem] border border-white/10 bg-slate-950/90 p-7 text-center shadow-2xl backdrop-blur-xl duration-300 motion-reduce:animate-none">
                        <AlertTriangle className="mx-auto mb-4 text-amber-400" size={34} />
                        <h2 className="text-xl font-black">{SCANNER_STATUS_COPY[status]}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/60">{errorDetail}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={retryScanner} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-400 active:scale-95">
                                <RefreshCw size={17} /> {SCANNER_COPY.retry}
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15 active:scale-95">
                                <ImagePlus size={17} /> {SCANNER_COPY.photo}
                            </button>
                        </div>
                    </div>
                )}

                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.72)]" />
            </div>

            <footer
                className={`absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-black/90 to-transparent px-5 pt-16 transition-all duration-300 sm:px-8 ${status === 'success' ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <div aria-live="polite" aria-atomic="true" className="mx-auto mb-4 max-w-md text-center">
                    <p className="text-xs font-semibold text-white/65">{guidance}</p>
                    {lastScan && continuous && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 text-left text-slate-900 shadow-xl duration-300 motion-reduce:animate-none">
                            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600"><CheckCircle2 size={20} /></div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{SCANNER_COPY.lastScan}</p>
                                <SkuColorizedText
                                    sku={lastScanMaster}
                                    suffix={lastScanSuffix}
                                    gender={lastScanMatch?.product.gender}
                                    className="block truncate text-lg"
                                    masterClassName="text-slate-900"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="mx-auto flex max-w-md items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label={SCANNER_COPY.aria.photo}
                        className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 text-xs font-black text-white/85 transition hover:bg-white/20 active:scale-95"
                    >
                        <ImagePlus size={17} /> {SCANNER_COPY.photo}
                    </button>
                    <ZoomOut size={17} className="shrink-0 text-white/45" aria-hidden="true" />
                    <input
                        type="range"
                        min={zoomMinimum}
                        max={zoomMaximum}
                        step={zoomStep}
                        value={Math.max(zoomMinimum, Math.min(zoomMaximum, zoom))}
                        onChange={(event) => void handleZoomChange(event)}
                        aria-label={capabilities.zoom ? SCANNER_COPY.aria.opticalZoom : SCANNER_COPY.aria.digitalZoom}
                        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-emerald-500"
                    />
                    <ZoomIn size={17} className="shrink-0 text-white/45" aria-hidden="true" />
                </div>
            </footer>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhoto(event)} />

            <style>{`
                @keyframes ilios-scanner-enter {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes ilios-scan {
                    0% { top: 8%; opacity: 0; transform: scaleX(.72); }
                    14%, 86% { opacity: 1; }
                    50% { transform: scaleX(1); }
                    100% { top: 92%; opacity: 0; transform: scaleX(.72); }
                }
                @keyframes ilios-reticle-breathe {
                    0%, 100% { filter: drop-shadow(0 0 7px rgba(52, 211, 153, .22)); }
                    50% { filter: drop-shadow(0 0 16px rgba(52, 211, 153, .42)); }
                }
                @keyframes ilios-reticle-enhancing {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(251, 191, 36, .24)); }
                    50% { transform: scale(1.015); filter: drop-shadow(0 0 18px rgba(251, 191, 36, .45)); }
                }
                @keyframes ilios-reticle-lock {
                    0% { transform: scale(1.06); filter: drop-shadow(0 0 0 rgba(110, 231, 183, 0)); }
                    45% { transform: scale(.96); filter: drop-shadow(0 0 24px rgba(110, 231, 183, .7)); }
                    100% { transform: scale(1); filter: drop-shadow(0 0 14px rgba(110, 231, 183, .42)); }
                }
                @keyframes ilios-status-enter {
                    from { opacity: 0; transform: translateY(8px) scale(.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes ilios-status-dot {
                    0%, 100% { opacity: .45; box-shadow: 0 0 0 0 currentColor; }
                    50% { opacity: 1; box-shadow: 0 0 0 4px transparent; }
                }
                @keyframes ilios-success-backdrop {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes ilios-success-card {
                    0% { opacity: 0; transform: translateY(12px) scale(.88); }
                    58% { opacity: 1; transform: translateY(-2px) scale(1.025); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes ilios-success-mark {
                    0% { opacity: 0; transform: rotate(-10deg) scale(.55); }
                    68% { opacity: 1; transform: rotate(2deg) scale(1.08); }
                    100% { opacity: 1; transform: rotate(0) scale(1); }
                }
                @keyframes ilios-success-ring {
                    0% { opacity: .8; transform: scale(.68); }
                    100% { opacity: 0; transform: scale(1.45); }
                }
                @keyframes ilios-success-progress {
                    from { transform: scaleX(0); }
                    to { transform: scaleX(1); }
                }
                .ilios-scanner-shell { animation: ilios-scanner-enter .24s ease-out both; }
                .ilios-scan-beam { animation: ilios-scan 1.45s cubic-bezier(.45, 0, .55, 1) infinite; }
                .ilios-reticle-breathe { animation: ilios-reticle-breathe 2.2s ease-in-out infinite; }
                .ilios-reticle-enhancing { animation: ilios-reticle-enhancing 1s ease-in-out infinite; }
                .ilios-reticle-locked { animation: ilios-reticle-lock .42s cubic-bezier(.2, .9, .25, 1.2) both; }
                .ilios-reticle-corner { transition: border-color .35s ease, filter .35s ease; }
                .ilios-status-card { animation: ilios-status-enter .28s ease-out both; }
                .ilios-status-dot { animation: ilios-status-dot 1.6s ease-in-out infinite; }
                .ilios-success-backdrop { animation: ilios-success-backdrop .18s ease-out both; }
                .ilios-success-card { animation: ilios-success-card .46s cubic-bezier(.2, .85, .25, 1.1) both; }
                .ilios-success-mark { animation: ilios-success-mark .48s cubic-bezier(.2, .9, .25, 1.15) .05s both; }
                .ilios-success-ring { animation: ilios-success-ring .9s ease-out .08s both; }
                .ilios-success-ring-delayed { animation-delay: .2s; }
                .ilios-success-progress { animation: ilios-success-progress .68s linear .04s both; }
                @media (prefers-reduced-motion: reduce) {
                    .ilios-scan-beam { animation: none; top: 50%; opacity: .55; }
                    .ilios-scanner-shell,
                    .ilios-reticle-breathe,
                    .ilios-reticle-enhancing,
                    .ilios-reticle-locked,
                    .ilios-status-card,
                    .ilios-status-dot,
                    .ilios-success-backdrop,
                    .ilios-success-card,
                    .ilios-success-mark,
                    .ilios-success-ring,
                    .ilios-success-progress { animation: none; }
                    .ilios-reticle-corner { transition: none; }
                }
            `}</style>
        </div>
    );
}
