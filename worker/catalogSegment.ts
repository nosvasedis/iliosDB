export const CATALOG_PREPARE_HEADER = 'X-Ilios-Catalog-Prepare';
export const CATALOG_PREPARE_FAILED_STATUS = 422;
export const CATALOG_PREPARE_FAILED_ERROR = 'catalog-prepare-failed';
export const ISOLATE_MAX_EDGE = 800;

async function resolveImagesResponse(result: any): Promise<Response | null> {
  if (!result) return null;
  const maybe = typeof result.response === 'function' ? result.response() : result;
  return await Promise.resolve(maybe);
}

export async function segmentCatalogImage(
  env: { IMAGES?: any } | null | undefined,
  body: ReadableStream | null,
): Promise<Response | null> {
  if (!env?.IMAGES || !body) return null;
  try {
    const result = await env.IMAGES.input(body)
      .transform({ segment: 'foreground' })
      .transform({ width: ISOLATE_MAX_EDGE, height: ISOLATE_MAX_EDGE, fit: 'scale-down' })
      .output({ format: 'png' });
    const response = await resolveImagesResponse(result);
    if (!response || !response.ok) return null;
    return response;
  } catch {
    return null;
  }
}
