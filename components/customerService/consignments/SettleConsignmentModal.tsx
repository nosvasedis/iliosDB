import { useRestartDraft } from '../../../hooks/useRestartBlocker';
import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import type { Consignment } from '../../../types';
import { buildSettlementSteps, consignmentSaleTotal, consignmentUnitPrice, formatGreekMoney, formatGreekNumber } from '../../../features/customerService';
import SkuColorizedText from '../../SkuColorizedText';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ServiceController } from '../useServiceController';
import { ACTION_PRIMARY, ACTION_QUIET, GHOST_BUTTON, ROW_BUTTON, SERVICE_INPUT, ServiceModal } from '../shared/serviceUi';

function MiniStepper({ value, max, onChange, tone }: { value: number; max: number; onChange: (value: number) => void; tone: 'emerald' | 'amber' }) {
  const ring = 'focus:border-slate-400';
  return (
    <div className="flex items-center gap-1">
      <button type="button" className="h-8 w-8 rounded-lg border border-slate-200 bg-white font-black text-slate-500 hover:bg-slate-50 disabled:opacity-30" disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Μείωση">−</button>
      <input type="number" min={0} max={max} className={`${SERVICE_INPUT} h-8 w-12 px-1 py-0 text-center font-black ${ring}`} value={value} onChange={(event) => onChange(Math.max(0, Math.min(max, Math.floor(Number(event.target.value) || 0))))} />
      <button type="button" className="h-8 w-8 rounded-lg border border-slate-200 bg-white font-black text-slate-500 hover:bg-slate-50 disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Αύξηση">+</button>
    </div>
  );
}

export default function SettleConsignmentModal({ ctl, entry }: { ctl: ServiceController; entry: Consignment }) {
  const bundle = ctl.consignmentBundles.find((candidate) => candidate.entry.id === entry.id);
  const lines = useMemo(() => (bundle?.lines || []).filter((line) => line.pending_quantity > 0), [bundle?.lines]);
  const [counts, setCounts] = useState<Record<string, { sold: number; returned: number }>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
    useRestartDraft('Κλείσιμο παρακαταθήκης', { counts, note }, { busy });

  const close = () => ctl.setOperation(null);

  const get = (lineId: string) => counts[lineId] || { sold: 0, returned: 0 };
  const set = (lineId: string, patch: Partial<{ sold: number; returned: number }>) =>
    setCounts((current) => ({ ...current, [lineId]: { ...get(lineId), ...patch } }));
  const fillAll = (field: 'sold' | 'returned') =>
    setCounts(Object.fromEntries(lines.map((line) => [line.id, field === 'sold' ? { sold: line.pending_quantity, returned: 0 } : { sold: 0, returned: line.pending_quantity }])));

  const { steps, issues } = useMemo(() => buildSettlementSteps(lines.map((line) => ({
    lineId: line.id,
    pending: line.pending_quantity,
    sold: get(line.id).sold,
    returned: get(line.id).returned,
    unitPrice: Number(line.locked_unit_price),
  }))), [counts, lines]); // eslint-disable-line react-hooks/exhaustive-deps

  const soldValue = lines.reduce((sum, line) => sum + consignmentSaleTotal(line, get(line.id).sold, bundle?.settlements), 0);
  const soldPieces = lines.reduce((sum, line) => sum + get(line.id).sold, 0);
  const returnedPieces = lines.reduce((sum, line) => sum + get(line.id).returned, 0);
  const remaining = lines.reduce((sum, line) => sum + line.pending_quantity, 0) - soldPieces - returnedPieces;

  const submit = async () => {
    setBusy(true);
    try { await ctl.runSettlementSteps(steps, note.trim()); } finally { setBusy(false); }
  };

  return (
    <ServiceModal
      title={`Απολογισμός ${entry.code}`}
      subtitle={`${ctl.customerName(entry.customer_id)} · τι πούλησε και τι επιστρέφει ο πελάτης`}
      icon={<ClipboardCheck size={18} />}
      onClose={close}
      busy={busy}
      size="lg"
      footer={(
        <>
          <div className="mr-auto text-xs text-slate-500">
            <span className="font-bold text-slate-700">{formatGreekNumber(soldPieces)} πωλήσεις · {formatGreekMoney(soldValue)}</span>
            {' · '}<span className="font-bold text-slate-700">{formatGreekNumber(returnedPieces)} επιστροφές</span>
            {' · '}μένουν {formatGreekNumber(Math.max(0, remaining))} στον πελάτη
          </div>
          <button type="button" className={ACTION_QUIET} onClick={close} disabled={busy}>Άκυρο</button>
          <button type="button" className={`${ACTION_PRIMARY}`} disabled={busy || steps.length === 0 || issues.length > 0} onClick={submit}>
            {busy && <Loader2 size={15} className="animate-spin" />} Καταχώριση
          </button>
        </>
      )}
    >
      {lines.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Δεν υπάρχουν τεμάχια στον πελάτη.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ROW_BUTTON} onClick={() => fillAll('sold')}>Πουλήθηκαν όλα</button>
            <button type="button" className={ROW_BUTTON} onClick={() => fillAll('returned')}>Επιστρέφονται όλα</button>
            <button type="button" className={GHOST_BUTTON} onClick={() => setCounts({})}>Μηδενισμός</button>
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
            <div className="hidden grid-cols-[minmax(0,1fr)_128px_128px] gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 sm:grid">
              <span>Τεμάχιο</span><span>Πουλήθηκαν</span><span>Επιστράφηκαν</span>
            </div>
            {lines.map((line) => {
              const value = get(line.id);
              const over = value.sold + value.returned > line.pending_quantity;
              return (
                <div key={line.id} className={`grid grid-cols-2 items-center gap-3 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_128px_128px] ${over ? 'bg-rose-50' : ''}`}>
                  <div className="col-span-2 flex min-w-0 items-center gap-3 sm:col-span-1">
                    <ConsignmentSkuThumb product={ctl.productBySku.get(line.product_sku)} sku={line.product_sku} quantity={line.pending_quantity} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black"><SkuColorizedText sku={line.product_sku} suffix={line.variant_suffix || ''} gender={ctl.productBySku.get(line.product_sku)?.gender} /></div>
                      <div className="text-[11px] text-slate-500">{formatGreekNumber(line.pending_quantity)} στον πελάτη · {formatGreekMoney(consignmentUnitPrice(line))}/τεμ.{line.offer_line_total != null ? ' (προσφορά)' : ''}{line.size_info ? ` · ${line.size_info}` : ''}</div>
                    </div>
                  </div>
                  <MiniStepper tone="emerald" value={value.sold} max={line.pending_quantity - value.returned} onChange={(sold) => set(line.id, { sold })} />
                  <MiniStepper tone="amber" value={value.returned} max={line.pending_quantity - value.sold} onChange={(returned) => set(line.id, { returned })} />
                </div>
              );
            })}
          </div>
          <input className={SERVICE_INPUT} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Σημείωση για τις επιστροφές (προαιρετικά)" />
          <p className="text-[11px] text-slate-400">Οι πωλήσεις δημιουργούν οφειλή στη συμφωνημένη τιμή. Για διαφορετική τιμή χρησιμοποιήστε «Πώληση» στη γραμμή.</p>
        </div>
      )}
    </ServiceModal>
  );
}
