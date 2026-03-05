import React from 'react';
import { BellRing, Clock3, PauseCircle, CheckCircle2 } from 'lucide-react';
import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../../types';
import { DELIVERY_ACTION_LABELS, formatGreekDateTime } from '../../utils/deliveryLabels';
import { getReminderUrgency } from '../../utils/deliveryScheduling';

interface Props {
  items: EnrichedDeliveryItem[];
  onSelectItem: (item: EnrichedDeliveryItem) => void;
  onAcknowledgeReminder: (reminder: OrderDeliveryReminder) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
}

export default function DeliveryAlertRail({ items, onSelectItem, onAcknowledgeReminder, onCompleteReminder, onSnoozeReminder }: Props) {
  const alerts = items.flatMap((item) => item.pending_reminders.map((reminder) => ({ item, reminder })))
    .filter(({ reminder }) => ['overdue', 'today', 'soon'].includes(getReminderUrgency(reminder)))
    .sort((a, b) => new Date(a.reminder.trigger_at).getTime() - new Date(b.reminder.trigger_at).getTime());

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-slate-800">
        <BellRing size={18} />
        <h3 className="font-black text-sm uppercase tracking-wide">Ζωντανές ειδοποιήσεις</h3>
      </div>

      {alerts.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 font-medium">
          Δεν υπάρχουν ενεργές ειδοποιήσεις αυτή τη στιγμή.
        </div>
      )}

      {alerts.map(({ item, reminder }) => {
        const urgency = getReminderUrgency(reminder);
        const tone = urgency === 'overdue'
          ? 'border-red-100 bg-red-50'
          : urgency === 'today'
            ? 'border-amber-100 bg-amber-50'
            : 'border-blue-100 bg-blue-50';

        return (
          <div key={reminder.id} className={`rounded-2xl border p-4 ${tone}`}>
            <button onClick={() => onSelectItem(item)} className="w-full text-left">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-800">{item.order.customer_name}</div>
                  <div className="text-xs font-bold text-slate-500 mt-1">
                    {DELIVERY_ACTION_LABELS[reminder.action_type]} · {formatGreekDateTime(reminder.trigger_at)}
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                  {urgency === 'overdue' ? 'Εκπρόθεσμο' : urgency === 'today' ? 'Σήμερα' : 'Άμεσα'}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600">{reminder.reason}</p>
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => onAcknowledgeReminder(reminder)} className="px-3 py-2 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5">
                <Clock3 size={14} /> Αναγνώριση
              </button>
              <button onClick={() => onSnoozeReminder(reminder)} className="px-3 py-2 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5">
                <PauseCircle size={14} /> Αναβολή 1 ώρας
              </button>
              <button onClick={() => onCompleteReminder(reminder)} className="px-3 py-2 rounded-xl bg-[#060b00] text-white text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} /> Ολοκλήρωση
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
