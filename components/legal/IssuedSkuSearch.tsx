import React, { useDeferredValue, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, PackageSearch, Search } from 'lucide-react';
import { LegalArchiveRecord } from '../../types';
import { issuedSkuPricing, searchIssuedSkus, IssuedSkuFilters } from '../../features/legal/skuIssuedSearch';
import { getLegalDocumentDisplayNumber } from '../../utils/legalDocuments';
import { normalizeSkuQuery } from '../../utils/skuSearchMatch';
import SkuColorizedText from '../SkuColorizedText';

const kinds = { invoice: 'Τιμολόγιο', invoice_delivery: 'Τιμολόγιο - ΔΑ', credit: 'Πιστωτικό', delivery_note: 'Δελτίο αποστολής', proforma: 'Προτιμολόγιο' };
const emptyFilters: IssuedSkuFilters = { query: '', customer: '', from: '', to: '', includeCancelled: false };
const inputClass = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const PAGE_SIZE = 30;

export default function IssuedSkuSearch({ records, loading, renderDetails }: {
  records: LegalArchiveRecord[];
  loading: boolean;
  renderDetails: (record: LegalArchiveRecord) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const deferred = useDeferredValue(filters);
  const results = useMemo(() => open ? searchIssuedSkus(records, deferred) : [], [records, deferred, open]);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const update = (patch: Partial<IssuedSkuFilters>) => { setFilters((current) => ({ ...current, ...patch })); setPage(1); setDetailKey(null); };
  const validQuery = normalizeSkuQuery(deferred.query).length >= 2;
  const invalidDates = !!filters.from && !!filters.to && filters.from > filters.to;

  return <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
    <button type="button" aria-expanded={open} aria-controls="issued-sku-search" onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 bg-emerald-50/60 p-4 text-left sm:p-5">
      <PackageSearch className="shrink-0 text-emerald-700" size={23} />
      <span className="flex-1"><span className="block font-black text-slate-900">Αναζήτηση SKU σε παραστατικά</span><span className="text-sm text-slate-600">Σε ποιον εκδόθηκε, πότε και σε ποια τιμή</span></span>
      {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
    </button>
    {open && <div id="issued-sku-search" className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">SKU / κωδικός είδους<input autoFocus value={filters.query} onChange={(event) => update({ query: event.target.value })} placeholder="π.χ. DA001 ή DA001D" className={inputClass} /></label>
        <label className="text-xs font-bold text-slate-600">Πελάτης ή ΑΦΜ<input value={filters.customer} onChange={(event) => update({ customer: event.target.value })} placeholder="Όλοι οι πελάτες" className={inputClass} /></label>
        <label className="text-xs font-bold text-slate-600">Από<input type="date" value={filters.from} onChange={(event) => update({ from: event.target.value })} className={inputClass} /></label>
        <label className="text-xs font-bold text-slate-600">Έως<input type="date" value={filters.to} onChange={(event) => update({ to: event.target.value })} className={inputClass} /></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={filters.includeCancelled} onChange={(event) => update({ includeCancelled: event.target.checked })} /> Συμπερίληψη ακυρωμένων</label>
        <button type="button" onClick={() => update(emptyFilters)} className="font-bold text-emerald-700 hover:underline">Καθαρισμός</button>
      </div>
      <p className="text-xs leading-5 text-slate-500">Αναζήτηση σε όλο το αρχείο, ανεξάρτητα από τα φίλτρα παρακάτω. Ο βασικός SKU βρίσκει και τις παραλλαγές του. Οι τιμές είναι οι αποθηκευμένες κατά την έκδοση, χωρίς ΦΠΑ. Τα πιστωτικά εμφανίζονται ξεχωριστά ως πιστώσεις.</p>
      <div role="status" aria-live="polite" className="text-sm font-bold text-slate-600">
        {loading ? 'Φόρτωση παραστατικών…' : invalidDates ? 'Η ημερομηνία «Από» πρέπει να προηγείται της «Έως».' : !validQuery ? 'Πληκτρολογήστε τουλάχιστον 2 χαρακτήρες SKU.' : filters !== deferred ? 'Αναζήτηση…' : `${results.length} γραμμές σε ${new Set(results.map((row) => row.record.key)).size} παραστατικά`}
      </div>
      {!loading && !invalidDates && validQuery && results.length === 0 && <div className="rounded-xl bg-slate-50 p-8 text-center text-slate-500"><Search className="mx-auto mb-2" />Δεν βρέθηκαν εκδοθέντα παραστατικά με αυτά τα κριτήρια.</div>}
      {!loading && !invalidDates && validQuery && results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((row) => {
        const { record, match } = row;
        const document = record.document;
        const line = match.line;
        const pricing = issuedSkuPricing(line);
        const money = (value: number) => new Intl.NumberFormat('el-GR', { style: 'currency', currency: document.currency || 'EUR' }).format(value);
        const credit = document.document_kind === 'credit';
        return <article key={row.key} className={`overflow-hidden rounded-xl border ${credit ? 'border-rose-200' : 'border-slate-200'}`}>
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><SkuColorizedText sku={row.sku} className="text-lg" /><p className="text-sm text-slate-500">{line.source_metadata?.item_description || line.description}</p></div>
              <div className="flex flex-wrap gap-2 text-xs font-bold"><span className={`rounded-full px-2 py-1 ${credit ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{kinds[document.document_kind]}</span><span className={`rounded-full px-2 py-1 ${document.status === 'cancelled' ? 'bg-slate-200 text-slate-700' : 'bg-slate-50 text-slate-600'}`}>{document.status === 'cancelled' ? 'Ακυρώθηκε' : 'Εκδόθηκε'}</span></div>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm"><div className="font-bold text-slate-900">{row.customer}<span className="ml-2 font-normal text-slate-500">ΑΦΜ {document.counterpart.vat_number || '—'}</span></div><div className="text-slate-600">{getLegalDocumentDisplayNumber(document)} · {document.issue_date.slice(0, 10).split('-').reverse().join('/')}</div></div>
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-3 xl:grid-cols-6">
              {[
                ['Ποσότητα', `${line.quantity} ${line.measurement_unit === 1 ? 'τεμ.' : line.measurement_unit === 2 ? 'kg' : `μον. (${line.measurement_unit})`}`],
                ['Αρχική τιμή / μον.', row.hasPrice && pricing.original !== null ? money(pricing.original) : '—'],
                ['Έκπτωση', !row.hasPrice ? '—' : pricing.discount === null ? 'Δεν καταγράφηκε' : `${pricing.discount}%${pricing.discountAmount !== null && pricing.discountAmount > 0 ? ` · ${money(pricing.discountAmount)}` : ''}`],
                ['Τιμή έκδοσης / μον.', row.hasPrice ? money(line.unit_price) : '—'],
                [credit ? 'Καθαρή αξία πίστωσης' : 'Καθαρή αξία γραμμής', row.hasPrice ? money(line.net_value) : '—'],
                ['Σύνολο με ΦΠΑ', row.hasPrice ? money(line.gross_value) : '—'],
              ].map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-900">{value}</dd></div>)}
            </dl>
            {row.hasPrice && <p className="text-xs text-slate-500">ΦΠΑ γραμμής: {money(line.vat_amount)}. Το ποσό έκπτωσης αφορά όλη τη γραμμή.</p>}
            {!row.hasPrice && <p className="text-xs text-sky-800">{row.fromDeliveryNote ? 'Το SKU προέρχεται από συνδεδεμένο Δελτίο Αποστολής. Δεν υπάρχει επιμέρους τιμή στο τιμολόγιο.' : 'Παραστατικό διακίνησης — δεν αποτελεί τιμή πώλησης.'}</p>}
            {line.source_metadata?.line_comments && <p className="text-xs text-slate-500">{line.source_metadata.line_comments}</p>}
            <button type="button" aria-expanded={detailKey === row.key} onClick={() => setDetailKey(detailKey === row.key ? null : row.key)} className="text-sm font-bold text-emerald-700 hover:underline">{detailKey === row.key ? 'Κλείσιμο στοιχείων' : 'Στοιχεία παραστατικού'}</button>
          </div>
          {detailKey === row.key && renderDetails(record)}
        </article>;
      })}
      {validQuery && !loading && !invalidDates && pages > 1 && <div className="flex items-center justify-between text-sm"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Προηγούμενη</button><span>Σελίδα {currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Επόμενη</button></div>}
    </div>}
  </section>;
}
