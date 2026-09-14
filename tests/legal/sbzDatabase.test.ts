import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { sbzFixture } from './sbzFixture';
import { buildCreditDraft } from '../../features/legal/sbz';
import { serializeLegalDocumentForDb, serializeLegalDocumentLineForDb } from '../../utils/legalDocuments';
const read=(name:string)=>readFileSync(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
let db:PGlite;
const actor='30000000-0000-4000-8000-000000000001';
describe('SBZ PostgreSQL transactions',()=>{
  beforeAll(async()=>{
    db=new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT ''${actor}''::uuid';
      CREATE TABLE profiles(id uuid primary key,role text,is_approved boolean,full_name text);
      INSERT INTO profiles VALUES('${actor}','admin',true,'Admin');
      CREATE TABLE customers(id uuid primary key); CREATE TABLE products(sku text primary key);`);
    for(const name of ['20260611091210_legal_documents_module.sql','20260611095523_legal_documents_admin_rls.sql','20260611123000_legal_proformas_sync.sql','20260709104336_backup_restore_v4.sql','20260728085650_legal_archive_intelligence.sql','20260728101952_legal_archive_relationships.sql','20260729082559_legal_numbering_submission_hardening.sql','20260806094743_link_legal_invoice_delivery_note.sql']) await db.exec(read(name));
    await db.exec('GRANT USAGE ON SCHEMA public,auth TO authenticated,service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated,service_role;');
    await db.exec(read('20260911070545_sbz_provider_wholesale.sql'));
    await db.exec(read('20260914094500_customer_vat_exemption_profile.sql'));

  },60000);
  afterAll(async()=>{await db?.close();});
  it('claims once, records uncertainty, and does not permit reissue',async()=>{
    const {document,lines}=sbzFixture();
    await db.query(`INSERT INTO legal_documents(id,document_kind,aade_document_type,issue_date,issuer,counterpart,totals,environment) VALUES($1,'invoice','1.1','2026-09-11',$2,$3,$4,'dev')`,[document.id,document.issuer,document.counterpart,document.totals]);
    await db.query(`INSERT INTO legal_document_lines(id,document_id,line_number,sku,description,quantity,unit_price,net_value,vat_amount,gross_value,income_classification) VALUES($1,$2,1,'R1','Ring',2,90,180,43.2,223.2,$3)`,[lines[0].id,document.id,lines[0].income_classification]);
    const result=await db.query<any>('SELECT claim_sbz_operation($1,\'send\',$2) result',[document.id,actor]);const claim=result.rows[0].result;
    expect(claim.document.environment).toBe('dev');expect(claim.document.aa).toBe('1');
    await expect(db.query('SELECT claim_sbz_operation($1,\'send\',$2)',[document.id,actor])).rejects.toThrow();
    await db.query('SELECT finish_sbz_operation($1,\'unknown\',\'{}\',\'\',\'pending\')',[claim.operationId]);
    await expect(db.query('SELECT claim_sbz_operation($1,\'send\',$2)',[document.id,actor])).rejects.toThrow();
    await expect(db.query('UPDATE legal_document_lines SET quantity=3 WHERE id=$1',[lines[0].id])).rejects.toThrow();
    await db.query('SELECT finish_sbz_operation($1,\'accepted\',$2,\'response\',null)',[claim.operationId,{invoiceMark:'9007199254740993123',invoiceUid:'uid',authenticationCode:'auth',invoiceUrl:'https://api.sbz.gr/sign/doc.php?ac=auth'}]);
    await expect(db.query('SELECT claim_sbz_operation($1,\'cancel\',$2)',[document.id,actor])).rejects.toThrow('πιστωτικό');
    await expect(db.query('DELETE FROM legal_documents WHERE id=$1',[document.id])).rejects.toThrow();
  });
  it('rejects client mutation of provider state',async()=>{
    await db.exec('SET ROLE authenticated');
    try {await expect(db.exec("UPDATE legal_documents SET provider_state='rejected'")).rejects.toThrow();}
    finally {await db.exec('RESET ROLE');}
  });
  it('persists exemption wording and locks it after provider acceptance',async()=>{
    const source=sbzFixture();
    const legalNote='ΧΩΡΙΣ ΦΠΑ ΩΣ Α.Υ.Ο. Π.7395/4269/5.11.1987';
    const document={...source.document,id:'20000000-0000-4000-8000-000000000008',vat_rate:0,vat_exemption_category:1,vat_exemption_legal_note:legalNote};
    const lines=source.lines.map(line=>({...line,id:'10000000-0000-4000-8000-000000000008',document_id:document.id,vat_category:7,vat_amount:0,gross_value:line.net_value}));
    await db.query('SELECT save_sbz_draft($1,$2)',[serializeLegalDocumentForDb(document),lines.map(line=>serializeLegalDocumentLineForDb(line,document.id))]);
    const saved=await db.query<any>('SELECT vat_exemption_legal_note FROM legal_documents WHERE id=$1',[document.id]);
    expect(saved.rows[0].vat_exemption_legal_note).toBe(legalNote);
    const claim=await db.query<any>('SELECT claim_sbz_operation($1,\'send\',$2) result',[document.id,actor]);
    await db.query('SELECT finish_sbz_operation($1,\'accepted\',$2,\'response\',null)',[claim.rows[0].result.operationId,{invoiceMark:'600',invoiceUid:'athos',authenticationCode:'auth',invoiceUrl:'https://api.sbz.gr/sign/doc.php?ac=athos'}]);
    await expect(db.query('UPDATE legal_documents SET vat_exemption_legal_note=$1 WHERE id=$2',['changed',document.id])).rejects.toThrow('κλειδωμένο');
  });
  it('saves credits atomically and prevents over-crediting pending quantities',async()=>{
    const source=sbzFixture();const original={...source.document,status:'issued' as const,aade_mark:'9007199254740993123'};
    const save=async()=>{const bundle=buildCreditDraft(original,source.lines,{[source.lines[0].id]:2});
      await db.exec('SET ROLE authenticated');
      try {await db.query('SELECT save_sbz_draft($1,$2)',[serializeLegalDocumentForDb(bundle.document),bundle.lines.map(l=>serializeLegalDocumentLineForDb(l,bundle.document.id))]);}
      finally{await db.exec('RESET ROLE');}return bundle;
    };
    const first=await save(),second=await save();
    await db.query('SELECT claim_sbz_operation($1,\'send\',$2)',[first.document.id,actor]);
    await expect(db.query('SELECT claim_sbz_operation($1,\'send\',$2)',[second.document.id,actor])).rejects.toThrow('πιστωθεί');
  });
  it('requires activation for production and keeps numbering separate',async()=>{
    const source=sbzFixture();const id='20000000-0000-4000-8000-000000000003';
    await db.query(`INSERT INTO legal_documents(id,document_kind,aade_document_type,issuer,counterpart,environment) VALUES($1,'invoice','1.1',$2,$3,'prod')`,[id,source.document.issuer,source.document.counterpart]);
    await expect(db.query('SELECT claim_sbz_operation($1,\'send\',$2)',[id,actor])).rejects.toThrow('παραγωγή');
    const result=await db.query<any>("SELECT next_aa FROM legal_numbering_sequences WHERE document_kind='invoice' AND environment='prod'");expect(Number(result.rows[0].next_aa)).toBe(1);
  });
  it('permits the special delivery-note cancellation and preserves invoice links',async()=>{
    const source=sbzFixture();const id='20000000-0000-4000-8000-000000000004';
    const d={...source.document,id,document_kind:'delivery_note' as const,aade_document_type:'9.3' as const,series:null,aa:null};
    const line={...source.lines[0],id:'10000000-0000-4000-8000-000000000004',document_id:id};
    await db.query('SELECT save_sbz_draft($1,$2)',[serializeLegalDocumentForDb(d),[serializeLegalDocumentLineForDb(line,id)]]);
    const issue=await db.query<any>('SELECT claim_sbz_operation($1,\'send\',$2) result',[id,actor]);
    await db.query('SELECT finish_sbz_operation($1,\'accepted\',$2,\'response\',null)',[issue.rows[0].result.operationId,{invoiceMark:'555',invoiceUid:'delivery',authenticationCode:'auth',invoiceUrl:'https://api.sbz.gr/sign/doc.php?ac=delivery'}]);
    await db.query('UPDATE legal_documents SET related_delivery_document_id=$1 WHERE id=$2',[id,source.document.id]);
    const cancel=await db.query<any>('SELECT claim_sbz_operation($1,\'cancel\',$2) result',[id,actor]);
    const result=await db.query<any>('SELECT finish_sbz_operation($1,\'accepted\',$2,\'response\',null) result',[cancel.rows[0].result.operationId,{cancellationMark:'556'}]);
    expect(result.rows[0].result.status).toBe('cancelled');
  });
  it('retains deferred credit references during a service-only archive restore',async()=>{
    const result=await db.query<any>('SELECT jsonb_agg(to_jsonb(d)) rows FROM legal_documents d');const lines=await db.query<any>('SELECT jsonb_agg(to_jsonb(d)) rows FROM legal_document_lines d');
    const session='50000000-0000-4000-8000-000000000001';
    await db.query("INSERT INTO private.backup_restore_sessions(id,mode,requested_tables,manifest,status) VALUES($1,'replace-selected',ARRAY['legal_documents','legal_document_lines'],'{}','staged')",[session]);
    for(const [table,rows] of [['legal_documents',result.rows[0].rows],['legal_document_lines',lines.rows[0].rows]] as any[])await db.query('INSERT INTO private.backup_restore_tables(session_id,table_name,rows,row_count) VALUES($1,$2,$3,$4)',[session,table,rows,rows.length]);
    await db.query('SELECT backup_apply_restore($1)',[session]);
    const after=await db.query<any>('SELECT count(*) n FROM legal_documents');expect(Number(after.rows[0].n)).toBe(result.rows[0].rows.length);
    await expect(db.exec("DELETE FROM legal_documents WHERE status='issued'")).rejects.toThrow();
  });
});
