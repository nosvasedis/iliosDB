import type { LegalDocument, LegalDocumentLine } from '../../types';
export function sbzFixture() {
  const line: LegalDocumentLine = {id:'10000000-0000-4000-8000-000000000001',document_id:'20000000-0000-4000-8000-000000000001',line_number:1,sku:'R1',description:'Δαχτυλίδι & κόσμημα',quantity:2,unit_price:90,net_value:180,vat_category:1,vat_amount:43.2,gross_value:223.2,measurement_unit:1,income_classification:{classification_category:'category1_2',classification_type:'E3_561_001',amount:180},source_metadata:{original_unit_price:100,discount_percent:10}};
  const party={name:'Επιχείρηση',vat_number:'094259216',country:'GR',branch:0,address:{street:'Ερμού',number:'1',city:'Αθήνα',postal_code:'10563'}};
  const document: LegalDocument={id:line.document_id,source_kind:'manual',document_kind:'invoice',aade_document_type:'1.1',status:'draft',provider:'sbz',environment:'dev',provider_state:'idle',issue_date:'2026-09-11',issuer:{...party,business_name:'ILIOS',activity:'Κοσμήματα',doy:'Αθηνών'},counterpart:{...party,vat_number:'987654324'},payment_method_code:5,currency:'EUR',vat_rate:.24,revenue_classification:[line.income_classification],totals:{net:180,vat:43.2,gross:223.2,quantity:2},created_at:'2026-09-11T08:00:00Z',updated_at:'2026-09-11T08:00:00Z',series:'ΤΙΜ',aa:'1'};
  return {document,lines:[line]};
}
