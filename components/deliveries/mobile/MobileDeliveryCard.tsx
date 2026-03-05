import React from 'react';
import { CalendarRange, Gift, PhoneCall } from 'lucide-react';
import { EnrichedDeliveryItem } from '../../../types';
import { DELIVERY_URGENCY_LABELS, formatDeliveryWindow, formatGreekDate, formatGreekDateTime } from '../../../utils/deliveryLabels';

interface Props {
  item: EnrichedDeliveryItem;
  onClick: () => void;
}

export default function MobileDeliveryCard({ item, onClick }: Props) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-3xl border border-slate-100 bg-white shadow-sm p-4 active:scale-[0.99] transition-all">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="font-black text-slate-900 truncate">{item.order.customer_name}</div>
          <div className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1.5">
            <CalendarRange size={12} /> {formatDeliveryWindow(item.plan)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{DELIVERY_URGENCY_LABELS[item.urgency]}</div>
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

      {item.call_reasons[0] && <div className="mt-3 text-sm font-medium text-slate-600">{item.call_reasons[0]}</div>}

      {item.needs_call && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
          <PhoneCall size={12} /> Κλήση
        </div>
      )}
    </button>
  );
}
