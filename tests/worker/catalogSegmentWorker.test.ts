import { describe, expect, it } from 'vitest';
import worker from '../../worker/worker.js';
import { CATALOG_PREPARE_FAILED_STATUS, CATALOG_PREPARE_HEADER } from '../../worker/catalogSegment';

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

const mockImages = (response: Response) => {
  const handle = {
    transform: () => handle,
    output: async () => ({
      response: () => response,
    }),
  };
  return {
    info: async () => ({ format: 'image/jpeg', fileSize: 12, width: 40, height: 40 }),
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

describe('catalog image Worker segment proxy', () => {
  it('allows the catalog prepare header in CORS preflight', async () => {
    const response = await worker.fetch(new Request('https://worker.example/SKU_1.jpg', { method: 'OPTIONS' }), {
      AUTH_KEY_SECRET: AUTH,
    });
    expect(response.headers.get('Access-Control-Allow-Headers') || '').toContain(CATALOG_PREPARE_HEADER);
  });

  it('stores the uploaded bytes verbatim when the prepare header is absent', async () => {
    const r2 = memoryR2();
    const original = new Uint8Array([1, 2, 3, 4]);
    const response = await post({ AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response('nope', { status: 500 })) }, original);
    expect(response.status).toBe(200);
    expect(Array.from(r2.objects.get('SKU_1.jpg')!.bytes)).toEqual([1, 2, 3, 4]);
  });

  it('returns the isolated PNG without storing anything when prepare is requested', async () => {
    const r2 = memoryR2();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response(png, { status: 200 })) },
      new Uint8Array([9, 8, 7, 6]),
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(Array.from(png));
    expect(r2.objects.size).toBe(0);
  });

  it('fails with the prepare status and stores nothing when Images returns an error', async () => {
    const r2 = memoryR2();
    const response = await post(
      { AUTH_KEY_SECRET: AUTH, R2_BUCKET: r2, IMAGES: mockImages(new Response('error 9422', { status: 415 })) },
      new Uint8Array([9, 8, 7, 6]),
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(CATALOG_PREPARE_FAILED_STATUS);
    expect(r2.objects.size).toBe(0);
  });

  it('fails with the prepare status when Images throws', async () => {
    const r2 = memoryR2();
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
      new Uint8Array([3, 3, 3]),
      { [CATALOG_PREPARE_HEADER]: '1' },
    );
    expect(response.status).toBe(CATALOG_PREPARE_FAILED_STATUS);
    expect(r2.objects.size).toBe(0);
  });
});
