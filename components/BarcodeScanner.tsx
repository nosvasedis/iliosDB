import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Focus,
    ImagePlus,
    Loader2,
    RefreshCw,
    Scan,
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

interface Props {
    onScan: (result: string) => void;
    onClose: () => void;
    continuous?: boolean;
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

const STATUS_COPY: Record<ScannerStatus, string> = {
    opening: 'Opening camera…',
    warming: 'Warming precision engine…',
    ready: 'Ready — hold the QR inside the frame',
    'difficult-print': 'Enhancing a difficult print… hold steady',
    success: 'QR recognized',
    'permission-denied': 'Camera permission needed',
    'camera-busy': 'Camera is being used elsewhere',
    'camera-unavailable': 'Camera unavailable',
    error: 'Scanner needs attention',
};

export default function BarcodeScanner({ onScan, onClose, continuous = false }: Props) {
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
    const [guidance, setGuidance] = useState('Move close enough for the QR modules to look sharp.');
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
        pauseUntilRef.current = performance.now() + 500;
        setLastScan(text);
        setStatus('success');
        setGuidance('Captured clearly.');
        void playSuccessFeedback();
        onScanRef.current(text);

        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        if (continuousRef.current) {
            successTimerRef.current = window.setTimeout(() => {
                setStatus('ready');
                setGuidance('Aim at the next QR code.');
            }, 520);
        } else {
            successTimerRef.current = window.setTimeout(closeScanner, 180);
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
        setGuidance('Preparing the rear camera for small jewelry labels.');

        if (!navigator.mediaDevices?.getUserMedia) {
            setStatus('camera-unavailable');
            setErrorDetail('This browser does not expose camera access. Use “Scan from photo” instead.');
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
            setGuidance('Center the QR and hold the phone steady.');
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
                setErrorDetail('The precision QR engine could not load. Native scanning may still work.');
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
                    window.setTimeout(() => void startCamera(activeCameraIdRef.current || undefined), 560);
                }
                return;
            }
            if (message.source === 'photo') {
                pauseUntilRef.current = 0;
                setStatus('error');
                setErrorDetail('No readable QR was found in that photo. Try a sharper image or reopen the camera.');
                return;
            }
            if (message.brightness < 58) {
                setGuidance('The label is dark — add light or use the torch.');
            } else if (message.sharpness < 5.5) {
                setGuidance('The QR looks soft — hold steady and let focus settle.');
            } else if (performance.now() - startedAtRef.current > 1200) {
                setGuidance('Move a little closer; keep all four QR corners visible.');
            }
        };
        worker.onerror = () => {
            workerReadyRef.current = false;
            workerInFlightRef.current = false;
            setErrorDetail('The precision engine stopped unexpectedly. Please retry.');
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
            setGuidance('This camera advertised a torch but could not switch it.');
        }
    };

    const handleZoomChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(event.target.value);
        setZoom(value);
        if (!capabilities.zoom || !trackRef.current) return;
        try {
            await trackRef.current.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] });
        } catch {
            setGuidance('Zoom could not be changed on this lens.');
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
            setGuidance('Focusing on the selected area…');
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
        setGuidance('Inspecting the photo at full resolution…');
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
            setErrorDetail('That photo could not be read. Try another image or reopen the camera.');
        }
    };

    const isCameraError = ['permission-denied', 'camera-busy', 'camera-unavailable', 'error'].includes(status);
    const zoomMinimum = capabilities.zoom?.min ?? 1;
    const zoomMaximum = capabilities.zoom ? Math.min(capabilities.zoom.max, 5) : 2.5;
    const zoomStep = capabilities.zoom?.step ?? 0.1;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ilios-vision-title"
            className="fixed inset-0 z-[250] flex flex-col overflow-hidden bg-black font-sans text-white select-none"
        >
            <header
                className="absolute inset-x-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-black/45 px-4 pb-4 backdrop-blur-xl sm:px-6"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
            >
                <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/15 p-2.5 shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                        <Target className="text-emerald-400" size={23} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h1 id="ilios-vision-title" className="truncate text-lg font-black leading-none tracking-tight sm:text-xl">Ilios Vision</h1>
                        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[9px] font-black uppercase tracking-[0.18em] text-white/60">
                            <span className={`h-1.5 w-1.5 rounded-full ${status === 'success' ? 'bg-emerald-300' : 'bg-emerald-500'}`} />
                            {capabilities.zoom ? 'Optical' : 'Digital precision crop'} · {zoom.toFixed(1)}×
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {cameras.length > 1 && (
                        <button type="button" onClick={switchCamera} aria-label="Switch camera" className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white/80 transition hover:bg-white/20">
                            <SwitchCamera size={21} />
                        </button>
                    )}
                    {capabilities.torch && (
                        <button
                            type="button"
                            onClick={() => void toggleTorch()}
                            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
                            aria-pressed={torchOn}
                            className={`rounded-2xl border p-3 transition ${torchOn ? 'border-amber-300 bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.45)]' : 'border-white/10 bg-white/10 text-white/70 hover:bg-white/20'}`}
                        >
                            <Zap size={21} className={torchOn ? 'fill-current' : ''} />
                        </button>
                    )}
                    <button type="button" onClick={closeScanner} aria-label="Close scanner" className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white transition hover:bg-red-500/25 hover:text-red-300">
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
                    className="h-full w-full origin-center object-cover brightness-110 contrast-110 transition-transform duration-200 motion-reduce:transition-none"
                    style={{ transform: capabilities.zoom ? undefined : `scale(${zoom})` }}
                    playsInline
                    muted
                    autoPlay
                    aria-label="Live camera preview"
                />

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div
                        ref={reticleRef}
                        className={`relative aspect-square w-[min(68vw,19rem)] transition-transform duration-200 motion-reduce:transition-none ${status === 'success' ? 'scale-[1.03]' : ''}`}
                        aria-hidden="true"
                    >
                        <div className={`absolute left-0 top-0 h-12 w-12 rounded-tl-3xl border-l-4 border-t-4 ${status === 'success' ? 'border-emerald-300' : 'border-emerald-500'}`} />
                        <div className={`absolute right-0 top-0 h-12 w-12 rounded-tr-3xl border-r-4 border-t-4 ${status === 'success' ? 'border-emerald-300' : 'border-emerald-500'}`} />
                        <div className={`absolute bottom-0 left-0 h-12 w-12 rounded-bl-3xl border-b-4 border-l-4 ${status === 'success' ? 'border-emerald-300' : 'border-emerald-500'}`} />
                        <div className={`absolute bottom-0 right-0 h-12 w-12 rounded-br-3xl border-b-4 border-r-4 ${status === 'success' ? 'border-emerald-300' : 'border-emerald-500'}`} />
                        <div className="absolute inset-0 flex items-center justify-center opacity-25">
                            <div className="h-px w-8 bg-white" />
                            <div className="absolute h-8 w-px bg-white" />
                        </div>
                        {status !== 'success' && !isCameraError && (
                            <div className="ilios-scan-beam absolute inset-x-4 h-px bg-gradient-to-r from-transparent via-red-400 to-transparent shadow-[0_0_18px_rgba(248,113,113,0.9)] motion-reduce:hidden" />
                        )}
                        {status === 'success' && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <CheckCircle2 size={72} className="rounded-full bg-black/45 p-2 text-emerald-300" />
                            </div>
                        )}
                    </div>

                    {!isCameraError && (
                        <div className="mt-8 max-w-[85vw] rounded-full border border-white/10 bg-black/55 px-5 py-2.5 text-center backdrop-blur-md">
                            <p className="flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/80">
                                {status === 'opening' || status === 'warming'
                                    ? <Loader2 size={13} className="animate-spin motion-reduce:animate-none text-emerald-400" />
                                    : capabilities.tapToFocus ? <Focus size={13} className="text-emerald-400" /> : <Scan size={13} className="text-emerald-400" />}
                                {STATUS_COPY[status]}
                            </p>
                        </div>
                    )}
                </div>

                {isCameraError && (
                    <div className="absolute inset-x-5 top-1/2 z-20 mx-auto max-w-md -translate-y-1/2 rounded-[2rem] border border-white/10 bg-slate-950/90 p-7 text-center shadow-2xl backdrop-blur-xl">
                        <AlertTriangle className="mx-auto mb-4 text-amber-400" size={34} />
                        <h2 className="text-xl font-black">{STATUS_COPY[status]}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-white/60">{errorDetail}</p>
                        <div className="mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={retryScanner} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white hover:bg-emerald-400">
                                <RefreshCw size={17} /> Retry
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                                <ImagePlus size={17} /> Photo
                            </button>
                        </div>
                    </div>
                )}

                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.72)]" />
            </div>

            <footer
                className="absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-black/90 to-transparent px-5 pt-16 sm:px-8"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <div aria-live="polite" aria-atomic="true" className="mx-auto mb-4 max-w-md text-center">
                    <p className="text-xs font-semibold text-white/65">{guidance}</p>
                    {lastScan && continuous && (
                        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white p-3 text-left text-slate-900 shadow-xl">
                            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600"><CheckCircle2 size={20} /></div>
                            <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Last scan</p>
                                <p className="truncate font-mono text-lg font-black">{lastScan}</p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mx-auto flex max-w-md items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label="Scan QR code from photo"
                        className="flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 text-xs font-black text-white/85 transition hover:bg-white/20"
                    >
                        <ImagePlus size={17} /> Photo
                    </button>
                    <ZoomOut size={17} className="shrink-0 text-white/45" aria-hidden="true" />
                    <input
                        type="range"
                        min={zoomMinimum}
                        max={zoomMaximum}
                        step={zoomStep}
                        value={Math.max(zoomMinimum, Math.min(zoomMaximum, zoom))}
                        onChange={(event) => void handleZoomChange(event)}
                        aria-label={capabilities.zoom ? 'Optical camera zoom' : 'Digital precision crop zoom'}
                        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-emerald-500"
                    />
                    <ZoomIn size={17} className="shrink-0 text-white/45" aria-hidden="true" />
                </div>
            </footer>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhoto(event)} />

            <style>{`
                @keyframes ilios-scan {
                    0% { top: 10%; opacity: 0; }
                    15%, 85% { opacity: 1; }
                    100% { top: 90%; opacity: 0; }
                }
                .ilios-scan-beam { animation: ilios-scan 1.55s ease-in-out infinite; }
                @media (prefers-reduced-motion: reduce) {
                    .ilios-scan-beam { animation: none; top: 50%; opacity: .55; }
                }
            `}</style>
        </div>
    );
}
