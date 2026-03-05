import React from 'react';
import { BellRing, CalendarRange, CheckCircle2, ClipboardList, ExternalLink, Gift, Phone, PhoneCall, Trash2 } from 'lucide-react';
import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../../types';
import { DELIVERY_ACTION_LABELS, DELIVERY_STATUS_LABELS, DELIVERY_URGENCY_LABELS, formatDeliveryWindow, formatGreekDate, formatGreekDateTime, getOrderDisplayName, getReminderStateLabel } from '../../utils/deliveryLabels';

interface Props {
  item?: EnrichedDeliveryItem | null;
  onEditPlan: (item: EnrichedDeliveryItem) => void;
  onOpenOrder: (item: EnrichedDeliveryItem) => void;
  onMarkDelivered: (item: EnrichedDeliveryItem) => void;
  onDeletePlan: (item: EnrichedDeliveryItem) => void;
  onAcknowledgeReminder: (reminder: OrderDeliveryReminder) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
}

export default function DeliveryDetailPanel({ item, onEditPlan, onOpenOrder, onMarkDelivered, onDeletePlan, onAcknowledgeReminder, onCompleteReminder, onSnoozeReminder }: Props) {
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

      <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
        <div className="text-[11px] font-black uppercase tracking-wide text-slate-400 flex items-center gap-2"><PhoneCall size={14} /> Γιατί χρειάζεται επικοινωνία</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.call_reasons.length > 0 ? item.call_reasons.map((reason) => (
            <span key={reason} className="text-xs font-bold px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700">{reason}</span>
          )) : <span className="text-sm text-slate-500 font-medium">Δεν υπάρχουν ειδικοί λόγοι επικοινωνίας.</span>}
        </div>
      </div>

      {(item.order.notes || item.customer?.notes) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wide text-amber-700 flex items-center gap-2"><ClipboardList size={14} /> Σημειώσεις</div>
          {item.order.notes && <p className="text-sm font-medium text-slate-700">{item.order.notes}</p>}
          {item.customer?.notes && <p className="text-sm font-medium text-slate-700">{item.customer.notes}</p>}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-800">
          <BellRing size={16} />
          <div className="font-black text-sm uppercase tracking-wide">Υπενθυμίσεις</div>
        </div>
        {item.reminders.map((reminder) => (
          <div key={reminder.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-slate-800">{DELIVERY_ACTION_LABELS[reminder.action_type]}</div>
                <div className="text-xs font-bold text-slate-500 mt-1">{formatGreekDateTime(reminder.trigger_at)}</div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{getReminderStateLabel(reminder)}</div>
            </div>
            <p className="mt-2 text-sm text-slate-600 font-medium">{reminder.reason}</p>
            {!reminder.completed_at && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => onAcknowledgeReminder(reminder)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700">Το είδα</button>
                <button onClick={() => onSnoozeReminder(reminder)} className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700">Αναβολή 1 ώρας</button>
                <button onClick={() => onCompleteReminder(reminder)} className="px-3 py-2 rounded-xl text-xs font-bold bg-[#060b00] text-white">Ολοκλήρωση</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={() => onEditPlan(item)} className="px-4 py-3 rounded-2xl bg-[#060b00] text-white font-bold text-sm">Επεξεργασία πλάνου</button>
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
