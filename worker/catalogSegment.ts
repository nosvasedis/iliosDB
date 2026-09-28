export const CATALOG_PREPARE_HEADER = 'X-Ilios-Catalog-Prepare';
export const CATALOG_PREPARE_FAILED_STATUS = 422;
export const CATALOG_PREPARE_FAILED_ERROR = 'catalog-prepare-failed';
export const ISOLATE_MAX_EDGE = 800;

const OUTPUT_FORMATS = ['png', 'image/png'];

async function resolveImagesResponse(result: any): Promise<Response | null> {
  if (!result) return null;
  const maybe = typeof result.response === 'function' ? result.response() : result;
  return await Promise.resolve(maybe);
}

export async function segmentCatalogImage(
  env: { IMAGES?: any } | null | undefined,
  originalBytes: Uint8Array | null | undefined,
): Promise<Response | null> {
  if (!env?.IMAGES) {
    console.warn('catalog-segment: IMAGES binding missing');
    return null;
  }
  if (!originalBytes || originalBytes.length === 0) {
    console.warn('catalog-segment: empty upload body');
    return null;
  }

  let lastError = 'no attempt';
  for (const format of OUTPUT_FORMATS) {
    try {
      const stream = new Response(originalBytes as unknown as BodyInit).body;
      if (!stream) {
        lastError = `format=${format} empty input stream`;
        continue;
      }
      const result = await env.IMAGES.input(stream)
        .transform({ segment: 'foreground' })
        .transform({ width: ISOLATE_MAX_EDGE, height: ISOLATE_MAX_EDGE, fit: 'scale-down' })
        .output({ format });
      const response = await resolveImagesResponse(result);
      if (response && response.ok) return response;
      lastError = `format=${format} status=${response?.status ?? 'none'}`;
      if (response && !response.ok) {
        try {
          lastError += ` body=${(await response.text()).slice(0, 300)}`;
        } catch {
          // ignore body read failures
        }
      }
    } catch (err: any) {
      lastError = `format=${format} threw=${err?.message || err} code=${err?.code ?? ''}`;
    }
  }

  console.warn('catalog-segment failed:', lastError);
  return null;
}
