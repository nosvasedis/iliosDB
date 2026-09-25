import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

export const CATALOG_PREPARE_HEADER = 'X-Ilios-Catalog-Prepare';
export const CATALOG_PREPARE_FAILED_STATUS = 422;
export const CATALOG_PREPARE_FAILED_ERROR = 'catalog-prepare-failed';
export const ALPHA_FLOOR = 12;
export const MIN_OPAQUE_FRACTION = 0.015;
export const MAX_OPAQUE_FRACTION = 0.92;
export const CATALOG_SQUARE_SIZE = 900;
export const BBOX_PADDING = 0.035;
export const JPEG_QUALITY = 74;
export const SHADOW_OFFSET_X = 3;
export const SHADOW_OFFSET_Y = 11;
export const SHADOW_BLUR_RADIUS = 7;
export const SHADOW_OPACITY = 0.20;
export const CATALOG_EDGE_MARGIN = 12;
export const ISOLATE_MAX_EDGE = 960;

export function scaledIsolateSize(width: number, height: number, maxEdge = ISOLATE_MAX_EDGE): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

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

function blurShadow(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const horizontal = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += src[row + Math.min(width - 1, Math.max(0, x + k))];
      }
      horizontal[row + x] = sum / span;
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        sum += horizontal[Math.min(height - 1, Math.max(0, y + k)) * width + x];
      }
      out[y * width + x] = sum / span;
    }
  }
  return out;
}

export function composeCatalogSquare(image: RgbaImage, box: BoundingBox): { data: Uint8Array; mask: Uint8Array } {
  const size = CATALOG_SQUARE_SIZE;
  const out = new Uint8Array(size * size * 4);
  const mask = new Uint8Array(size * size);
  const layer = new Uint8Array(size * size * 4);
  const shadow = new Float32Array(size * size);

  const pad = Math.round(Math.max(box.width, box.height) * BBOX_PADDING);
  const x0 = Math.max(0, box.x - pad);
  const y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(image.width, box.x + box.width + pad);
  const y1 = Math.min(image.height, box.y + box.height + pad);
  const cropW = Math.max(1, x1 - x0);
  const cropH = Math.max(1, y1 - y0);
  const availableW = Math.max(1, size - CATALOG_EDGE_MARGIN * 2 - SHADOW_OFFSET_X - SHADOW_BLUR_RADIUS);
  const availableH = Math.max(1, size - CATALOG_EDGE_MARGIN * 2 - SHADOW_OFFSET_Y - SHADOW_BLUR_RADIUS);
  const scale = Math.min(availableW / cropW, availableH / cropH);
  const destW = Math.max(1, Math.round(cropW * scale));
  const destH = Math.max(1, Math.round(cropH * scale));
  const ox = Math.max(
    CATALOG_EDGE_MARGIN,
    Math.min(
      Math.floor((size - destW - SHADOW_OFFSET_X) / 2),
      size - destW - CATALOG_EDGE_MARGIN - SHADOW_OFFSET_X,
    ),
  );
  const oy = Math.max(
    CATALOG_EDGE_MARGIN,
    Math.min(
      Math.floor((size - destH - SHADOW_OFFSET_Y) / 2),
      size - destH - CATALOG_EDGE_MARGIN - SHADOW_OFFSET_Y,
    ),
  );

  for (let dy = 0; dy < destH; dy += 1) {
    for (let dx = 0; dx < destW; dx += 1) {
      const sx = x0 + ((dx + 0.5) * cropW) / destW - 0.5;
      const sy = y0 + ((dy + 0.5) * cropH) / destH - 0.5;
      const [r, g, b, a] = sampleRgba(image.data, image.width, image.height, sx, sy);
      const destX = ox + dx;
      const destY = oy + dy;
      const outIndex = (destY * size + destX) * 4;
      layer[outIndex] = r;
      layer[outIndex + 1] = g;
      layer[outIndex + 2] = b;
      layer[outIndex + 3] = a;
      if (a >= ALPHA_FLOOR) mask[destY * size + destX] = 1;

      const shadowX = destX + SHADOW_OFFSET_X;
      const shadowY = destY + SHADOW_OFFSET_Y;
      if (shadowX < 0 || shadowY < 0 || shadowX >= size || shadowY >= size) continue;
      const shadowIndex = shadowY * size + shadowX;
      const alpha = a / 255;
      if (alpha > shadow[shadowIndex]) shadow[shadowIndex] = alpha;
    }
  }

  const blurred = blurShadow(shadow, size, size, SHADOW_BLUR_RADIUS);
  for (let i = 0; i < size * size; i += 1) {
    const shadowA = Math.min(1, blurred[i] * SHADOW_OPACITY);
    const background = Math.round(255 * (1 - shadowA));
    const li = i * 4;
    const jewelryA = layer[li + 3] / 255;
    out[li] = Math.round(layer[li] * jewelryA + background * (1 - jewelryA));
    out[li + 1] = Math.round(layer[li + 1] * jewelryA + background * (1 - jewelryA));
    out[li + 2] = Math.round(layer[li + 2] * jewelryA + background * (1 - jewelryA));
    out[li + 3] = 255;
  }

  return { data: out, mask };
}

function inspectMask(data: Uint8Array, width: number, height: number): { fraction: number; box: BoundingBox | null } {
  let opaque = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const pixels = width * height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alphaIndex = (y * width + x) * 4 + 3;
      const alpha = data[alphaIndex];
      if (alpha < ALPHA_FLOOR) continue;
      data[alphaIndex] = Math.min(255, Math.round(alpha + (255 - alpha) * 0.35));
      opaque += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return {
    fraction: pixels ? opaque / pixels : 0,
    box: maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
  };
}

export function prepareCatalogJpegFromRgba(data: Uint8Array, width: number, height: number): Uint8Array | null {
  const pixels = data.slice();
  const inspected = inspectMask(pixels, width, height);
  if (!isMaskSane(inspected.fraction) || !inspected.box) return null;

  const composed = composeCatalogSquare(
    { data: pixels, width, height },
    inspected.box,
  );
  applyJewelryVibrance(composed.data, composed.mask);

  const encoded = jpeg.encode(
    { data: Buffer.from(composed.data), width: CATALOG_SQUARE_SIZE, height: CATALOG_SQUARE_SIZE },
    JPEG_QUALITY,
  );
  return new Uint8Array(encoded.data);
}

export function prepareCatalogJpegFromPng(pngBytes: Uint8Array): Uint8Array | null {
  let decoded: { data: Buffer; width: number; height: number };
  try {
    decoded = PNG.sync.read(Buffer.from(pngBytes));
  } catch {
    return null;
  }

  return prepareCatalogJpegFromRgba(new Uint8Array(decoded.data), decoded.width, decoded.height);
}

export type CatalogPrepareDiagnosis = {
  stage: 'ok' | 'binding' | 'input' | 'images' | 'throw' | 'png-decode' | 'mask' | 'bbox';
  error?: string;
  status?: number;
  code?: number;
  pngBytes?: number;
  jpegBytes?: number;
  fraction?: number;
  width?: number;
  height?: number;
};

async function imagesResponse(result: any): Promise<Response | null> {
  if (!result) return null;
  const maybe = typeof result.response === 'function' ? result.response() : result;
  return await Promise.resolve(maybe);
}

export async function isolateCatalogRgba(
  env: { IMAGES?: any },
  originalBytes: Uint8Array,
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  if (!env?.IMAGES) return null;
  try {
    const info = await env.IMAGES.info(new Response(originalBytes).body);
    const width = Number(info?.width);
    const height = Number(info?.height);
    if (!width || !height) return null;
    const sized = scaledIsolateSize(width, height);

    const stream = new Response(originalBytes).body;
    if (!stream) return null;
    const result = await env.IMAGES.input(stream)
      .transform({ segment: 'foreground' })
      .transform({ width: sized.width, height: sized.height, fit: 'scale-down' })
      .output({ format: 'rgba' });
    const response = await imagesResponse(result);
    if (!response || !response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== sized.width * sized.height * 4) return null;
    return { data, width: sized.width, height: sized.height };
  } catch {
    return null;
  }
}

export async function diagnoseCatalogPrepare(
  env: { IMAGES?: any },
  originalBytes: Uint8Array,
): Promise<CatalogPrepareDiagnosis> {
  if (!env?.IMAGES) return { stage: 'binding', error: 'IMAGES binding missing' };
  let width = 0;
  let height = 0;
  let data: Uint8Array | null = null;
  try {
    const info = await env.IMAGES.info(new Response(originalBytes).body);
    width = Number(info?.width);
    height = Number(info?.height);
    if (!width || !height) return { stage: 'input', error: 'IMAGES.info missing dimensions' };

    const sized = scaledIsolateSize(width, height);
    const stream = new Response(originalBytes).body;
    if (!stream) return { stage: 'input', error: 'empty body stream' };
    const result = await env.IMAGES.input(stream)
      .transform({ segment: 'foreground' })
      .transform({ width: sized.width, height: sized.height, fit: 'scale-down' })
      .output({ format: 'rgba' });
    const response = await imagesResponse(result);
    if (!response) return { stage: 'images', error: 'no Images response' };
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { stage: 'images', status: response.status, error: text.slice(0, 500) };
    }
    data = new Uint8Array(await response.arrayBuffer());
    width = sized.width;
    height = sized.height;
  } catch (err: any) {
    return {
      stage: 'throw',
      error: String(err?.message || err),
      code: typeof err?.code === 'number' ? err.code : undefined,
    };
  }

  if (data.length !== width * height * 4) {
    return {
      stage: 'png-decode',
      error: `rgba length ${data.length} != ${width}x${height}x4`,
      pngBytes: data.length,
      width,
      height,
    };
  }

  const pixels = data.slice();
  applyAlphaFloor(pixels);
  const fraction = opaqueFraction(pixels);
  if (!isMaskSane(fraction)) {
    return { stage: 'mask', fraction, pngBytes: data.length, width, height };
  }

  const box = boundingBox(pixels, width, height);
  if (!box) {
    return { stage: 'bbox', fraction, pngBytes: data.length, width, height };
  }

  const jpeg = prepareCatalogJpegFromRgba(data, width, height);
  if (!jpeg) {
    return { stage: 'mask', fraction, pngBytes: data.length, width, height };
  }
  return {
    stage: 'ok',
    pngBytes: data.length,
    jpegBytes: jpeg.length,
    fraction,
    width,
    height,
  };
}

export async function prepareCatalogImageBytes(
  env: { IMAGES?: any },
  originalBytes: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const isolated = await isolateCatalogRgba(env, originalBytes);
    if (!isolated) return null;
    return prepareCatalogJpegFromRgba(isolated.data, isolated.width, isolated.height);
  } catch {
    return null;
  }
}
