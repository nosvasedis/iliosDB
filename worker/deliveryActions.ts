import { boundedText } from './sbz';
import { MYDATA_DELIVERY_BASE, mydataErpCredentials } from './deliveryNote';
import { parseDeliveryNoteStatusXml } from '../features/legal/deliveryStatus';
import {
  buildConfirmOutcomeXml,
  buildConfirmReturnXml,
  buildRegisterTransferXml,
  buildRejectDeliveryXml,
  environmentFromQrUrl,
  parseDeliveryActionResponse,
  type DeliveryAction,
  type DeliveryOutcome,
} from '../features/legal/deliveryActions';

type Env = Parameters<typeof mydataErpCredentials>[0];

type ActionPayload = {
  action?: string;
  documentId?: string;
  qrUrl?: string;
  vehicleNumber?: string;
  transportType?: number;
  outcome?: string;
  deliveredWithoutRecipient?: boolean;
  packaging?: Array<{ type: number; quantity: number; title?: string }>;
  reason?: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_TYPE: Record<DeliveryAction, string> = {
  start: 'register_transfer', deliver: 'confirm_delivery', return: 'confirm_return', receive: 'confirm_receipt', reject: 'reject_delivery',
};
const envLabel = (environment: 'dev' | 'prod') => (environment === 'prod' ? 'Παραγωγή' : 'Δοκιμές');

/**
 * Movement events on the myDATA ERP channel (RegisterTransfer, ConfirmDeliveryOutcome,
 * ConfirmDeliveryReturn, RejectDeliveryNote). Own documents are resolved by id — their QR is the
 * AADE myDATAUrl saved at issue — and only allow start/deliver/return. A scanned QR of someone
 * else's note allows only receive/reject. Called after verifyAdminAccess; own events are logged.
 */
export async function handleDeliveryActionRoute(request: Request, env: Env, cors: Record<string, string>, actor: string, fetchFn: typeof fetch = fetch) {
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ error: 'Μη επιτρεπόμενη ενέργεια.' }, 405);
  const db = (path: string, init: RequestInit = {}) => fetchFn(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', ...((init.headers as Record<string, string>) || {}) },
    signal: AbortSignal.timeout(15000),
  });
  try {
    const payload = JSON.parse(await boundedText(new Response(request.body), 16384) || '{}') as ActionPayload;
    const action = payload.action as DeliveryAction;
    if (!['start', 'deliver', 'return', 'receive', 'reject'].includes(action)) return json({ error: 'Άγνωστη ενέργεια διακίνησης.' }, 400);

    let document: any = null;
    let qrUrl: string;
    let environment: 'dev' | 'prod';
    if (payload.documentId) {
      if (!uuid.test(payload.documentId)) return json({ error: 'Μη έγκυρο παραστατικό.' }, 400);
      if (action === 'receive' || action === 'reject') return json({ error: 'Η παραλαβή ή απόρριψη γίνεται από τον παραλήπτη, όχι στα δικά σας δελτία.' }, 400);
      const lookup = await db(`legal_documents?id=eq.${payload.documentId}&select=id,environment,aade_mark,status,document_kind,provider_mydata_url,issuer`);
      [document] = lookup.ok ? JSON.parse(await boundedText(lookup)) : [];
      if (!document) return json({ error: 'Το παραστατικό δεν βρέθηκε.' }, 404);
      if (!['delivery_note', 'invoice_delivery'].includes(document.document_kind) || document.status !== 'issued') return json({ error: 'Η ενέργεια αφορά εκδοθέντα δελτία αποστολής και τιμολόγια-ΔΑ.' }, 400);
      qrUrl = String(document.provider_mydata_url || '');
      environment = document.environment === 'prod' ? 'prod' : 'dev';
    } else {
      qrUrl = String(payload.qrUrl || '').trim();
      environment = environmentFromQrUrl(qrUrl);
      if (!['receive', 'reject'].includes(action)) return json({ error: 'Για δελτία τρίτων επιτρέπεται μόνο επιβεβαίωση παραλαβής ή απόρριψη.' }, 400);
    }
    try {
      const parsedQr = new URL(qrUrl);
      if (parsedQr.protocol !== 'https:' || qrUrl.length > 2048) throw new Error('bad');
    } catch {
      return json({ error: 'Δεν υπάρχει έγκυρο QR διακίνησης για αυτό το δελτίο.' }, 400);
    }

    const outcome = (action === 'receive' ? 'FULL' : String(payload.outcome || 'FULL').toUpperCase()) as DeliveryOutcome;
    let method: string;
    let body: string;
    if (action === 'start') {
      const vehicle = String(payload.vehicleNumber || '').trim();
      const transportType = Number(payload.transportType) || 2;
      if (!vehicle && transportType !== 7) return json({ error: 'Συμπληρώστε τον αριθμό κυκλοφορίας του οχήματος.' }, 400);
      const carrierVat = String(document?.issuer?.vat_number || '').replace(/\D/g, '');
      if (!/^\d{9}$/.test(carrierVat)) return json({ error: 'Λείπει ο ΑΦΜ εκδότη (μεταφορέας με ίδια μέσα).' }, 400);
      method = 'RegisterTransfer';
      body = buildRegisterTransferXml({ qrUrl, vehicleNumber: vehicle || 'ΑΝΕΥ', transportType, carrierVatNumber: carrierVat });
    } else if (action === 'deliver' || action === 'receive') {
      if (!['FULL', 'PARTIAL', 'NONE'].includes(outcome)) return json({ error: 'Μη έγκυρο αποτέλεσμα παράδοσης.' }, 400);
      if (outcome === 'PARTIAL' && !(payload.packaging || []).some((item) => Number(item.quantity) > 0)) return json({ error: 'Στη μερική παράδοση δηλώστε τις συσκευασίες που παραδόθηκαν.' }, 400);
      method = 'ConfirmDeliveryOutcome';
      body = buildConfirmOutcomeXml({ qrUrl, outcome, deliveredWithoutRecipient: action === 'deliver' && !!payload.deliveredWithoutRecipient, packaging: outcome === 'PARTIAL' ? payload.packaging : [] });
    } else if (action === 'return') {
      method = 'ConfirmDeliveryReturn';
      body = buildConfirmReturnXml(qrUrl);
    } else {
      method = 'RejectDeliveryNote';
      body = buildRejectDeliveryXml({ qrUrl, reason: payload.reason });
    }

    const credentials = mydataErpCredentials(env, environment);
    if (!credentials.userId || !credentials.key) return json({ error: `Δεν έχουν οριστεί τα κλειδιά myDATA REST (${envLabel(environment)}) στον worker.` }, 503);
    const headers = { Accept: 'application/xml', 'aade-user-id': credentials.userId, 'Ocp-Apim-Subscription-Key': credentials.key };
    const response = await fetchFn(`${MYDATA_DELIVERY_BASE[environment]}/${method}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(25000),
    });
    const responseText = await boundedText(response, 256 * 1024);
    if (response.status === 401 || response.status === 403) {
      return json({ error: `Η ΑΑΔΕ δεν δέχθηκε τα κλειδιά myDATA REST (${envLabel(environment)}).` }, 502);
    }
    const result = parseDeliveryActionResponse(responseText);
    if (!result.ok) {
      return json({ error: result.errors[0] || `Η ΑΑΔΕ δεν δέχθηκε την ενέργεια (HTTP ${response.status}).`, errors: result.errors, statusCode: result.statusCode }, 409);
    }

    if (document) {
      const eventType = action === 'deliver' && outcome === 'NONE' ? 'failed_delivery'
        : action === 'deliver' && outcome === 'PARTIAL' ? 'partial_delivery'
          : EVENT_TYPE[action];
      await db('legal_delivery_events', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          document_id: document.id,
          event_type: eventType,
          actor_role: action === 'return' ? 'issuer' : 'carrier',
          aade_status: 'Success',
          event_mark: result.eventMark,
          created_by: actor,
          event_payload: { action, environment, vehicleNumber: payload.vehicleNumber || null, transportType: payload.transportType || null, outcome: action === 'deliver' ? outcome : null, deliveredWithoutRecipient: !!payload.deliveredWithoutRecipient, packaging: payload.packaging || [] },
        }),
      }).catch(() => undefined);
    }

    // Fresh status so the screen shows the new state right away.
    let status = null;
    try {
      const statusUrl = new URL(`${MYDATA_DELIVERY_BASE[environment]}/GetDeliveryNoteStatus`);
      if (document?.aade_mark) statusUrl.searchParams.set('mark', String(document.aade_mark));
      else statusUrl.searchParams.set('qrUrl', qrUrl);
      const statusResponse = await fetchFn(statusUrl.href, { method: 'GET', redirect: 'manual', headers, signal: AbortSignal.timeout(15000) });
      status = parseDeliveryNoteStatusXml(await boundedText(statusResponse, 512 * 1024));
    } catch { /* status is a convenience only */ }

    return json({ ok: true, action, eventMark: result.eventMark, environment, status });
  } catch (error) {
    console.error(JSON.stringify({ event: 'delivery_action_failed', message: error instanceof Error ? error.message : 'unknown' }));
    return json({ error: 'Η ενέργεια δεν επιβεβαιώθηκε. Ελέγξτε την κατάσταση διακίνησης πριν δοκιμάσετε ξανά.' }, 502);
  }
}
