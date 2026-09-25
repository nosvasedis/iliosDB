import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import worker from '../../worker/worker.js';
import { CATALOG_PREPARE_HEADER } from '../../worker/catalogImagePrepare';

const AUTH = 'secret';

const memoryR2 = () => {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects,
    async put(key: string, value: ArrayBuffer | Uint8Array | ReadableStream, options?: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array
        ? value
        : new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
      objects.set(key, { bytes, contentType: options?.httpMetadata?.contentType });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.bytes,
        httpEtag: '"etag"',
        writeHttpMetadata(headers: Headers) {
          headers.set('Content-Type', object.contentType || 'image/jpeg');
        },
      };
    },
  };
};

const jewelryPng = () => {
  const png = new PNG({ width: 40, height: 40 });
  png.data.fill(0);
  for (let y = 12; y < 28; y += 1) {
    for (let x = 12; x < 28; x += 1) {
      const i = (y * 40 + x) * 4;
      png.data[i] = 140;
      png.data[i + 1] = 110;
      png.data[i + 2] = 60;
      png.data[i + 3] = 255;
    }
  }
  return Uint8Array.from(PNG.sync.write(png));
};

const mockImages = (response: Response) => ({
  input: () => ({
    transform: () => ({
      output: async () => ({
        response: () => response,
      }),
    }),
  }),
});

const post = (env: any, body: Uint8Array, headers: Record<string, string> = {}) =>
  worker.fetch(
    new Request('https://worker.example/SKU_1.jpg', {
      method: 'POST',
      headers: {
        Authorization: AUTH,
        'Content-Type': 'image/jpeg',
        ...headers,
      },
      body,
    }),
    env,
  );

describe('catalog image Worker prepare path', () => {
  it('allows the catalog prepare header in CORS preflight', async () => {
    const response = await worker.fetch(new Request('https://worker.example/SKU_1.jpg', { method: 'OPTIONS' }), {
      AUTH_KEY_SECRET: AUTH,
    });
    expect(response.headers.get('Access-Control-Allow-Headers') || '').toContain(CATALOG_PREPARE_HEADER);
  });

  it('stores the original bytes when the prepare header is absent', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([1, 2, 3, 4]);
    const response = await post({ AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response('nope', { status: 500 })) }, original);
    expect(response.status).toBe(200);
    expect(Array.from(r2.objects.get('SKU_1.jpg')!.bytes)).toEqual([1, 2, 3, 4]);
  });

  it('stores the original photo when Images returns 9422', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([9, 8, 7, 6]);
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response('error 9422', { status: 415 })) },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(200);
    expect(Array.from(r2.objects.get('SKU_1.jpg')!.bytes)).toEqual([9, 8, 7, 6]);
  });

  it('stores the original photo when Images throws', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([3, 3, 3]);
    const response = await post(
      {
        AUTH_KEY_SECRET: AUTH,
        R2_BUCKET: r2,
        IMAGES: {
          input: () => {
            throw new Error('error code: 9422');
          },
        },
      },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(200);
    expect(Array.from(r2.objects.get('SKU_1.jpg')!.bytes)).toEqual([3, 3, 3]);
  });

  it('stores the original photo when the mask is empty', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([4, 4, 4, 4]);
    const empty = new PNG({ width: 16, height: 16 });
    empty.data.fill(0);
    const png = Uint8Array.from(PNG.sync.write(empty));
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response(png, { status: 200 })) },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(200);
    expect(Array.from(r2.objects.get('SKU_1.jpg')!.bytes)).toEqual([4, 4, 4, 4]);
  });

  it('stores a catalog JPEG when isolation succeeds', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([11, 12, 13]);
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response(jewelryPng(), { status: 200 })) },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(200);
    const stored = r2.objects.get('SKU_1.jpg')!;
    expect(stored.bytes[0]).toBe(0xff);
    expect(stored.bytes[1]).toBe(0xd8);
    expect(stored.contentType).toBe('image/jpeg');
    expect(stored.bytes.length).toBeGreaterThan(original.length);
  });
});
