import { XMLValidator } from 'fast-xml-parser';
import { buildSbzInvoiceXml, parseSbzResponse, sbzFailureMessage, SBZ_BASE_URL, SBZ_UNKNOWN_MESSAGE, validateSbzDocument } from '../features/legal/sbz';
import { parseTransmittedDocumentsXml, parseAadeResponseXml, normalizeAadeResponseXml, isWholesaleAadeDocumentType, getDocumentKindFromAadeType, groupIncomeClassifications } from '../utils/legalDocuments';

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; SBZ_API_KEY_DEV?: string; SBZ_API_KEY_PROD?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function boundedBytes(response: Response, limit = 4 * 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Η απάντηση είναι πολύ μεγάλη. Περιορίστε το διάστημα αναζήτησης.');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new Error('Η απάντηση είναι πολύ μεγάλη.'); chunks.push(part.value); } }
  finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function boundedText(response: Response, limit = 4 * 1024 * 1024) { return new TextDecoder().decode(await boundedBytes(response, limit)); }

export function sbzEnvironment(environment: string, env: Env) {
  if (environment !== 'dev' && environment !== 'prod') throw new Error('Επιλέξτε περιβάλλον έκδοσης.');
  const key = environment === 'prod' ? env.SBZ_API_KEY_PROD : env.SBZ_API_KEY_DEV;
  if (!key) throw new Error('Η σύνδεση SBZ δεν έχει ρυθμιστεί για αυτό το περιβάλλον.');
  return { key, action: environment === 'prod' ? 'production' : 'sandbox' };
}

export async function handleSbzRoute(request: Request, env: Env, cors: Record<string,string>, actor: string, fetchFn: typeof fetch = fetch) {
  const json = (data: unknown, status=200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  const db = async (path: string, method='GET', data?: unknown) => {
    const response = await fetchFn(`${env.SUPABASE_URL}/rest/v1/${path}`, { method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(20000) });
    const text = await boundedText(response);
    if (!response.ok) { let message = 'Δεν αποθηκεύτηκε η ενέργεια. Δοκιμάστε ξανά.'; try { message = JSON.parse(text).message || message; } catch {} throw new Error(message); }
    return text ? JSON.parse(text) : null;
  };
  const rpc = (name: string, data: unknown) => db(`rpc/${name}`, 'POST', data);
  const getDocument = async (id: string) => { if (!uuid.test(id || '')) throw new Error('Μη έγκυρο παραστατικό.'); const [d] = await db(`legal_documents?id=eq.${id}`); if (!d) throw new Error('Το παραστατικό δεν βρέθηκε.'); return d; };
  const settings = async () => { const [s] = await db('legal_settings?order=updated_at.desc&limit=1'); if (!s) throw new Error('Συμπληρώστε τις ρυθμίσεις της επιχείρησης.'); return s; };
  const provider = async (endpoint: string, environment: string, method: string, body?: BodyInit, query: Record<string,string> = {}) => {
    const { key, action } = sbzEnvironment(environment,env);
    const url = new URL(endpoint,SBZ_BASE_URL); url.search = new URLSearchParams({ ...query, action }).toString();
    // Workers only supports manual/follow. Never forward the API key or invoice to a redirect target.
    const response = await fetchFn(url.href, { method, redirect: 'manual', headers: { 'Api-Key': key, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/xml; charset=utf-8' }) }, body, signal: AbortSignal.timeout(45000) });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new Error('Η SBZ επέστρεψε μη αναμενόμενη ανακατεύθυνση. Δοκιμάστε ξανά αργότερα ή επικοινωνήστε με την υποστήριξη.');
    }
    return { ok: response.ok, status: response.status, text: await boundedText(response), endpoint: url.href };
  };
  const retrieve = async (environment: string, mark: string, maxMark?: string) => {
    if (!/^\d+$/.test(mark) || (maxMark && !/^\d+$/.test(maxMark))) throw new Error('Μη έγκυρο όριο αναζήτησης.');
    const s = await settings();
    const result = await provider('requesttransmitteddocs.php',environment,'GET',undefined,{ issuerVAT: s.issuer.vat_number, mark, ...(maxMark ? {maxMark} : {}) });
    if (!result.ok || result.text.trim().startsWith('{')) throw new Error(sbzFailureMessage(parseSbzResponse(result.text).statusCode));
    const normalized = normalizeAadeResponseXml(result.text);
    if (/<!DOCTYPE|<!ENTITY/i.test(result.text) || /<!DOCTYPE|<!ENTITY/i.test(normalized)
      || XMLValidator.validate(result.text) !== true || XMLValidator.validate(normalized) !== true) {
      throw new Error('Μη αναμενόμενη απάντηση αρχείου SBZ.');
    }
    const root = normalized.match(/^\s*(?:<\?xml[^>]*>\s*)?<(?:\w+:)?(RequestedDoc|ResponseDoc)\b/i)?.[1]?.toLowerCase();
    if (root === 'requesteddoc') return { ...result, parsed: parseTransmittedDocumentsXml(normalized) };
    if (root === 'responsedoc') {
      const response = parseAadeResponseXml(normalized);
      const messages = response.errors.map(message => message.toLowerCase());
      const emptyArchive = response.statusCode === 'Success' || response.statusCode === 'NoDocuments' || messages.some(message =>
        message.includes('not found') || message.includes('δεν βρέθη') || message.includes('no documents')
      );
      if (emptyArchive) return { ...result, parsed: parseTransmittedDocumentsXml(normalized) };
      if (response.errors.length) throw new Error(response.errors.join('\n'));
    }
    throw new Error('Μη αναμενόμενη απάντηση αρχείου SBZ.');
  };
  const checkConnection = async (environment: string) => {
    const s = await settings();
    const result = await provider('requesttransmitteddocs.php',environment,'GET',undefined,{ issuerVAT: s.issuer.vat_number, mark: '0', maxMark: '0' });
    if (!result.ok) throw new Error('Η SBZ δεν αποδέχθηκε τον έλεγχο σύνδεσης. Δοκιμάστε ξανά ή επικοινωνήστε με την υποστήριξη.');
    const text = result.text.trim();
    if (!text) throw new Error('Η SBZ δεν επέστρεψε απάντηση στον έλεγχο σύνδεσης.');
    if (text.startsWith('{')) {
      const parsed = parseSbzResponse(text);
      if (parsed.statusCode === '5006') throw new Error(sbzFailureMessage(parsed.statusCode));
      return;
    }
    // RequestTransmittedDocs is only an authentication probe here. SBZ returns
    // the downstream AADE payload as-is, so its archive shape is validated only
    // by retrieve() when data is actually imported.
    if (/<!DOCTYPE|<!ENTITY|<(?:\w+:)?html\b/i.test(text)) throw new Error('Η SBZ επέστρεψε μη αναμενόμενη απάντηση στον έλεγχο σύνδεσης.');
  };
  const path = new URL(request.url).pathname;
  try {
    if (path === '/sbz/status' && request.method === 'GET') {
      const s = await settings();
      const unresolved = await db('legal_documents?environment=is.null&aa=not.is.null&select=id,series,aa,issue_date&limit=100');
      return json({ dev: { configured: !!env.SBZ_API_KEY_DEV, ready: !!env.SBZ_API_KEY_DEV }, prod: { configured: !!env.SBZ_API_KEY_PROD, ready: !!env.SBZ_API_KEY_PROD && s.sbz_production_enabled }, productionEnabled: s.sbz_production_enabled, checks: s.sbz_activation_checks, unresolved });
    }
    if (request.method !== 'POST') return json({error:'Μη επιτρεπόμενη ενέργεια.'},405);
    if (path === '/sbz/attach') {
      if (Number(request.headers.get('content-length')) > 350000) throw new Error('Το αρχείο πρέπει να είναι έως 300 KB.');
      // Bound the complete multipart request before parsing it.
      const bytes = await boundedBytes(new Response(request.body), 350000);
      const form = await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData();
      const d = await getDocument(String(form.get('documentId') || '')); const file = form.get('file');
      if (!(file instanceof File) || file.size > 300 * 1024 || !['application/pdf','image/jpeg'].includes(file.type)) throw new Error('Επιλέξτε PDF ή JPG έως 300 KB.');
      const magic = new Uint8Array(await file.slice(0,5).arrayBuffer());
      if (!(file.type==='application/pdf' ? new TextDecoder().decode(magic)==='%PDF-' : magic[0]===255 && magic[1]===216 && magic[2]===255)) throw new Error('Το περιεχόμενο δεν είναι έγκυρο PDF ή JPG.');
      sbzEnvironment(d.environment,env);
      const claim = await rpc('claim_sbz_operation',{p_document_id:d.id,p_action:'attach',p_actor:actor});
      const upload = new FormData(); upload.set('issuerVat',d.issuer.vat_number);upload.set('invoiceMark',d.aade_mark);upload.set('file',file,file.type==='application/pdf'?'invoice.pdf':'invoice.jpg');
      return await execute(claim,'sendfile.php',upload,{});
    }
    const payload = JSON.parse(await boundedText(new Response(request.body),128*1024));
    if (path === '/sbz/legacy-environment') {
      if (!['dev','prod'].includes(payload.environment)) throw new Error('Επιλέξτε περιβάλλον.');
      const d=await getDocument(payload.documentId);
      if(d.provider!=='legacy'||d.environment!==null) throw new Error('Το περιβάλλον έχει ήδη επιβεβαιωθεί.');
      await db(`legal_documents?id=eq.${d.id}&environment=is.null`,'PATCH',{environment:payload.environment});
      await db('legal_audit_log','POST',{document_id:d.id,action:'legacy_environment_confirmed',user_name:actor,details:{environment:payload.environment}});
      return json({ok:true});
    }
    if (path === '/sbz/activate') {
      const checks = payload.checks || {};
      if (payload.enabled === true) {
        sbzEnvironment('prod',env);
        if (!['sbz_approved','numbering_reviewed','backup_completed','delivery_confirmed'].every(k=>checks[k]===true)) throw new Error('Ολοκληρώστε τους ελέγχους πριν ενεργοποιήσετε την παραγωγή.');
        const sample = await db('legal_documents?provider=eq.sbz&environment=eq.dev&status=eq.issued&source_kind=neq.aade_sync&authentication_code=not.is.null&limit=1');
        if (!sample.length) throw new Error('Ολοκληρώστε πρώτα πραγματική έκδοση στο δοκιμαστικό περιβάλλον.');
        const unresolved = await db('legal_documents?environment=is.null&aa=not.is.null&limit=1');
        if (unresolved.length) throw new Error('Υπάρχουν παλιά παραστατικά που χρειάζονται έλεγχο περιβάλλοντος.');
      }
      const s = await settings();
      await db(`legal_settings?id=eq.${s.id}`,'PATCH',{sbz_production_enabled:payload.enabled===true,sbz_activation_checks:{...checks,actor,at:new Date().toISOString()}});
      return json({ok:true});
    }
    if (path === '/sbz/check') {
      await checkConnection(payload.environment);
      return json({ok:true,message:'Η σύνδεση με την SBZ επαληθεύτηκε.'});
    }
    if (path === '/sbz/sync') {
      let mark=String(payload.markFrom || '0'); let imported=0, updated=0; const runId=crypto.randomUUID();
      await db('legal_sync_runs','POST',{id:runId,environment:payload.environment,status:'success',mark_from:mark,started_at:new Date().toISOString(),created_by:actor});
      try {
        for (let page=0;page<20;page++) {
          const result=await retrieve(payload.environment,mark,payload.maxMark);
          await db('legal_transmissions','POST',{action:'sbz_sync',endpoint:result.endpoint,environment:payload.environment,status:'success',response_payload:result.text});
          for (const t of result.parsed.documents) {
            if ((payload.receiverVatNumber && t.counterpartVat !== payload.receiverVatNumber) || !isWholesaleAadeDocumentType(t.invoiceType) || (payload.invType && t.invoiceType!==payload.invType) || (payload.dateFrom && t.issueDate<payload.dateFrom) || (payload.dateTo && t.issueDate>payload.dateTo)) continue;
            const existing=await db(`legal_documents?environment=eq.${payload.environment}&aade_mark=eq.${encodeURIComponent(t.mark)}`);
            if (existing.length) {
              const cancellation=t.cancelledByMark || result.parsed.cancellations.find(c=>c.invoiceMark===t.mark)?.cancellationMark;
              if (cancellation && existing[0].document_kind==='delivery_note' && existing[0].status==='issued') {
                await db(`legal_documents?id=eq.${existing[0].id}`,'PATCH',{status:'cancelled',cancellation_mark:cancellation,cancelled_at:new Date().toISOString()}); updated++;
              }
              continue;
            }
            const conflict=await db(`legal_documents?environment=eq.${payload.environment}&aade_document_type=eq.${t.invoiceType}&series=eq.${encodeURIComponent(t.series || '0')}&aa=eq.${encodeURIComponent(t.aa || '')}`);
            if (conflict.length) { if (conflict[0].provider_state==='unknown' || conflict[0].provider_state==='sending') await reconcile(conflict[0],result.parsed.documents); else throw new Error('Βρέθηκε σύγκρουση αρίθμησης στο αρχείο. Χρειάζεται έλεγχος.'); updated++; continue; }
            await rpc('import_sbz_document',{p_document:{...t,environment:payload.environment,document_kind:getDocumentKindFromAadeType(t.invoiceType as any),sync_run_id:runId},p_actor:actor}); imported++;
          }
          const highest = result.parsed.documents.reduce((max,t)=>BigInt(t.mark)>BigInt(max)?t.mark:max,mark);
          if (!result.parsed.documents.length || highest===mark) break;
          mark=highest;
          if (page===19) throw new Error('Ανακτήθηκε μέρος του αρχείου. Συνεχίστε τον συγχρονισμό από το τελευταίο καταχωρημένο παραστατικό.');
        }
        const [run]=await db(`legal_sync_runs?id=eq.${runId}`,'PATCH',{imported_count:imported,updated_count:updated,finished_at:new Date().toISOString()}); return json(run);
      } catch(error) { await db(`legal_sync_runs?id=eq.${runId}`,'PATCH',{status:'failed',error_message:(error as Error).message,imported_count:imported,updated_count:updated,finished_at:new Date().toISOString()}); throw error; }
    }
    if (!['/sbz/submit','/sbz/cancel-delivery','/sbz/reconcile'].includes(path)) return json({error:'Η ενέργεια δεν υποστηρίζεται.'},404);
    const d = await getDocument(payload.documentId);
    if (path==='/sbz/reconcile') {
      if (!['sending','unknown'].includes(d.provider_state)) return json(d);
      const recovered=await reconcile(d,[],[],true); if(recovered) return json(recovered);
      const result=await retrieve(d.environment,d.aade_mark ? (BigInt(d.aade_mark)-1n).toString() : '0');
      return json(await reconcile(d,result.parsed.documents,result.parsed.cancellations));
    }
    sbzEnvironment(d.environment || (await settings()).environment,env);
    if (path==='/sbz/submit') {
      if (d.status==='issued') return json(d);
      const lines=await db(`legal_document_lines?document_id=eq.${d.id}&order=line_number`);
      const errors=validateSbzDocument(d,lines); if(errors.length) throw new Error(errors.join('\n'));
    }
    const claim=await rpc('claim_sbz_operation',{p_document_id:d.id,p_action:path==='/sbz/submit'?'send':'cancel',p_actor:actor});
    if (path==='/sbz/cancel-delivery') return await execute(claim,'canceldeliverynote.php',undefined,{mark:claim.document.aade_mark,entityVatNumber:claim.document.issuer.vat_number});
    let xml: string;
    try { xml=buildSbzInvoiceXml(claim.document,claim.lines,claim.document.submitted_at); }
    catch(error) { await finish(claim.operationId,'rejected',{},'',(error as Error).message); throw error; }
    // Persist the exact snapshot before network I/O. A crash afterwards is never retried blindly.
    await db(`legal_documents?id=eq.${d.id}`,'PATCH',{raw_xml:xml});
    await db(`legal_transmissions?id=eq.${claim.operationId}`,'PATCH',{request_payload:xml});
    return await execute(claim,'sendinvoice.php',xml,{});

    async function finish(op: string,outcome: string,result: unknown,text: string,error: string|null) {
      return rpc('finish_sbz_operation',{p_operation_id:op,p_outcome:outcome,p_result:result,p_response:text,p_error:error});
    }
    async function execute(claim: any,endpoint: string,body: BodyInit|undefined,query: Record<string,string>) {
      let responseText='';
      try {
        const response=await provider(endpoint,claim.document.environment,'POST',body,query); responseText=response.text;
        const parsed=parseSbzResponse(response.text); const codes=[parsed.statusCode,...parsed.errors.map(e=>e.code)];
        const complete=endpoint==='sendinvoice.php' ? /^\d+$/.test(parsed.invoiceMark) && !!parsed.invoiceUid && !!parsed.authenticationCode && !!parsed.invoiceUrl
          : endpoint==='canceldeliverynote.php' ? /^\d+$/.test(parsed.cancellationMark) : parsed.invoiceMark===claim.document.aade_mark;
        const success=response.ok && parsed.statusCode==='Success' && complete && !parsed.errors.length;
        const explicitRejection=response.ok && !['','Success','TechnicalError'].includes(parsed.statusCode) && !codes.some(c=>['233','7002','7003'].includes(c));
        const outcome=success?'accepted':explicitRejection?'rejected':'unknown';
        const error=success?null:outcome==='unknown'?SBZ_UNKNOWN_MESSAGE:sbzFailureMessage(parsed.errors[0]?.code || parsed.statusCode);
        const result=await finish(claim.operationId,outcome,parsed,response.text,error);
        return json(outcome==='accepted'?result:{error,document:result},outcome==='accepted'?200:409);
      } catch(error) {
        // Includes accepted remote responses whose local commit failed. Keep evidence for reconciliation.
        try { await finish(claim.operationId,'unknown',{},responseText,SBZ_UNKNOWN_MESSAGE); } catch { /* durable pending claim prevents another send */ }
        return json({error:SBZ_UNKNOWN_MESSAGE},409);
      }
    }
    async function reconcile(d: any,documents: any[],cancellations: any[] = [],savedOnly = false) {
      const [attempt]=await db(`legal_transmissions?id=eq.${d.provider_operation_id}`);
      if (attempt?.response_payload) {
        try {
          const saved=parseSbzResponse(attempt.response_payload);
          if (saved.statusCode==='Success' && !saved.errors.length && ((attempt.action==='sbz_send' && saved.invoiceMark && saved.invoiceUid && saved.authenticationCode && saved.invoiceUrl) || (attempt.action==='sbz_cancel' && saved.cancellationMark) || (attempt.action==='sbz_attach' && saved.invoiceMark===d.aade_mark))) return finish(d.provider_operation_id,'accepted',saved,attempt.response_payload,null);
        } catch { /* fall through to provider retrieval */ }
      }
      if(savedOnly) return null;
      if(attempt?.action==='sbz_cancel') {
        const cancellationMark=cancellations.find(c=>c.invoiceMark===d.aade_mark)?.cancellationMark || documents.find(t=>t.mark===d.aade_mark)?.cancelledByMark;
        if(/^\d+$/.test(cancellationMark || '')) return finish(d.provider_operation_id,'accepted',{cancellationMark},attempt?.response_payload || '',null);
      }
      const match=documents.find(t=>t.series===d.series && t.aa===d.aa && t.invoiceType===d.aade_document_type && t.issueDate===d.issue_date && t.issuerVat===d.issuer.vat_number && t.counterpartVat===d.counterpart.vat_number && Math.abs(t.totals.gross-d.totals.gross)<0.001 && Math.abs(t.totals.net-d.totals.net)<0.001 && Math.abs(t.totals.vat-d.totals.vat)<0.001);
      if (match && attempt?.action==='sbz_send') {
        const parsed=parseAadeResponseXml(match.rawXml);
        const local=await db(`legal_document_lines?document_id=eq.${d.id}&order=line_number`);
        const sameLines=local.length===match.lines.length && local.every((l:any,i:number)=>l.quantity===match.lines[i].quantity && Math.abs(l.net_value-match.lines[i].netValue)<0.001 && Math.abs(l.vat_amount-match.lines[i].vatAmount)<0.001);
        if (sameLines && parsed.authenticationCode && match.uid && match.qrUrl) return finish(d.provider_operation_id,'accepted',{invoiceMark:match.mark,invoiceUid:match.uid,authenticationCode:parsed.authenticationCode,invoiceUrl:match.qrUrl},match.rawXml,null);
      }
      return finish(d.provider_operation_id,'unknown',{},attempt?.response_payload || '',SBZ_UNKNOWN_MESSAGE);
    }
  } catch(error) { return json({error:(error as Error).message || 'Η ενέργεια δεν ολοκληρώθηκε.'},400); }
}
