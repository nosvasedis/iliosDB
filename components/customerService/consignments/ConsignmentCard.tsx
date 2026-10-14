import React from 'react';
import { ArrowRightLeft, ChevronRight, ClipboardCheck, PackageCheck, Wallet } from 'lucide-react';
import { formatGreekDateOnly, formatGreekMoney, formatGreekNumber, nextConsignmentAction, type ConsignmentNextAction } from '../../../features/customerService';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ConsignmentBundle, ServiceController } from '../useServiceController';

export const CONSIGNMENT_ACTION_META: Record<Exclude<ConsignmentNextAction, null>, { label: string; icon: React.ReactNode }> = {
  handoff: { label: 'Παράδοση στον πελάτη', icon: <PackageCheck size={15} /> },
  settle: { label: 'Απολογισμός', icon: <ClipboardCheck size={15} /> },
  collect: { label: 'Είσπραξη', icon: <Wallet size={15} /> },
  'route-return': { label: 'Τακτοποίηση επιστροφής', icon: <ArrowRightLeft size={15} /> },
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
  const isOpen = ['active', 'partially_settled'].includes(entry.status);
  const notHandedOff = entry.status === 'pending_handoff' || entry.status === 'draft';
  const totalPieces = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className="cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-bold text-slate-900">{ctl.customerName(entry.customer_id)}</div>
        <div className="shrink-0 font-mono text-[10px] text-slate-400">{entry.code}</div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {shown.map((line) => <ConsignmentSkuThumb key={line.id} product={ctl.productBySku.get(line.product_sku)} sku={line.product_sku} quantity={isOpen ? line.pending_quantity : line.quantity} />)}
        {lines.length > shown.length && <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[11px] font-bold text-slate-400">+{lines.length - shown.length}</div>}
      </div>

      <div className="mt-2.5 space-y-0.5 text-xs">
        <div className="text-slate-600">
          {notHandedOff
            ? <>{formatGreekNumber(totalPieces)} τεμ. προς παράδοση</>
            : summary.pending > 0
              ? <><span className="font-bold text-slate-800">{formatGreekNumber(summary.pending)} τεμ.</span> · {formatGreekMoney(summary.value)}</>
              : <span className="text-slate-400">Κανένα τεμάχιο στον πελάτη</span>}
        </div>
        {summary.due > 0 && <div className="font-bold text-rose-600">Οφείλει {formatGreekMoney(summary.due)}</div>}
        {isOpen && summary.pending > 0 && (
          <div className={summary.overdue ? 'font-bold text-rose-600' : summary.dueSoon ? 'text-amber-700' : 'text-slate-400'}>
            {summary.overdue ? 'Εκπρόθεσμος επανέλεγχος' : 'Επανέλεγχος'} {formatGreekDateOnly(entry.review_due_at)}
          </div>
        )}
      </div>

      {meta && action && (
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); if (!runConsignmentAction(ctl, bundle, action)) onOpen(); }}
          className="mt-3 flex h-8 w-full items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <span className="flex items-center gap-1.5">{meta.icon} {meta.label}</span>
          <ChevronRight size={14} className="text-slate-400" />
        </button>
      )}
    </article>
  );
}
