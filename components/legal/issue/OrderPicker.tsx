import { useMemo, useState } from 'react';
import { CalendarDays, Check, FileCheck2, Search } from 'lucide-react';
import type { LegalDocument } from '../../../types';
import type { LegalOrderPickerRow } from '../../../utils/legalOrderSources';
import { formatOrderId } from '../../../utils/orderUtils';
import { getLegalDocumentDisplayNumber } from '../../../utils/legalDocuments';
import { formatNumber } from '../../../utils/numberFormat';
import { inputBaseClass } from './ui';

const VISIBLE_LIMIT = 40;

const money = (value: number) => value.toLocaleString('el-GR', { style: 'currency', currency: 'EUR' });
const normalize = (value: string) => value.toLocaleLowerCase('el-GR').normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Searchable order list for the creation step. Shows which orders already carry a fiscal
 * document so the same order is not invoiced twice by mistake.
 */
export default function OrderPicker({
  rows,
  selectedId,
  onSelect,
  documentsByOrder,
  loading,
}: {
  rows: LegalOrderPickerRow[];
  selectedId: string;
  onSelect: (orderId: string) => void;
  /** Issued or in-flight documents per order id. */
  documentsByOrder: Map<string, LegalDocument[]>;
  loading: boolean;
}) {
  const [query, setQuery] = useState('');
  const [showTransferred, setShowTransferred] = useState(false);
  const needle = normalize(query.trim());
  const matches = useMemo(() => rows
    .filter((row) => row.selectable || showTransferred || row.order.id === selectedId)
    .filter((row) => !needle || normalize([row.label, row.order.customer_name, formatOrderId(row.order.id), row.order.id].join(' ')).includes(needle))
    .sort((a, b) => String(b.order.created_at || '').localeCompare(String(a.order.created_at || ''))), [rows, needle, showTransferred, selectedId]);
  const transferredCount = rows.filter((row) => !row.selectable).length;
  const visible = matches.slice(0, VISIBLE_LIMIT);

  return (
    <div className="min-w-0 space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && visible[0]?.selectable) {
              event.preventDefault();
              onSelect(visible[0].order.id);
            }
          }}
          placeholder="Αναζήτηση πελάτη ή αριθμού παραγγελίας"
          aria-label="Αναζήτηση παραγγελίας"
          className={`${inputBaseClass} pl-9`}
        />
      </div>
      <div role="listbox" aria-label="Παραγγελίες" className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm font-medium text-slate-500">Φόρτωση παραγγελιών…</div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm font-medium text-slate-500">
            {rows.length === 0 ? 'Δεν υπάρχουν παραγγελίες χονδρικής.' : 'Καμία παραγγελία δεν ταιριάζει στην αναζήτηση.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((row) => {
              const active = row.order.id === selectedId;
              const existing = documentsByOrder.get(row.order.id) || [];
              return (
                <li key={row.order.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(row.order.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${active ? 'bg-emerald-50' : row.selectable ? 'hover:bg-slate-50' : 'opacity-60 hover:bg-slate-50'}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                      {active ? <Check size={14} /> : <FileCheck2 size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-black text-slate-900">{row.order.customer_name || 'Χωρίς πελάτη'}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-500">
                        <span className="font-mono font-bold">#{formatOrderId(row.order.id)}</span>
                        {row.order.created_at ? <span className="inline-flex items-center gap-0.5"><CalendarDays size={11} /> {new Date(row.order.created_at).toLocaleDateString('el-GR')}</span> : null}
                        {!row.selectable ? <span className="font-bold text-amber-700">Μεταφέρθηκε</span> : null}
                        {existing.length > 0 ? (
                          <span className="rounded-sm bg-sky-50 px-1 font-bold text-sky-700 ring-1 ring-sky-100" title={existing.map(getLegalDocumentDisplayNumber).join(', ')}>
                            Έχει {existing.length === 1 ? 'παραστατικό' : `${formatNumber(existing.length)} παραστατικά`}: {getLegalDocumentDisplayNumber(existing[0])}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-black tabular-nums text-slate-900">{money(row.billableTotal)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
        <span>
          {matches.length > VISIBLE_LIMIT
            ? `Εμφανίζονται ${formatNumber(VISIBLE_LIMIT)} από ${formatNumber(matches.length)}. Περιορίστε την αναζήτηση.`
            : `${formatNumber(matches.length)} παραγγελίες · Enter επιλέγει την πρώτη`}
        </span>
        {transferredCount > 0 ? (
          <button type="button" onClick={() => setShowTransferred((value) => !value)} className="font-bold text-slate-500 hover:text-slate-800">
            {showTransferred ? 'Απόκρυψη μεταφερμένων' : `Εμφάνιση μεταφερμένων (${formatNumber(transferredCount)})`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
