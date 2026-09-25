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
export const JPEG_QUALITY = 82;
export const SHADOW_OFFSET_X = 0;
export const SHADOW_OFFSET_Y = 4;
export const SHADOW_BLUR_RADIUS = 3;
export const SHADOW_OPACITY = 0.26;
export const CATALOG_EDGE_MARGIN = 12;
export const ISOLATE_MAX_EDGE = 800;

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

function sampleChannel(c00: number, c10: number, c01: number, c11: number, fx: number, fy: number): number {
  const top = c00 + (c10 - c00) * fx;
  return top + ((c01 + (c11 - c01) * fx) - top) * fy;
}

function sampleRgbaInto(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array,
): void {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = Math.min(1, Math.max(0, x - x0));
  const fy = Math.min(1, Math.max(0, y - y0));
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;
  out[0] = sampleChannel(data[i00], data[i10], data[i01], data[i11], fx, fy);
  out[1] = sampleChannel(data[i00 + 1], data[i10 + 1], data[i01 + 1], data[i11 + 1], fx, fy);
  out[2] = sampleChannel(data[i00 + 2], data[i10 + 2], data[i01 + 2], data[i11 + 2], fx, fy);
  out[3] = sampleChannel(data[i00 + 3], data[i10 + 3], data[i01 + 3], data[i11 + 3], fx, fy);
}

function blurShadow(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const span = radius * 2 + 1;
  const lastX = width - 1;
  const lastY = height - 1;
  const horizontal = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      sum += src[row + Math.min(lastX, Math.max(0, k))];
    }
    horizontal[row] = sum / span;
    for (let x = 1; x < width; x += 1) {
      sum += src[row + Math.min(lastX, x + radius)] - src[row + Math.min(lastX, Math.max(0, x - radius - 1))];
      horizontal[row + x] = sum / span;
    }
  }

  const out = new Float32Array(src.length);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) {
      sum += horizontal[Math.min(lastY, Math.max(0, k)) * width + x];
    }
    out[x] = sum / span;
    for (let y = 1; y < height; y += 1) {
      sum += horizontal[Math.min(lastY, y + radius) * width + x] - horizontal[Math.min(lastY, Math.max(0, y - radius - 1)) * width + x];
      out[y * width + x] = sum / span;
    }
  }
  return out;
}

export function composeCatalogSquare(image: RgbaImage, box: BoundingBox): { data: Uint8Array; mask: Uint8Array } {
  const size = CATALOG_SQUARE_SIZE;
  const out = new Uint8Array(size * size * 4);
  const mask = new Uint8Array(size * size);
  const shadow = new Float32Array(size * size);
  const sample = new Float64Array(4);

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
      sampleRgbaInto(
        image.data,
        image.width,
        image.height,
        x0 + ((dx + 0.5) * cropW) / destW - 0.5,
        y0 + ((dy + 0.5) * cropH) / destH - 0.5,
        sample,
      );
      const destX = ox + dx;
      const destY = oy + dy;
      const outIndex = (destY * size + destX) * 4;
      out[outIndex] = Math.round(sample[0]);
      out[outIndex + 1] = Math.round(sample[1]);
      out[outIndex + 2] = Math.round(sample[2]);
      out[outIndex + 3] = Math.round(sample[3]);
      if (sample[3] >= ALPHA_FLOOR) mask[destY * size + destX] = 1;

      const shadowX = destX + SHADOW_OFFSET_X;
      const shadowY = destY + SHADOW_OFFSET_Y;
      if (shadowX < 0 || shadowY < 0 || shadowX >= size || shadowY >= size) continue;
      const shadowIndex = shadowY * size + shadowX;
      const alpha = sample[3] / 255;
      if (alpha > shadow[shadowIndex]) shadow[shadowIndex] = alpha;
    }
  }

  const blurred = blurShadow(shadow, size, size, SHADOW_BLUR_RADIUS);
  for (let i = 0; i < size * size; i += 1) {
    const shadowA = Math.min(1, blurred[i] * SHADOW_OPACITY);
    const background = 255 * (1 - shadowA);
    const li = i * 4;
    const jewelryA = out[li + 3] / 255;
    const keep = 1 - jewelryA;
    out[li] = Math.round(out[li] * jewelryA + background * keep);
    out[li + 1] = Math.round(out[li + 1] * jewelryA + background * keep);
    out[li + 2] = Math.round(out[li + 2] * jewelryA + background * keep);
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

export function prepareCatalogRgba(data: Uint8Array, width: number, height: number): { data: Uint8Array; mask: Uint8Array } | null {
  const inspected = inspectMask(data, width, height);
  if (!isMaskSane(inspected.fraction) || !inspected.box) return null;
  const composed = composeCatalogSquare(
    { data, width, height },
    inspected.box,
  );
  applyJewelryVibrance(composed.data, composed.mask);
  return composed;
}

export function encodeCatalogJpegJs(rgba: Uint8Array, width = CATALOG_SQUARE_SIZE, height = CATALOG_SQUARE_SIZE): Uint8Array | null {
  try {
    const encoded = jpeg.encode({ data: rgba, width, height }, JPEG_QUALITY);
    return encoded?.data ? new Uint8Array(encoded.data) : null;
  } catch {
    return null;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a += bytes[i];
    if (a >= 65521) a -= 65521;
    b += a;
    if (b >= 65521) b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput));
  return chunk;
}

function zlibStore(raw: Uint8Array): Uint8Array {
  const max = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / max));
  const out = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let offset = 2;
  let read = 0;
  while (read < raw.length || read === 0) {
    const n = Math.min(max, raw.length - read);
    const last = read + n >= raw.length;
    out[offset] = last ? 0x01 : 0x00;
    out[offset + 1] = n & 0xff;
    out[offset + 2] = (n >> 8) & 0xff;
    const nlen = (~n) & 0xffff;
    out[offset + 3] = nlen & 0xff;
    out[offset + 4] = (nlen >> 8) & 0xff;
    offset += 5;
    if (n) {
      out.set(raw.subarray(read, read + n), offset);
      offset += n;
    }
    read += n;
    if (raw.length === 0) break;
  }
  const view = new DataView(out.buffer);
  view.setUint32(offset, adler32(raw));
  return out.subarray(0, offset + 4);
}

export function rgbaToPngBytes(data: Uint8Array, width: number, height: number): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4));
  let src = 0;
  let dst = 0;
  const rowBytes = width * 4;
  for (let y = 0; y < height; y += 1) {
    raw[dst] = 0;
    dst += 1;
    raw.set(data.subarray(src, src + rowBytes), dst);
    src += rowBytes;
    dst += rowBytes;
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = pngChunk('IDAT', zlibStore(raw));
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = pngChunk('IHDR', ihdr);
  const iend = pngChunk('IEND', new Uint8Array(0));
  const png = new Uint8Array(signature.length + ihdrChunk.length + idat.length + iend.length);
  png.set(signature, 0);
  png.set(ihdrChunk, signature.length);
  png.set(idat, signature.length + ihdrChunk.length);
  png.set(iend, signature.length + ihdrChunk.length + idat.length);
  return png;
}

function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export async function encodeCatalogJpeg(
  env: { IMAGES?: any } | null | undefined,
  rgba: Uint8Array,
  width = CATALOG_SQUARE_SIZE,
  height = CATALOG_SQUARE_SIZE,
): Promise<Uint8Array | null> {
  if (env?.IMAGES) {
    try {
      const png = rgbaToPngBytes(rgba, width, height);
      const formats = ['jpeg', 'image/jpeg'];
      for (const format of formats) {
        const stream = new Response(png).body;
        if (!stream) continue;
        const result = await env.IMAGES.input(stream).output({ format, quality: JPEG_QUALITY });
        const response = await imagesResponse(result);
        if (!response?.ok) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (isJpegBytes(bytes)) return bytes;
      }
    } catch {
      // Fall through to jpeg-js for tests/mocks; production Images encode should succeed.
    }
  }
  return encodeCatalogJpegJs(rgba, width, height);
}

export function prepareCatalogJpegFromRgba(data: Uint8Array, width: number, height: number): Uint8Array | null {
  const composed = prepareCatalogRgba(data, width, height);
  if (!composed) return null;
  return encodeCatalogJpegJs(composed.data);
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
    const composed = prepareCatalogRgba(isolated.data, isolated.width, isolated.height);
    if (!composed) return null;
    return encodeCatalogJpeg(env, composed.data);
  } catch {
    return null;
  }
}
