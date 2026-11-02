import { AUTH_KEY_SECRET, CLOUDFLARE_WORKER_URL, R2_PUBLIC_URL } from '../../lib/supabase';

const MAX_EDGE = 256;

/** Raster logos become a transparent PNG (max 256px); SVG is kept as-is. */
async function normalizeLogo(file: File): Promise<{ body: Blob; type: string; ext: string }> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    return { body: file, type: 'image/svg+xml', ext: 'svg' };
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const body = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Η εικόνα δεν μπόρεσε να μετατραπεί.'))), 'image/png'));
  return { body, type: 'image/png', ext: 'png' };
}

/** Uploads a supplier logo to the public image bucket and returns its URL. */
export async function uploadSupplierLogo(file: File): Promise<string> {
  if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name)) {
    throw new Error('Επιλέξτε εικόνα (PNG, JPG, WEBP ή SVG).');
  }
  const { body, type, ext } = await normalizeLogo(file);
  const key = `supplier-logos/${crypto.randomUUID()}.${ext}`;
  const response = await fetch(`${CLOUDFLARE_WORKER_URL}/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': type, Authorization: AUTH_KEY_SECRET },
    body,
  });
  if (!response.ok) throw new Error(`Το λογότυπο δεν ανέβηκε (${response.status}).`);
  return `${R2_PUBLIC_URL}/${key}`;
}
