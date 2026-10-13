import React from 'react';
import { AlertTriangle, ArrowRightLeft, CalendarClock, ClipboardCheck, PackageCheck, Wallet } from 'lucide-react';
import { formatGreekDateOnly, formatGreekMoney, formatGreekNumber, nextConsignmentAction, type ConsignmentNextAction } from '../../../features/customerService';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ConsignmentBundle, ServiceController } from '../useServiceController';
import { StatusPill } from '../shared/serviceUi';

export const CONSIGNMENT_ACTION_META: Record<Exclude<ConsignmentNextAction, null>, { label: string; icon: React.ReactNode; className: string }> = {
  handoff: { label: 'Παράδοση', icon: <PackageCheck size={14} />, className: 'bg-[#060b00] text-white hover:bg-slate-800' },
  settle: { label: 'Απολογισμός', icon: <ClipboardCheck size={14} />, className: 'bg-indigo-600 text-white hover:bg-indigo-700' },
  collect: { label: 'Είσπραξη', icon: <Wallet size={14} />, className: 'bg-emerald-600 text-white hover:bg-emerald-700' },
  'route-return': { label: 'Τακτοποίηση επιστροφής', icon: <ArrowRightLeft size={14} />, className: 'bg-amber-500 text-white hover:bg-amber-600' },
};

/** Εκτελεί την κύρια ενέργεια μιας Παρακαταθήκης. Επιστρέφει false όταν χρειάζεται το πάνελ λεπτομερειών. */
export function runConsignmentAction(ctl: ServiceController, bundle: ConsignmentBundle, action: ConsignmentNextAction): boolean {
  if (action === 'handoff') { void ctl.handoffConsignment(bundle.entry); return true; }
  if (action === 'settle') { ctl.setOperation({ kind: 'settle', entry: bundle.entry }); return true; }
  if (action === 'route-return') {
    const pending = bundle.returns.find((item) => item.status === 'inspection');
    if (pending) { ctl.setOperation({ kind: 'route-return', item: pending }); return true; }
  }
  if (action === 'collect') {
    const open = bundle.settlements.filter((item) => item.status !== 'reversed' && item.status !== 'paid');
    if (open.length === 1) { ctl.setOperation({ kind: 'payment', settlement: open[0] }); return true; }
  }
  return false;
}

export default function ConsignmentCard({ ctl, bundle, onOpen }: { ctl: ServiceController; bundle: ConsignmentBundle; onOpen: () => void }) {
  const { entry, lines, summary } = bundle;
  const action = nextConsignmentAction(entry, summary);
  const meta = action ? CONSIGNMENT_ACTION_META[action] : null;
  const shown = lines.slice(0, 4);
  const totalPieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  const isOpen = ['active', 'partially_settled'].includes(entry.status);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className={`group cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${summary.overdue ? 'border-rose-200' : 'border-slate-200/80'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-slate-900">{ctl.customerName(entry.customer_id)}</div>
          <div className="font-mono text-[11px] font-bold text-slate-400">{entry.code}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {summary.overdue && <StatusPill tone="rose" icon={<AlertTriangle size={10} />}>Εκπρόθεσμη</StatusPill>}
          {!summary.overdue && summary.dueSoon && <StatusPill tone="amber">Σύντομα</StatusPill>}
          {entry.status === 'cancelled' && <StatusPill>Ακυρωμένη</StatusPill>}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {shown.map((line) => <ConsignmentSkuThumb key={line.id} product={ctl.productBySku.get(line.product_sku)} sku={line.product_sku} quantity={isOpen ? line.pending_quantity : line.quantity} />)}
        {lines.length > shown.length && <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-black text-slate-500">+{lines.length - shown.length}</div>}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {entry.status === 'pending_handoff' || entry.status === 'draft'
          ? <span className="font-bold text-slate-600">{formatGreekNumber(totalPieces)} τεμ. έτοιμα για παράδοση</span>
          : summary.pending > 0
            ? <span className="font-bold text-slate-600">{formatGreekNumber(summary.pending)} τεμ. · {formatGreekMoney(summary.value)}</span>
            : <span className="font-bold text-slate-400">Κανένα τεμάχιο στον πελάτη</span>}
        {summary.due > 0 && <span className="font-black text-rose-600">Οφείλει {formatGreekMoney(summary.due)}</span>}
      </div>
      {isOpen && summary.pending > 0 && (
        <div className={`mt-1 flex items-center gap-1 text-[10px] font-bold ${summary.overdue ? 'text-rose-600' : 'text-slate-400'}`}>
          <CalendarClock size={11} /> Επανέλεγχος {formatGreekDateOnly(entry.review_due_at)}
        </div>
      )}

      {meta && action && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); if (!runConsignmentAction(ctl, bundle, action)) onOpen(); }}
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition ${meta.className}`}
        >
          {meta.icon} {meta.label}
        </button>
      )}
    </article>
  );
}
