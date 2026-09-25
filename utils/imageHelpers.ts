
export const ACCEPTED_IMAGE_INPUT_TYPES = 'image/*,.heic,.heif,image/heic,image/heif';
export const CATALOG_IMAGE_PREPARE_HEADER = 'X-Ilios-Catalog-Prepare';

const MAX_IMAGE_SIZE = 900;
const MAX_CATALOG_UPLOAD_EDGE = 2048;
const JPEG_QUALITY = 0.74;

const isHeicImage = (file: File): boolean => {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.toLowerCase();
  return lowerType === 'image/heic'
    || lowerType === 'image/heif'
    || lowerName.endsWith('.heic')
    || lowerName.endsWith('.heif');
};

const convertHeicToJpeg = async (file: File): Promise<Blob> => {
  const heic2anyUrl = 'https://esm.sh/heic2any@0.0.4';
  const module = await import(/* @vite-ignore */ heic2anyUrl);
  const heic2any = module.default as (options: {
    blob: Blob;
    toType: string;
    quality?: number;
  }) => Promise<Blob | Blob[]>;

  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: JPEG_QUALITY,
  });

  return Array.isArray(converted) ? converted[0] : converted;
};

export const createImagePreviewUrl = async (file: File): Promise<string> => {
  const source = isHeicImage(file) ? await convertHeicToJpeg(file) : file;
  return URL.createObjectURL(source);
};

const loadImage = (blob: Blob): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unsupported or unreadable image format'));
    };

    img.src = objectUrl;
  });
};

const fitWithinMaxEdge = (width: number, height: number, maxEdge: number) => {
  if (width <= maxEdge && height <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  if (width > height) {
    return { width: maxEdge, height: Math.round(height * (maxEdge / width)) };
  }
  return { width: Math.round(width * (maxEdge / height)), height: maxEdge };
};

const rasterizeJpeg = async (file: File | Blob, maxEdge: number): Promise<Blob> => {
  const source = file instanceof File && isHeicImage(file) ? await convertHeicToJpeg(file) : file;
  const img = await loadImage(source);
  const fitted = fitWithinMaxEdge(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, fitted.width);
  canvas.height = Math.max(1, fitted.height);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Draw on white so transparent PNGs stay predictable after JPEG conversion.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Compression failed'));
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
};

/**
 * Compresses and resizes an image file.
 * - Converts HEIC/HEIF to JPEG before processing.
 * - Max width/height: 900px.
 * - Format: JPEG.
 * - Quality: 0.74 (74%).
 */
export const compressImage = async (file: File | Blob): Promise<Blob> => {
  return rasterizeJpeg(file, MAX_IMAGE_SIZE);
};

/**
 * Converts HEIC and caps the long edge at 2048px so the Worker can isolate
 * jewelry at HD before storing the final 900px catalog JPEG.
 */
export const prepareUploadSource = async (file: File): Promise<Blob> => {
  return rasterizeJpeg(file, MAX_CATALOG_UPLOAD_EDGE);
};
