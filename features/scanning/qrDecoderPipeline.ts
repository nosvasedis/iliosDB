import { readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import { normalizeQrContrast } from './scannerEngine';

export function getQrReaderOptions(enhanced: boolean, fullFrame: boolean): ReaderOptions {
  return {
    formats: ['QRCode'],
    maxNumberOfSymbols: 1,
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDenoise: enhanced,
    // Preserve tiny modules in the primary ROI; safe downscaling is reserved for overview passes.
    tryDownscale: fullFrame,
    binarizer: 'LocalAverage',
  };
}

export async function decodeQrImage(image: ImageData, enhanced: boolean, fullFrame: boolean): Promise<string> {
  const options = getQrReaderOptions(enhanced, fullFrame);
  const first = await readBarcodes(image, options);
  const firstText = first.find((result) => result.isValid && result.text.trim())?.text.trim() ?? '';
  if (firstText || !enhanced) return firstText;

  const normalized = normalizeQrContrast(image);
  const second = await readBarcodes(normalized, { ...options, tryDenoise: true });
  return second.find((result) => result.isValid && result.text.trim())?.text.trim() ?? '';
}
