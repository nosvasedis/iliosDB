import { describe,it,expect,vi } from 'vitest';
import { handleSbzRoute, sbzEnvironment } from '../../worker/sbz';
import worker from '../../worker/worker.js';
import { sbzFixture } from '../legal/sbzFixture';
const actor='30000000-0000-4000-8000-000000000001';
const env={SUPABASE_URL:'https://db.example',SUPABASE_SERVICE_ROLE_KEY:'server',SBZ_API_KEY_DEV:'sandbox-key',SBZ_API_KEY_PROD:'production-key'};
function harness(providerResponse:()=>Promise<Response>) {
  const fixture=sbzFixture(); const d={...fixture.document,series:null,aa:null};const attempts:any[]=[];let operation:any;
  const fetcher=vi.fn(async(url:any,options:any={})=>{
    const address=String(url);if(address.startsWith('https://api.sbz.gr/'))return providerResponse();
    const path=new URL(address).pathname;const body=options.body?JSON.parse(options.body):{};
    const json=(v:any)=>new Response(JSON.stringify(v));
    if(path.endsWith('/rpc/claim_sbz_operation')){operation={document:{...d,series:'ΤΙΜ',aa:'1',submitted_at:d.created_at},lines:fixture.lines,operationId:'40000000-0000-4000-8000-000000000001'};return json(operation);}
    if(path.endsWith('/rpc/finish_sbz_operation')){attempts.push(body);return json({...d,status:body.p_outcome==='accepted'?'issued':'submitted',provider_state:body.p_outcome});}
    if(path.endsWith('/legal_documents'))return json([d]);
    if(path.endsWith('/legal_document_lines'))return json(fixture.lines);
    if(path.endsWith('/legal_transmissions'))return json([]);
    throw Error('Unexpected '+address);
  });
  const request=new Request('https://worker.example/sbz/submit',{method:'POST',body:JSON.stringify({documentId:d.id,xml:'attacker xml',environment:'prod'})});
  return {fetcher,attempts,request};
}
describe('SBZ Worker boundary',()=>{
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
