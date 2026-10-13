import React, { useDeferredValue, useMemo, useState } from 'react';
import { Download, RefreshCw, Printer } from 'lucide-react';
import { buildInspectionRegistry, inspectSnapshot, inspectionUnitLabel } from '../../features/inspection/analysis';
import { buildInspectionExport, downloadInspectionFile, inspectionCsv } from '../../features/inspection/export';
import type { InspectionFilters, InspectionSnapshot, InspectionEvidenceSource } from '../../features/inspection/types';
import { evidenceCategories } from './EvidenceSourcesEditor';

export type InspectionExtraTab = 'registry' | 'readiness' | 'inventory' | 'third_parties';
const dateLabel = (value: unknown) => typeof value === 'string' && value ? new Date(value).toLocaleString('el-GR') : 'Μη δηλωμένο';
const cell = (value: unknown) => React.isValidElement(value) ? value : value === null || value === undefined || value === '' ? 'Μη δηλωμένο' : String(value);
const buttonClass = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold disabled:opacity-50';
const statusLabels: Record<string, string> = { draft: 'Πρόχειρη', pending_handoff: 'Σε αναμονή παράδοσης', active: 'Ενεργή', partially_settled: 'Μερικώς τακτοποιημένη', cancelled: 'Ακυρωμένη', completed: 'Ολοκληρωμένη', open: 'Ανοιχτή', received: 'Παραλήφθηκε', in_production: 'Επεξεργασία', quality_check: 'Ποιοτικός έλεγχος', ready_for_return: 'Έτοιμο για επιστροφή', delivered: 'Παραδόθηκε', on_hold: 'Σε αναμονή', irreparable: 'Μη επισκευάσιμο' };

export function InspectionStatusPanel({ snapshot, loading, error, pendingCount, filters, onFilters, onRefresh }: {
  snapshot?: InspectionSnapshot; loading: boolean; error?: Error | null; pendingCount: number;
  filters: InspectionFilters; onFilters: (value: InspectionFilters) => void; onRefresh: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportSnapshot = async () => {
    if (!snapshot) return;
    setExporting(true); setExportError('');
    try { const result = await buildInspectionExport(error ? { ...snapshot, status: { ...snapshot.status, state: 'saved', source: 'saved', error: error.message } } : snapshot); downloadInspectionFile(result.bytes, result.filename); }
    catch (e) { setExportError(e instanceof Error ? e.message : 'Δεν δημιουργήθηκε η εξαγωγή.'); }
    finally { setExporting(false); }
  };
  const state = error && snapshot ? 'saved' : snapshot?.status.state;
  return <section aria-label="Κατάσταση ανάκτησης στοιχείων" className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 print:hidden">
    <div className="flex flex-wrap items-center gap-3">
      <strong>{loading ? 'Ανάκτηση στοιχείων…' : state === 'complete' ? 'Οι διαθέσιμες ενότητες ανακτήθηκαν' : state === 'saved' ? 'Αποθηκευμένο αντίγραφο · μη επιβεβαιωμένη επικαιρότητα' : state === 'partial' ? 'Μερική ανάκτηση στοιχείων' : 'Η ανάκτηση δεν έχει ολοκληρωθεί'}</strong>
      <span className="text-xs text-slate-500">{snapshot ? `Στιγμιότυπο: ${dateLabel(snapshot.fetchedAt)}` : ''}</span>
      <button type="button" className={buttonClass} onClick={onRefresh} disabled={loading}><RefreshCw size={15} />Ανανέωση στοιχείων</button>
      <button type="button" className={buttonClass} onClick={() => void exportSnapshot()} disabled={!snapshot || loading || exporting}><Download size={15} />{exporting ? 'Δημιουργία ZIP…' : 'Εξαγωγή ZIP'}</button>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-bold">Αρχείο<select className="ml-2 rounded-lg border p-2" value={filters.environment} onChange={(e) => onFilters({ ...filters, environment: e.target.value as 'prod' | 'dev' })}><option value="prod">Παραγωγή</option><option value="dev">Δοκιμές</option></select></label>
      <label className="text-xs font-bold">Από<input type="date" className="ml-2 rounded-lg border p-2" value={filters.dateFrom} onChange={(e) => onFilters({ ...filters, dateFrom: e.target.value })} /></label>
      <label className="text-xs font-bold">Έως<input type="date" className="ml-2 rounded-lg border p-2" value={filters.dateTo} onChange={(e) => onFilters({ ...filters, dateTo: e.target.value })} /></label>
    </div>
    {(error || snapshot?.status.error || exportError) && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">{exportError || error?.message || snapshot?.status.error}</p>}
    {pendingCount > 0 && <p role="status" className="text-sm font-bold text-amber-800">{pendingCount} εκκρεμείς τοπικές εργασίες διατηρούνται. Ο αυτόματος συγχρονισμός τους παραμένει σε αναμονή σε αυτή την προβολή.</p>}
    <p className="text-xs text-slate-500">Η ολοκλήρωση ανάκτησης αφορά τις διαθέσιμες ενότητες του ERP. Βιβλία και πρόσθετα τεκμήρια παρέχονται από τις δηλωμένες πηγές. Τα άγνωστα περιβάλλοντα παραμένουν ορατά.</p>
  </section>;
}

function DataTable({ rows, columns }: { rows: Record<string, any>[]; columns: Array<[string, string]> }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(rows.length / 100);
  const current = Math.min(page, Math.max(0, pageCount - 1));
  return <div className="space-y-3"><div className="overflow-auto"><table className="w-full text-left text-sm"><thead><tr>{columns.map(([key, label]) => <th key={key} className="whitespace-nowrap border-b bg-slate-50 p-3">{label}</th>)}</tr></thead>
    <tbody>{rows.slice(current * 100, (current + 1) * 100).map((row, index) => <tr key={row.id || index}>{columns.map(([key]) => <td key={key} className="border-b p-3">{cell(key === 'status' || key === 'statusLabel' ? statusLabels[row[key]] || row[key] : row[key])}</td>)}</tr>)}</tbody></table></div>
    {!rows.length && <p className="p-3 text-sm">Δεν υπάρχουν εγγραφές στην ανακτημένη ενότητα.</p>}
    {pageCount > 1 && <div className="flex items-center gap-3 print:hidden"><button className={buttonClass} disabled={!current} onClick={() => setPage(current - 1)}>Προηγούμενα</button><span>{current + 1}/{pageCount} · {rows.length} εγγραφές</span><button className={buttonClass} disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Επόμενα</button></div>}
  </div>;
}

export default function InspectionWorkspace({ tab, snapshot, onOpenDocument }: { tab: InspectionExtraTab; snapshot: InspectionSnapshot; onOpenDocument: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const registry = useMemo(() => buildInspectionRegistry(snapshot), [snapshot]);
  const issues = useMemo(() => inspectSnapshot(snapshot), [snapshot]);
  const registryRows = useMemo(() => registry.filter((row) => [row.itemCode,row.description,row.sku].some((value) => value.toLocaleLowerCase('el').includes(deferredSearch.toLocaleLowerCase('el')))), [registry,deferredSearch]);
  const settings = snapshot.tables.legal_settings?.[0]?.settings;
  const sources = (settings?.inspection_evidence_sources || []) as InspectionEvidenceSource[];
  const unavailable = (table: string) => snapshot.tableStatus[table] !== 'complete';
  if (tab === 'registry') return <section className="space-y-4 rounded-2xl border bg-white p-5">
    <div className="flex flex-wrap items-center gap-3"><input aria-label="Αναζήτηση κωδικού ή περιγραφής" className="rounded-xl border p-2" placeholder="Κωδικός ή περιγραφή" value={search} onChange={(e) => setSearch(e.target.value)} />
      <button type="button" className={buttonClass} onClick={() => downloadInspectionFile(inspectionCsv(registryRows.map((row) => ({ ...row }))), 'Ilios_Registry.csv', 'text/csv;charset=utf-8')}><Download size={15} />CSV · {registryRows.length} εγγραφές</button>
      <button type="button" className={buttonClass} onClick={() => {
        const frame = document.createElement('iframe'); frame.style.display = 'none'; document.body.appendChild(frame);
        const doc = frame.contentDocument; if (!doc) { frame.remove(); return; }
        doc.open(); doc.write('<!doctype html><html lang="el"><title>Μητρώο κωδικών</title><style>body{font:12px sans-serif}td,th{border:1px solid #ccc;padding:5px}table{border-collapse:collapse;width:100%}</style><body></body></html>'); doc.close();
        const heading = doc.createElement('h1'); heading.textContent = `Μητρώο κωδικών · ${snapshot.fetchedAt}`; doc.body.appendChild(heading);
        const table = doc.createElement('table'); const header = table.insertRow(); ['Κωδικός','Περιγραφή','Μονάδα','Προέλευση','Είδος'].forEach((label) => { const th = doc.createElement('th'); th.textContent = label; header.appendChild(th); });
        registryRows.forEach((row) => { const tr = table.insertRow(); [row.itemCode,row.description,inspectionUnitLabel(row.unit),row.source === 'document' ? 'Παραστατικό' : 'Τρέχον μητρώο',row.kind === 'service' ? 'Υπηρεσία' : 'Αγαθό'].forEach((text) => { tr.insertCell().textContent = text; }); }); doc.body.appendChild(table);
        frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true }); frame.contentWindow?.focus(); frame.contentWindow?.print();
      }}><Printer size={15} />Εκτύπωση όλων των αποτελεσμάτων</button></div>
    <p className="text-sm text-slate-600">Οι ιστορικές περιγραφές και μονάδες προέρχονται από τις αρχικές γραμμές παραστατικών. Η μονάδα των τρεχόντων κωδικών ακολουθεί την έκδοση σε τεμάχια. Η λίστα δεν αποτελεί απογραφή.</p>
    {(unavailable('products') || unavailable('product_variants')) && <p className="text-amber-800">Η κάλυψη του τρέχοντος μητρώου είναι ελλιπής.</p>}
    <DataTable rows={registryRows.map((row) => ({ ...row, unitLabel: inspectionUnitLabel(row.unit), sourceLabel: row.source === 'document' ? 'Ιστορικό παραστατικό' : 'Τρέχον μητρώο', kindLabel: row.kind === 'service' ? 'Υπηρεσία' : 'Αγαθό' }))} columns={[[ 'sku','Βασικός κωδικός'],['variant','Παραλλαγή'],['itemCode','Πλήρης κωδικός'],['description','Περιγραφή'],['category','Κατηγορία'],['unitLabel','Μονάδα'],['sourceLabel','Προέλευση'],['kindLabel','Είδος']]} />
  </section>;
  if (tab === 'readiness') return <section className="space-y-5 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">Πληρότητα και πηγές</h2>
    <p className="text-sm">Τα ευρήματα χρειάζονται διερεύνηση και διασταύρωση με SBZ και λογιστή. Η ασυνέχεια αρίθμησης μπορεί να οφείλεται στην επιλεγμένη περίοδο ή σε ελλιπή κάλυψη.</p>
    {issues.length ? <ul className="space-y-2">{issues.map((issue, index) => <li key={`${issue.code}:${issue.documentId}:${index}`} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{issue.message}{issue.documentId && <button type="button" className="ml-2 font-bold underline" onClick={() => onOpenDocument(issue.documentId!)}>Παραστατικό</button>}</li>)}</ul> : <p>Δεν εντοπίστηκαν ευρήματα από τους αυτοματοποιημένους ελέγχους των ανακτημένων στοιχείων.</p>}
    <h3 className="font-bold">Εξωτερικές πηγές</h3>
    {!sources.length && <p className="text-amber-800">Δεν έχει συμπληρωθεί ευρετήριο πηγών. Συμπληρώνεται από τις κανονικές ρυθμίσεις παραστατικών.</p>}
    <DataTable rows={sources.map((source) => ({ ...source, categoryLabel: evidenceCategories[source.category] || source.category, confirmedLabel: source.confirmed ? `Διαθεσιμότητα επιβεβαιωμένη ${dateLabel(source.verifiedAt)}` : 'Ανεπιβεβαίωτη διαθεσιμότητα' }))} columns={[[ 'categoryLabel','Κατηγορία'],['title','Αρχείο'],['periodFrom','Από'],['periodTo','Έως'],['location','Θέση φύλαξης'],['responsible','Υπεύθυνος'],['confirmedLabel','Κατάσταση']]} />
    <p className="rounded-xl bg-slate-50 p-3 text-sm">Η πιθανή απαλλαγή απογραφής έως €150.000 χρειάζεται επιβεβαίωση για τη συγκεκριμένη οντότητα και χρήση. Τα υπόλοιπα του ERP είναι μερικώς ενημερωμένα.</p>
    <p className="text-xs text-slate-500">Νομοθετική ενημέρωση 13/10/2026: δεύτερη περίοδος τιμολόγησης 2/11/2026–31/1/2027 · Β1 διακίνησης 1/1/2027 · ενιαία κωδικοποίηση 1/1/2028. <a href="https://aade.gr/sites/default/files/2026-10/A1197_2026_fek.pdf" target="_blank" rel="noreferrer" className="underline">Α.1197–Α.1198/2026</a></p>
  </section>;
  const warehouses = new Map((snapshot.tables.warehouses || []).map((row) => [row.id,row.name]));
  const customers = new Map((snapshot.tables.customers || []).map((row) => [row.id,row]));
  if (tab === 'inventory') return <section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">Εσωτερικά υπόλοιπα αποθήκης</h2>
    <p className="rounded-xl bg-amber-50 p-3 font-bold text-amber-900">Μερικώς ενημερωμένα στοιχεία · Δεν αποτελούν επιβεβαιωμένη φυσική απογραφή. Η απουσία εγγραφής δεν δηλώνει μηδενικό απόθεμα.</p>
    {unavailable('inventory_balances') ? <p>Δεν ανακτήθηκε το ledger αποθεμάτων.</p> : <DataTable rows={(snapshot.tables.inventory_balances || []).map((row) => ({ ...row, warehouseName: warehouses.get(row.warehouse_id) || row.warehouse_id, updatedLabel: dateLabel(row.updated_at) }))} columns={[[ 'product_sku','Κωδικός'],['variant_suffix','Παραλλαγή'],['size_info','Μέγεθος'],['warehouseName','Χώρος'],['on_hand','Καταχωρημένη ποσότητα'],['reserved','Δεσμευμένα'],['updatedLabel','Ενημέρωση']]} />}
    <p className="text-sm text-slate-500">Οι πραγματικές κινήσεις του ledger περιλαμβάνονται στην εξαγωγή ZIP. Υλικά και αποστολές σε τεχνίτες τεκμηριώνονται από τις εξωτερικές πηγές.</p>
  </section>;
  const consignments = new Map((snapshot.tables.consignments || []).map((row) => [row.id,row]));
  const documents = new Map((snapshot.tables.legal_documents || []).map((row) => [row.id,row]));
  const documentLinks = (ids: Array<string | null>) => <span className="flex flex-wrap gap-2">{ids.length ? [...new Set(ids)].map((id, index) => {
    const document = id ? documents.get(id) : null;
    return document ? <button type="button" key={id} className="font-bold underline" onClick={() => onOpenDocument(id!)}>{document.series || 'Χωρίς σειρά'}/{document.aa || 'Πρόχειρο'} · {document.issue_date}</button>
      : <span key={id || index}>{id ? `Εκτός ανακτημένης περιόδου: ${id}` : 'Χωρίς σύνδεση'}</span>;
  }) : 'Δεν έχει συνδεθεί παραστατικό'}</span>;
  const consignmentRows = (snapshot.tables.consignment_lines || []).map((row) => {
    const consignment = consignments.get(row.consignment_id);
    const customer = customers.get(consignment?.customer_id);
    const settlement = (snapshot.tables.consignment_settlements || []).filter((item) => item.consignment_line_id === row.id);
    return { ...row, code: consignment?.code, ownership: 'Αγαθά της επιχείρησης σε πελάτη', party: customer?.full_name, vat: customer?.vat_number, address: customer?.address,
      handedOff: consignment?.handed_off_at, statusLabel: consignment?.status, legalIds: documentLinks(settlement.map((item) => item.legal_document_id || null)) };
  });
  const repairRows = (snapshot.tables.repair_items || []).map((row) => ({ ...row, ownership: 'Παραλαβή για επισκευή · κυριότητα πελάτη προς τεκμηρίωση',
    party: customers.get(row.customer_id)?.full_name, vat: customers.get(row.customer_id)?.vat_number,
    address: customers.get(row.customer_id)?.address, quantity: 1,
    legalIds: documentLinks((snapshot.tables.repair_charges || []).filter((charge) => charge.repair_item_id === row.id).map((charge) => charge.legal_document_id || null)) }));
  return <section className="space-y-5 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">Παρακαταθήκες και παραλαβές επισκευής</h2>
    <p className="text-sm text-amber-900">Οι εσωτερικές εγγραφές χρειάζονται τα αντίστοιχα τεκμήρια κυριότητας και διακίνησης. Η σύνδεση τιμολογίου υπηρεσίας δεν αντικαθιστά το παραστατικό διακίνησης. Οι αποστολές σε τεχνίτες καλύπτονται από τις δηλωμένες εξωτερικές πηγές.</p>
    {unavailable('consignment_lines') ? <p>Δεν ανακτήθηκαν οι παρακαταθήκες.</p> : <DataTable rows={consignmentRows} columns={[[ 'code','Παρακαταθήκη'],['product_sku','Κωδικός'],['variant_suffix','Παραλλαγή'],['ownership','Κυριότητα / θέση'],['party','Αντισυμβαλλόμενος'],['vat','ΑΦΜ'],['address','Διεύθυνση'],['quantity','Αρχική ποσότητα'],['pending_quantity','Εκκρεμής ποσότητα'],['handedOff','Παράδοση'],['statusLabel','Κατάσταση'],['legalIds','Συνδέσεις παραστατικών']]} />}
    <h3 className="font-bold">Παραλαβές επισκευής</h3>
    {unavailable('repair_items') ? <p>Δεν ανακτήθηκαν οι επισκευές.</p> : <DataTable rows={repairRows} columns={[[ 'code','Παραλαβή'],['product_sku','Κωδικός'],['description','Είδος'],['ownership','Κυριότητα'],['party','Πελάτης'],['vat','ΑΦΜ'],['address','Διεύθυνση'],['quantity','Ποσότητα'],['created_at','Παραλαβή'],['status','Κατάσταση'],['legalIds','Συνδέσεις παραστατικών']]} />}
  </section>;
}
