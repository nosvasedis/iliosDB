import React from 'react';
import { Check, CheckCircle2, ChevronRight, Factory, PackageCheck, PlayCircle, RotateCcw, Wrench } from 'lucide-react';
import type { RepairItem } from '../../../types';
import { daysSince, formatGreekMoney, formatGreekNumber, isRepairClosed, nextRepairAction, repairOutstanding, type RepairNextAction } from '../../../features/customerService';
import SkuColorizedText from '../../SkuColorizedText';
import RepairStageBadge from '../RepairStageBadge';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ServiceController } from '../useServiceController';

export const REPAIR_ACTION_META: Record<Exclude<RepairNextAction, null>, { label: string; icon: React.ReactNode; staffOnly?: boolean; onCard: boolean }> = {
  'send-to-production': { label: 'Στείλε στην Παραγωγή', icon: <Factory size={15} />, staffOnly: true, onCard: true },
  // Τα στάδια αλλάζουν από τη ράγα Παραγωγής· το κουμπί αυτό είναι συντόμευση μόνο μέσα στο πάνελ.
  'open-production': { label: 'Ολοκληρώθηκε η Παραγωγή', icon: <CheckCircle2 size={15} />, staffOnly: true, onCard: false },
  quality: { label: 'Εγκρίνεται', icon: <Check size={15} />, staffOnly: true, onCard: true },
  deliver: { label: 'Παράδοση στον πελάτη', icon: <PackageCheck size={15} />, onCard: true },
  resume: { label: 'Συνέχεια εργασίας', icon: <PlayCircle size={15} />, staffOnly: true, onCard: true },
  rework: { label: 'Νέα επανεπισκευή', icon: <RotateCcw size={15} />, onCard: false },
};

export function runRepairAction(ctl: ServiceController, item: RepairItem, action: RepairNextAction, onRework: (item: RepairItem) => void) {
  switch (action) {
    case 'send-to-production': void ctl.returnRepairToProduction(item); break;
    case 'open-production': void ctl.completeRepairReady(item); break;
    case 'quality': ctl.setOperation({ kind: 'quality', item, passed: true }); break;
    case 'deliver': ctl.setOperation({ kind: 'deliver', item }); break;
    case 'resume': ctl.toggleRepairHold(item); break;
    case 'rework': onRework(item); break;
    default: break;
  }
}

export function repairActionFor(ctl: ServiceController, item: RepairItem): RepairNextAction {
  const batch = ctl.liveRepairBatch(item);
  const action = nextRepairAction(item, !!batch, !!batch?.on_hold);
  if (!action) return null;
  if (REPAIR_ACTION_META[action].staffOnly && ctl.isSeller) return null;
  return action;
}

const CARD_ACTION = 'flex h-8 items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50';

export default function RepairCard({ ctl, item, onOpen, onRework }: { ctl: ServiceController; item: RepairItem; onOpen: () => void; onRework: (item: RepairItem) => void }) {
  const batch = ctl.liveRepairBatch(item);
  const action = repairActionFor(ctl, item);
  const meta = action && REPAIR_ACTION_META[action].onCard ? REPAIR_ACTION_META[action] : null;
  const product = item.product_sku ? ctl.productBySku.get(item.product_sku) : undefined;
  const outstanding = repairOutstanding(ctl.chargeByRepairId.get(item.id));
  const days = daysSince(item.received_at || item.created_at);
  const waitingLong = days > 14 && !isRepairClosed(item);
  const busy = ctl.movingRepairId === item.id;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className="cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
    >
      <div className="flex items-start gap-2.5">
        {item.product_sku
          ? <ConsignmentSkuThumb product={product} sku={item.product_sku} />
          : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400"><Wrench size={16} /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 truncate text-sm font-bold text-slate-900">{ctl.customerName(item.customer_id)}</div>
            <div className="shrink-0 font-mono text-[10px] text-slate-400">{item.code}</div>
          </div>
          {item.product_sku && <div className="truncate text-[11px] font-bold"><SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} /></div>}
        </div>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{item.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        {batch && <RepairStageBadge item={item} batch={batch} />}
        {item.current_cycle_number > 1 && <span className="font-bold text-rose-600">{formatGreekNumber(item.current_cycle_number)}ος κύκλος</span>}
        {outstanding > 0 && <span className="font-bold text-amber-700">χρωστά {formatGreekMoney(outstanding)}</span>}
        <span className={`ml-auto tabular-nums ${waitingLong ? 'font-bold text-rose-600' : 'text-slate-400'}`}>
          {days === 0 ? 'σήμερα' : `${formatGreekNumber(days)} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}
        </span>
      </div>

      {meta && action && (
        <div className="mt-3 flex gap-1.5">
          <button type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); runRepairAction(ctl, item, action, onRework); }} className={`${CARD_ACTION} flex-1 justify-between`}>
            <span className="flex items-center gap-1.5">{meta.icon} {meta.label}</span>
            <ChevronRight size={14} className="text-slate-400" />
          </button>
          {action === 'quality' && (
            <button type="button" title="Δεν πέρασε τον έλεγχο — ξανά στην Παραγωγή" aria-label="Δεν πέρασε τον έλεγχο — ξανά στην Παραγωγή" onClick={(event) => { event.stopPropagation(); ctl.setOperation({ kind: 'quality', item, passed: false }); }} className={CARD_ACTION}>
              <RotateCcw size={14} /> Ξανά
            </button>
          )}
        </div>
      )}
    </article>
  );
}
