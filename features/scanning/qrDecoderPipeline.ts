import { readBarcodes, type ReadResult, type ReaderOptions } from 'zxing-wasm/reader';
import { normalizeQrContrast } from './scannerEngine';
import type { QrCandidate } from './scannerTypes';

export function getQrReaderOptions(enhanced: boolean, fullFrame: boolean): ReaderOptions {
  return {
    formats: ['QRCode'],
    // Several neighbouring labels can share one frame; the scanner picks the aimed one.
    maxNumberOfSymbols: 4,
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDenoise: enhanced,
    // Preserve tiny modules in the primary ROI; safe downscaling is reserved for overview passes.
    tryDownscale: fullFrame,
    binarizer: 'LocalAverage',
  };
}

function toCandidates(results: ReadResult[]): QrCandidate[] {
  return results
    .filter((result) => result.isValid && result.text.trim())
    .map((result) => {
      const { topLeft, topRight, bottomLeft, bottomRight } = result.position;
      const corners = [topLeft, topRight, bottomRight, bottomLeft];
      const x = corners.reduce((total, point) => total + point.x, 0) / 4;
      const y = corners.reduce((total, point) => total + point.y, 0) / 4;
      const size = (
        Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y)
        + Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y)
      ) / 2;
      return { text: result.text.trim(), x, y, size };
    });
}

export async function decodeQrCandidates(image: ImageData, enhanced: boolean, fullFrame: boolean): Promise<QrCandidate[]> {
  const options = getQrReaderOptions(enhanced, fullFrame);
  const first = toCandidates(await readBarcodes(image, options));
  if (first.length || !enhanced) return first;

  const normalized = normalizeQrContrast(image);
  return toCandidates(await readBarcodes(normalized, { ...options, tryDenoise: true }));
}

export async function decodeQrImage(image: ImageData, enhanced: boolean, fullFrame: boolean): Promise<string> {
  const candidates = await decodeQrCandidates(image, enhanced, fullFrame);
  return candidates[0]?.text ?? '';
}
