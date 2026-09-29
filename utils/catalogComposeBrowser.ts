import { CATALOG_JPEG_QUALITY, CATALOG_SQUARE_SIZE, prepareCatalogRgba } from './catalogCompose';

const readRgba = (bitmap: ImageBitmap): Uint8Array | null => {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength);
};

const encodeJpeg = (rgba: Uint8Array): Promise<Blob | null> => {
  const canvas = document.createElement('canvas');
  canvas.width = CATALOG_SQUARE_SIZE;
  canvas.height = CATALOG_SQUARE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  const imageData = new ImageData(
    new Uint8ClampedArray(rgba),
    CATALOG_SQUARE_SIZE,
    CATALOG_SQUARE_SIZE,
  );
  context.putImageData(imageData, 0, 0);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', CATALOG_JPEG_QUALITY);
  });
};

export async function composeCatalogJpegFromPng(png: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(png);
  } catch {
    return null;
  }
  try {
    const rgba = readRgba(bitmap);
    if (!rgba) return null;
    const composed = prepareCatalogRgba(rgba, bitmap.width, bitmap.height);
    if (!composed) return null;
    return await encodeJpeg(composed.data);
  } finally {
    bitmap.close();
  }
}
