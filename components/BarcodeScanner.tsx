import { formatDecimal } from '../utils/numberFormat';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '../types';
import {
    AlertTriangle,
    CheckCircle2,
    Crosshair,
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
    EMPTY_SCAN_LOCK,
    computeObjectCoverCrop,
    describeCameraError,
    expireScanLock,
    getAdaptiveDecodeInterval,
    getScanLockProgress,
    isCurrentScannerSession,
    isDuplicateScan,
    mapVideoPointToViewport,
    observeScanLock,
    pickAimedCandidate,
    type AimCandidate,
    type ScanLockState,
} from '../features/scanning/scannerEngine';
import {
    DecoderWorkerResponse,
    QrCandidate,
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
    boundingBox?: DOMRectReadOnly;
    cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
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

/** Maps decoder pixels of a captured crop back onto source-video pixels. */
interface CaptureTransform {
    x: number;
    y: number;
    scale: number;
}

const EMPTY_CAPABILITIES: ScannerCapabilities = {
    torch: false,
    zoom: null,
    continuousFocus: false,
    tapToFocus: false,
};

/** Aim zone radius as a fraction of the reticle side: the dashed circle drawn in the reticle. */
const AIM_RADIUS_RATIO = 0.3;
const ZOOM_PRESETS = [1, 1.5, 2, 3];

function nativeResultToCandidate(result: BarcodeDetectorResult): QrCandidate | null {
    const text = result.rawValue?.trim() ?? '';
    if (!text) return null;
    const corners = result.cornerPoints;
    if (corners && corners.length >= 4) {
        const x = corners.reduce((total, point) => total + point.x, 0) / corners.length;
        const y = corners.reduce((total, point) => total + point.y, 0) / corners.length;
        const size = (
            Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y)
            + Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)
        ) / 2;
        return { text, x, y, size };
    }
    const box = result.boundingBox;
    if (box && box.width > 0) {
        return { text, x: box.x + box.width / 2, y: box.y + box.height / 2, size: (box.width + box.height) / 2 };
    }
    // Without a position we cannot tell which neighbouring label it is; the ROI worker covers it.
    return null;
}

export default function BarcodeScanner({ onScan, onClose, continuous = false, products }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const reticleRef = useRef<HTMLDivElement>(null);
    const lockRingRef = useRef<SVGRectElement>(null);
    const targetBoxRef = useRef<HTMLDivElement>(null);
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
    const captureTransformsRef = useRef(new Map<number, CaptureTransform>());
    const attemptRef = useRef(0);
    const startedAtRef = useRef(0);
    const pauseUntilRef = useRef(0);
    const lastAcceptedRef = useRef<{ text: string; at: number } | null>(null);
    const lockRef = useRef<ScanLockState>(EMPTY_SCAN_LOCK);
    const lockingTextRef = useRef<string | null>(null);
    const offTargetUntilRef = useRef(0);
    const digitalZoomRef = useRef(1.2);
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
    const [scanCount, setScanCount] = useState(0);
    const [lockingText, setLockingText] = useState<string | null>(null);
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

    useEffect(() => {
        digitalZoomRef.current = capabilities.zoom ? 1 : zoom;
    }, [capabilities.zoom, zoom]);

    const stopFrameLoop = useCallback(() => {
        const video = videoRef.current as VideoWithFrameCallback | null;
        if (frameCallbackRef.current !== null && video?.cancelVideoFrameCallback) {
            video.cancelVideoFrameCallback(frameCallbackRef.current);
        }
        if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
        frameCallbackRef.current = null;
        fallbackTimerRef.current = null;
    }, []);

    /** Writes lock progress straight to the DOM so the ring animates at frame rate without re-rendering. */
    const paintLock = useCallback((progress: number) => {
        const ring = lockRingRef.current;
        if (ring) {
            ring.style.strokeDashoffset = String(100 - progress * 100);
            ring.style.opacity = progress > 0 ? '1' : '0';
        }
    }, []);

    const setLockTarget = useCallback((text: string | null) => {
        if (lockingTextRef.current === text) return;
        lockingTextRef.current = text;
        setLockingText(text);
        if (!text) {
            paintLock(0);
            targetBoxRef.current?.style.setProperty('opacity', '0');
        }
    }, [paintLock]);

    const resetLock = useCallback(() => {
        lockRef.current = EMPTY_SCAN_LOCK;
        setLockTarget(null);
    }, [setLockTarget]);

    const stopCamera = useCallback(() => {
        stopFrameLoop();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        trackRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setTorchOn(false);
        resetLock();
    }, [resetLock, stopFrameLoop]);

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
        setLockTarget(null);
        setLastScan(text);
        setScanCount((count) => count + 1);
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
    }, [closeScanner, playSuccessFeedback, setLockTarget]);

    /**
     * Single gate for every live decode. Only the code centred in the aim circle can build a
     * lock, and it must hold there for a short dwell before it is accepted — so sweeping the
     * phone across a tray of neighbouring labels never fires on the wrong piece.
     */
    const handleLiveCandidates = useCallback((videoCandidates: QrCandidate[], now: number) => {
        const video = videoRef.current;
        const viewport = viewportRef.current;
        const reticle = reticleRef.current;
        if (!video || !viewport || !reticle || !videoCandidates.length) return;
        if (now < pauseUntilRef.current) return;

        const viewportBounds = viewport.getBoundingClientRect();
        const reticleBounds = reticle.getBoundingClientRect();
        const mapping = {
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            viewportWidth: viewportBounds.width,
            viewportHeight: viewportBounds.height,
            digitalZoom: digitalZoomRef.current,
        };
        const candidates: AimCandidate[] = videoCandidates.map((candidate) => {
            const point = mapVideoPointToViewport(candidate, mapping);
            return { text: candidate.text, x: point.x, y: point.y, size: candidate.size * point.scale };
        });
        const aim = {
            x: reticleBounds.left - viewportBounds.left + reticleBounds.width / 2,
            y: reticleBounds.top - viewportBounds.top + reticleBounds.height / 2,
            radius: reticleBounds.width * AIM_RADIUS_RATIO,
        };
        const aimed = pickAimedCandidate(candidates, aim);
        if (!aimed) {
            if (!lockRef.current.text && now > offTargetUntilRef.current) {
                offTargetUntilRef.current = now + 1600;
                setGuidance(SCANNER_COPY.offTargetGuidance);
            }
            return;
        }

        const observation = observeScanLock(lockRef.current, aimed.text, now);
        lockRef.current = observation.state;
        if (observation.confirmed) {
            acceptResult(aimed.text);
            return;
        }
        if (!observation.state.text) return;

        const box = targetBoxRef.current;
        if (box) {
            const side = Math.max(48, aimed.size * 1.18);
            box.style.width = `${side}px`;
            box.style.height = `${side}px`;
            box.style.transform = `translate3d(${aimed.x - side / 2}px, ${aimed.y - side / 2}px, 0)`;
            box.style.opacity = '1';
        }
        if (lockingTextRef.current !== aimed.text) setGuidance(SCANNER_COPY.lockingGuidance);
        setLockTarget(aimed.text);
        paintLock(observation.progress);
    }, [acceptResult, paintLock, setLockTarget]);

    const captureCameraFrame = useCallback((fullFrame: boolean): { image: ImageData; transform: CaptureTransform } | null => {
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
        return {
            image: context.getImageData(0, 0, outputWidth, outputHeight),
            transform: { x: source.x, y: source.y, scale: outputWidth / source.width },
        };
    }, [capabilities.zoom, zoom]);

    const dispatchFrameToWorker = useCallback((now: number) => {
        if (!workerReadyRef.current || workerInFlightRef.current || now < nextWorkerAttemptRef.current) return;
        if (now < pauseUntilRef.current) return;

        attemptRef.current += 1;
        const fullFrame = attemptRef.current % 5 === 0;
        const capture = captureCameraFrame(fullFrame);
        if (!capture || !workerRef.current) return;
        const { image, transform } = capture;

        const enhanced = now - startedAtRef.current >= 600 && attemptRef.current % 2 === 0;
        if (enhanced) setStatus((current) => current === 'success' ? current : 'difficult-print');
        const requestId = ++requestRef.current;
        captureTransformsRef.current.set(requestId, transform);
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

        const lock = expireScanLock(lockRef.current, now);
        lockRef.current = lock;
        if (lock.text) {
            paintLock(getScanLockProgress(lock, now));
        } else if (lockingTextRef.current) {
            setLockTarget(null);
            setGuidance(SCANNER_COPY.readyGuidance);
        }

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
                    if (sessionId !== sessionRef.current) return;
                    const candidates = results
                        .map(nativeResultToCandidate)
                        .filter((candidate): candidate is QrCandidate => candidate !== null);
                    handleLiveCandidates(candidates, performance.now());
                })
                .catch(() => undefined)
                .finally(() => { nativeInFlightRef.current = false; });
        }

        dispatchFrameToWorker(now);
        if (now - startedAtRef.current > 600 && status !== 'success') {
            setStatus((current) => current === 'ready' ? 'difficult-print' : current);
        }
    }, [dispatchFrameToWorker, handleLiveCandidates, paintLock, setLockTarget, status]);

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
        captureTransformsRef.current.clear();
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
            const transform = captureTransformsRef.current.get(message.requestId);
            captureTransformsRef.current.delete(message.requestId);
            if (!isCurrentScannerSession(message.sessionId, sessionRef.current)) return;
            if (message.type === 'decode-error') {
                nextWorkerAttemptRef.current = performance.now() + 250;
                return;
            }

            workerIntervalRef.current = getAdaptiveDecodeInterval(message.durationMs);
            nextWorkerAttemptRef.current = performance.now() + workerIntervalRef.current;
            if (message.source === 'photo') {
                // A still photo has no aim; take the code nearest the middle of the picture.
                const centreX = message.width / 2;
                const centreY = message.height / 2;
                const best = [...message.candidates].sort((a, b) =>
                    Math.hypot(a.x - centreX, a.y - centreY) - Math.hypot(b.x - centreX, b.y - centreY))[0];
                if (best) {
                    acceptResult(best.text);
                    if (continuousRef.current) {
                        window.setTimeout(() => void startCamera(activeCameraIdRef.current || undefined), 720);
                    }
                    return;
                }
                pauseUntilRef.current = 0;
                setStatus('error');
                setErrorDetail(SCANNER_COPY.photoNotFound);
                return;
            }
            if (message.candidates.length && transform) {
                handleLiveCandidates(message.candidates.map((candidate) => ({
                    text: candidate.text,
                    x: transform.x + candidate.x / transform.scale,
                    y: transform.y + candidate.y / transform.scale,
                    size: candidate.size / transform.scale,
                })), performance.now());
                return;
            }
            if (lockingTextRef.current) return;
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
    }, [acceptResult, handleLiveCandidates, startCamera, workerGeneration]);

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

    const applyZoom = async (value: number) => {
        setZoom(value);
        resetLock();
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
        resetLock();
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
    const isSuccess = status === 'success';
    const isLocking = Boolean(lockingText) && !isSuccess;
    const zoomMinimum = capabilities.zoom?.min ?? 1;
    const zoomMaximum = capabilities.zoom ? Math.min(capabilities.zoom.max, 5) : 2.5;
    const zoomStep = capabilities.zoom?.step ?? 0.1;
    const zoomPresets = ZOOM_PRESETS.filter((preset) => preset >= zoomMinimum - 0.01 && preset <= zoomMaximum + 0.01);
    const activeStage = status === 'opening' ? 0 : status === 'warming' ? 1 : 2;
    const isEnhancing = status === 'difficult-print' && !isLocking;
    const lastScanMatch = lastScan && products
        ? findProductByScannedCode(lastScan, products)
        : null;
    const lastScanMaster = lastScanMatch?.product.sku || lastScan;
    const lastScanSuffix = lastScanMatch
        ? (lastScanMatch.variant?.suffix || '')
        : undefined;
    const lockingMatch = lockingText && products ? findProductByScannedCode(lockingText, products) : null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ilios-vision-title"
            className="ilios-scanner-shell fixed inset-0 z-[250] flex flex-col overflow-hidden bg-black font-sans text-white select-none"
        >
            <header
                className="absolute inset-x-0 top-0 z-50 flex items-center justify-between bg-gradient-to-b from-black/80 via-black/45 to-transparent px-4 pb-8 sm:px-6"
                style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
            >
                <div className="flex min-w-0 items-center gap-3">
                    <div className={`ilios-brand-mark relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl transition-all duration-500 ${isSuccess ? 'ilios-brand-mark-success' : ''}`}>
                        <Target className="relative text-white" size={21} strokeWidth={2.4} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h1 id="ilios-vision-title" className="truncate text-lg font-black leading-none tracking-tight sm:text-xl">
                            Ilios <span className="bg-gradient-to-r from-emerald-200 to-teal-300 bg-clip-text text-transparent">Vision</span>
                        </h1>
                        <p className="mt-1.5 flex items-center gap-1.5 truncate text-[9px] font-black uppercase tracking-[0.18em] text-white/55">
                            <span className={`ilios-status-dot h-1.5 w-1.5 rounded-full ${isSuccess ? 'bg-emerald-200' : isLocking ? 'bg-emerald-300' : isEnhancing ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                            {capabilities.zoom ? SCANNER_COPY.opticalZoom : SCANNER_COPY.digitalZoom} · {formatDecimal(zoom, 1)}×
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {cameras.length > 1 && (
                        <button type="button" onClick={switchCamera} aria-label={SCANNER_COPY.aria.switchCamera} className="ilios-glass-button grid h-11 w-11 place-items-center rounded-full text-white/85 active:scale-95">
                            <SwitchCamera size={19} />
                        </button>
                    )}
                    {capabilities.torch && (
                        <button
                            type="button"
                            onClick={() => void toggleTorch()}
                            aria-label={torchOn ? SCANNER_COPY.aria.torchOff : SCANNER_COPY.aria.torchOn}
                            aria-pressed={torchOn}
                            className={`grid h-11 w-11 place-items-center rounded-full border transition active:scale-95 ${torchOn ? 'border-amber-200/80 bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_26px_rgba(245,158,11,0.55)]' : 'ilios-glass-button text-white/80'}`}
                        >
                            <Zap size={19} className={torchOn ? 'fill-current' : ''} />
                        </button>
                    )}
                    <button type="button" onClick={closeScanner} aria-label={SCANNER_COPY.aria.close} className="ilios-glass-button grid h-11 w-11 place-items-center rounded-full text-white hover:!bg-red-500/30 hover:text-red-200 active:scale-95">
                        <X size={20} />
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
                    className={`h-full w-full origin-center object-cover contrast-110 transition-[transform,filter] duration-500 motion-reduce:transition-none ${isSuccess ? 'brightness-75 saturate-50 blur-[1px]' : 'brightness-110 saturate-100'}`}
                    style={{ transform: capabilities.zoom ? undefined : `scale(${zoom})` }}
                    playsInline
                    muted
                    autoPlay
                    aria-label={SCANNER_COPY.aria.preview}
                />

                {/* Lock-on brackets that follow the code being confirmed. */}
                <div
                    ref={targetBoxRef}
                    className="ilios-target-box pointer-events-none absolute left-0 top-0 z-20 opacity-0"
                    aria-hidden="true"
                >
                    <span className="ilios-target-corner left-0 top-0 rounded-tl-xl border-l-[3px] border-t-[3px]" />
                    <span className="ilios-target-corner right-0 top-0 rounded-tr-xl border-r-[3px] border-t-[3px]" />
                    <span className="ilios-target-corner bottom-0 left-0 rounded-bl-xl border-b-[3px] border-l-[3px]" />
                    <span className="ilios-target-corner bottom-0 right-0 rounded-br-xl border-b-[3px] border-r-[3px]" />
                    <span className="absolute inset-0 rounded-xl bg-emerald-300/10" />
                </div>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <div className="relative aspect-square w-[min(68vw,19rem)]">
                        {/* Dims everything outside the reticle so the target reads instantly. */}
                        <div className={`ilios-reticle-mask absolute inset-0 rounded-[2.25rem] transition-[box-shadow] duration-500 ${isSuccess ? 'ilios-reticle-mask-strong' : ''}`} aria-hidden="true" />
                        <div
                            ref={reticleRef}
                            className={`absolute inset-0 transition-transform duration-500 motion-reduce:transition-none ${isSuccess ? 'ilios-reticle-locked' : isLocking ? 'scale-[0.985]' : isEnhancing ? 'ilios-reticle-enhancing' : 'ilios-reticle-breathe'}`}
                            aria-hidden="true"
                        >

                            <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100">
                                <defs>
                                    <linearGradient id="ilios-corner-idle" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#a7f3d0" />
                                        <stop offset="100%" stopColor="#10b981" />
                                    </linearGradient>
                                    <linearGradient id="ilios-corner-enhancing" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#fde68a" />
                                        <stop offset="100%" stopColor="#f59e0b" />
                                    </linearGradient>
                                    <linearGradient id="ilios-lock-ring" x1="0" y1="0" x2="1" y2="1">
                                        <stop offset="0%" stopColor="#ecfdf5" />
                                        <stop offset="55%" stopColor="#6ee7b7" />
                                        <stop offset="100%" stopColor="#2dd4bf" />
                                    </linearGradient>
                                </defs>
                                <g
                                    className="ilios-reticle-corners"
                                    fill="none"
                                    stroke={isEnhancing ? 'url(#ilios-corner-enhancing)' : 'url(#ilios-corner-idle)'}
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                >
                                    <path d="M1.5 22 V13 Q1.5 1.5 13 1.5 H22" />
                                    <path d="M78 1.5 H87 Q98.5 1.5 98.5 13 V22" />
                                    <path d="M98.5 78 V87 Q98.5 98.5 87 98.5 H78" />
                                    <path d="M22 98.5 H13 Q1.5 98.5 1.5 87 V78" />
                                </g>
                                <rect
                                    x="1.5" y="1.5" width="97" height="97" rx="11.5" ry="11.5"
                                    fill="none"
                                    stroke="rgba(255,255,255,0.08)"
                                    strokeWidth="0.35"
                                />
                                <rect
                                    ref={lockRingRef}
                                    className="ilios-lock-ring"
                                    x="1.5" y="1.5" width="97" height="97" rx="11.5" ry="11.5"
                                    fill="none"
                                    stroke="url(#ilios-lock-ring)"
                                    strokeWidth="1.4"
                                    strokeLinecap="round"
                                    pathLength={100}
                                    strokeDasharray="100"
                                    strokeDashoffset="100"
                                    style={{ opacity: 0 }}
                                />
                            </svg>

                            {/* Aim zone: a code is only read when its centre sits inside this circle. */}
                            <div className="absolute inset-0 grid place-items-center">
                                <div
                                    className={`ilios-aim-zone relative grid place-items-center rounded-full border transition-all duration-300 ${isLocking || isSuccess ? 'scale-95 border-solid border-emerald-200/80 bg-emerald-300/[0.07] shadow-[0_0_30px_rgba(110,231,183,0.35)]' : `border-dashed ${isEnhancing ? 'border-amber-200/35' : 'border-white/30'}`}`}
                                    style={{ width: `${AIM_RADIUS_RATIO * 200}%`, height: `${AIM_RADIUS_RATIO * 200}%` }}
                                >
                                    <span className={`h-2 w-2 rounded-full transition-all duration-300 ${isLocking || isSuccess ? 'scale-125 bg-emerald-200 shadow-[0_0_14px_rgba(167,243,208,0.95)]' : 'bg-white/70 shadow-[0_0_10px_rgba(255,255,255,0.6)]'}`} />
                                    <span className="absolute left-1/2 top-0 h-2 w-px -translate-x-1/2 bg-white/35" />
                                    <span className="absolute bottom-0 left-1/2 h-2 w-px -translate-x-1/2 bg-white/35" />
                                    <span className="absolute left-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/35" />
                                    <span className="absolute right-0 top-1/2 h-px w-2 -translate-y-1/2 bg-white/35" />
                                </div>
                            </div>

                            {!isSuccess && !isLocking && !isCameraError && (
                                <div className="ilios-scan-beam absolute inset-x-5 h-10 motion-reduce:hidden">
                                    <div className={`absolute inset-x-0 bottom-0 h-full bg-gradient-to-t ${isEnhancing ? 'from-amber-300/20' : 'from-emerald-300/20'} to-transparent`} />
                                    <div className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent ${isEnhancing ? 'via-amber-200 shadow-[0_0_18px_rgba(251,191,36,0.95)]' : 'via-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.95)]'} to-transparent`} />
                                </div>
                            )}

                            {isLocking && (
                                <div className="ilios-lock-chip absolute -top-12 left-1/2 flex max-w-[110%] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200/40 bg-emerald-950/75 py-1.5 pl-2 pr-3.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-300/20">
                                        <Crosshair size={12} className="text-emerald-200" />
                                    </span>
                                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200/80">{SCANNER_COPY.locking}</span>
                                    <span className="truncate rounded-md bg-white px-1.5 py-0.5">
                                        <SkuColorizedText
                                            sku={lockingMatch?.product.sku || lockingText || ''}
                                            suffix={lockingMatch ? (lockingMatch.variant?.suffix || '') : undefined}
                                            gender={lockingMatch?.product.gender}
                                            className="block truncate text-xs leading-tight"
                                            masterClassName="text-slate-900"
                                        />
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {!isCameraError && !isSuccess && (
                        <div key={isLocking ? 'locking' : status} className="ilios-status-card mt-7 w-[min(86vw,21rem)] rounded-[1.4rem] border border-white/10 bg-black/55 px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                            <p className="flex items-center justify-center gap-2 text-center text-[10px] font-black uppercase tracking-[0.12em] text-white/85">
                                {status === 'opening' || status === 'warming'
                                    ? <Loader2 size={13} className="shrink-0 animate-spin text-emerald-400 motion-reduce:animate-none" />
                                    : isLocking ? <Crosshair size={13} className="shrink-0 text-emerald-300" />
                                        : isEnhancing ? <Sparkles size={13} className="shrink-0 text-amber-300" />
                                            : capabilities.tapToFocus ? <Focus size={13} className="shrink-0 text-emerald-400" /> : <Scan size={13} className="shrink-0 text-emerald-400" />}
                                {isLocking ? SCANNER_COPY.lockingGuidance : SCANNER_STATUS_COPY[status]}
                            </p>
                            <div className="mt-2.5 grid grid-cols-3 gap-1.5" aria-hidden="true">
                                {[SCANNER_COPY.cameraStage, SCANNER_COPY.analysisStage, SCANNER_COPY.scanningStage].map((label, index) => {
                                    const reached = activeStage >= index;
                                    const current = activeStage === index;
                                    const amber = index === 2 && isEnhancing;
                                    return (
                                        <div key={label} className="flex flex-col items-center gap-1">
                                            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                                                <div className={`h-full rounded-full transition-all duration-500 ${reached ? `w-full ${amber ? 'bg-amber-300' : 'bg-gradient-to-r from-emerald-400 to-teal-300'}` : 'w-0'} ${current && index < 2 ? 'ilios-stage-pulse' : ''}`} />
                                            </div>
                                            <span className={`text-[8px] font-black uppercase tracking-wider transition-colors ${reached ? (amber ? 'text-amber-200/90' : 'text-emerald-200/90') : 'text-white/30'}`}>{label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {isSuccess && (
                    <div className="ilios-success-backdrop pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-emerald-950/50 px-6 backdrop-blur-[3px]">
                        <div className="ilios-success-card relative flex w-full max-w-xs flex-col items-center overflow-hidden rounded-[2.25rem] border border-emerald-200/25 bg-black/70 px-6 pb-6 pt-7 text-center shadow-[0_24px_80px_rgba(5,150,105,0.4)] backdrop-blur-2xl">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(ellipse_at_top,rgba(110,231,183,0.28),transparent_70%)]" />
                            <div className="ilios-success-mark relative flex h-24 w-24 items-center justify-center">
                                <span className="ilios-success-ring absolute inset-0 rounded-full border border-emerald-200/45" />
                                <span className="ilios-success-ring ilios-success-ring-delayed absolute inset-2 rounded-full border border-emerald-300/35" />
                                {lastScanMatch?.product.image_url ? (
                                    <>
                                        <img src={lastScanMatch.product.image_url} alt="" className="absolute inset-2 h-20 w-20 rounded-full border-2 border-emerald-200/70 object-cover shadow-[0_0_40px_rgba(110,231,183,0.4)]" />
                                        <span className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border-2 border-black bg-emerald-400 text-emerald-950 shadow-lg">
                                            <CheckCircle2 size={20} strokeWidth={2.6} />
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <span className="absolute inset-3 rounded-full bg-emerald-300/15 shadow-[0_0_45px_rgba(110,231,183,0.35)]" />
                                        <CheckCircle2 size={56} strokeWidth={2.4} className="relative text-emerald-200" />
                                    </>
                                )}
                            </div>
                            <p className="relative mt-4 flex items-center gap-2 text-[10px] font-black tracking-[0.24em] text-emerald-200">
                                <Sparkles size={13} /> {SCANNER_COPY.detected}
                            </p>
                            <div className="relative mt-3 max-w-full rounded-2xl border border-white/80 bg-white px-4 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.28)]">
                                <SkuColorizedText
                                    sku={lastScanMaster}
                                    suffix={lastScanSuffix}
                                    gender={lastScanMatch?.product.gender}
                                    className="block break-all text-2xl leading-tight sm:text-3xl"
                                    masterClassName="text-slate-900"
                                />
                            </div>
                            {lastScanMatch?.product.category && (
                                <p className="relative mt-2 text-[11px] font-bold uppercase tracking-wider text-white/60">{lastScanMatch.product.category}</p>
                            )}
                            <p className="relative mt-1.5 text-xs font-semibold text-white/50">{continuous ? SCANNER_COPY.nextGuidance : SCANNER_COPY.transferring}</p>
                            <div className="relative mt-5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                                <div className="ilios-success-progress h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-teal-200" />
                            </div>
                        </div>
                    </div>
                )}

                {isCameraError && (
                    <div className="animate-in fade-in zoom-in-95 absolute inset-x-5 top-1/2 z-40 mx-auto max-w-md -translate-y-1/2 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/90 p-7 text-center shadow-2xl backdrop-blur-2xl duration-300 motion-reduce:animate-none">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.18),transparent_70%)]" />
                        <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-amber-300/25 bg-amber-400/10">
                            <AlertTriangle className="text-amber-300" size={30} />
                        </div>
                        <h2 className="relative text-xl font-black">{SCANNER_STATUS_COPY[status]}</h2>
                        <p className="relative mt-2 text-sm leading-relaxed text-white/60">{errorDetail}</p>
                        <div className="relative mt-6 grid grid-cols-2 gap-3">
                            <button type="button" onClick={retryScanner} className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 px-4 py-3 text-sm font-black text-white shadow-[0_10px_30px_rgba(16,185,129,0.35)] transition hover:brightness-110 active:scale-95">
                                <RefreshCw size={17} /> {SCANNER_COPY.retry}
                            </button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15 active:scale-95">
                                <ImagePlus size={17} /> {SCANNER_COPY.photo}
                            </button>
                        </div>
                    </div>
                )}

                <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_150px_rgba(0,0,0,0.6)]" />
            </div>

            <footer
                className={`absolute inset-x-0 bottom-0 z-50 bg-gradient-to-t from-black via-black/85 to-transparent px-5 pt-16 transition-all duration-300 sm:px-8 ${isSuccess ? 'pointer-events-none translate-y-4 opacity-0' : 'translate-y-0 opacity-100'}`}
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
                <div aria-live="polite" aria-atomic="true" className="mx-auto mb-4 max-w-md text-center">
                    <p key={guidance} className="ilios-guidance text-xs font-semibold leading-relaxed text-white/70">{guidance}</p>
                    {lastScan && continuous && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 mt-3 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/95 p-2.5 text-left text-slate-900 shadow-[0_14px_40px_rgba(0,0,0,0.4)] duration-300 motion-reduce:animate-none">
                            {lastScanMatch?.product.image_url ? (
                                <img src={lastScanMatch.product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover ring-2 ring-emerald-200" />
                            ) : (
                                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600"><CheckCircle2 size={20} /></div>
                            )}
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
                            <div key={scanCount} className="ilios-count-pop shrink-0 rounded-xl bg-slate-900 px-2.5 py-1.5 text-center text-white">
                                <p className="text-base font-black leading-none">{scanCount}</p>
                                <p className="mt-0.5 text-[7px] font-black uppercase tracking-widest text-white/50">{SCANNER_COPY.scanCount}</p>
                            </div>
                        </div>
                    )}
                </div>

                {zoomPresets.length > 1 && (
                    <div className="mx-auto mb-3 flex w-fit items-center gap-1 rounded-full border border-white/10 bg-white/[0.07] p-1 backdrop-blur-xl" role="group" aria-label={SCANNER_COPY.aria.zoomPreset}>
                        {zoomPresets.map((preset) => {
                            const active = Math.abs(zoom - preset) < 0.15;
                            return (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => void applyZoom(preset)}
                                    aria-pressed={active}
                                    className={`h-8 min-w-[2.75rem] rounded-full px-2.5 text-[11px] font-black tabular-nums transition-all active:scale-95 ${active ? 'bg-white text-slate-900 shadow-[0_4px_14px_rgba(255,255,255,0.25)]' : 'text-white/70 hover:bg-white/10'}`}
                                >
                                    {formatDecimal(preset, preset % 1 ? 1 : 0)}×
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="mx-auto flex max-w-md items-center gap-3">
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        aria-label={SCANNER_COPY.aria.photo}
                        className="ilios-glass-button flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-xs font-black text-white/90 active:scale-95"
                    >
                        <ImagePlus size={16} /> {SCANNER_COPY.photo}
                    </button>
                    <ZoomOut size={16} className="shrink-0 text-white/40" aria-hidden="true" />
                    <input
                        type="range"
                        min={zoomMinimum}
                        max={zoomMaximum}
                        step={zoomStep}
                        value={Math.max(zoomMinimum, Math.min(zoomMaximum, zoom))}
                        onChange={(event) => void applyZoom(Number(event.target.value))}
                        aria-label={capabilities.zoom ? SCANNER_COPY.aria.opticalZoom : SCANNER_COPY.aria.digitalZoom}
                        className="ilios-zoom-slider h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full"
                        style={{ '--ilios-zoom-fill': `${((Math.max(zoomMinimum, Math.min(zoomMaximum, zoom)) - zoomMinimum) / Math.max(0.01, zoomMaximum - zoomMinimum)) * 100}%` } as React.CSSProperties}
                    />
                    <ZoomIn size={16} className="shrink-0 text-white/40" aria-hidden="true" />
                </div>
            </footer>

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void handlePhoto(event)} />

            <style>{`
                @keyframes ilios-scanner-enter {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes ilios-scan {
                    0% { top: 4%; opacity: 0; transform: scaleX(.72); }
                    14%, 86% { opacity: 1; }
                    50% { transform: scaleX(1); }
                    100% { top: 82%; opacity: 0; transform: scaleX(.72); }
                }
                @keyframes ilios-reticle-breathe {
                    0%, 100% { filter: drop-shadow(0 0 6px rgba(52, 211, 153, .22)); }
                    50% { filter: drop-shadow(0 0 16px rgba(52, 211, 153, .45)); }
                }
                @keyframes ilios-reticle-enhancing {
                    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(251, 191, 36, .24)); }
                    50% { transform: scale(1.012); filter: drop-shadow(0 0 18px rgba(251, 191, 36, .45)); }
                }
                @keyframes ilios-reticle-lock {
                    0% { transform: scale(1.06); filter: drop-shadow(0 0 0 rgba(110, 231, 183, 0)); }
                    45% { transform: scale(.96); filter: drop-shadow(0 0 26px rgba(110, 231, 183, .75)); }
                    100% { transform: scale(1); filter: drop-shadow(0 0 14px rgba(110, 231, 183, .42)); }
                }
                @keyframes ilios-status-enter {
                    from { opacity: 0; transform: translateY(8px) scale(.97); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes ilios-fade-up {
                    from { opacity: 0; transform: translateY(4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes ilios-status-dot {
                    0%, 100% { opacity: .45; }
                    50% { opacity: 1; }
                }
                @keyframes ilios-stage-pulse {
                    0%, 100% { opacity: .55; }
                    50% { opacity: 1; }
                }
                @keyframes ilios-lock-chip {
                    from { opacity: 0; transform: translate(-50%, 6px) scale(.92); }
                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                }
                @keyframes ilios-target-pulse {
                    0%, 100% { filter: drop-shadow(0 0 4px rgba(110, 231, 183, .55)); }
                    50% { filter: drop-shadow(0 0 12px rgba(110, 231, 183, .95)); }
                }
                @keyframes ilios-count-pop {
                    0% { transform: scale(.7); }
                    60% { transform: scale(1.12); }
                    100% { transform: scale(1); }
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
                .ilios-glass-button {
                    border: 1px solid rgba(255, 255, 255, .14);
                    background: rgba(255, 255, 255, .09);
                    backdrop-filter: blur(18px) saturate(1.4);
                    -webkit-backdrop-filter: blur(18px) saturate(1.4);
                    transition: background-color .2s ease, transform .15s ease, color .2s ease;
                }
                .ilios-glass-button:hover { background: rgba(255, 255, 255, .18); }
                .ilios-brand-mark {
                    background: linear-gradient(140deg, #34d399 0%, #059669 55%, #0f766e 100%);
                    box-shadow: 0 8px 26px rgba(16, 185, 129, .35), inset 0 1px 0 rgba(255, 255, 255, .35);
                }
                .ilios-brand-mark::after {
                    content: '';
                    position: absolute;
                    inset: 1px;
                    border-radius: inherit;
                    background: linear-gradient(180deg, rgba(255, 255, 255, .22), transparent 55%);
                }
                .ilios-brand-mark-success { box-shadow: 0 0 36px rgba(110, 231, 183, .6), inset 0 1px 0 rgba(255, 255, 255, .35); }
                .ilios-reticle-mask { box-shadow: 0 0 0 200vmax rgba(2, 6, 5, .5); }
                .ilios-reticle-mask-strong { box-shadow: 0 0 0 200vmax rgba(2, 6, 5, .7); }
                .ilios-reticle-corners { transition: stroke .35s ease; }
                .ilios-lock-ring {
                    transition: opacity .2s ease;
                    filter: drop-shadow(0 0 6px rgba(110, 231, 183, .85));
                }
                .ilios-scan-beam { animation: ilios-scan 1.8s cubic-bezier(.45, 0, .55, 1) infinite; }
                .ilios-reticle-breathe { animation: ilios-reticle-breathe 2.4s ease-in-out infinite; }
                .ilios-reticle-enhancing { animation: ilios-reticle-enhancing 1.1s ease-in-out infinite; }
                .ilios-reticle-locked { animation: ilios-reticle-lock .42s cubic-bezier(.2, .9, .25, 1.2) both; }
                .ilios-target-box {
                    will-change: transform, width, height, opacity;
                    transition: transform .12s ease-out, width .12s ease-out, height .12s ease-out, opacity .18s ease;
                    animation: ilios-target-pulse .9s ease-in-out infinite;
                }
                .ilios-target-corner {
                    position: absolute;
                    width: 30%;
                    height: 30%;
                    border-color: #a7f3d0;
                }
                .ilios-lock-chip { animation: ilios-lock-chip .22s cubic-bezier(.2, .9, .3, 1.1) both; }
                .ilios-status-card { animation: ilios-status-enter .28s ease-out both; }
                .ilios-guidance { animation: ilios-fade-up .25s ease-out both; }
                .ilios-status-dot { animation: ilios-status-dot 1.6s ease-in-out infinite; }
                .ilios-stage-pulse { animation: ilios-stage-pulse 1.1s ease-in-out infinite; }
                .ilios-count-pop { animation: ilios-count-pop .35s cubic-bezier(.2, .9, .3, 1.3) both; }
                .ilios-zoom-slider {
                    background: linear-gradient(90deg, #34d399 0%, #2dd4bf var(--ilios-zoom-fill, 0%), rgba(255, 255, 255, .18) var(--ilios-zoom-fill, 0%));
                }
                .ilios-zoom-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 22px;
                    height: 22px;
                    border-radius: 9999px;
                    background: #fff;
                    border: 3px solid #10b981;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, .45), 0 0 0 4px rgba(16, 185, 129, .18);
                }
                .ilios-zoom-slider::-moz-range-thumb {
                    width: 18px;
                    height: 18px;
                    border-radius: 9999px;
                    background: #fff;
                    border: 3px solid #10b981;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, .45);
                }
                .ilios-success-backdrop { animation: ilios-success-backdrop .18s ease-out both; }
                .ilios-success-card { animation: ilios-success-card .46s cubic-bezier(.2, .85, .25, 1.1) both; }
                .ilios-success-mark { animation: ilios-success-mark .48s cubic-bezier(.2, .9, .25, 1.15) .05s both; }
                .ilios-success-ring { animation: ilios-success-ring .9s ease-out .08s both; }
                .ilios-success-ring-delayed { animation-delay: .2s; }
                .ilios-success-progress { animation: ilios-success-progress .68s linear .04s both; }
                @media (prefers-reduced-motion: reduce) {
                    .ilios-scan-beam { animation: none; top: 45%; opacity: .55; }
                    .ilios-scanner-shell,
                    .ilios-reticle-breathe,
                    .ilios-reticle-enhancing,
                    .ilios-reticle-locked,
                    .ilios-target-box,
                    .ilios-lock-chip,
                    .ilios-status-card,
                    .ilios-guidance,
                    .ilios-status-dot,
                    .ilios-stage-pulse,
                    .ilios-count-pop,
                    .ilios-success-backdrop,
                    .ilios-success-card,
                    .ilios-success-mark,
                    .ilios-success-ring,
                    .ilios-success-progress { animation: none; }
                    .ilios-target-box { transition: opacity .18s ease; }
                    .ilios-reticle-corners { transition: none; }
                }
            `}</style>
        </div>
    );
}
