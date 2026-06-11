import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, { buildEndpoint, callAadeXml, getAadeCredentialStatus } from '../../worker/worker.js';

const env = {
  AUTH_KEY_SECRET: 'secret',
  AADE_USER_ID_DEV: 'user-dev',
  AADE_SUBSCRIPTION_KEY_DEV: 'key-dev',
  AADE_USER_ID_PROD: 'user-prod',
  AADE_SUBSCRIPTION_KEY_PROD: 'key-prod',
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AADE Worker proxy', () => {
  it('keeps AADE routes auth-gated', async () => {
    const response = await worker.fetch(new Request('https://worker.example/aade/credential-status'), env);

    expect(response.status).toBe(403);
  });

  it('reports exact missing AADE and Cloudflare secrets', () => {
    const status = getAadeCredentialStatus({});

    expect(status.dev.ready).toBe(false);
    expect(status.prod.ready).toBe(false);
    expect(status.missingAadeCredentials).toEqual([
      'AADE_USER_ID_DEV',
      'AADE_SUBSCRIPTION_KEY_DEV',
      'AADE_USER_ID_PROD',
      'AADE_SUBSCRIPTION_KEY_PROD',
    ]);
    expect(status.missingWorkerSecretManager).toEqual(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
  });

  it('builds RequestTransmittedDocs query endpoints', () => {
    const endpoint = buildEndpoint('dev', 'RequestTransmittedDocs', {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      mark: '100',
      empty: '',
    });

    expect(endpoint.toString()).toContain('/RequestTransmittedDocs?');
    expect(endpoint.searchParams.get('dateFrom')).toBe('2026-01-01');
    expect(endpoint.searchParams.get('dateTo')).toBe('2026-01-31');
    expect(endpoint.searchParams.get('mark')).toBe('100');
    expect(endpoint.searchParams.has('empty')).toBe(false);
  });

  it('sends normal invoice calls as POST XML', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<ResponseDoc><response><statusCode>Success</statusCode></response></ResponseDoc>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callAadeXml(env, 'dev', 'SendInvoices', '<InvoicesDoc />', undefined, 'POST');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: '<InvoicesDoc />',
    });
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toContain('application/xml');
  });

  it('sends transmitted document sync as GET with query and no body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<RequestedDoc />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await callAadeXml(env, 'dev', 'RequestTransmittedDocs', '', { dateFrom: '2026-01-01', mark: '0' }, 'GET');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/RequestTransmittedDocs?');
    expect(fetchMock.mock.calls[0][0]).toContain('dateFrom=2026-01-01');
    expect(fetchMock.mock.calls[0][0]).toContain('mark=0');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('sends cancellation to AADE as GET query with no XML body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<ResponseDoc><response><statusCode>Success</statusCode><cancellationMark>456</cancellationMark></response></ResponseDoc>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(new Request('https://worker.example/aade/cancel-invoice', {
      method: 'POST',
      headers: { Authorization: 'secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'dev', mark: '123', entityVatNumber: '999999999' }),
    }), env);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/CancelInvoice?');
    expect(fetchMock.mock.calls[0][0]).toContain('mark=123');
    expect(fetchMock.mock.calls[0][0]).toContain('entityVatNumber=999999999');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
  });

  it('returns missing credential diagnostics instead of calling AADE', async () => {
    const result = await callAadeXml({}, 'prod', 'CancelInvoice', '', { mark: '123' }, 'GET');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.responseText).toContain('AADE_USER_ID_PROD');
    expect(result.responseText).toContain('AADE_SUBSCRIPTION_KEY_PROD');
  });
});
