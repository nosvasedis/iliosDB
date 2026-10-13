import { isLegalReservedItemCode } from '../../utils/legalItemCodes';
import type { InspectionIssue, InspectionRegistryItem, InspectionSnapshot } from './types';

export const inspectionUnitLabel = (unit: number | null) => ({ 1: 'Τεμάχια', 2: 'Κιλά', 3: 'Λίτρα', 4: 'Μέτρα', 5: 'τ.μ.', 6: 'κ.μ.', 7: 'Συσκευασία' }[unit!] || 'Μη δηλωμένη');
const tableLabels: Record<string, string> = { products: 'Μητρώο προϊόντων', product_variants: 'Παραλλαγές προϊόντων', inventory_balances: 'Υπόλοιπα αποθήκης', inventory_events: 'Κινήσεις αποθήκης', warehouses: 'Αποθηκευτικοί χώροι', customers: 'Αντισυμβαλλόμενοι', legal_settings: 'Στοιχεία εκδότη', legal_documents: 'Παραστατικά', legal_document_lines: 'Γραμμές παραστατικών', legal_transmissions: 'Διαβιβάσεις', legal_payments: 'Πληρωμές', legal_delivery_events: 'Γεγονότα διακίνησης', legal_audit_log: 'Ιστορικό ενεργειών', legal_sync_runs: 'Ιστορικό συγχρονισμών', proforma_documents: 'Προτιμολόγια', proforma_document_lines: 'Γραμμές προτιμολογίων', consignments: 'Παρακαταθήκες', consignment_lines: 'Είδη παρακαταθηκών', consignment_settlements: 'Τακτοποιήσεις παρακαταθηκών', consignment_returns: 'Επιστροφές παρακαταθηκών', repair_intakes: 'Παραλαβές επισκευών', repair_items: 'Είδη επισκευών', repair_charges: 'Παραστατικά επισκευών' };

export function buildInspectionRegistry(snapshot: InspectionSnapshot): InspectionRegistryItem[] {
  const rows: InspectionRegistryItem[] = [];
  const products = snapshot.tables.products || [];
  const variants = snapshot.tables.product_variants || [];
  const variantsBySku = new Map<string, any[]>();
  for (const variant of variants) {
    const group = variantsBySku.get(variant.product_sku) || [];
    group.push(variant); variantsBySku.set(variant.product_sku, group);
  }
  for (const product of products) {
    rows.push({ sku: product.sku, variant: '', itemCode: product.sku, description: product.description || product.category || '',
      category: product.category || '', unit: 1, kind: isLegalReservedItemCode(product.sku) ? 'service' : 'goods', source: 'catalog', documentId: null });
    for (const variant of variantsBySku.get(product.sku) || []) {
      rows.push({ sku: product.sku, variant: variant.suffix, itemCode: product.sku + variant.suffix,
        description: [product.description || product.category, variant.description].filter(Boolean).join(' · '), category: product.category || '',
        unit: 1, kind: 'goods', source: 'catalog', documentId: null });
    }
  }
  // Historical descriptions and units are evidence, even when a current code exists.
  const seen = new Set<string>();
  for (const line of snapshot.tables.legal_document_lines || []) {
    const key = JSON.stringify([line.sku, line.variant_suffix, line.item_code, line.description, line.measurement_unit]);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ sku: line.sku || '', variant: line.variant_suffix || '', itemCode: line.item_code || line.sku || '',
      description: line.description || '', category: '', unit: line.measurement_unit ?? null,
      kind: isLegalReservedItemCode(line.item_code || line.sku) ? 'service' : 'goods', source: 'document', documentId: line.document_id });
  }
  return rows.sort((a, b) => a.itemCode.localeCompare(b.itemCode, 'el') || a.source.localeCompare(b.source));
}

export function inspectSnapshot(snapshot: InspectionSnapshot): InspectionIssue[] {
  const issues: InspectionIssue[] = [];
  const add = (code: string, message: string, documentId?: string) => issues.push({ code, message, documentId });
  for (const [table, state] of Object.entries(snapshot.tableStatus || {})) {
    if (state !== 'complete') add('unavailable', `Δεν ανακτήθηκε η ενότητα «${tableLabels[table] || table}».`);
  }
  const ids = new Set<string>();
  const marks = new Map<string, string>();
  const numbers = new Map<string, string>();
  const sequences = new Map<string, Array<{ number: bigint; id: string }>>();
  const lines = new Map<string, any[]>();
  for (const line of snapshot.tables.legal_document_lines || []) {
    const group = lines.get(line.document_id) || [];
    group.push(line); lines.set(line.document_id, group);
  }
  for (const document of snapshot.tables.legal_documents || []) {
    if (ids.has(document.id)) add('duplicate_id', 'Διπλή εγγραφή παραστατικού.', document.id);
    ids.add(document.id);
    if (!document.environment) add('unknown_environment', 'Το περιβάλλον του παραστατικού δεν έχει επιβεβαιωθεί.', document.id);
    const environment = document.environment || 'unknown';
    if (document.aade_mark) {
      const key = `${environment}:${document.aade_mark}`;
      if (marks.has(key)) add('duplicate_mark', `Επαναλαμβανόμενο MARK ${document.aade_mark}.`, document.id);
      marks.set(key, document.id);
    }
    if (['sending', 'unknown'].includes(document.provider_state) || document.status === 'submitted') {
      add('pending_issue', 'Η έκδοση παραμένει εκκρεμής. Απαιτείται έλεγχος στον πάροχο.', document.id);
    }
    const official = ['issued', 'cancelled'].includes(document.status);
    if (official && (!document.aade_mark || !document.aa || !document.issue_date)) add('missing_identity', 'Λείπουν στοιχεία ταυτοποίησης εκδομένου παραστατικού.', document.id);
    if (official && (!document.issuer?.vat_number || !document.counterpart?.vat_number)) add('missing_party', 'Λείπει ΑΦΜ εκδότη ή αντισυμβαλλόμενου.', document.id);
    const documentLines = lines.get(document.id) || [];
    if (!documentLines.length) add('missing_lines', 'Δεν έχουν ανακτηθεί γραμμές για το παραστατικό.', document.id);
    const seenLines = new Set<number>();
    const totals = { net: 0, vat: 0, gross: 0, quantity: 0 };
    for (const line of documentLines) {
      if (seenLines.has(line.line_number)) add('duplicate_line', `Διπλή γραμμή ${line.line_number}.`, document.id);
      seenLines.add(line.line_number);
      if (!line.description || !line.sku || !line.measurement_unit || !Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
        add('missing_line_fields', `Ελλιπή στοιχεία είδους στη γραμμή ${line.line_number}.`, document.id);
      }
      totals.net += Number(line.net_value); totals.vat += Number(line.vat_amount);
      totals.gross += Number(line.gross_value); totals.quantity += Number(line.quantity);
    }
    if (documentLines.length && Object.entries(totals).some(([key, value]) =>
      !Number.isFinite(value) || !Number.isFinite(Number(document.totals?.[key])) || Math.abs(value - Number(document.totals[key])) > 0.011)) {
      add('totals_mismatch', 'Τα σύνολα του παραστατικού δεν συμφωνούν με τις γραμμές.', document.id);
    }
    if (document.aa && /^\d+$/.test(String(document.aa))) {
      const number = BigInt(document.aa);
      const series = String(document.series || '').trim().toLocaleUpperCase('el');
      const group = JSON.stringify([environment, document.aade_document_type, series]);
      const key = `${group}:${number}`;
      if (numbers.has(key)) add('duplicate_number', `Επαναλαμβανόμενος αριθμός ${document.series}/${document.aa}.`, document.id);
      numbers.set(key, document.id);
      const sequence = sequences.get(group) || []; sequence.push({ number, id: document.id }); sequences.set(group, sequence);
    }
  }
  for (const sequence of sequences.values()) {
    sequence.sort((a, b) => a.number < b.number ? -1 : a.number > b.number ? 1 : 0);
    for (let index = 1; index < sequence.length; index++) {
      if (sequence[index].number > sequence[index - 1].number + 1n) {
        add('number_gap', `Ασυνέχεια μεταξύ ${sequence[index - 1].number} και ${sequence[index].number} μέσα στο επιλεγμένο αρχείο. Χρειάζεται διερεύνηση της κάλυψης.`, sequence[index].id);
      }
    }
  }
  const evidenceSources = snapshot.tables.legal_settings?.[0]?.settings?.inspection_evidence_sources || [];
  if (!evidenceSources.length || evidenceSources.some((source: any) => !source.confirmed)) {
    add('external_evidence', 'Η διαθεσιμότητα των εξωτερικών βιβλίων και τεκμηρίων δεν έχει επιβεβαιωθεί πλήρως στο ευρετήριο πηγών.');
  }
  return issues;
}
