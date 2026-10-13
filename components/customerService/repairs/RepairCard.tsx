import React from 'react';
import { CheckCircle2, Factory, PackageCheck, PlayCircle, RotateCcw, Wrench } from 'lucide-react';
import type { RepairItem } from '../../../types';
import { daysSince, formatGreekMoney, formatGreekNumber, nextRepairAction, repairOutstanding, type RepairNextAction } from '../../../features/customerService';
import SkuColorizedText from '../../SkuColorizedText';
import RepairStageBadge from '../RepairStageBadge';
import ConsignmentSkuThumb from '../ConsignmentSkuThumb';
import type { ServiceController } from '../useServiceController';
import { StatusPill } from '../shared/serviceUi';

export const REPAIR_ACTION_META: Record<Exclude<RepairNextAction, null>, { label: string; icon: React.ReactNode; className: string; staffOnly?: boolean }> = {
  'send-to-production': { label: 'Στείλε στην Παραγωγή', icon: <Factory size={14} />, className: 'bg-[#060b00] text-white hover:bg-slate-800', staffOnly: true },
  'open-production': { label: 'Τελείωσε η Παραγωγή', icon: <CheckCircle2 size={14} />, className: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50', staffOnly: true },
  quality: { label: 'Εγκρίνεται', icon: <CheckCircle2 size={14} />, className: 'bg-emerald-600 text-white hover:bg-emerald-700', staffOnly: true },
  deliver: { label: 'Παράδοση στον πελάτη', icon: <PackageCheck size={14} />, className: 'bg-[#060b00] text-white hover:bg-slate-800' },
  resume: { label: 'Συνέχεια', icon: <PlayCircle size={14} />, className: 'bg-amber-500 text-white hover:bg-amber-600', staffOnly: true },
  rework: { label: 'Νέα επανεπισκευή', icon: <RotateCcw size={14} />, className: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50' },
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

export default function RepairCard({ ctl, item, onOpen, onRework }: { ctl: ServiceController; item: RepairItem; onOpen: () => void; onRework: (item: RepairItem) => void }) {
  const batch = ctl.liveRepairBatch(item);
  const action = repairActionFor(ctl, item);
  const meta = action ? REPAIR_ACTION_META[action] : null;
  const product = item.product_sku ? ctl.productBySku.get(item.product_sku) : undefined;
  const outstanding = repairOutstanding(ctl.chargeByRepairId.get(item.id));
  const days = daysSince(item.received_at || item.created_at);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen(); }}
      className="cursor-pointer rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        {item.product_sku
          ? <ConsignmentSkuThumb product={product} sku={item.product_sku} />
          : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Wrench size={16} /></div>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-900">{ctl.customerName(item.customer_id)}</div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-mono font-bold text-slate-400">{item.code}</span>
            {item.product_sku && <span className="truncate font-black"><SkuColorizedText sku={item.product_sku} suffix={item.variant_suffix || ''} gender={product?.gender} /></span>}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600">{item.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {batch && <RepairStageBadge item={item} batch={batch} />}
        {item.current_cycle_number > 1 && <StatusPill tone="rose">{formatGreekNumber(item.current_cycle_number)}ος κύκλος</StatusPill>}
        {outstanding > 0 && <StatusPill tone="amber">Χρωστά {formatGreekMoney(outstanding)}</StatusPill>}
        {item.is_archived && <StatusPill>Αρχείο</StatusPill>}
        <span className={`ml-auto text-[10px] font-bold ${days > 14 && !['delivered', 'irreparable', 'cancelled'].includes(item.status) ? 'text-rose-500' : 'text-slate-400'}`}>
          {days === 0 ? 'σήμερα' : `${formatGreekNumber(days)} ${days === 1 ? 'ημέρα' : 'ημέρες'}`}
        </span>
      </div>
      {meta && action && (
        <div className="mt-3 flex gap-1.5">
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); runRepairAction(ctl, item, action, onRework); }}
            disabled={ctl.movingRepairId === item.id}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition disabled:opacity-50 ${meta.className}`}
          >
            {meta.icon} {meta.label}
          </button>
          {action === 'quality' && (
            <button type="button" title="Δεν πέρασε — ξανά στην Παραγωγή" aria-label="Δεν πέρασε — ξανά στην Παραγωγή" onClick={(event) => { event.stopPropagation(); ctl.setOperation({ kind: 'quality', item, passed: false }); }} className="rounded-lg px-2.5 text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50">
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
