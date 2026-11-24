import { describe, expect, it, vi } from 'vitest';
import { parseDeliveryNoteStatusXml } from '../../features/legal/deliveryStatus';
import { handleDeliveryStatusRoute, MYDATA_DELIVERY_BASE } from '../../worker/deliveryNote';

const statusXml = `<?xml version="1.0" encoding="utf-8"?>
<GetDeliveryNoteStatusResponse xmlns="http://www.aade.gr/myDATA/delivery/v1.0">
  <invoiceMark>400001976761760</invoiceMark>
  <status>3</status>
  <dispatchTimestamp>2026-11-24T08:15:00Z</dispatchTimestamp>
  <lifecycleHistory>
    <eventType>RegisterTransfer</eventType>
    <eventTimestamp>2026-11-24T08:15:00Z</eventTimestamp>
    <actorVat>094360202</actorVat>
    <mark>400001976799999</mark>
    <transportDetails><vehicleNumber>ΙΚΑ1234</vehicleNumber><transportType>1</transportType><carrierVatNumber>094360202</carrierVatNumber></transportDetails>
  </lifecycleHistory>
</GetDeliveryNoteStatusResponse>`;

describe('Ψηφιακό Δελτίο Αποστολής status', () => {
  it('parses status and history per the official v2.0.2 response schema', () => {
    const result = parseDeliveryNoteStatusXml(statusXml);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe('3');
    expect(result.statusLabel).toBe('Σε διακίνηση');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'RegisterTransfer', actorVat: '094360202', mark: '400001976799999' });
    expect(result.events[0].detail).toContain('Όχημα ΙΚΑ1234');
  });

  it('reports AADE errors instead of a status', () => {
    const result = parseDeliveryNoteStatusXml('<ResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><message>Invoice not found</message><code>808</code></error></errors></response></ResponseDoc>');
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('Invoice not found');
  });

  it('asks myDATA (dev ERP channel) with the worker credentials, for the document MARK only', async () => {
    const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', AADE_USER_ID_DEV: 'user-dev', AADE_SUBSCRIPTION_KEY_DEV: 'key-dev' };
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('https://db.test')) {
        return new Response(JSON.stringify([{ id: 'x', environment: 'dev', aade_mark: '400001976761760', status: 'issued', document_kind: 'invoice_delivery' }]));
      }
      expect(url).toBe(`${MYDATA_DELIVERY_BASE.dev}/GetDeliveryNoteStatus?mark=400001976761760`);
      expect((init?.headers as Record<string, string>)['aade-user-id']).toBe('user-dev');
      expect((init?.headers as Record<string, string>)['Ocp-Apim-Subscription-Key']).toBe('key-dev');
      return new Response(statusXml, { status: 200 });
    });
    const request = new Request('https://worker.test/legal/delivery-status', { method: 'POST', body: JSON.stringify({ documentId: '6ad7ce15-5bb1-43d9-afbc-ded2be309a7e' }) });
    const response = await handleDeliveryStatusRoute(request, env, {}, fetchFn as unknown as typeof fetch);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, statusCode: '3', environment: 'dev' });
  });

  it('rejects documents that are not movement documents', async () => {
    const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service', AADE_USER_ID_DEV: 'u', AADE_SUBSCRIPTION_KEY_DEV: 'k' };
    const fetchFn = vi.fn(async () => new Response(JSON.stringify([{ id: 'x', environment: 'dev', aade_mark: '1', status: 'issued', document_kind: 'invoice' }])));
    const request = new Request('https://worker.test/legal/delivery-status', { method: 'POST', body: JSON.stringify({ documentId: '6ad7ce15-5bb1-43d9-afbc-ded2be309a7e' }) });
    const response = await handleDeliveryStatusRoute(request, env, {}, fetchFn as unknown as typeof fetch);
    expect(response.status).toBe(400);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
