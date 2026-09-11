import { afterEach,describe,it,expect,vi } from 'vitest';
import { handleSbzRoute, parseSbzArchiveResponse, sbzEnvironment } from '../../worker/sbz';
import worker from '../../worker/worker.js';
import { sbzFixture } from '../legal/sbzFixture';
const actor='30000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'server',SBZ_API_KEY_DEV:'sandbox-key',SBZ_API_KEY_PROD:'production-key'};
function harness(providerResponse:()=>Promise<Response>) {
  const fixture=sbzFixture(); const d={...fixture.document,series:null,aa:null};const attempts:any[]=[];let operation:any;
  const fetcher=vi.fn(async(url:any,options:any={})=>{
    const address=String(url);if(address.startsWith('https://api.sbz.gr/')) {
      // Match the Workers runtime rather than Node's more permissive fetch implementation.
      if (!['manual','follow'].includes(options.redirect)) throw new TypeError('Invalid redirect value');
      return providerResponse();
    }
    const path=new URL(address).pathname;const body=options.body?JSON.parse(options.body):{};
    const json=(v:any)=>new Response(JSON.stringify(v));
    if(path.endsWith('/rpc/claim_sbz_operation')){operation={document:{...d,series:'ΤΙΜ',aa:'1',submitted_at:d.created_at},lines:fixture.lines,operationId:'40000000-0000-4000-8000-000000000001'};return json(operation);}
    if(path.endsWith('/rpc/finish_sbz_operation')){attempts.push(body);return json({...d,status:body.p_outcome==='accepted'?'issued':'submitted',provider_state:body.p_outcome});}
    if(path.endsWith('/legal_documents'))return json([d]);
    if(path.endsWith('/legal_settings'))return json([{issuer:d.issuer,environment:'dev',sbz_production_enabled:false}]);
    if(path.endsWith('/legal_document_lines'))return json(fixture.lines);
    if(path.endsWith('/legal_transmissions'))return json([]);
    throw Error('Unexpected '+address);
  });
  const request=new Request('https://worker.example/sbz/submit',{method:'POST',body:JSON.stringify({documentId:d.id,xml:'attacker xml',environment:'prod'})});
  return {fetcher,attempts,request};
}
describe('SBZ Worker boundary',()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it('uses the stored environment and snapshot, then commits acceptance',async()=>{
    const h=harness(async()=>new Response('<SBZResponseDoc><response><statusCode>Success</statusCode><invoiceMark>123</invoiceMark><invoiceUid>UID</invoiceUid><authenticationCode>AUTH</authenticationCode><InvoiceUrl>https://api.sbz.gr/sign/doc.php?ac=AUTH</InvoiceUrl></response></SBZResponseDoc>'));
    const response=await handleSbzRoute(h.request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(200);expect(h.attempts[0].p_outcome).toBe('accepted');
    const call=h.fetcher.mock.calls.find(c=>String(c[0]).startsWith('https://api.sbz.gr/'))!;
    expect(call[0]).toBe('https://api.sbz.gr/sign/sendinvoice.php?action=sandbox');expect(call[1].headers['Api-Key']).toBe('sandbox-key');
    expect(call[1].body).toContain('<API_InvoiceDetails>');expect(call[1].body).not.toContain('attacker');
  });
  it.each(['timeout','duplicate','malformed'])('keeps %s uncertain rather than retryable',async kind=>{
    const h=harness(async()=>{if(kind==='timeout')throw Error('timeout');return new Response(kind==='duplicate'?'<SBZResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><code>233</code><message>duplicate</message></error></errors></response></SBZResponseDoc>':'<bad>');});
    expect((await handleSbzRoute(h.request,env,{},actor,h.fetcher as any)).status).toBe(409);expect(h.attempts[0].p_outcome).toBe('unknown');
    expect(h.fetcher.mock.calls.filter(c=>String(c[0]).startsWith('https://api.sbz.gr/'))).toHaveLength(1);
  });
  it('separates an explicit rejection from transport uncertainty',async()=>{
    const h=harness(async()=>new Response('{"statusCode":7001}'));await handleSbzRoute(h.request,env,{},actor,h.fetcher as any);expect(h.attempts[0].p_outcome).toBe('rejected');
  });
  it('checks the sandbox connection using a read-only request supported by Workers',async()=>{
    const h=harness(async()=>new Response('<RequestedDoc />'));
    const request=new Request('https://worker.example/sbz/check',{method:'POST',body:JSON.stringify({environment:'dev'})});
    const response=await handleSbzRoute(request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true});
    const calls=h.fetcher.mock.calls.filter(c=>String(c[0]).startsWith('https://api.sbz.gr/'));
    expect(calls).toHaveLength(1);
    const [url,options]=calls[0];
    expect(new URL(url).pathname).toBe('/sign/requesttransmitteddocs.php');
    expect(new URL(url).searchParams.get('action')).toBe('sandbox');
    expect(options).toMatchObject({method:'GET',redirect:'manual',headers:{'Api-Key':'sandbox-key'}});
    expect(h.attempts).toHaveLength(0);
  });
  it('accepts the AADE no-document response returned for an empty SBZ sandbox archive',async()=>{
    const h=harness(async()=>new Response('<ResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><message>Requested Invoice was not found</message></error></errors></response></ResponseDoc>'));
    const request=new Request('https://worker.example/sbz/check',{method:'POST',body:JSON.stringify({environment:'dev'})});
    const response=await handleSbzRoute(request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true});
    expect(h.fetcher.mock.calls.filter(c=>String(c[0]).startsWith('https://api.sbz.gr/'))).toHaveLength(1);
    expect(h.attempts).toHaveLength(0);
  });
  it('accepts and parses the RequestedProviderDoc archive shape returned by SBZ',()=>{
    const parsed=parseSbzArchiveResponse('<RequestedProviderDoc><InvoiceProviderType><issuerVAT>094259216</issuerVAT><invoiceProviderMark>9007199254740993123</invoiceProviderMark><invoiceUid>UID-1</invoiceUid><authenticationCode>AUTH-1</authenticationCode></InvoiceProviderType></RequestedProviderDoc>');
    expect(parsed.providerDocuments).toEqual([{issuerVat:'094259216',mark:'9007199254740993123',uid:'UID-1',authenticationCode:'AUTH-1'}]);
  });
  it('treats a non-XML AADE no-document payload as a successful authentication probe',async()=>{
    const h=harness(async()=>new Response('Requested Invoice was not found'));
    const request=new Request('https://worker.example/sbz/check',{method:'POST',body:JSON.stringify({environment:'dev'})});
    const response=await handleSbzRoute(request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true});
  });
  it('still rejects an invalid SBZ API key during the authentication probe',async()=>{
    const h=harness(async()=>Response.json({statusCode:5006}));
    const request=new Request('https://worker.example/sbz/check',{method:'POST',body:JSON.stringify({environment:'dev'})});
    const response=await handleSbzRoute(request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(400);expect((await response.json()).error).toContain('σύνδεση με τον πάροχο');
  });
  it.each([301,302,303,307,308])('rejects a %s redirect without forwarding credentials',async status=>{
    const h=harness(async()=>new Response(null,{status,headers:{Location:'https://other.example/collect'}}));
    const request=new Request('https://worker.example/sbz/check',{method:'POST',body:JSON.stringify({environment:'dev'})});
    const response=await handleSbzRoute(request,env,{},actor,h.fetcher as any);
    expect(response.status).toBe(400);expect((await response.json()).error).toContain('ανακατεύθυνση');
    expect(h.fetcher.mock.calls.filter(c=>!String(c[0]).startsWith(env.SUPABASE_URL))).toHaveLength(1);
  });
  it('keeps an invoice pending when the provider redirects',async()=>{
    const h=harness(async()=>new Response(null,{status:307,headers:{Location:'https://other.example/collect'}}));
    expect((await handleSbzRoute(h.request,env,{},actor,h.fetcher as any)).status).toBe(409);
    expect(h.attempts[0].p_outcome).toBe('unknown');
    expect(h.fetcher.mock.calls.filter(c=>String(c[0]).startsWith('https://api.sbz.gr/'))).toHaveLength(1);
  });
  it.each(['dev','prod'])('saves the %s connection as the working environment without activating production',async environment=>{
    const patches:any[]=[];const secrets:any[]=[];
    const settingsId='00000000-0000-0000-0000-000000000091';
    const fetcher=vi.fn(async(input:any,options:any={})=>{
      const url=new URL(String(input));
      if(url.pathname==='/auth/v1/user')return Response.json({id:actor});
      if(url.pathname==='/rest/v1/profiles')return Response.json([{role:'admin',is_approved:true}]);
      if(url.hostname==='api.cloudflare.com'){
        expect(options.method).toBe('PUT');secrets.push(JSON.parse(options.body));return Response.json({success:true});
      }
      if(url.pathname==='/rest/v1/legal_settings'){
        if(options.method==='PATCH'){
          expect(url.searchParams.get('id')).toBe(`eq.${settingsId}`);
          patches.push(JSON.parse(options.body));
          return Response.json([{id:settingsId,environment,sbz_production_enabled:false}]);
        }
        return Response.json([{id:settingsId}]);
      }
      throw Error('Unexpected request');
    });
    vi.stubGlobal('fetch',fetcher);
    const response=await worker.fetch(new Request('https://worker.example/sbz/configure',{
      method:'POST',headers:{Authorization:'Bearer user-token'},body:JSON.stringify({environment,apiKey:' new-key '}),
    }),{...env,CLOUDFLARE_ACCOUNT_ID:'account',CLOUDFLARE_API_TOKEN:'cf-token'});
    expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,environment});
    expect(secrets).toEqual([{name:environment==='dev'?'SBZ_API_KEY_DEV':'SBZ_API_KEY_PROD',text:'new-key',type:'secret_text'}]);
    expect(patches).toEqual([{environment}]);
  });
  it('requires a user session rather than the shared image-worker key',async()=>{
    const response=await worker.fetch(new Request('https://worker.example/sbz/submit',{method:'POST',headers:{Authorization:'shared-key'},body:'{}'}),env);
    expect(response.status).toBe(401);
  });
  it('recovers a saved accepted response without another provider call',async()=>{
    const fixture=sbzFixture();const d={...fixture.document,provider_state:'unknown',provider_operation_id:'40000000-0000-4000-8000-000000000001'};
    const accepted='<SBZResponseDoc><response><statusCode>Success</statusCode><invoiceMark>123</invoiceMark><invoiceUid>UID</invoiceUid><authenticationCode>AUTH</authenticationCode><InvoiceUrl>https://api.sbz.gr/sign/doc.php?ac=AUTH</InvoiceUrl></response></SBZResponseDoc>';
    const fetcher=vi.fn(async(url:any,options:any={})=>{
      const path=new URL(String(url)).pathname;
      if(path.endsWith('/legal_documents'))return Response.json([d]);
      if(path.endsWith('/legal_transmissions'))return Response.json([{action:'sbz_send',response_payload:accepted}]);
      if(path.endsWith('/rpc/finish_sbz_operation')){expect(JSON.parse(options.body).p_outcome).toBe('accepted');return Response.json({...d,status:'issued'});}
      throw new Error('Unexpected network request');
    });
    const response=await handleSbzRoute(new Request('https://worker.example/sbz/reconcile',{method:'POST',body:JSON.stringify({documentId:d.id})}),env,{},actor,fetcher as any);
    expect(response.status).toBe(200);expect(fetcher.mock.calls.some(c=>String(c[0]).startsWith('https://api.sbz.gr/'))).toBe(false);
  });
  it('bounds chunked attachment bodies before multipart parsing',async()=>{
    const fetcher=vi.fn();const body=new Uint8Array(350001);
    const response=await handleSbzRoute(new Request('https://worker.example/sbz/attach',{method:'POST',body}),env,{},actor,fetcher as any);
    expect(response.status).toBe(400);expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not fall back to a different environment key',()=>{
    expect(()=>sbzEnvironment('prod',{...env,SBZ_API_KEY_PROD:undefined})).toThrow();expect(()=>sbzEnvironment('invalid',env)).toThrow();
  });
});
