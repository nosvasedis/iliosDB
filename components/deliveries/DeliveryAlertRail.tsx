import React from 'react';
import { BellRing, CheckCircle2, Loader2, PauseCircle, Phone } from 'lucide-react';
import { DeliveryAttentionEntry } from '../../utils/deliveryScheduling';
import { DELIVERY_ACTION_LABELS, getOrderDisplayName } from '../../utils/deliveryLabels';
import { isCallReminderAction } from '../../utils/deliveryWorklist';
import { OrderDeliveryReminder } from '../../types';

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
  maxItems = 3,
}: Props) {
  if (attentionItems.length === 0) return null;

  const visible = attentionItems.slice(0, maxItems);
  const hiddenCount = attentionItems.length - visible.length;

  return (
    <div className="rounded-xl border border-amber-100/80 bg-amber-50/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
          <BellRing size={14} className="shrink-0 text-amber-700" />
          <span className="text-[11px] font-black uppercase tracking-wide truncate">Προσοχή</span>
          <span className="text-[11px] font-bold text-slate-500">({attentionItems.length})</span>
        </div>
        {hiddenCount > 0 && onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="text-[11px] font-bold text-amber-800 hover:text-amber-950 shrink-0"
          >
            Δείτε όλα
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
        {visible.map(({ item, reminder, urgency }) => {
          const tone = urgency === 'overdue'
            ? 'border-red-200 bg-white'
            : 'border-amber-200/80 bg-white';

          return (
            <div
              key={reminder.id}
              className={`shrink-0 w-[min(100%,18rem)] rounded-xl border px-3 py-2 ${tone}`}
            >
              <button
                type="button"
                onClick={() => onSelectItem({ item, reminder, urgency })}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">
                      {getOrderDisplayName(item.order)}
                    </div>
                    <div className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                      {DELIVERY_ACTION_LABELS[reminder.action_type]}
                    </div>
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-wide shrink-0 ${
                    urgency === 'overdue' ? 'text-red-600' : 'text-amber-700'
                  }`}>
                    {urgency === 'overdue' ? 'Εκπρ.' : 'Σήμερα'}
                  </span>
                </div>
              </button>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {isCallReminderAction(reminder.action_type) && item.phone && (
                  <a
                    href={`tel:${item.phone}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#060b00] text-white text-[11px] font-bold"
                  >
                    <Phone size={11} /> Κλήση
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onSnoozeReminder(reminder)}
                  disabled={loadingReminders.has(reminder.id)}
                  className="px-2 py-1 rounded-lg bg-slate-50 text-slate-600 text-[11px] font-bold border border-slate-200 flex items-center gap-1 disabled:opacity-50"
                >
                  <PauseCircle size={11} /> Αναβολή
                </button>
                <button
                  type="button"
                  onClick={() => onCompleteReminder(reminder)}
                  disabled={loadingReminders.has(reminder.id)}
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  {loadingReminders.has(reminder.id)
                    ? <Loader2 size={11} className="animate-spin" />
                    : <CheckCircle2 size={11} />}
                  Οκ
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
