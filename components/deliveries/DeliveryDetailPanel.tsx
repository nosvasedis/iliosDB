import React from 'react';
import { BellRing, CalendarRange, CheckCircle2, ClipboardList, ExternalLink, Flame, Gem, Gift, Globe, Hammer, ImageIcon, Layers, Loader2, Package, PackageCheck, Phone, PhoneCall, RotateCcw, Send, Tag, Trash2, Truck, History } from 'lucide-react';
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
        {b.cord_color && <span className="text-[10px] font-bold text-amber-700 mt-0.5 block">Κορδόνι: {getProductOptionColorLabel(b.cord_color)}</span>}
        {b.enamel_color && <span className="text-[10px] font-bold text-rose-700 mt-0.5 block">Σμάλτο: {getProductOptionColorLabel(b.enamel_color)}</span>}
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

export default function DeliveryDetailPanel({ item, onEditPlan, onOpenOrder, onMarkDelivered, onDeletePlan, onAcknowledgeReminder, onCompleteReminder, onSnoozeReminder, onShipReady, onRevertShipment, loadingReminders }: Props) {
  if (!item) {
    return (
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-sm font-medium text-slate-500">
        Επιλέξτε μια καταχώρηση για να δείτε λεπτομέρειες παράδοσης, ειδοποιήσεις, ονομαστικές εορτές και ενέργειες επικοινωνίας.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-slate-400">Παραγγελία #{item.order.id.slice(-6)}</div>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{getOrderDisplayName(item.order)}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {DELIVERY_STATUS_LABELS[item.plan.plan_status]}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Κατάσταση: {ORDER_STATUS_LABELS[item.order.status as OrderStatus] ?? item.order.status}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
              {DELIVERY_URGENCY_LABELS[item.urgency]}
            </span>
          </div>
        </div>
        {item.phone && (
          <a href={`tel:${item.phone}`} className="shrink-0 inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-sm">
            <Phone size={16} /> Κλήση
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-2"><CalendarRange size={14} /> Στόχος</div>
          <div className="mt-2 font-bold text-slate-800">{formatDeliveryWindow(item.plan)}</div>
        </div>
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-2"><Phone size={14} /> Επικοινωνία</div>
          <div className="mt-2 font-bold text-slate-800">{item.phone || 'Δεν υπάρχει διαθέσιμο τηλέφωνο'}</div>
        </div>
      </div>

      {item.next_nameday && (
        <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4">
          <div className="text-[11px] font-black uppercase tracking-wide text-sky-700 flex items-center gap-2"><Gift size={14} /> Ονομαστική Εορτή</div>
          <div className="mt-2 font-bold text-slate-800">{item.next_nameday.label}</div>
          <div className="mt-1 text-sm font-medium text-slate-600">
            {item.next_nameday.is_today
              ? 'Γιορτάζει σήμερα'
              : `Επόμενη εορτή: ${formatGreekDate(item.next_nameday.date)} (${item.next_nameday.days_until} ημέρες)`}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 space-y-4">
        <div>
          <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-2"><PhoneCall size={14} /> Γιατί χρειάζεται επικοινωνία</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.call_reasons.length > 0 ? item.call_reasons.map((reason) => (
              <span key={reason} className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700">{reason}</span>
            )) : <span className="text-sm text-slate-500 font-medium">Δεν υπάρχουν ειδικοί λόγοι επικοινωνίας.</span>}
          </div>
        </div>
        {item.is_ready && (
          <div className="pt-3 border-t border-slate-200">
            <div className="text-xs font-bold text-emerald-700 flex items-center gap-2"><Package size={14} /> Κατάσταση παραγγελίας</div>
            <p className="mt-1 text-sm font-medium text-slate-700">Η παραγγελία είναι πλήρως έτοιμη· μπορείτε να οργανώσετε την αποστολή/παράδοση.</p>
          </div>
        )}
        {item.shipment_readiness && item.shipment_readiness.total_batches > 0 && !item.shipment_readiness.is_fully_ready && (
          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide text-slate-500 flex items-center gap-2"><Package size={14} /> Πρόοδος Παραγωγής</div>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      item.shipment_readiness.is_fully_ready ? 'bg-emerald-500' : item.shipment_readiness.is_partially_ready ? 'bg-amber-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.round(item.shipment_readiness.ready_fraction * 100)}%` }}
                  />
                </div>
                <span className="text-sm font-black text-slate-700 whitespace-nowrap">
                  {item.shipment_readiness.ready_qty}/{item.shipment_readiness.total_qty} τεμ. έτοιμα
                </span>
              </div>
            </div>
            {item.shipment_readiness.shipments.length > 1 ? (
              item.shipment_readiness.shipments.map((shipment) => (
                <div key={shipment.time_key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      <Send size={14} className="text-slate-400 shrink-0" />
                      <span className="text-xs font-black text-slate-700">Αποστολή {shipment.shipment_index}</span>
                      <span className="text-[10px] font-medium text-slate-500 truncate">{formatGreekDateTime(shipment.time_key)}</span>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-lg border shrink-0 ${
                      shipment.is_ready
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {shipment.ready_qty}/{shipment.total_qty} τεμ. έτοιμα
                    </span>
                  </div>
                  <div className="p-3">
                    {shipment.is_ready ? (
                      <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                        <CheckCircle2 size={14} /> Όλα τα τμήματα αυτής της αποστολής είναι έτοιμα
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {shipment.not_ready_batches.map((b, idx) => (
                          <BatchCard key={`${shipment.time_key}-${b.sku}-${b.variant_suffix ?? ''}-${idx}`} b={b} idx={idx} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div>
                <div className="text-[11px] font-black uppercase tracking-wide text-amber-700 flex items-center gap-2 mb-2"><Package size={14} /> Τι δεν είναι ακόμη έτοιμο</div>
                <ul className="space-y-3">
                  {item.shipment_readiness.shipments[0]?.not_ready_batches?.map((b, idx) => (
                    <BatchCard key={`${b.sku}-${b.variant_suffix ?? ''}-${idx}`} b={b} idx={idx} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {item.shipment_history && item.shipment_history.length > 0 && (() => {
        const maxShipmentNumber = Math.max(...item.shipment_history.map((s) => s.shipment_number));
        return (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4 space-y-3">
            <div className="text-[11px] font-black uppercase tracking-wide text-indigo-700 flex items-center gap-2"><History size={14} /> Ιστορικό Αποστολών</div>
            {item.shipment_history.map((shipment) => (
              <div key={shipment.id} className="rounded-xl bg-white border border-indigo-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Truck size={14} className="text-indigo-500 shrink-0" />
                    <span className="text-sm font-black text-slate-800">Αποστολή #{shipment.shipment_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500">{formatGreekDateTime(shipment.shipped_at)}</span>
                    {onRevertShipment && shipment.shipment_number === maxShipmentNumber && (
                      <button
                        onClick={() => onRevertShipment(shipment, item)}
                        title="Αναίρεση αυτής της αποστολής"
                        className="p-1.5 rounded-lg bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {shipment.notes && <p className="mt-1.5 text-xs text-slate-500 font-medium">{shipment.notes}</p>}
                <div className="mt-1.5 text-[10px] text-slate-400 font-medium">Από: {shipment.shipped_by}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {(item.order.notes || item.customer?.notes) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-amber-700 flex items-center gap-2"><ClipboardList size={14} /> Σημειώσεις</div>
          {item.order.notes && <p className="text-sm font-medium text-slate-700">{item.order.notes}</p>}
          {item.customer?.notes && <p className="text-sm font-medium text-slate-700">{item.customer.notes}</p>}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-800 mb-1">
          <BellRing size={16} />
          <div className="font-black text-sm uppercase tracking-wide">Ενέργειες πλάνου</div>
        </div>
        <p className="text-xs text-slate-500 font-medium mb-3">Οι προγραμματισμένες ενέργειες για αυτή την παράδοση</p>
        {item.reminders.map((reminder) => (
          <div key={reminder.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-slate-800">{DELIVERY_ACTION_LABELS[reminder.action_type]}</div>
                <div className="text-xs font-bold text-slate-500 mt-1">{formatGreekDateTime(reminder.trigger_at)}</div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{getReminderStateLabel(reminder)}</div>
            </div>
            <p className="mt-2 text-sm text-slate-600 font-medium">{reminder.reason || (isCallReminder(reminder.action_type) ? 'Καλέστε τον πελάτη για επιβεβαίωση ετοιμότητας και οργάνωση παράδοσης.' : 'Ελέγξτε την πρόοδο της παραγγελίας.')}</p>
            {!reminder.completed_at && (
              <div className="mt-3 flex flex-wrap gap-2 items-center">
                {isCallReminder(reminder.action_type) && item.phone && (
                  <a href={`tel:${item.phone}`} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                    <Phone size={14} /> Κλήση πελάτη
                  </a>
                )}
                <button onClick={() => onSnoozeReminder(reminder)} disabled={loadingReminders.has(reminder.id)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 disabled:opacity-50">Αναβολή</button>
                <button onClick={() => onCompleteReminder(reminder)} disabled={loadingReminders.has(reminder.id)} className="px-3 py-2 rounded-xl text-xs font-bold bg-[#060b00] text-white disabled:opacity-50 flex items-center gap-1.5">
                  {loadingReminders.has(reminder.id) ? <Loader2 size={14} className="animate-spin" /> : null} Ολοκλήρωσα
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => onEditPlan(item)} className="px-4 py-3 rounded-2xl bg-[#060b00] text-white font-bold text-sm">Επεξεργασία πλάνου</button>
        {onShipReady && item.shipment_readiness && (item.shipment_readiness.is_partially_ready || item.shipment_readiness.is_fully_ready) && (
          <button onClick={() => onShipReady(item)} className="px-4 py-3 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 font-bold text-sm flex items-center gap-2">
            <Truck size={16} /> Αποστολή Ετοίμων
          </button>
        )}
        <button onClick={() => onMarkDelivered(item)} className="px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-sm flex items-center gap-2">
          <CheckCircle2 size={16} /> Σήμανση ως παραδομένη
        </button>
        <button onClick={() => onOpenOrder(item)} className="px-4 py-3 rounded-2xl bg-white text-slate-700 border border-slate-200 font-bold text-sm flex items-center gap-2">
          <ExternalLink size={16} /> Άνοιγμα παραγγελίας
        </button>
        <button onClick={() => onDeletePlan(item)} className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 border border-red-100 font-bold text-sm flex items-center gap-2">
          <Trash2 size={16} /> Διαγραφή πλάνου
        </button>
      </div>
    </div>
  );
}
