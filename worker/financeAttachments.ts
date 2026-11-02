// Private receipt/invoice photos for the admin finance module. Objects live only in the
// private R2_FINANCE bucket and are served through this route, never from a public URL.

type FinanceObject = { body: ReadableStream; size: number; httpMetadata?: { contentType?: string } };
type FinanceBucket = {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<FinanceObject | null>;
  delete(key: string): Promise<void>;
};
type FinanceEnv = { R2_FINANCE?: FinanceBucket };

export const FINANCE_ATTACHMENT_ROUTE = '/finance/attachments';
export const FINANCE_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};
const CONTENT_TYPE_BY_EXT: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };
const KEY_PATTERN = /^finance\/\d{4}\/(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/;

export function isFinanceAttachmentKey(key: string): boolean {
  return KEY_PATTERN.test(key) && !key.includes('..');
}

function sniffExtension(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(8, 12))) return 'heic';
  return null;
}

/** Called only after verifyAdminAccess in the main router (which also refuses while inspection is locked). */
export async function handleFinanceAttachmentRoute(request: Request, env: FinanceEnv, cors: Record<string, string>, userId: string, now = new Date()) {
  const json = (value: unknown, status: number) => new Response(JSON.stringify(value), {
    status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
  const bucket = env.R2_FINANCE;
  if (!bucket) return json({ error: 'Η ιδιωτική αποθήκευση παραστατικών δεν έχει ρυθμιστεί.' }, 503);
  const path = new URL(request.url).pathname;

  if (path === FINANCE_ATTACHMENT_ROUTE) {
    if (request.method !== 'POST') return json({ error: 'Μη επιτρεπόμενη ενέργεια.' }, 405);
    const declaredType = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[declaredType]) return json({ error: 'Επιτρέπονται μόνο εικόνες JPEG, PNG, WEBP ή HEIC.' }, 415);
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > FINANCE_ATTACHMENT_MAX_BYTES) return json({ error: 'Η εικόνα ξεπερνά τα 8MB.' }, 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ error: 'Η εικόνα είναι κενή.' }, 400);
    if (body.byteLength > FINANCE_ATTACHMENT_MAX_BYTES) return json({ error: 'Η εικόνα ξεπερνά τα 8MB.' }, 413);
    const ext = sniffExtension(new Uint8Array(body, 0, Math.min(body.byteLength, 16)));
    if (!ext || ext !== TYPES[declaredType]) return json({ error: 'Το περιεχόμενο δεν αντιστοιχεί σε έγκυρη εικόνα.' }, 415);
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `finance/${year}/${month}/${crypto.randomUUID()}.${ext}`;
    await bucket.put(key, body, {
      httpMetadata: { contentType: CONTENT_TYPE_BY_EXT[ext] },
      customMetadata: { uploadedBy: userId, uploadedAt: now.toISOString() },
    });
    return json({ key }, 201);
  }

  let key: string;
  try {
    key = decodeURIComponent(path.slice(FINANCE_ATTACHMENT_ROUTE.length + 1));
  } catch {
    return json({ error: 'Μη έγκυρο κλειδί συνημμένου.' }, 400);
  }
  if (!path.startsWith(`${FINANCE_ATTACHMENT_ROUTE}/`) || !isFinanceAttachmentKey(key)) {
    return json({ error: 'Μη έγκυρο κλειδί συνημμένου.' }, 400);
  }

  if (request.method === 'GET') {
    const object = await bucket.get(key);
    if (!object) return json({ error: 'Το συνημμένο δεν βρέθηκε.' }, 404);
    return new Response(object.body, {
      headers: {
        ...cors,
        'Content-Type': object.httpMetadata?.contentType || CONTENT_TYPE_BY_EXT[key.split('.').pop() as string],
        'Content-Length': String(object.size),
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  }
  if (request.method === 'DELETE') {
    await bucket.delete(key);
    return json({ ok: true, key }, 200);
  }
  return json({ error: 'Μη επιτρεπόμενη ενέργεια.' }, 405);
}
