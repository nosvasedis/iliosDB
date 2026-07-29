import { describe, expect, it, vi, afterEach } from 'vitest';
import worker, {
  buildAadeRegistryEnvelope,
  buildEndpoint,
  callAadeRegistry,
  callAadeXml,
  getAadeCredentialStatus,
  parseAadeRegistryResponse,
  validateAadeRegistryReferenceDate,
} from '../../worker/worker.js';

const env = {
  AUTH_KEY_SECRET: 'secret',
  AADE_USER_ID_DEV: 'user-dev',
  AADE_SUBSCRIPTION_KEY_DEV: 'key-dev',
  AADE_USER_ID_PROD: 'user-prod',
  AADE_SUBSCRIPTION_KEY_PROD: 'key-prod',
  CLOUDFLARE_API_TOKEN: 'cf-token',
  CLOUDFLARE_ACCOUNT_ID: 'cf-account',
  AADE_REGISTRY_USERNAME: 'registry-user',
  AADE_REGISTRY_PASSWORD: 'registry-password',
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
    expect(status.registry.ready).toBe(false);
    expect(status.missingRegistryCredentials).toEqual([
      'AADE_REGISTRY_USERNAME',
      'AADE_REGISTRY_PASSWORD',
    ]);
  });

  it('builds the official SOAP 1.2 registry request without exposing malformed XML', () => {
    const xml = buildAadeRegistryEnvelope({
      username: 'user&name',
      password: 'p<ass',
      vatNumber: '090165560',
      requestedByVat: '123456789',
      referenceDate: '2026-07-28',
    });

    expect(xml).toContain('http://www.w3.org/2003/05/soap-envelope');
    expect(xml).toContain('<ns1:Username>user&amp;name</ns1:Username>');
    expect(xml).toContain('<ns1:Password>p&lt;ass</ns1:Password>');
    expect(xml).toContain('<ns3:afm_called_for>090165560</ns3:afm_called_for>');
    expect(xml).toContain('<ns3:as_on_date>2026-07-28</ns3:as_on_date>');
  });

  it('parses every official registry field including activity rows', () => {
    const result = parseAadeRegistryResponse(`<?xml version="1.0"?>
      <env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
        <env:Body><srvc:rgWsPublic2AfmMethodResponse>
          <srvc:result><rg_ws_public2_result_rtType>
            <call_seq_id>862701698</call_seq_id>
            <error_rec><error_code/><error_descr/></error_rec>
            <afm_called_by_rec><as_on_date>2026-07-28</as_on_date></afm_called_by_rec>
            <basic_rec>
              <afm>090165560</afm><doy>1104</doy><doy_descr>Δ ΑΘΗΝΩΝ</doy_descr>
              <i_ni_flag_descr>ΜΗ ΦΠ</i_ni_flag_descr>
              <deactivation_flag>1</deactivation_flag>
              <deactivation_flag_descr>ΕΝΕΡΓΟΣ ΑΦΜ</deactivation_flag_descr>
              <firm_flag_descr>ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ</firm_flag_descr>
              <onomasia>ΔΟΚΙΜΑΣΤΙΚΗ ΕΠΙΧΕΙΡΗΣΗ</onomasia>
              <commer_title>ΔΟΚΙΜΗ</commer_title>
              <legal_status_descr>ΙΚΕ</legal_status_descr>
              <postal_address>ΕΡΜΟΥ</postal_address><postal_address_no>1</postal_address_no>
              <postal_zip_code>10563</postal_zip_code><postal_area_description>ΑΘΗΝΑ</postal_area_description>
              <regist_date>2020-01-02</regist_date><stop_date/>
              <normal_vat_system_flag>Y</normal_vat_system_flag>
            </basic_rec>
            <firm_act_tab><item>
              <firm_act_code>47770000</firm_act_code>
              <firm_act_descr>ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ</firm_act_descr>
              <firm_act_kind>1</firm_act_kind>
              <firm_act_kind_descr>ΚΥΡΙΑ</firm_act_kind_descr>
            </item></firm_act_tab>
          </rg_ws_public2_result_rtType></srvc:result>
        </srvc:rgWsPublic2AfmMethodResponse></env:Body>
      </env:Envelope>`);

    expect(result).toMatchObject({
      vatNumber: '090165560',
      active: true,
      businessName: 'ΔΟΚΙΜΑΣΤΙΚΗ ΕΠΙΧΕΙΡΗΣΗ',
      tradeName: 'ΔΟΚΙΜΗ',
      normalVatRegime: true,
      registrationDate: '2020-01-02',
      address: { street: 'ΕΡΜΟΥ', number: '1', postalCode: '10563', city: 'ΑΘΗΝΑ' },
    });
    expect(result.activities).toEqual([{
      code: '47770000',
      description: 'ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ',
      kind: '1',
      kindDescription: 'ΚΥΡΙΑ',
    }]);
  });

  it('calls the official registry endpoint with SOAP 1.2 credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <rg_ws_public2_result_rtType>
        <error_rec><error_code/><error_descr/></error_rec>
        <afm_called_by_rec><as_on_date>2026-07-28</as_on_date></afm_called_by_rec>
        <basic_rec><afm>090165560</afm><deactivation_flag>2</deactivation_flag>
          <deactivation_flag_descr>ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟΣ ΑΦΜ</deactivation_flag_descr>
          <normal_vat_system_flag>N</normal_vat_system_flag></basic_rec>
        <firm_act_tab></firm_act_tab>
      </rg_ws_public2_result_rtType>`, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callAadeRegistry(env, { vatNumber: '090165560' });

    expect(result.active).toBe(false);
    expect(result.normalVatRegime).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe('https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2');
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toContain('application/soap+xml');
  });

  it('enforces the registry historical-date limit of three years', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    expect(validateAadeRegistryReferenceDate('2023-07-29', now)).toBe('2023-07-29');
    expect(() => validateAadeRegistryReferenceDate('2023-07-28', now)).toThrow(/τρία έτη/i);
    expect(() => validateAadeRegistryReferenceDate('2026-07-30', now)).toThrow(/μελλοντική/i);
    expect(() => validateAadeRegistryReferenceDate('2026-02-30', now)).toThrow(/έγκυρη/i);
  });

  it('tests registry credentials against the issuer VAT before reporting ready', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(`
      <rg_ws_public2_result_rtType>
        <error_rec><error_code/><error_descr/></error_rec>
        <afm_called_by_rec><as_on_date>2026-07-29</as_on_date></afm_called_by_rec>
        <basic_rec><afm>094259216</afm><deactivation_flag>1</deactivation_flag>
          <deactivation_flag_descr>ΕΝΕΡΓΟΣ ΑΦΜ</deactivation_flag_descr>
          <onomasia>ILIOS TEST</onomasia></basic_rec>
        <firm_act_tab></firm_act_tab>
      </rg_ws_public2_result_rtType>`, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(new Request('https://worker.example/aade/test-registry-connection', {
      method: 'POST',
      headers: { Authorization: 'secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedByVat: '094259216' }),
    }), env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.verifiedAt).toBeTruthy();
    expect(data.result).toMatchObject({ vatNumber: '094259216', active: true });
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

  it('treats empty transmitted document sync as an empty successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<RequestedDoc />', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(new Request('https://worker.example/aade/request-transmitted-docs', {
      method: 'POST',
      headers: { Authorization: 'secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment: 'dev', query: { dateFrom: '2026-06-11', dateTo: '2026-06-11', mark: '0' } }),
    }), env);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.status).toBe(204);
    expect(data.parsed.statusCode).toBe('NoDocuments');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });

  it('sends cancellation to AADE as POST with mark query and no XML body', async () => {
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
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].body).toBe('');
  });

  it('returns missing credential diagnostics instead of calling AADE', async () => {
    const result = await callAadeXml({}, 'prod', 'CancelInvoice', '', { mark: '123' }, 'POST');

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    expect(result.responseText).toContain('AADE_USER_ID_PROD');
    expect(result.responseText).toContain('AADE_SUBSCRIPTION_KEY_PROD');
  });
});
