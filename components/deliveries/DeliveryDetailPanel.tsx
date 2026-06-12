import React, { useState } from 'react';
import { ArrowRightLeft, BellRing, CalendarRange, CheckCircle2, ChevronDown, ClipboardList, ExternalLink, Flame, Gem, Gift, Globe, Hammer, ImageIcon, Layers, Loader2, Package, Phone, PhoneCall, RotateCcw, Send, Tag, Trash2, Truck, History } from 'lucide-react';
import { EnrichedDeliveryItem, OrderDeliveryReminder, OrderShipment, OrderStatus, ProductionStage, ShipmentGroup } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import {
  DELIVERY_ACTION_LABELS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_URGENCY_LABELS,
  DELIVERY_SKU_FINISH_TEXT,
  DELIVERY_SKU_STONE_TEXT,
  DELIVERY_SKU_CONTAINER,
  formatDeliveryWindow,
  formatGreekDate,
  formatGreekDateTime,
  getOrderDisplayName,
  getProductionStageLabel,
  getReminderStateLabel,
  ORDER_STATUS_LABELS,
  PRODUCTION_STAGE_COLORS
} from '../../utils/deliveryLabels';
import { getProductOptionColorLabel } from '../../utils/xrOptions';
import { getOrderTransferIndicators } from '../../utils/transferIndicators';

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
  [ProductionStage.AwaitingDelivery]: <Globe size={14} />,
  [ProductionStage.Waxing]: <Package size={14} />,
  [ProductionStage.Casting]: <Flame size={14} />,
  [ProductionStage.Setting]: <Gem size={14} />,
  [ProductionStage.Polishing]: <Hammer size={14} />,
  [ProductionStage.Assembly]: <Layers size={14} />,
  [ProductionStage.Labeling]: <Tag size={14} />,
  [ProductionStage.Ready]: <CheckCircle2 size={14} />
};

const isCallReminder = (action: OrderDeliveryReminder['action_type']) =>
  action === 'call_client' || action === 'confirm_ready' || action === 'arrange_delivery';

function CollapsibleSection({ title, icon, defaultOpen = false, children }: { title: string; icon: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-slate-100 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-slate-50 text-left">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
          {icon} {title}
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-4 border-t border-slate-100">{children}</div>}
    </div>
  );
}

function BatchCard({ b, idx }: { b: ShipmentGroup['not_ready_batches'][number]; idx: number }) {
  const { finish, stone } = getVariantComponents(b.variant_suffix ?? '', b.gender);
  const containerClass = DELIVERY_SKU_CONTAINER[finish.code] ?? 'bg-slate-50/80 border-slate-100';
  const finishTextClass = DELIVERY_SKU_FINISH_TEXT[finish.code] ?? 'text-slate-400';
  const stoneTextClass = stone.code ? (DELIVERY_SKU_STONE_TEXT[stone.code] ?? 'text-emerald-500') : '';
  const stageColors = PRODUCTION_STAGE_COLORS[b.current_stage] ?? { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
  const StageIcon = STAGE_ICONS[b.current_stage];
  return (
    <li key={`${b.sku}-${b.variant_suffix ?? ''}-${idx}`} className="flex items-center gap-3 rounded-xl bg-white border border-amber-100 p-3">
      <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
        {b.product_image ? (
          <img src={b.product_image} alt={b.sku} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={24} className="text-slate-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`inline-flex items-center gap-0.5 flex-wrap px-2 py-0.5 rounded-md border ${containerClass}`}>
          <span className="font-black text-sm leading-none text-slate-800">{b.sku}</span>
          {finish.code && <span className={`font-black text-sm leading-none ${finishTextClass}`}>{finish.code}</span>}
          {stone.code && <span className={`font-black text-sm leading-none ${stoneTextClass}`}>{stone.code}</span>}
        </div>
        {b.size_info && <span className="text-[10px] font-bold text-slate-500 mt-0.5 block">({b.size_info})</span>}
        <div className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border ${stageColors.bg} ${stageColors.text} ${stageColors.border} text-xs font-bold`}>
          {StageIcon}
          {getProductionStageLabel(b.current_stage)}
        </div>
      </div>
    </li>
  );
}

interface Props {
  item?: EnrichedDeliveryItem | null;
  onEditPlan: (item: EnrichedDeliveryItem) => void;
  onOpenOrder: (item: EnrichedDeliveryItem) => void;
  onMarkDelivered: (item: EnrichedDeliveryItem) => void;
  onDeletePlan: (item: EnrichedDeliveryItem) => void;
  onAcknowledgeReminder: (reminder: OrderDeliveryReminder) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
  onShipReady?: (item: EnrichedDeliveryItem) => void;
  onRevertShipment?: (shipment: OrderShipment, item: EnrichedDeliveryItem) => void;
  loadingReminders: Set<string>;
}

export default function DeliveryDetailPanel({ item, onEditPlan, onOpenOrder, onMarkDelivered, onDeletePlan, onCompleteReminder, onSnoozeReminder, onShipReady, onRevertShipment, loadingReminders }: Props) {
  if (!item) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-sm font-medium text-slate-500">
        Επιλέξτε μια παράδοση για λεπτομέρειες και ενέργειες.
      </div>
    );
  }

  const transferIndicators = getOrderTransferIndicators(item.order.notes);
  const pendingReminder = item.next_reminder && !item.next_reminder.completed_at ? item.next_reminder : null;
  const hasProduction = item.shipment_readiness && item.shipment_readiness.total_batches > 0 && !item.shipment_readiness.is_fully_ready;
  const hasShipmentHistory = item.shipment_history && item.shipment_history.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Παραγγελία #{item.order.id.slice(-6)}</div>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{getOrderDisplayName(item.order)}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
              {DELIVERY_URGENCY_LABELS[item.urgency]}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {DELIVERY_STATUS_LABELS[item.plan.plan_status]} · {ORDER_STATUS_LABELS[item.order.status as OrderStatus] ?? item.order.status}
            </span>
            {transferIndicators.map((indicator) => (
              <span key={indicator.detail} title={indicator.detail} className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100 inline-flex items-center gap-1">
                <ArrowRightLeft size={11} /> {indicator.label}
              </span>
            ))}
          </div>
        </div>
        {item.phone && (
          <a href={`tel:${item.phone}`} className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-sm">
            <Phone size={16} /> Κλήση
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-2"><CalendarRange size={14} /> Στόχος παράδοσης</div>
          <div className="mt-2 font-bold text-slate-800">{formatDeliveryWindow(item.plan)}</div>
        </div>
      </div>

      {pendingReminder && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-slate-800">{DELIVERY_ACTION_LABELS[pendingReminder.action_type]}</div>
              <div className="text-xs text-slate-500 mt-0.5">{formatGreekDateTime(pendingReminder.trigger_at)} · {getReminderStateLabel(pendingReminder)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {isCallReminder(pendingReminder.action_type) && item.phone && (
              <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">
                <Phone size={14} /> Κλήση
              </a>
            )}
            <button onClick={() => onSnoozeReminder(pendingReminder)} disabled={loadingReminders.has(pendingReminder.id)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 disabled:opacity-50">Αναβολή</button>
            <button onClick={() => onCompleteReminder(pendingReminder)} disabled={loadingReminders.has(pendingReminder.id)} className="px-3 py-2 rounded-xl text-xs font-bold bg-[#060b00] text-white disabled:opacity-50 flex items-center gap-1">
              {loadingReminders.has(pendingReminder.id) ? <Loader2 size={14} className="animate-spin" /> : null} Ολοκλήρωσα
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => onEditPlan(item)} className="px-4 py-2.5 rounded-2xl bg-[#060b00] text-white font-bold text-sm">Επεξεργασία</button>
        {onShipReady && item.shipment_readiness && (item.shipment_readiness.is_partially_ready || item.shipment_readiness.is_fully_ready) && (
          <button onClick={() => onShipReady(item)} className="px-4 py-2.5 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 font-bold text-sm flex items-center gap-2">
            <Truck size={16} /> Αποστολή
          </button>
        )}
        <button onClick={() => onMarkDelivered(item)} className="px-4 py-2.5 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> Παραδόθηκε
        </button>
        <button onClick={() => onOpenOrder(item)} className="px-4 py-2.5 rounded-2xl bg-white text-slate-700 border border-slate-200 font-bold text-sm flex items-center gap-2">
          <ExternalLink size={16} /> Παραγγελία
        </button>
        <button onClick={() => onDeletePlan(item)} className="px-4 py-2.5 rounded-2xl bg-red-50 text-red-700 border border-red-100 font-bold text-sm flex items-center gap-2">
          <Trash2 size={16} /> Διαγραφή
        </button>
      </div>

      {item.next_nameday && (
        <CollapsibleSection title="Ονομαστική εορτή" icon={<Gift size={14} />}>
          <p className="text-sm font-medium text-slate-700">
            {item.next_nameday.label} — {item.next_nameday.is_today ? 'σήμερα' : formatGreekDate(item.next_nameday.date)}
          </p>
        </CollapsibleSection>
      )}

      {item.call_reasons.length > 0 && (
        <CollapsibleSection title="Λόγοι επικοινωνίας" icon={<PhoneCall size={14} />}>
          <div className="flex flex-wrap gap-2">
            {item.call_reasons.map((reason) => (
              <span key={reason} className="text-xs font-bold px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700">{reason}</span>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {hasProduction && (
        <CollapsibleSection title="Πρόοδος παραγωγής" icon={<Package size={14} />}>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.shipment_readiness!.is_partially_ready ? 'bg-amber-500' : 'bg-red-400'}`}
                  style={{ width: `${Math.round(item.shipment_readiness!.ready_fraction * 100)}%` }}
                />
              </div>
              <span className="text-sm font-black text-slate-700 whitespace-nowrap">
                {item.shipment_readiness!.ready_qty}/{item.shipment_readiness!.total_qty} τεμ.
              </span>
            </div>
            <ul className="space-y-2">
              {item.shipment_readiness!.shipments.flatMap((s) => s.not_ready_batches).map((b, idx) => (
                <BatchCard key={`${b.sku}-${idx}`} b={b} idx={idx} />
              ))}
            </ul>
          </div>
        </CollapsibleSection>
      )}

      {hasShipmentHistory && (() => {
        const maxShipmentNumber = Math.max(...item.shipment_history!.map((s) => s.shipment_number));
        return (
          <CollapsibleSection title="Ιστορικό αποστολών" icon={<History size={14} />}>
            <div className="space-y-2">
              {item.shipment_history!.map((shipment) => (
                <div key={shipment.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <Truck size={14} /> #{shipment.shipment_number}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-500">{formatGreekDateTime(shipment.shipped_at)}</span>
                      {onRevertShipment && shipment.shipment_number === maxShipmentNumber && (
                        <button onClick={() => onRevertShipment(shipment, item)} className="p-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600">
                          <RotateCcw size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {shipment.notes && <p className="mt-1 text-xs text-slate-500">{shipment.notes}</p>}
                </div>
              ))}
            </div>
          </CollapsibleSection>
        );
      })()}

      {item.reminders.length > 1 && (
        <CollapsibleSection title="Όλες οι υπενθυμίσεις" icon={<BellRing size={14} />}>
          <div className="space-y-2">
            {item.reminders.map((reminder) => (
              <div key={reminder.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="font-bold text-slate-800">{DELIVERY_ACTION_LABELS[reminder.action_type]}</div>
                <div className="text-xs text-slate-500 mt-0.5">{formatGreekDateTime(reminder.trigger_at)} · {getReminderStateLabel(reminder)}</div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {(item.order.notes || item.customer?.notes) && (
        <CollapsibleSection title="Σημειώσεις" icon={<ClipboardList size={14} />}>
          {item.order.notes && <p className="text-sm font-medium text-slate-700">{item.order.notes}</p>}
          {item.customer?.notes && <p className="text-sm font-medium text-slate-700 mt-2">{item.customer.notes}</p>}
        </CollapsibleSection>
      )}
    </div>
  );
}
