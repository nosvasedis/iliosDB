import { describe, expect, it, vi } from 'vitest';
import {
  buildConfirmOutcomeXml, buildRegisterTransferXml, environmentFromQrUrl, parseDeliveryActionResponse,
} from '../../features/legal/deliveryActions';
import { handleDeliveryActionRoute } from '../../worker/deliveryActions';
import { MYDATA_DELIVERY_BASE } from '../../worker/deliveryNote';

const DOC_ID = '6ad7ce15-5bb1-43d9-afbc-ded2be309a7e';
const QR = 'https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=abc%3d';
const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', AADE_USER_ID_DEV: 'user-dev', AADE_SUBSCRIPTION_KEY_DEV: 'key-dev' };
const request = (body: unknown) => new Request('https://worker.test/legal/delivery-action', { method: 'POST', body: JSON.stringify(body) });
const ownDocument = { id: DOC_ID, environment: 'dev', aade_mark: '400001976761760', status: 'issued', document_kind: 'delivery_note', provider_mydata_url: QR, issuer: { vat_number: '800647737' } };

describe('Ψηφιακό Δελτίο Αποστολής actions', () => {
  it('builds RegisterTransfer and ConfirmDeliveryOutcome per the v2.0.2 schemas', () => {
    const transfer = buildRegisterTransferXml({ qrUrl: QR, vehicleNumber: 'ΙΚΑ1234', transportType: 2, carrierVatNumber: '800647737' });
    expect(transfer).toContain('<Transport><qrUrl>https://mydataapidev.aade.gr/TimologioQR/QRInfo?q=abc%3d</qrUrl><transportDetail><vehicleNumber>ΙΚΑ1234</vehicleNumber><transportType>2</transportType><carrierVatNumber>800647737</carrierVatNumber></transportDetail></Transport>');
    const partial = buildConfirmOutcomeXml({ qrUrl: QR, outcome: 'PARTIAL', packaging: [{ type: 2, quantity: 3 }] });
    expect(partial).toContain('<outcome>PARTIAL</outcome><deliveredPackaging><packagingType>2</packagingType><quantity>3</quantity></deliveredPackaging>');
    expect(environmentFromQrUrl(QR)).toBe('dev');
    expect(environmentFromQrUrl('https://mydatapi.aade.gr/mydata/TimologioQR/QRInfo?q=x')).toBe('prod');
  });

  it('translates myDATA business errors', () => {
    const result = parseDeliveryActionResponse('<ResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><message>x</message><code>813</code></error></errors></response></ResponseDoc>');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('δεν έχει ξεκινήσει');
    expect(parseDeliveryActionResponse('<ResponseDoc><response><statusCode>Success</statusCode><transferMark>4000000000099</transferMark></response></ResponseDoc>')).toMatchObject({ ok: true, eventMark: '4000000000099' });
  });

  it('starts our own-vehicle movement with the AADE QR and logs the event', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/rest/v1/legal_documents')) return new Response(JSON.stringify([ownDocument]));
      if (url.includes('/rest/v1/legal_delivery_events')) return new Response(null, { status: 201 });
      if (url.endsWith('/RegisterTransfer')) return new Response('<ResponseDoc><response><statusCode>Success</statusCode><transferMark>4000000000099</transferMark></response></ResponseDoc>');
      return new Response('<GetDeliveryNoteStatusResponse><invoiceMark>400001976761760</invoiceMark><status>3</status><dispatchTimestamp>2026-11-24T08:00:00Z</dispatchTimestamp></GetDeliveryNoteStatusResponse>');
    });
    const response = await handleDeliveryActionRoute(request({ action: 'start', documentId: DOC_ID, vehicleNumber: 'ΙΚΑ1234', transportType: 2 }), env, {}, 'user-1', fetchFn as unknown as typeof fetch);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, eventMark: '4000000000099', status: { statusCode: '3' } });
    const transfer = calls.find((call) => call.url === `${MYDATA_DELIVERY_BASE.dev}/RegisterTransfer`)!;
    expect(String(transfer.init?.body)).toContain('<carrierVatNumber>800647737</carrierVatNumber>');
    const logged = calls.find((call) => call.url.includes('legal_delivery_events'))!;
    expect(JSON.parse(String(logged.init?.body))).toMatchObject({ event_type: 'register_transfer', event_mark: '4000000000099', created_by: 'user-1' });
  });

  it('allows only receive/reject on a scanned note of someone else, and never on our own', async () => {
    const fetchFn = vi.fn(async () => new Response('<ResponseDoc><response><statusCode>Success</statusCode></response></ResponseDoc>'));
    expect((await handleDeliveryActionRoute(request({ action: 'start', qrUrl: QR }), env, {}, 'u', fetchFn as unknown as typeof fetch)).status).toBe(400);
    expect((await handleDeliveryActionRoute(request({ action: 'reject', documentId: DOC_ID }), env, {}, 'u', fetchFn as unknown as typeof fetch)).status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('requires packaging for a partial delivery', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify([ownDocument])));
    const response = await handleDeliveryActionRoute(request({ action: 'deliver', documentId: DOC_ID, outcome: 'PARTIAL', packaging: [] }), env, {}, 'u', fetchFn as unknown as typeof fetch);
    expect(response.status).toBe(400);
  });
});
