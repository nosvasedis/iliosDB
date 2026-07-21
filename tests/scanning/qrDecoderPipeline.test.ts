import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, purgeZXingModule } from 'zxing-wasm/reader';
import { decodeQrImage } from '../../features/scanning/qrDecoderPipeline';

class TestImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}

type FixtureOptions = {
  scale?: number;
  margin?: number;
  dark?: number;
  light?: number;
  rotate?: boolean;
  skew?: number;
  blur?: boolean;
  inkSpread?: boolean;
  missingInk?: boolean;
  noise?: boolean;
};

function renderFixture(text: string, options: FixtureOptions = {}): ImageData {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const scale = options.scale ?? 4;
  const margin = options.margin ?? 2;
  const baseSize = (qr.modules.size + margin * 2) * scale;
  const skew = options.skew ?? 0;
  const width = baseSize + Math.abs(skew) * 2;
  const height = baseSize;
  let pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);

  for (let y = 0; y < baseSize; y += 1) {
    const sourceY = options.rotate ? baseSize - 1 - y : y;
    const rowShift = Math.round(((y / Math.max(1, baseSize - 1)) - 0.5) * skew * 2) + Math.abs(skew);
    for (let x = 0; x < baseSize; x += 1) {
      const sourceX = options.rotate ? x : x;
      const moduleX = Math.floor(sourceX / scale) - margin;
      const moduleY = Math.floor(sourceY / scale) - margin;
      const rotatedModuleX = options.rotate ? moduleY : moduleX;
      const rotatedModuleY = options.rotate ? qr.modules.size - 1 - moduleX : moduleY;
      const inside = rotatedModuleX >= 0 && rotatedModuleX < qr.modules.size && rotatedModuleY >= 0 && rotatedModuleY < qr.modules.size;
      const darkModule = inside && Boolean(qr.modules.data[rotatedModuleY * qr.modules.size + rotatedModuleX]);
      const value = darkModule ? (options.dark ?? 0) : (options.light ?? 255);
      const destinationX = x + rowShift;
      if (destinationX < 0 || destinationX >= width) continue;
      const index = (y * width + destinationX) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
  }

  if (options.missingInk) {
    for (let index = 0; index < pixels.length; index += 4 * 431) {
      if (pixels[index] < 128) pixels[index] = pixels[index + 1] = pixels[index + 2] = options.light ?? 255;
    }
  }

  if (options.noise) {
    let seed = 0x1f123bb5;
    for (let sample = 0; sample < Math.floor(width * height * 0.002); sample += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const pixel = seed % (width * height);
      const index = pixel * 4;
      const value = pixels[index] < 128 ? options.light ?? 255 : options.dark ?? 0;
      pixels[index] = pixels[index + 1] = pixels[index + 2] = value;
    }
  }

  if (options.inkSpread) {
    const expanded = new Uint8ClampedArray(pixels);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4;
        if (pixels[index] >= 128) continue;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const target = ((y + offsetY) * width + x + offsetX) * 4;
            expanded[target] = expanded[target + 1] = expanded[target + 2] = options.dark ?? 0;
            expanded[target + 3] = 255;
          }
        }
      }
    }
    pixels = expanded;
  }

  if (options.blur) {
    const blurred = new Uint8ClampedArray(pixels);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        let total = 0;
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            total += pixels[((y + offsetY) * width + x + offsetX) * 4];
          }
        }
        const value = Math.round(total / 9);
        const target = (y * width + x) * 4;
        blurred[target] = blurred[target + 1] = blurred[target + 2] = value;
        blurred[target + 3] = 255;
      }
    }
    pixels = blurred;
  }

  return new TestImageData(pixels, width, height) as unknown as ImageData;
}

describe('ZXing-C++ QR decoder pipeline', () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'ImageData', { value: TestImageData, configurable: true });
    const wasmPath = fileURLToPath(new URL('../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url));
    await prepareZXingModule({
      overrides: { wasmBinary: new Uint8Array(readFileSync(wasmPath)) },
      fireImmediately: true,
    });
  });

  afterAll(() => purgeZXingModule());

  it.each([
    ['tiny modules and partial quiet zone', { scale: 2, margin: 1 }],
    ['low contrast', { scale: 3, margin: 1, dark: 76, light: 188 }],
    ['rotation and skew', { scale: 4, margin: 1, rotate: true, skew: 5 }],
    ['missing ink and noise', { scale: 4, margin: 1, missingInk: true, noise: true }],
    ['ink spread', { scale: 4, margin: 1, inkSpread: true }],
    ['blurred low-contrast old-printer combination', { scale: 5, margin: 1, dark: 62, light: 205, blur: true, missingInk: true }],
  ] as const)('decodes %s', async (_name, options) => {
    const result = await decodeQrImage(renderFixture('RN150P', options), true, false);
    expect(result).toBe('RN150P');
  });
});
