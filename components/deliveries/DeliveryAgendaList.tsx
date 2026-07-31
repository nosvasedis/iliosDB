import React from 'react';
import { CheckCircle2, PhoneCall } from 'lucide-react';
import { CalendarDayEvent, EnrichedDeliveryItem, OrderDeliveryReminder } from '../../types';
import {
  DELIVERY_ACTION_LABELS,
  DELIVERY_URGENCY_LABELS,
  formatDeliveryWindow,
  getOrderDisplayName,
} from '../../utils/deliveryLabels';
import {
  buildDeliveryWorklistGroups,
  formatSelectedDayLabel,
  isCallReminderAction,
} from '../../utils/deliveryWorklist';

interface Props {
  items: EnrichedDeliveryItem[];
  selectedDate?: Date | null;
  dayScoped?: boolean;
  onSelectItem: (item: EnrichedDeliveryItem) => void;
  dayEvents?: CalendarDayEvent[];
  selectedItemId?: string | null;
  onClearDayScope?: () => void;
  onShowAll?: () => void;
  onShowToday?: () => void;
  onCompleteReminder?: (reminder: OrderDeliveryReminder) => void;
  loadingReminders?: Set<string>;
  grouped?: boolean;
}

function urgencyTone(urgency: EnrichedDeliveryItem['urgency']): string {
  if (urgency === 'overdue') return 'bg-red-50 text-red-700 border-red-100';
  if (urgency === 'today') return 'bg-amber-50 text-amber-700 border-amber-100';
  if (urgency === 'soon') return 'bg-orange-50 text-orange-700 border-orange-100';
  if (urgency === 'completed') return 'bg-slate-100 text-slate-500 border-slate-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

export default function DeliveryAgendaList({
  items,
  selectedDate = null,
  dayScoped = false,
  onSelectItem,
  dayEvents = [],
  selectedItemId = null,
  onClearDayScope,
  onShowAll,
  onShowToday,
  onCompleteReminder,
  loadingReminders,
  grouped = true,
}: Props) {
  const groups = buildDeliveryWorklistGroups(items, { grouped });
  const title = dayScoped && selectedDate
    ? formatSelectedDayLabel(selectedDate)
    : 'Εργασίες';

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-2 shadow-sm">
      <div className="px-3 pt-2 pb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black text-[#060b00] tracking-tight">{title}</h3>
          <p className="text-xs font-medium text-slate-500 mt-0.5">
            {dayScoped
              ? 'Παραδόσεις για την επιλεγμένη ημέρα'
              : 'Κλήσεις, προθεσμίες και αποστολές'}
          </p>
          {dayEvents.length > 0 && (
            <p
              className="text-[11px] text-slate-400 font-medium mt-1 truncate"
              title={dayEvents.map((e) => e.title).join(', ')}
            >
              Γιορτή: {dayEvents.map((e) => e.title).join(', ')}
            </p>
          )}
        </div>
        {dayScoped && onClearDayScope && (
          <button
            type="button"
            onClick={onClearDayScope}
            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 shrink-0"
          >
            Όλες οι ημέρες
          </button>
        )}
      </div>

      <div className="space-y-3 max-h-[min(42rem,70vh)] overflow-y-auto p-1">
        {items.length === 0 && (
          <div className="rounded-2xl bg-white border border-slate-100 px-4 py-5 text-sm text-slate-500 font-medium">
            {dayScoped ? (
              <div className="space-y-3">
                <p>Τίποτα για αυτή την ημέρα.</p>
                <div className="flex flex-wrap gap-2">
                  {onShowToday && (
                    <button
                      type="button"
                      onClick={onShowToday}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold"
                    >
                      Σήμερα
                    </button>
                  )}
                  {onShowAll && (
                    <button
                      type="button"
                      onClick={onShowAll}
                      className="px-3 py-1.5 rounded-lg bg-[#060b00] text-white text-xs font-bold"
                    >
                      Όλα
                    </button>
                  )}
                  {onClearDayScope && (
                    <button
                      type="button"
                      onClick={onClearDayScope}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold"
                    >
                      Όλες οι ημέρες
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p>Δεν βρέθηκαν προγραμματισμένες παραδόσεις για τα τρέχοντα φίλτρα.</p>
            )}
          </div>
        )}

        {groups.map((group) => (
          <div key={group.key} className="space-y-1.5">
            {grouped && groups.length > 1 && (
              <div className="px-2 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isSelected = selectedItemId === item.plan.id;
              const pending = item.next_reminder && !item.next_reminder.completed_at
                ? item.next_reminder
                : null;
              const showQuickComplete = pending
                && (item.urgency === 'overdue' || item.urgency === 'today')
                && onCompleteReminder;

              return (
                <div
                  key={item.plan.id}
                  className={`rounded-2xl border bg-white transition-all ${
                    isSelected
                      ? 'border-emerald-200 ring-2 ring-emerald-500/15 shadow-sm'
                      : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className="w-full text-left px-3.5 py-3"
                  >
                    <div className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {getOrderDisplayName(item.order)}
                        </div>
                        <div className="text-xs font-medium text-slate-500 mt-0.5">
                          {formatDeliveryWindow(item.plan)}
                        </div>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span className={`inline-flex text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border ${urgencyTone(item.urgency)}`}>
                          {DELIVERY_URGENCY_LABELS[item.urgency]}
                        </span>
                        {item.shipment_readiness && item.shipment_readiness.total_batches > 0 && (
                          <div className="flex items-center justify-end gap-1.5">
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                item.shipment_readiness.is_fully_ready
                                  ? 'bg-emerald-500'
                                  : item.shipment_readiness.is_partially_ready
                                    ? 'bg-amber-500'
                                    : 'bg-red-400'
                              }`}
                            />
                            <span className="text-[10px] font-bold text-slate-500">
                              {item.shipment_readiness.is_fully_ready ? (
                                <CheckCircle2 size={12} className="text-emerald-600 inline" />
                              ) : (
                                `${item.shipment_readiness.ready_qty}/${item.shipment_readiness.total_qty}`
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {pending && (
                      <div className="mt-2 text-xs font-medium text-slate-600 flex items-center gap-1.5">
                        {isCallReminderAction(pending.action_type) && (
                          <PhoneCall size={12} className="text-slate-400 shrink-0" />
                        )}
                        {DELIVERY_ACTION_LABELS[pending.action_type]}
                      </div>
                    )}
                  </button>
                  {showQuickComplete && pending && (
                    <div className="px-3.5 pb-3 flex flex-wrap gap-1.5 -mt-1">
                      {isCallReminderAction(pending.action_type) && item.phone && (
                        <a
                          href={`tel:${item.phone}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#060b00] text-white text-[11px] font-bold"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PhoneCall size={11} /> Κλήση
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompleteReminder(pending);
                        }}
                        disabled={loadingReminders?.has(pending.id)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11px] font-bold disabled:opacity-50"
                      >
                        Ολοκλήρωσα
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
