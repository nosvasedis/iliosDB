import { boundedText } from './sbz';
import { parseDeliveryNoteStatusXml } from '../features/legal/deliveryStatus';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  AADE_USER_ID_DEV?: string;
  AADE_SUBSCRIPTION_KEY_DEV?: string;
  AADE_USER_ID_PROD?: string;
  AADE_SUBSCRIPTION_KEY_PROD?: string;
};

/** myDATA ERP channel (DeliveryNote v2.0.2): dev has no /myDATA path segment, prod does. */
export const MYDATA_DELIVERY_BASE = { dev: 'https://mydataapidev.aade.gr', prod: 'https://mydatapi.aade.gr/myDATA' } as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function mydataErpCredentials(env: Env, environment: 'dev' | 'prod') {
  return environment === 'prod'
    ? { userId: env.AADE_USER_ID_PROD, key: env.AADE_SUBSCRIPTION_KEY_PROD }
    : { userId: env.AADE_USER_ID_DEV, key: env.AADE_SUBSCRIPTION_KEY_DEV };
}

/**
 * Read-only status of a movement document issued through SBZ, asked directly from myDATA with
 * the business's own REST credentials. Called only after verifyAdminAccess. The document id is
 * resolved server-side, so the client cannot query arbitrary MARKs.
 */
export async function handleDeliveryStatusRoute(request: Request, env: Env, cors: Record<string, string>, fetchFn: typeof fetch = fetch) {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ error: 'Μη επιτρεπόμενη ενέργεια.' }, 405);
  try {
    const payload = JSON.parse(await boundedText(new Response(request.body), 4096) || '{}');
    let environment: 'dev' | 'prod';
    let query: ['mark' | 'qrUrl', string];
    if (payload.documentId) {
      if (!uuid.test(String(payload.documentId))) return json({ error: 'Μη έγκυρο παραστατικό.' }, 400);
      const lookup = await fetchFn(`${env.SUPABASE_URL}/rest/v1/legal_documents?id=eq.${payload.documentId}&select=id,environment,aade_mark,status,document_kind`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        signal: AbortSignal.timeout(15000),
      });
      const [document] = lookup.ok ? JSON.parse(await boundedText(lookup)) : [];
      if (!document) return json({ error: 'Το παραστατικό δεν βρέθηκε.' }, 404);
      if (!['delivery_note', 'invoice_delivery'].includes(document.document_kind)) return json({ error: 'Η κατάσταση διακίνησης αφορά μόνο δελτία αποστολής και τιμολόγια-ΔΑ.' }, 400);
      if (!/^\d+$/.test(String(document.aade_mark || '')) || !['issued', 'cancelled'].includes(document.status)) return json({ error: 'Το παραστατικό δεν έχει ΜΑΡΚ.' }, 400);
      environment = document.environment === 'prod' ? 'prod' : 'dev';
      query = ['mark', String(document.aade_mark)];
    } else {
      // A scanned QR of someone else's note (e.g. goods arriving from a supplier).
      const qrUrl = String(payload.qrUrl || '').trim();
      try {
        if (new URL(qrUrl).protocol !== 'https:' || qrUrl.length > 2048) throw new Error('bad');
      } catch {
        return json({ error: 'Το QR δεν είναι έγκυρο QR διακίνησης.' }, 400);
      }
      environment = /mydataapidev/i.test(qrUrl) ? 'dev' : 'prod';
      query = ['qrUrl', qrUrl];
    }
    const credentials = mydataErpCredentials(env, environment);
    if (!credentials.userId || !credentials.key) return json({ error: `Δεν έχουν οριστεί τα κλειδιά myDATA REST (${environment === 'prod' ? 'Παραγωγή' : 'Δοκιμές'}) στον worker.` }, 503);

    const endpoint = new URL(`${MYDATA_DELIVERY_BASE[environment]}/GetDeliveryNoteStatus`);
    endpoint.searchParams.set(query[0], query[1]);
    const response = await fetchFn(endpoint.href, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/xml', 'aade-user-id': credentials.userId, 'Ocp-Apim-Subscription-Key': credentials.key },
      signal: AbortSignal.timeout(20000),
    });
    const body = await boundedText(response, 512 * 1024);
    if (response.status === 401 || response.status === 403) {
      return json({ error: `Η ΑΑΔΕ δεν δέχθηκε τα κλειδιά myDATA REST του περιβάλλοντος ${environment === 'prod' ? 'Παραγωγής' : 'Δοκιμών'} (HTTP ${response.status}).`, httpStatus: response.status }, 502);
    }
    const result = parseDeliveryNoteStatusXml(body);
    if (!response.ok && !result.ok) {
      return json({ error: result.errors[0] || `Η ΑΑΔΕ απάντησε με HTTP ${response.status}.`, httpStatus: response.status, ...result }, 502);
    }
    return json({ ...result, environment, httpStatus: response.status, checkedAt: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ event: 'delivery_status_failed', message: error instanceof Error ? error.message : 'unknown' }));
    return json({ error: 'Η ανάκτηση κατάστασης από την ΑΑΔΕ απέτυχε. Δοκιμάστε ξανά.' }, 502);
  }
}
