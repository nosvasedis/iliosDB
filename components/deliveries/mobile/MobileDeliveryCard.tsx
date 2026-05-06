import React from 'react';
import { ArrowRightLeft, CalendarRange, CheckCircle2, Gift, PhoneCall } from 'lucide-react';
import { EnrichedDeliveryItem } from '../../../types';
import { DELIVERY_URGENCY_LABELS, formatDeliveryWindow, formatGreekDate, formatGreekDateTime, getOrderDisplayName } from '../../../utils/deliveryLabels';
import { getOrderTransferIndicators } from '../../../utils/transferIndicators';

interface Props {
  item: EnrichedDeliveryItem;
  onClick: () => void;
}

export default function MobileDeliveryCard({ item, onClick }: Props) {
  const transferIndicators = getOrderTransferIndicators(item.order.notes);

  return (
    <button onClick={onClick} className="w-full text-left rounded-3xl border border-slate-100 bg-white shadow-sm p-4 active:scale-[0.99] transition-all">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="font-black text-slate-900 truncate">{getOrderDisplayName(item.order)}</div>
          <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1.5">
            <CalendarRange size={12} /> {formatDeliveryWindow(item.plan)}
          </div>
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
          {item.next_reminder && <div className="text-[11px] font-bold text-slate-500 mt-1">{formatGreekDateTime(item.next_reminder.trigger_at)}</div>}
        </div>
      </div>

      {item.next_nameday && item.next_nameday.days_until <= 30 && (
        <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-sky-50 border border-sky-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-700">
          <Gift size={12} />
          <span className="truncate">
            {item.next_nameday.is_today ? 'Γιορτάζει σήμερα' : `Γιορτή ${formatGreekDate(item.next_nameday.date)}`}
          </span>
        </div>
      )}

      {transferIndicators[0] && (
        <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full bg-violet-50 border border-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">
          <ArrowRightLeft size={12} />
          <span className="truncate">{transferIndicators[0].label}</span>
        </div>
      )}

      {item.call_reasons[0] && <div className="mt-3 text-sm font-medium text-slate-600">{item.call_reasons[0]}</div>}

      {item.needs_call && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
          <PhoneCall size={12} /> Κλήση
        </div>
      )}
    </button>
  );
}
