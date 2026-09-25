import { describe, expect, it } from 'vitest';
import worker from '../../worker/worker.js';
import { CATALOG_PREPARE_FAILED_STATUS, CATALOG_PREPARE_HEADER } from '../../worker/catalogImagePrepare';

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

const jewelryRgba = () => {
  const width = 40;
  const height = 40;
  const data = new Uint8Array(width * height * 4);
  for (let y = 12; y < 28; y += 1) {
    for (let x = 12; x < 28; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = 140;
      data[i + 1] = 110;
      data[i + 2] = 60;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
};

const mockImages = (response: Response, info = { format: 'image/jpeg', fileSize: 12, width: 40, height: 40 }) => {
  const handle = {
    transform: () => handle,
    output: async () => ({
      response: () => response,
    }),
  };
  return {
    info: async () => info,
    input: () => handle,
  };
};

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

  it('does not store the original when Images returns 9422', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([9, 8, 7, 6]);
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response('error 9422', { status: 415 })) },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(CATALOG_PREPARE_FAILED_STATUS);
    expect(r2.objects.has('SKU_1.jpg')).toBe(false);
  });

  it('does not store the original when Images throws', async () => {
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
    expect(response.status).toBe(CATALOG_PREPARE_FAILED_STATUS);
    expect(r2.objects.has('SKU_1.jpg')).toBe(false);
  });

  it('does not store the original when the mask is empty', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([4, 4, 4, 4]);
    const empty = new Uint8Array(16 * 16 * 4);
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response(empty, { status: 200 }), { format: 'image/jpeg', fileSize: 4, width: 16, height: 16 }) },
      original,
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(CATALOG_PREPARE_FAILED_STATUS);
    expect(r2.objects.has('SKU_1.jpg')).toBe(false);
  });

  it('stores a catalog JPEG when isolation succeeds', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([11, 12, 13]);
    const jewelry = jewelryRgba();
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response(jewelry.data, { status: 200 }), { format: 'image/jpeg', fileSize: 13, width: jewelry.width, height: jewelry.height }) },
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
