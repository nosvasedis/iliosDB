import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export const CATALOG_PREPARE_HEADER = 'X-Ilios-Catalog-Prepare';
export const ALPHA_FLOOR = 12;
export const MIN_OPAQUE_FRACTION = 0.015;
export const MAX_OPAQUE_FRACTION = 0.92;
export const CATALOG_SQUARE_SIZE = 900;
export const BBOX_PADDING = 0.10;
export const JPEG_QUALITY = 74;

export type RgbaImage = {
  data: Uint8Array;
  width: number;
  height: number;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function applyAlphaFloor(data: Uint8Array): void {
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha < ALPHA_FLOOR) continue;
    data[i] = Math.min(255, Math.round(alpha + (255 - alpha) * 0.35));
  }
}

export function opaqueFraction(data: Uint8Array): number {
  if (data.length < 4) return 0;
  let opaque = 0;
  const pixels = data.length / 4;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= ALPHA_FLOOR) opaque += 1;
  }
  return opaque / pixels;
}

export function isMaskSane(fraction: number): boolean {
  return fraction >= MIN_OPAQUE_FRACTION && fraction <= MAX_OPAQUE_FRACTION;
}

export function boundingBox(data: Uint8Array, width: number, height: number): BoundingBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

function hueToRgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0) {
    const value = Math.round(l * 255);
    return [value, value, value];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

export function applyJewelryVibrance(data: Uint8Array, mask?: Uint8Array): void {
  const pixels = data.length / 4;
  for (let p = 0; p < pixels; p += 1) {
    if (mask && mask[p] === 0) continue;
    const i = p * 4;
    if (!mask && data[i + 3] < ALPHA_FLOOR) continue;

    const { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l <= 0.12 || l >= 0.85) continue;

    let nextS = s;
    if (s < 0.45) nextS = Math.min(1, s * 1.06);
    else if (s <= 0.70) nextS = Math.min(1, s * 1.03);

    let nextL = l;
    if (l >= 0.25 && l <= 0.80) {
      nextL = 0.5 + (l - 0.5) * 1.04;
    }

    const [r, g, b] = hslToRgb(h, nextS, nextL);
    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }
}

function sampleRgba(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));

  const pixel = (px: number, py: number) => {
    const index = (py * width + px) * 4;
    return [data[index], data[index + 1], data[index + 2], data[index + 3]];
  };

  const c00 = pixel(x0, y0);
  const c10 = pixel(x1, y0);
  const c01 = pixel(x0, y1);
  const c11 = pixel(x1, y1);
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;

  return [
    mix(mix(c00[0], c10[0], fx), mix(c01[0], c11[0], fx), fy),
    mix(mix(c00[1], c10[1], fx), mix(c01[1], c11[1], fx), fy),
    mix(mix(c00[2], c10[2], fx), mix(c01[2], c11[2], fx), fy),
    mix(mix(c00[3], c10[3], fx), mix(c01[3], c11[3], fx), fy),
  ];
}

export function composeCatalogSquare(image: RgbaImage, box: BoundingBox): { data: Uint8Array; mask: Uint8Array } {
  const size = CATALOG_SQUARE_SIZE;
  const out = new Uint8Array(size * size * 4);
  const mask = new Uint8Array(size * size);
  out.fill(255);

  const pad = Math.round(Math.max(box.width, box.height) * BBOX_PADDING);
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(image.width, box.x + box.width + pad);
  const y1 = Math.min(image.height, box.y + box.height + pad);
  const cropW = Math.max(1, x1 - x0);
  const cropH = Math.max(1, y1 - y0);
  const scale = Math.min(size / cropW, size / cropH);
  const destW = Math.max(1, Math.round(cropW * scale));
  const destH = Math.max(1, Math.round(cropH * scale));
  const ox = Math.floor((size - destW) / 2);
  const oy = Math.floor((size - destH) / 2);

  for (let dy = 0; dy < destH; dy += 1) {
    for (let dx = 0; dx < destW; dx += 1) {
      const sx = x0 + ((dx + 0.5) * cropW) / destW - 0.5;
      const sy = y0 + ((dy + 0.5) * cropH) / destH - 0.5;
      const [r, g, b, a] = sampleRgba(image.data, image.width, image.height, sx, sy);
      const alpha = a / 255;
      const outIndex = ((oy + dy) * size + (ox + dx)) * 4;
      out[outIndex] = Math.round(r * alpha + 255 * (1 - alpha));
      out[outIndex + 1] = Math.round(g * alpha + 255 * (1 - alpha));
      out[outIndex + 2] = Math.round(b * alpha + 255 * (1 - alpha));
      out[outIndex + 3] = 255;
      if (a >= ALPHA_FLOOR) mask[(oy + dy) * size + (ox + dx)] = 1;
    }
  }

  return { data: out, mask };
}

export function prepareCatalogJpegFromPng(pngBytes: Uint8Array): Uint8Array | null {
  let decoded: { data: Buffer; width: number; height: number };
  try {
    decoded = PNG.sync.read(Buffer.from(pngBytes));
  } catch {
    return null;
  }

  const data = new Uint8Array(decoded.data);
  applyAlphaFloor(data);
  if (!isMaskSane(opaqueFraction(data))) return null;

  const box = boundingBox(data, decoded.width, decoded.height);
  if (!box) return null;

  const composed = composeCatalogSquare(
    { data, width: decoded.width, height: decoded.height },
    box,
  );
  applyJewelryVibrance(composed.data, composed.mask);

  const encoded = jpeg.encode(
    { data: Buffer.from(composed.data), width: CATALOG_SQUARE_SIZE, height: CATALOG_SQUARE_SIZE },
    JPEG_QUALITY,
  );
  return new Uint8Array(encoded.data);
}

export async function isolateCatalogPng(env: { IMAGES?: any }, originalBytes: Uint8Array): Promise<Uint8Array | null> {
  if (!env?.IMAGES) return null;
  try {
    const input = env.IMAGES.input(new Response(originalBytes).body);
    const result = await input.transform({ segment: 'foreground' }).output({ format: 'image/png' });
    const response = typeof result.response === 'function' ? result.response() : result;
    if (!response || !response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

export async function prepareCatalogImageBytes(
  env: { IMAGES?: any },
  originalBytes: Uint8Array,
): Promise<Uint8Array | null> {
  const pngBytes = await isolateCatalogPng(env, originalBytes);
  if (!pngBytes) return null;
  return prepareCatalogJpegFromPng(pngBytes);
}
