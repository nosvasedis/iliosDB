import { describe,it,expect } from 'vitest';
import { buildManualLegalDocument, createManualLegalDocumentLine, DEFAULT_LEGAL_SETTINGS, recalculateLegalDocument } from '../../utils/legalDocuments';
import { buildSbzInvoiceXml, parseSbzResponse, buildCreditDraft, validateSbzDocument } from '../../features/legal/sbz';
import type { LegalDocument, LegalDocumentLine } from '../../types';

import { sbzFixture } from './sbzFixture';
describe('SBZ wholesale contract',()=>{
  it('serializes provider extensions, discounts, Greek characters and Athens time',()=>{
    const {document,lines}=sbzFixture(); const xml=buildSbzInvoiceXml(document,lines,document.created_at);
    expect(xml).toContain('xmlns:N1=');expect(xml).not.toContain('N2:');expect(xml).not.toContain('icls:');
    expect(xml).toContain('<API_InvoiceDetails>');expect(xml).toContain('<lineUnitPrice>100.00</lineUnitPrice>');
    expect(xml).toContain('<totalDiscountValue>20.00</totalDiscountValue>');expect(xml).toContain('<IssuerPhone>2101234567</IssuerPhone>');expect(xml).toContain('<CounterpartPhone>2101234567</CounterpartPhone>');expect(xml).toContain('Δαχτυλίδι &amp; κόσμημα');expect(xml).toContain('<docTime>11:00:00</docTime>');
  });
  it.each(['invoice_delivery', 'delivery_note'] as const)('serializes %s with dispatch details', kind => {
    const {document,lines}=sbzFixture();
    const d={...document,document_kind:kind,aade_document_type:kind==='delivery_note'?'9.3' as const:'1.1' as const,delivery:{dispatch_date:'2026-09-11',dispatch_time:'11:00',move_purpose:1,loading_address:document.issuer.address,delivery_address:document.counterpart.address,vehicle_number:'ABC123'}};
    const selected=kind==='delivery_note'?lines.map(l=>({...l,income_classification:{classification_category:'category3',classification_type:'',amount:l.net_value}})):lines;
    expect(buildSbzInvoiceXml(d,selected,d.created_at)).toContain('<movePurpose>1</movePurpose>');
  });
  it('serializes an exempt invoice and rejects forged totals or missing classification amounts',()=>{
    const {document,lines}=sbzFixture();const exempt=lines.map(l=>({...l,vat_category:7,vat_amount:0,gross_value:l.net_value}));
    expect(buildSbzInvoiceXml({...document,vat_exemption_category:1,totals:{...document.totals,vat:0,gross:180}},exempt,document.created_at)).toContain('<vatExemptionCategory>1</vatExemptionCategory>');
    expect(validateSbzDocument({...document,totals:{...document.totals,net:1}},lines).length).toBeGreaterThan(0);
    expect(validateSbzDocument(document,lines.map(l=>({...l,income_classification:{...l.income_classification,amount:NaN}}))).length).toBeGreaterThan(0);
  });
  it('preserves large identifiers and parses XML or JSON errors',()=>{
    expect(parseSbzResponse('<SBZResponseDoc><response><statusCode>Success</statusCode><invoiceMark>9007199254740993123</invoiceMark></response></SBZResponseDoc>').invoiceMark).toBe('9007199254740993123');
    expect(parseSbzResponse('{"statusCode":5006}').statusCode).toBe('5006');
    expect(parseSbzResponse('<SBZResponseDoc><response><statusCode>ValidationError</statusCode><errors><error><code>233</code><message>duplicate</message></error></errors></response></SBZResponseDoc>').errors[0].code).toBe('233');
  });
  it('rejects malformed and entity-bearing responses',()=>{
    expect(()=>parseSbzResponse('<response>')).toThrow();expect(()=>parseSbzResponse('<!DOCTYPE test><response/>')).toThrow();
  });
  it('creates partial correlated credits from original monetary values',()=>{
    const {document,lines}=sbzFixture(); const credit=buildCreditDraft({...document,status:'issued',aade_mark:'123'},lines,{[lines[0].id]:1});
    expect(credit.document.aade_document_type).toBe('5.1');expect(credit.document.totals.gross).toBe(111.6);expect(credit.document.correlated_mark).toBe('123');expect(credit.lines[0].credited_line_id).toBe(lines[0].id);expect(credit.document.aa).toBeNull();
    expect(buildSbzInvoiceXml({...credit.document,series:'Π',aa:'1'},credit.lines,document.created_at)).toContain('<correlatedInvoices>123</correlatedInvoices>');
  });
  it('allocates rounding residuals across successive partial credits',()=>{
    const {document,lines}=sbzFixture();const original={...document,status:'issued' as const,aade_mark:'123'};
    const source=[{...lines[0],quantity:3,unit_price:.01,net_value:.03,vat_amount:.01,gross_value:.04}];
    const reserved:LegalDocumentLine[]=[];
    for(let i=0;i<3;i++) reserved.push(...buildCreditDraft(original,source,{[source[0].id]:1},reserved).lines);
    expect(reserved.reduce((sum,l)=>sum+l.vat_amount,0)).toBe(.01);
    expect(()=>buildCreditDraft(original,source,{[source[0].id]:1},reserved)).toThrow();
  });
  it('blocks unsupported payment integration and inconsistent amounts',()=>{
    const {document,lines}=sbzFixture();expect(validateSbzDocument({...document,payment_method_code:7},lines).length).toBeGreaterThan(0);
    expect(()=>buildSbzInvoiceXml(document,[{...lines[0],vat_amount:1}],document.created_at)).toThrow();
  });
});
