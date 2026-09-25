import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import {
  ALPHA_FLOOR,
  CATALOG_SQUARE_SIZE,
  applyAlphaFloor,
  applyJewelryVibrance,
  boundingBox,
  composeCatalogSquare,
  isMaskSane,
  opaqueFraction,
  prepareCatalogJpegFromPng,
  prepareCatalogJpegFromRgba,
  scaledIsolateSize,
  ISOLATE_MAX_EDGE,
} from '../../worker/catalogImagePrepare';

const makeRgba = (width: number, height: number, fill: [number, number, number, number] = [0, 0, 0, 0]) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data.set(fill, i * 4);
  }
  return data;
};

const setPixel = (data: Uint8Array, width: number, x: number, y: number, rgba: [number, number, number, number]) => {
  data.set(rgba, (y * width + x) * 4);
};

const chroma = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);

describe('catalog image alpha floor and mask sanity', () => {
  it('raises jewelry alpha toward opaque and never lowers it', () => {
    const data = new Uint8Array([10, 10, 10, 8, 40, 40, 40, 40, 90, 90, 90, 200]);
    applyAlphaFloor(data);
    expect(data[3]).toBe(8);
    expect(data[7]).toBeGreaterThan(40);
    expect(data[11]).toBeGreaterThan(200);
    expect(data[7]).toBeLessThanOrEqual(255);
    expect(data[11]).toBeLessThanOrEqual(255);
  });

  it('rejects empty and near-full masks', () => {
    expect(isMaskSane(0.01)).toBe(false);
    expect(isMaskSane(0.93)).toBe(false);
    expect(isMaskSane(0.04)).toBe(true);
    expect(isMaskSane(0.92)).toBe(true);
  });

  it('measures opaque fraction after the floor', () => {
    const data = makeRgba(10, 10);
    setPixel(data, 10, 2, 2, [10, 10, 10, 40]);
    applyAlphaFloor(data);
    expect(opaqueFraction(data)).toBe(0.01);
    expect(isMaskSane(opaqueFraction(data))).toBe(false);
  });
});

describe('catalog bounding box and square compose', () => {
  it('finds the opaque jewelry bounds', () => {
    const data = makeRgba(20, 20);
    setPixel(data, 20, 4, 5, [120, 90, 40, 255]);
    setPixel(data, 20, 8, 9, [120, 90, 40, 255]);
    expect(boundingBox(data, 20, 20)).toEqual({ x: 4, y: 5, width: 5, height: 5 });
  });

  it('centers the piece on a white 900 square', () => {
    const data = makeRgba(40, 40);
    for (let y = 14; y < 26; y += 1) {
      for (let x = 14; x < 26; x += 1) {
        setPixel(data, 40, x, y, [160, 110, 50, 255]);
      }
    }
    const box = boundingBox(data, 40, 40);
    const composed = composeCatalogSquare({ data, width: 40, height: 40 }, box!);
    const corner = 0;
    expect(composed.data[corner]).toBe(255);
    expect(composed.data[corner + 1]).toBe(255);
    expect(composed.data[corner + 2]).toBe(255);

    const center = ((CATALOG_SQUARE_SIZE * 450 + 450) * 4);
    expect(composed.data[center]).toBeLessThan(200);
    expect(composed.mask[450 * CATALOG_SQUARE_SIZE + 450]).toBe(1);
  });

  it('drops a subtle studio shadow behind the piece without tinting jewelry or the corners', () => {
    const data = makeRgba(40, 40);
    for (let y = 14; y < 26; y += 1) {
      for (let x = 14; x < 26; x += 1) {
        setPixel(data, 40, x, y, [160, 110, 50, 255]);
      }
    }
    const box = boundingBox(data, 40, 40);
    const composed = composeCatalogSquare({ data, width: 40, height: 40 }, box!);

    expect(composed.data[0]).toBe(255);
    expect(composed.data[1]).toBe(255);
    expect(composed.data[2]).toBe(255);

    const jewelryIndex = (450 * CATALOG_SQUARE_SIZE + 450) * 4;
    expect(composed.mask[450 * CATALOG_SQUARE_SIZE + 450]).toBe(1);
    expect(composed.data[jewelryIndex]).toBe(160);
    expect(composed.data[jewelryIndex + 1]).toBe(110);
    expect(composed.data[jewelryIndex + 2]).toBe(50);

    let maxMaskY = 0;
    let minMaskX = CATALOG_SQUARE_SIZE;
    let maxMaskX = 0;
    for (let y = 0; y < CATALOG_SQUARE_SIZE; y += 1) {
      for (let x = 0; x < CATALOG_SQUARE_SIZE; x += 1) {
        if (!composed.mask[y * CATALOG_SQUARE_SIZE + x]) continue;
        if (y > maxMaskY) maxMaskY = y;
        if (x < minMaskX) minMaskX = x;
        if (x > maxMaskX) maxMaskX = x;
      }
    }

    let shadowPixels = 0;
    let darkest = 255;
    const midX = Math.floor((minMaskX + maxMaskX) / 2);
    for (let y = maxMaskY + 4; y < Math.min(CATALOG_SQUARE_SIZE, maxMaskY + 36); y += 1) {
      for (let x = midX - 20; x <= midX + 20; x += 1) {
        if (composed.mask[y * CATALOG_SQUARE_SIZE + x]) continue;
        const i = (y * CATALOG_SQUARE_SIZE + x) * 4;
        const value = composed.data[i];
        if (value >= 255) continue;
        expect(composed.data[i + 1]).toBe(value);
        expect(composed.data[i + 2]).toBe(value);
        shadowPixels += 1;
        if (value < darkest) darkest = value;
      }
    }
    expect(shadowPixels).toBeGreaterThan(40);
    expect(darkest).toBeGreaterThan(210);
    expect(darkest).toBeLessThan(252);
  });
});

describe('jewelry vibrance', () => {
  it('leaves already-rich colors and specular highlights alone', () => {
    const rich = new Uint8Array([255, 0, 0, 255]);
    applyJewelryVibrance(rich);
    expect(Array.from(rich.slice(0, 3))).toEqual([255, 0, 0]);

    const highlight = new Uint8Array([250, 250, 248, 255]);
    applyJewelryVibrance(highlight);
    expect(Array.from(highlight.slice(0, 3))).toEqual([250, 250, 248]);

    const deep = new Uint8Array([20, 20, 22, 255]);
    applyJewelryVibrance(deep);
    expect(Array.from(deep.slice(0, 3))).toEqual([20, 20, 22]);
  });

  it('lifts muted midtones slightly without touching white', () => {
    const muted = new Uint8Array([140, 130, 120, 255, 255, 255, 255, 255]);
    const before = chroma(140, 130, 120);
    applyJewelryVibrance(muted, new Uint8Array([1, 0]));
    expect(chroma(muted[0], muted[1], muted[2])).toBeGreaterThan(before);
    expect(Array.from(muted.slice(4, 7))).toEqual([255, 255, 255]);
  });
});

describe('PNG to catalog JPEG', () => {
  const encodePng = (width: number, height: number, paint: (data: Uint8Array) => void) => {
    const png = new PNG({ width, height });
    paint(png.data);
    return Uint8Array.from(PNG.sync.write(png));
  };

  it('returns null for an empty mask', () => {
    const png = encodePng(24, 24, (data) => data.fill(0));
    expect(prepareCatalogJpegFromPng(png)).toBeNull();
  });

  it('returns a 900px JPEG when the jewelry mask is sane', () => {
    const png = encodePng(48, 48, (data) => {
      data.fill(0);
      for (let y = 16; y < 32; y += 1) {
        for (let x = 16; x < 32; x += 1) {
          const i = (y * 48 + x) * 4;
          data[i] = 150;
          data[i + 1] = 120;
          data[i + 2] = 70;
          data[i + 3] = 255;
        }
      }
    });
    const jpegBytes = prepareCatalogJpegFromPng(png);
    expect(jpegBytes).toBeTruthy();
    expect(jpegBytes![0]).toBe(0xff);
    expect(jpegBytes![1]).toBe(0xd8);
    const decoded = jpeg.decode(Buffer.from(jpegBytes!), { useTArray: true });
    expect(decoded.width).toBe(CATALOG_SQUARE_SIZE);
    expect(decoded.height).toBe(CATALOG_SQUARE_SIZE);
  });

  it('builds the catalog JPEG from raw RGBA so Workers do not need pngjs inflate', () => {
    const width = 48;
    const height = 48;
    const data = makeRgba(width, height);
    for (let y = 16; y < 32; y += 1) {
      for (let x = 16; x < 32; x += 1) {
        setPixel(data, width, x, y, [150, 120, 70, 255]);
      }
    }
    const jpegBytes = prepareCatalogJpegFromRgba(data, width, height);
    expect(jpegBytes).toBeTruthy();
    const decoded = jpeg.decode(Buffer.from(jpegBytes!), { useTArray: true });
    expect(decoded.width).toBe(CATALOG_SQUARE_SIZE);
    expect(decoded.height).toBe(CATALOG_SQUARE_SIZE);
  });
});

describe('isolate scale-down', () => {
  it('keeps small sources and fits a 2048px phone photo onto a 960 edge', () => {
    expect(scaledIsolateSize(40, 40)).toEqual({ width: 40, height: 40 });
    expect(ISOLATE_MAX_EDGE).toBe(960);
    expect(scaledIsolateSize(1536, 2048)).toEqual({ width: 720, height: 960 });
  });
});
