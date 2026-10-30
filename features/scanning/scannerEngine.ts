import { CropRect, ScannerStatus } from './scannerTypes';
import { SCANNER_COPY } from './scannerCopy';

export interface CoverCropInput {
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  target: CropRect;
  paddingRatio?: number;
  digitalZoom?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Maps a reticle in viewport pixels onto the source video under object-cover. */
export function computeObjectCoverCrop({
  videoWidth,
  videoHeight,
  viewportWidth,
  viewportHeight,
  target,
  paddingRatio = 0.25,
  digitalZoom = 1,
}: CoverCropInput): CropRect {
  if (!videoWidth || !videoHeight || !viewportWidth || !viewportHeight) {
    return { x: 0, y: 0, width: Math.max(1, videoWidth), height: Math.max(1, videoHeight) };
  }

  const zoom = Math.max(1, digitalZoom);
  const coverScale = Math.max(viewportWidth / videoWidth, viewportHeight / videoHeight);
  const renderedWidth = videoWidth * coverScale;
  const renderedHeight = videoHeight * coverScale;
  const coverOffsetX = (renderedWidth - viewportWidth) / 2;
  const coverOffsetY = (renderedHeight - viewportHeight) / 2;
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;

  // Undo the preview's centered digital scale before undoing object-cover.
  const unzoomX = (target.x - centerX) / zoom + centerX;
  const unzoomY = (target.y - centerY) / zoom + centerY;
  const unzoomWidth = target.width / zoom;
  const unzoomHeight = target.height / zoom;

  let x = (unzoomX + coverOffsetX) / coverScale;
  let y = (unzoomY + coverOffsetY) / coverScale;
  let width = unzoomWidth / coverScale;
  let height = unzoomHeight / coverScale;

  x -= width * paddingRatio;
  y -= height * paddingRatio;
  width *= 1 + paddingRatio * 2;
  height *= 1 + paddingRatio * 2;

  const left = clamp(Math.floor(x), 0, Math.max(0, videoWidth - 1));
  const top = clamp(Math.floor(y), 0, Math.max(0, videoHeight - 1));
  const right = clamp(Math.ceil(x + width), left + 1, videoWidth);
  const bottom = clamp(Math.ceil(y + height), top + 1, videoHeight);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function getAdaptiveDecodeInterval(durationMs: number): number {
  return Math.round(clamp(durationMs * 1.35 + 35, 120, 350));
}

export function isDuplicateScan(
  text: string,
  previous: { text: string; at: number } | null,
  now: number,
  suppressionMs = 1500,
): boolean {
  return Boolean(previous && previous.text === text && now - previous.at < suppressionMs);
}

export function isCurrentScannerSession(messageSessionId: number, activeSessionId: number): boolean {
  return messageSessionId === activeSessionId;
}

export interface CameraErrorInfo {
  status: Extract<ScannerStatus, 'permission-denied' | 'camera-busy' | 'camera-unavailable' | 'error'>;
  title: string;
  detail: string;
}

export function describeCameraError(error: unknown): CameraErrorInfo {
  const name = error instanceof DOMException ? error.name : (error as { name?: string } | null)?.name;

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      status: 'permission-denied',
      title: SCANNER_COPY.errors.permissionTitle,
      detail: SCANNER_COPY.errors.permissionDetail,
    };
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return {
      status: 'camera-busy',
      title: SCANNER_COPY.errors.busyTitle,
      detail: SCANNER_COPY.errors.busyDetail,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      status: 'camera-unavailable',
      title: SCANNER_COPY.errors.unavailableTitle,
      detail: SCANNER_COPY.errors.unavailableDetail,
    };
  }
  return {
    status: 'error',
    title: SCANNER_COPY.errors.genericTitle,
    detail: SCANNER_COPY.errors.genericDetail,
  };
}

export function getFrameDiagnostics(data: Uint8ClampedArray, width: number, height: number) {
  if (!data.length || !width || !height) return { brightness: 0, sharpness: 0 };

  const pixelCount = width * height;
  const sampleStep = Math.max(1, Math.floor(Math.sqrt(pixelCount / 12000)));
  let luminanceTotal = 0;
  let edgeTotal = 0;
  let samples = 0;

  for (let y = 0; y < height; y += sampleStep) {
    let previous = -1;
    for (let x = 0; x < width; x += sampleStep) {
      const index = (y * width + x) * 4;
      const luminance = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      luminanceTotal += luminance;
      if (previous >= 0) edgeTotal += Math.abs(luminance - previous);
      previous = luminance;
      samples += 1;
    }
  }

  return {
    brightness: Math.round(luminanceTotal / Math.max(1, samples)),
    sharpness: Math.round((edgeTotal / Math.max(1, samples)) * 10) / 10,
  };
}

/** Contrast stretch that preserves hard QR edges while helping faded thermal prints. */
export function normalizeQrContrast(image: ImageData): ImageData {
  const values: number[] = [];
  const stride = Math.max(4, Math.floor(image.data.length / 16000 / 4) * 4);
  for (let index = 0; index < image.data.length; index += stride) {
    values.push(
      image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114,
    );
  }
  values.sort((a, b) => a - b);
  const low = values[Math.floor(values.length * 0.04)] ?? 0;
  const high = values[Math.floor(values.length * 0.96)] ?? 255;
  if (high - low < 12) return image;

  const output = new Uint8ClampedArray(image.data.length);
  const scale = 255 / (high - low);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114;
    const normalized = clamp((luminance - low) * scale, 0, 255);
    output[index] = normalized;
    output[index + 1] = normalized;
    output[index + 2] = normalized;
    output[index + 3] = 255;
  }
  return new ImageData(output, image.width, image.height);
}

export interface ViewportMappingInput {
  videoWidth: number;
  videoHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  digitalZoom?: number;
}

/** Inverse of {@link computeObjectCoverCrop}: maps a source-video point onto the visible viewport. */
export function mapVideoPointToViewport(
  point: { x: number; y: number },
  { videoWidth, videoHeight, viewportWidth, viewportHeight, digitalZoom = 1 }: ViewportMappingInput,
): { x: number; y: number; scale: number } {
  const zoom = Math.max(1, digitalZoom);
  const coverScale = Math.max(viewportWidth / Math.max(1, videoWidth), viewportHeight / Math.max(1, videoHeight));
  const coverOffsetX = (videoWidth * coverScale - viewportWidth) / 2;
  const coverOffsetY = (videoHeight * coverScale - viewportHeight) / 2;
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const unzoomX = point.x * coverScale - coverOffsetX;
  const unzoomY = point.y * coverScale - coverOffsetY;
  return {
    x: (unzoomX - centerX) * zoom + centerX,
    y: (unzoomY - centerY) * zoom + centerY,
    scale: coverScale * zoom,
  };
}

export interface AimCandidate {
  text: string;
  /** Centre in viewport pixels. */
  x: number;
  y: number;
  /** Approximate side length in viewport pixels. */
  size: number;
}

/**
 * Picks the code the operator is actually pointing at: its centre must sit inside the
 * aim zone (a circle around the reticle centre), and the closest such code wins. Codes
 * that merely appear elsewhere in the frame — neighbouring labels — are ignored.
 */
export function pickAimedCandidate<T extends AimCandidate>(
  candidates: T[],
  aim: { x: number; y: number; radius: number },
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate.text) continue;
    const distance = Math.hypot(candidate.x - aim.x, candidate.y - aim.y);
    if (distance <= aim.radius && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export interface ScanLockState {
  /** Code currently being held in the aim zone. */
  text: string | null;
  startedAt: number;
  lastSeenAt: number;
  hits: number;
  /** Code that was just accepted; it must leave the aim zone before it can be accepted again. */
  releaseText: string | null;
  releaseSeenAt: number;
}

export const SCAN_LOCK_TIMING = {
  /** How long a code must stay centred before it is accepted. */
  dwellMs: 450,
  /** Minimum independent decodes of the same code during the dwell. */
  minHits: 2,
  /** Decoders miss frames; a gap shorter than this keeps the lock alive. */
  graceMs: 280,
  /** An accepted code must be out of the aim zone this long before it can be re-accepted. */
  releaseMs: 1000,
} as const;

export const EMPTY_SCAN_LOCK: ScanLockState = {
  text: null,
  startedAt: 0,
  lastSeenAt: 0,
  hits: 0,
  releaseText: null,
  releaseSeenAt: 0,
};

/** Drops a lock whose code has not been seen within the grace window. */
export function expireScanLock(state: ScanLockState, now: number, timing = SCAN_LOCK_TIMING): ScanLockState {
  let next = state;
  if (next.text && now - next.lastSeenAt > timing.graceMs) {
    next = { ...next, text: null, startedAt: 0, lastSeenAt: 0, hits: 0 };
  }
  if (next.releaseText && now - next.releaseSeenAt > timing.releaseMs) {
    next = { ...next, releaseText: null, releaseSeenAt: 0 };
  }
  return next;
}

/**
 * Feeds one aimed decode into the lock. Returns the new state, the lock progress (0–1)
 * and whether the code is confirmed for acceptance on this observation.
 */
export function observeScanLock(
  previous: ScanLockState,
  text: string,
  now: number,
  timing = SCAN_LOCK_TIMING,
): { state: ScanLockState; progress: number; confirmed: boolean } {
  const state = expireScanLock(previous, now, timing);
  if (state.releaseText === text) {
    return { state: { ...state, releaseSeenAt: now }, progress: 0, confirmed: false };
  }

  const continuing = state.text === text;
  const next: ScanLockState = {
    ...state,
    text,
    startedAt: continuing ? state.startedAt : now,
    lastSeenAt: now,
    hits: continuing ? state.hits + 1 : 1,
  };
  const progress = getScanLockProgress(next, now, timing);
  const confirmed = next.hits >= timing.minHits && now - next.startedAt >= timing.dwellMs;
  if (!confirmed) return { state: next, progress, confirmed };

  return {
    state: { ...EMPTY_SCAN_LOCK, releaseText: text, releaseSeenAt: now },
    progress: 1,
    confirmed,
  };
}

export function getScanLockProgress(state: ScanLockState, now: number, timing = SCAN_LOCK_TIMING): number {
  if (!state.text) return 0;
  return clamp((now - state.startedAt) / timing.dwellMs, 0, 1);
}
