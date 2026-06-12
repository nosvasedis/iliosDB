import React from 'react';
import { CalendarDays, CheckCircle2, PhoneCall } from 'lucide-react';
import { CalendarDayEvent, EnrichedDeliveryItem } from '../../types';
import { DELIVERY_ACTION_LABELS, DELIVERY_URGENCY_LABELS, formatDeliveryWindow, formatGreekDateTime, getOrderDisplayName } from '../../utils/deliveryLabels';

interface Props {
  items: EnrichedDeliveryItem[];
  onSelectItem: (item: EnrichedDeliveryItem) => void;
  dayEvents?: CalendarDayEvent[];
}

export default function DeliveryAgendaList({ items, onSelectItem, dayEvents = [] }: Props) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 h-full">
      <div className="flex items-center gap-2 text-slate-800 mb-1">
        <CalendarDays size={18} />
        <h3 className="font-black text-sm uppercase tracking-wide">Ατζέντα</h3>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-3">Παραδόσεις για την επιλεγμένη ημέρα</p>

      {dayEvents.length > 0 && (
        <p className="text-[11px] text-slate-400 font-medium mb-3 truncate" title={dayEvents.map((e) => e.title).join(', ')}>
          Γιορτή: {dayEvents.map((e) => e.title).join(', ')}
        </p>
      )}

      <div className="space-y-3 max-h-[42rem] overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 font-medium">
            Δεν βρέθηκαν προγραμματισμένες παραδόσεις για τα τρέχοντα φίλτρα.
          </div>
        )}
        {items.map((item) => (
          <button
            key={item.plan.id}
            onClick={() => onSelectItem(item)}
            className="w-full text-left rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 transition-all p-4"
          >
            <div className="flex justify-between gap-3">
              <div>
                <div className="font-black text-slate-900">{getOrderDisplayName(item.order)}</div>
                <div className="text-xs font-bold text-slate-500 mt-1">{formatDeliveryWindow(item.plan)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{DELIVERY_URGENCY_LABELS[item.urgency]}</div>
                {item.shipment_readiness && item.shipment_readiness.total_batches > 0 && (
                  <div className="mt-1 inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${
                      item.shipment_readiness.is_fully_ready ? 'bg-emerald-500' : item.shipment_readiness.is_partially_ready ? 'bg-amber-500' : 'bg-red-400'
                    }`} />
                    <span className="text-[10px] font-black text-slate-500">
                      {item.shipment_readiness.is_fully_ready
                        ? <CheckCircle2 size={12} className="text-emerald-600 inline" />
                        : `${item.shipment_readiness.ready_qty}/${item.shipment_readiness.total_qty} τεμ.`
                      }
                    </span>
                  </div>
                )}
                {item.next_reminder && (
                  <div className="text-[11px] font-bold text-slate-500 mt-1">{formatGreekDateTime(item.next_reminder.trigger_at)}</div>
                )}
              </div>
            </div>
            {item.next_reminder && (
              <div className="mt-2 text-xs text-slate-600 font-medium">
                {DELIVERY_ACTION_LABELS[item.next_reminder.action_type]}
              </div>
            )}
            {item.needs_call && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <PhoneCall size={12} /> Χρειάζεται κλήση
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
