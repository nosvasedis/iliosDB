import React from 'react';
import { BellRing, CheckCircle2, Loader2, PauseCircle, Phone } from 'lucide-react';
import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../../types';
import { DELIVERY_ACTION_LABELS, formatGreekDateTime, getOrderDisplayName } from '../../utils/deliveryLabels';
import { getReminderUrgency } from '../../utils/deliveryScheduling';

const isCallReminder = (action: OrderDeliveryReminder['action_type']) =>
  action === 'call_client' || action === 'confirm_ready' || action === 'arrange_delivery';

interface Props {
  items: EnrichedDeliveryItem[];
  onSelectItem: (item: EnrichedDeliveryItem) => void;
  onAcknowledgeReminder: (reminder: OrderDeliveryReminder) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
  loadingReminders: Set<string>;
}

export default function DeliveryAlertRail({ items, onSelectItem, onAcknowledgeReminder, onCompleteReminder, onSnoozeReminder, loadingReminders }: Props) {
  const alerts = items.flatMap((item) => item.pending_reminders.map((reminder) => ({ item, reminder })))
    .filter(({ reminder }) => ['overdue', 'today', 'soon'].includes(getReminderUrgency(reminder)))
    .sort((a, b) => new Date(a.reminder.trigger_at).getTime() - new Date(b.reminder.trigger_at).getTime());

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-slate-800 mb-1">
        <BellRing size={18} />
        <h3 className="font-black text-sm uppercase tracking-wide">Να κάνετε τώρα</h3>
      </div>
      <p className="text-xs text-slate-500 font-medium mb-2">Υπενθυμίσεις που λήγουν σήμερα ή χρειάζονται άμεση ενέργεια</p>

      {alerts.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500 font-medium">
          Δεν υπάρχουν ενέργειες που χρειάζονται τώρα.
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
                  <div className="text-sm font-black text-slate-800">{getOrderDisplayName(item.order)}</div>
                  <div className="text-xs font-bold text-slate-500 mt-1">
                    {DELIVERY_ACTION_LABELS[reminder.action_type]} · {formatGreekDateTime(reminder.trigger_at)}
                  </div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                  {urgency === 'overdue' ? 'Εκπρόθεσμο' : urgency === 'today' ? 'Σήμερα' : 'Άμεσα'}
                </span>
              </div>
              <p className="mt-2 text-xs font-medium text-slate-600">
                {reminder.reason || (isCallReminder(reminder.action_type) ? 'Καλέστε τον πελάτη για επιβεβαίωση ετοιμότητας και οργάνωση παράδοσης.' : 'Ελέγξτε την πρόοδο της παραγγελίας.')}
              </p>
            </button>
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              {isCallReminder(reminder.action_type) && item.phone && (
                <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">
                  <Phone size={14} /> Κλήση
                </a>
              )}
              <button onClick={() => onSnoozeReminder(reminder)} disabled={loadingReminders.has(reminder.id)} className="px-3 py-2 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5 disabled:opacity-50">
                <PauseCircle size={14} /> Αναβολή
              </button>
              <button onClick={() => onCompleteReminder(reminder)} disabled={loadingReminders.has(reminder.id)} className="px-3 py-2 rounded-xl bg-[#060b00] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                {loadingReminders.has(reminder.id) ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Ολοκλήρωσα
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
