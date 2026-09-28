export const ALPHA_FLOOR = 12;
export const MIN_OPAQUE_FRACTION = 0.015;
export const MAX_OPAQUE_FRACTION = 0.92;
export const CATALOG_SQUARE_SIZE = 900;
export const CATALOG_JPEG_QUALITY = 0.82;
export const BBOX_PADDING = 0.035;
export const SHADOW_OFFSET_X = 0;
export const SHADOW_OFFSET_Y = 4;
export const SHADOW_BLUR_RADIUS = 3;
export const SHADOW_OPACITY = 0.26;
export const CATALOG_EDGE_MARGIN = 12;

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
