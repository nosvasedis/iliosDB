
export const ACCEPTED_IMAGE_INPUT_TYPES = 'image/*,.heic,.heif,image/heic,image/heif';

const MAX_IMAGE_SIZE = 900;
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

/**
 * Compresses and resizes an image file.
 * - Converts HEIC/HEIF to JPEG before processing.
 * - Max width/height: 900px.
 * - Format: JPEG.
 * - Quality: 0.74 (74%).
 */
export const compressImage = async (file: File): Promise<Blob> => {
  const source = isHeicImage(file) ? await convertHeicToJpeg(file) : file;
  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > height) {
    if (width > MAX_IMAGE_SIZE) {
      height *= MAX_IMAGE_SIZE / width;
      width = MAX_IMAGE_SIZE;
    }
  } else if (height > MAX_IMAGE_SIZE) {
    width *= MAX_IMAGE_SIZE / height;
    height = MAX_IMAGE_SIZE;
  }

  canvas.width = Math.round(width);
  canvas.height = Math.round(height);

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
