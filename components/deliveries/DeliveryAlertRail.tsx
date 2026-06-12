import React from 'react';
import { BellRing, CheckCircle2, Loader2, PauseCircle, Phone } from 'lucide-react';
import { DeliveryAttentionEntry } from '../../utils/deliveryScheduling';
import { DELIVERY_ACTION_LABELS, formatGreekDateTime, getOrderDisplayName } from '../../utils/deliveryLabels';
import { OrderDeliveryReminder } from '../../types';

const isCallReminder = (action: OrderDeliveryReminder['action_type']) =>
  action === 'call_client' || action === 'confirm_ready' || action === 'arrange_delivery';

interface Props {
  attentionItems: DeliveryAttentionEntry[];
  onSelectItem: (entry: DeliveryAttentionEntry) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
  onShowAll?: () => void;
  loadingReminders: Set<string>;
  maxItems?: number;
}

export default function DeliveryAlertRail({
  attentionItems,
  onSelectItem,
  onCompleteReminder,
  onSnoozeReminder,
  onShowAll,
  loadingReminders,
  maxItems = 3
}: Props) {
  if (attentionItems.length === 0) return null;

  const visible = attentionItems.slice(0, maxItems);
  const hiddenCount = attentionItems.length - visible.length;

  return (
    <div className="bg-white rounded-3xl border border-amber-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-slate-800">
          <BellRing size={18} />
          <h3 className="font-black text-sm uppercase tracking-wide">Χρειάζεται προσοχή</h3>
          <span className="text-xs font-bold text-slate-500">({attentionItems.length})</span>
        </div>
        {hiddenCount > 0 && onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="text-xs font-bold text-amber-700 hover:text-amber-900"
          >
            Δείτε όλα
          </button>
        )}
      </div>

      <div className="space-y-2">
        {visible.map(({ item, reminder, urgency }) => {
          const tone = urgency === 'overdue'
            ? 'border-red-100 bg-red-50'
            : 'border-amber-100 bg-amber-50';

          return (
            <div key={reminder.id} className={`rounded-2xl border p-3 ${tone}`}>
              <button type="button" onClick={() => onSelectItem({ item, reminder, urgency })} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-800 truncate">{getOrderDisplayName(item.order)}</div>
                    <div className="text-xs font-bold text-slate-500 mt-0.5">
                      {DELIVERY_ACTION_LABELS[reminder.action_type]} · {formatGreekDateTime(reminder.trigger_at)}
                    </div>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-600 shrink-0">
                    {urgency === 'overdue' ? 'Εκπρόθεσμο' : 'Σήμερα'}
                  </span>
                </div>
              </button>
              <div className="mt-2 flex flex-wrap gap-2">
                {isCallReminder(reminder.action_type) && item.phone && (
                  <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold">
                    <Phone size={12} /> Κλήση
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onSnoozeReminder(reminder)}
                  disabled={loadingReminders.has(reminder.id)}
                  className="px-2.5 py-1.5 rounded-xl bg-white text-slate-700 text-xs font-bold border border-slate-200 flex items-center gap-1 disabled:opacity-50"
                >
                  <PauseCircle size={12} /> Αναβολή
                </button>
                <button
                  type="button"
                  onClick={() => onCompleteReminder(reminder)}
                  disabled={loadingReminders.has(reminder.id)}
                  className="px-2.5 py-1.5 rounded-xl bg-[#060b00] text-white text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingReminders.has(reminder.id) ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  Ολοκλήρωσα
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
