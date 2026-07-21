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
