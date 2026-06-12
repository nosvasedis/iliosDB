import React, { useEffect, useMemo, useState } from 'react';
import { Bell, ChevronDown, Lightbulb, Plus, Trash2, X } from 'lucide-react';
import { Customer, DeliveryHolidayAnchor, DeliveryPlanningMode, Order, OrderDeliveryPlan, OrderDeliveryReminder, OrderStatus } from '../../types';
import { DELIVERY_ACTION_LABELS, DELIVERY_ACTION_COLORS, DELIVERY_HOLIDAY_LABELS, DELIVERY_MODE_LABELS, formatGreekShortDateTime, getOrderDisplayName, ORDER_STATUS_LABELS, REMINDER_ACTION_DROPDOWN_OPTIONS } from '../../utils/deliveryLabels';
import { buildDefaultReminderDrafts, buildSingleCallReminder, computeDeliveryPlanWindow } from '../../utils/deliveryScheduling';
import { analyzeDeliveryContext } from '../../utils/deliveryIntelligence';
import { getHolidayPeriod } from '../../utils/orthodoxHoliday';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => Promise<void>;
  orders: Order[];
  customers: Customer[];
  selectedOrder?: Order | null;
  existingPlan?: OrderDeliveryPlan | null;
  existingReminders?: OrderDeliveryReminder[];
  mobile?: boolean;
}

function toLocalInputValue(isoLike?: string | null) {
  if (!isoLike) return '';
  const date = new Date(isoLike);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DeliveryPlannerModal({ isOpen, onClose, onSave, orders, customers, selectedOrder, existingPlan, existingReminders = [], mobile = false }: Props) {
  const [orderId, setOrderId] = useState(selectedOrder?.id || existingPlan?.order_id || '');
  const [targetAt, setTargetAt] = useState(toLocalInputValue(existingPlan?.target_at));
  const [wantCallReminder, setWantCallReminder] = useState(false);
  const [internalNotes, setInternalNotes] = useState(existingPlan?.internal_notes || '');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [mode, setMode] = useState<DeliveryPlanningMode>(existingPlan?.planning_mode || 'exact');
  const [monthValue, setMonthValue] = useState(existingPlan?.window_start ? new Date(existingPlan.window_start).toISOString().slice(0, 7) : '');
  const [windowStart, setWindowStart] = useState(toLocalInputValue(existingPlan?.window_start));
  const [windowEnd, setWindowEnd] = useState(toLocalInputValue(existingPlan?.window_end));
  const [holidayAnchor, setHolidayAnchor] = useState<DeliveryHolidayAnchor>(existingPlan?.holiday_anchor || 'orthodox_easter');
  const [holidayYear, setHolidayYear] = useState<number>(existingPlan?.holiday_year || new Date().getFullYear());
  const [holidayOffsetDays, setHolidayOffsetDays] = useState<number>(existingPlan?.holiday_offset_days || 0);
  const [contactPhoneOverride, setContactPhoneOverride] = useState(existingPlan?.contact_phone_override || '');
  const [reminders, setReminders] = useState<Array<{ id: string; trigger_at: string; action_type: OrderDeliveryReminder['action_type']; reason: string; source: OrderDeliveryReminder['source']; sort_order: number }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const order = useMemo(() => orders.find((candidate) => candidate.id === orderId) || null, [orders, orderId]);
  const customer = useMemo(() => customers.find((candidate) => candidate.id === order?.customer_id), [customers, order]);
  const intelligence = useMemo(() => order ? analyzeDeliveryContext(order, customer) : { suggestions: [], matchedKeywords: [], callReasons: [] }, [order, customer]);
  const topSuggestion = intelligence.suggestions[0] ?? null;

  const suggestedDrafts = useMemo(() => {
    let referenceDate = targetAt ? new Date(targetAt) : new Date();
    let computedWindowEnd: Date | undefined;
    if (mode === 'month' && monthValue) {
      const [y, m] = monthValue.split('-').map(Number);
      referenceDate = new Date(y, m - 1, 15, 9, 0, 0, 0);
      computedWindowEnd = new Date(y, m, 0, 23, 59, 0, 0);
    } else if (mode === 'custom_period' && windowStart) {
      referenceDate = new Date(windowStart);
      computedWindowEnd = windowEnd ? new Date(windowEnd) : undefined;
    } else if (mode === 'holiday_anchor' && holidayAnchor && holidayYear != null) {
      const period = getHolidayPeriod(holidayAnchor, holidayYear, holidayOffsetDays ?? 0);
      referenceDate = new Date(period.target);
      referenceDate.setHours(9, 0, 0, 0);
      computedWindowEnd = new Date(period.end);
    }
    return buildDefaultReminderDrafts(mode, referenceDate, computedWindowEnd);
  }, [mode, monthValue, targetAt, windowEnd, windowStart, holidayAnchor, holidayYear, holidayOffsetDays]);

  const defaultReminderTrigger = useMemo(() => {
    const planTarget = targetAt ? new Date(targetAt) : null;
    const now = new Date();
    const draft = buildSingleCallReminder(planTarget || now, now);
    return toLocalInputValue(draft.trigger_at);
  }, [targetAt]);

  useEffect(() => {
    if (!isOpen) return;
    const isNonExact = existingPlan && existingPlan.planning_mode !== 'exact';
    setAdvancedOpen(!!isNonExact || (existingReminders?.length ?? 0) > 1);
    setOrderId(selectedOrder?.id || existingPlan?.order_id || '');
    setTargetAt(toLocalInputValue(existingPlan?.target_at));
    setMode(existingPlan?.planning_mode || 'exact');
    setMonthValue(existingPlan?.window_start ? new Date(existingPlan.window_start).toISOString().slice(0, 7) : '');
    setWindowStart(toLocalInputValue(existingPlan?.window_start));
    setWindowEnd(toLocalInputValue(existingPlan?.window_end));
    setHolidayAnchor(existingPlan?.holiday_anchor || 'orthodox_easter');
    setHolidayYear(existingPlan?.holiday_year || new Date().getFullYear());
    setHolidayOffsetDays(existingPlan?.holiday_offset_days || 0);
    setContactPhoneOverride(existingPlan?.contact_phone_override || '');
    setInternalNotes(existingPlan?.internal_notes || '');
    setWantCallReminder(
      !isNonExact && (existingReminders?.length ?? 0) > 0
        && existingReminders.some((r) => !r.completed_at)
    );
  }, [existingPlan, existingReminders, isOpen, selectedOrder]);

  useEffect(() => {
    if (!isOpen) return;
    if (existingReminders.length > 0) {
      setReminders(existingReminders.map((reminder) => ({
        id: reminder.id,
        trigger_at: toLocalInputValue(reminder.trigger_at),
        action_type: reminder.action_type,
        reason: reminder.reason,
        source: reminder.source,
        sort_order: reminder.sort_order
      })));
    } else {
      setReminders([]);
    }
  }, [existingReminders, isOpen]);

  useEffect(() => {
    if (!order) return;
    if (!contactPhoneOverride) {
      setContactPhoneOverride(customer?.phone || order.customer_phone || '');
    }
  }, [contactPhoneOverride, customer?.phone, order]);

  if (!isOpen) return null;

  const containerClasses = mobile
    ? 'fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-end'
    : 'fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4';
  const panelClasses = mobile
    ? 'w-full bg-white rounded-t-[2.5rem] p-5 pb-safe max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-full duration-300'
    : 'w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl p-6 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200';

  const handleAddReminder = () => {
    setReminders((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        trigger_at: defaultReminderTrigger,
        action_type: 'call_client',
        reason: '',
        source: 'manual',
        sort_order: prev.length
      }
    ]);
  };

  const handleAddSuggested = (draft: typeof suggestedDrafts[0]) => {
    setReminders((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        trigger_at: toLocalInputValue(draft.trigger_at),
        action_type: draft.action_type,
        reason: draft.reason,
        source: draft.source,
        sort_order: prev.length
      }
    ]);
  };

  const handleSave = async () => {
    if (!order) return;
    const now = new Date().toISOString();
    const useAdvanced = advancedOpen;
    const effectiveMode = useAdvanced ? mode : 'exact';

    const basePlan: OrderDeliveryPlan = {
      id: existingPlan?.id || crypto.randomUUID(),
      order_id: order.id,
      plan_status: order.status === 'Delivered' ? 'completed' : order.status === 'Cancelled' ? 'cancelled' : 'active',
      planning_mode: effectiveMode,
      target_at: effectiveMode === 'exact' && targetAt ? new Date(targetAt).toISOString() : null,
      window_start: effectiveMode === 'custom_period' && windowStart ? new Date(windowStart).toISOString() : effectiveMode === 'month' && monthValue ? new Date(`${monthValue}-01T09:00`).toISOString() : null,
      window_end: effectiveMode === 'custom_period' && windowEnd ? new Date(windowEnd).toISOString() : null,
      holiday_anchor: effectiveMode === 'holiday_anchor' ? holidayAnchor : null,
      holiday_year: effectiveMode === 'holiday_anchor' ? holidayYear : null,
      holiday_offset_days: effectiveMode === 'holiday_anchor' ? holidayOffsetDays : null,
      contact_phone_override: contactPhoneOverride || null,
      internal_notes: internalNotes || null,
      snoozed_until: existingPlan?.snoozed_until || null,
      completed_at: existingPlan?.completed_at || null,
      cancelled_at: existingPlan?.cancelled_at || null,
      created_by: existingPlan?.created_by || null,
      updated_by: existingPlan?.updated_by || null,
      created_at: existingPlan?.created_at || now,
      updated_at: now
    };

    const computed = computeDeliveryPlanWindow(basePlan);
    const finalPlan: OrderDeliveryPlan = {
      ...basePlan,
      target_at: computed.targetAt || null,
      window_start: computed.windowStart || basePlan.window_start || null,
      window_end: computed.windowEnd || basePlan.window_end || null
    };

    let reminderSource = reminders;
    if (!useAdvanced && wantCallReminder && targetAt) {
      const draft = buildSingleCallReminder(new Date(targetAt));
      reminderSource = [{
        id: existingReminders[0]?.id || crypto.randomUUID(),
        trigger_at: toLocalInputValue(draft.trigger_at),
        action_type: draft.action_type,
        reason: draft.reason,
        source: draft.source,
        sort_order: 0
      }];
    } else if (!useAdvanced) {
      reminderSource = [];
    }

    const finalReminders: OrderDeliveryReminder[] = reminderSource.map((reminder, index) => ({
      id: reminder.id,
      plan_id: finalPlan.id,
      trigger_at: new Date(reminder.trigger_at).toISOString(),
      action_type: reminder.action_type,
      reason: reminder.reason,
      sort_order: index,
      source: reminder.source,
      acknowledged_at: existingReminders.find((item) => item.id === reminder.id)?.acknowledged_at || null,
      completed_at: existingReminders.find((item) => item.id === reminder.id)?.completed_at || null,
      completion_note: existingReminders.find((item) => item.id === reminder.id)?.completion_note || null,
      completed_by: existingReminders.find((item) => item.id === reminder.id)?.completed_by || null,
      snoozed_until: existingReminders.find((item) => item.id === reminder.id)?.snoozed_until || null,
      created_at: existingReminders.find((item) => item.id === reminder.id)?.created_at || now,
      updated_at: now
    }));

    await onSave(finalPlan, finalReminders);
    onClose();
  };

  return (
    <div className={containerClasses}>
      <div className={panelClasses}>
        <div className="flex items-start justify-between gap-3 mb-6">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">Ημερολόγιο</div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">Προγραμματισμός παράδοσης</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4">
            <div>
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-400 block mb-2">Παραγγελία</label>
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none">
                <option value="">Επιλέξτε παραγγελία</option>
                {orders.map((item) => (
                  <option key={item.id} value={item.id}>{getOrderDisplayName(item)} · #{item.id.slice(-6)}</option>
                ))}
              </select>
            </div>

            {topSuggestion && !advancedOpen && (
              <button
                type="button"
                onClick={() => {
                  if (topSuggestion.suggested_date) setTargetAt(toLocalInputValue(topSuggestion.suggested_date));
                  if (topSuggestion.suggested_mode && topSuggestion.suggested_mode !== 'exact') {
                    setMode(topSuggestion.suggested_mode);
                    if (topSuggestion.suggested_holiday) setHolidayAnchor(topSuggestion.suggested_holiday);
                    setAdvancedOpen(true);
                  }
                }}
                className="w-full text-left rounded-2xl bg-white border border-amber-100 px-3 py-2 text-xs font-medium text-slate-600 flex items-center gap-2"
              >
                <Lightbulb size={14} className="text-amber-600 shrink-0" />
                <span>{topSuggestion.label}{topSuggestion.description ? ` — ${topSuggestion.description}` : ''}</span>
              </button>
            )}

            <div>
              <label className="text-[11px] font-black uppercase tracking-wide text-slate-400 block mb-2">Ημερομηνία παράδοσης</label>
              <input
                type="datetime-local"
                value={targetAt}
                onChange={(e) => setTargetAt(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
              />
            </div>

            {!advancedOpen && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantCallReminder}
                  onChange={(e) => setWantCallReminder(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm font-bold text-slate-700">Υπενθύμιση κλήσης πριν την παράδοση</span>
              </label>
            )}

            <input
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none"
              placeholder="Σημειώσεις (προαιρετικά)"
            />
          </div>

          <div className="rounded-3xl border border-slate-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 text-sm font-black text-slate-700"
            >
              <span>Προχωρημένα</span>
              <ChevronDown size={18} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            </button>

            {advancedOpen && (
              <div className="p-4 space-y-4 border-t border-slate-100">
                <div>
                  <label className="text-[11px] font-black uppercase tracking-wide text-slate-400 block mb-2">Τρόπος προγραμματισμού</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(DELIVERY_MODE_LABELS) as DeliveryPlanningMode[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={`px-3 py-2.5 rounded-2xl text-xs font-black border transition-all ${
                          mode === value ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {DELIVERY_MODE_LABELS[value]}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'month' && (
                  <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />
                )}

                {mode === 'custom_period' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />
                    <input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />
                  </div>
                )}

                {mode === 'holiday_anchor' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select value={holidayAnchor} onChange={(e) => setHolidayAnchor(e.target.value as DeliveryHolidayAnchor)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none">
                      {(Object.keys(DELIVERY_HOLIDAY_LABELS) as DeliveryHolidayAnchor[]).map((value) => (
                        <option key={value} value={value}>{DELIVERY_HOLIDAY_LABELS[value]}</option>
                      ))}
                    </select>
                    <input type="number" value={holidayYear} onChange={(e) => setHolidayYear(Number(e.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />
                    <input type="number" value={holidayOffsetDays} onChange={(e) => setHolidayOffsetDays(Number(e.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" placeholder="Μετατόπιση ημερών" />
                  </div>
                )}

                <input
                  value={contactPhoneOverride}
                  onChange={(e) => setContactPhoneOverride(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none"
                  placeholder="Τηλέφωνο επικοινωνίας"
                />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Bell size={16} className="text-slate-500" />
                      <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Υπενθυμίσεις</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      {suggestedDrafts.length > 0 && (
                        <button type="button" onClick={() => setShowSuggestions((v) => !v)} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-bold">
                          Προτάσεις
                        </button>
                      )}
                      <button type="button" onClick={handleAddReminder} className="px-3 py-2 rounded-xl bg-[#060b00] text-white text-xs font-bold flex items-center gap-1">
                        <Plus size={14} /> Νέα
                      </button>
                    </div>
                  </div>

                  {showSuggestions && suggestedDrafts.length > 0 && (
                    <div className="mb-3 p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                      {suggestedDrafts.map((draft, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-xl bg-white border border-slate-100 px-3 py-2">
                          <span className="text-xs font-medium text-slate-600 truncate">
                            {formatGreekShortDateTime(draft.trigger_at)} — {DELIVERY_ACTION_LABELS[draft.action_type]}
                          </span>
                          <button type="button" onClick={() => handleAddSuggested(draft)} className="shrink-0 px-2 py-1 rounded-lg bg-[#060b00] text-white text-xs font-bold">
                            +
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {reminders.length === 0 ? (
                    <p className="text-sm text-slate-500 font-medium">Χωρίς επιπλέον υπενθυμίσεις.</p>
                  ) : (
                    <div className="space-y-3">
                      {reminders.map((reminder) => {
                        const colors = DELIVERY_ACTION_COLORS[reminder.action_type];
                        return (
                          <div key={reminder.id} className={`rounded-2xl border-l-4 ${colors.border} ${colors.bg} border border-slate-200/80 p-3 space-y-2`}>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border ${colors.badge}`}>
                                {DELIVERY_ACTION_LABELS[reminder.action_type]}
                              </span>
                              <button type="button" onClick={() => setReminders((prev) => prev.filter((item) => item.id !== reminder.id))} className="ml-auto w-8 h-8 rounded-lg bg-white/80 text-red-600 border border-red-100 flex items-center justify-center">
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <input type="datetime-local" value={reminder.trigger_at} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, trigger_at: e.target.value } : item))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none" />
                            <select value={reminder.action_type === 'confirm_ready' || reminder.action_type === 'arrange_delivery' ? 'call_client' : reminder.action_type} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, action_type: e.target.value as OrderDeliveryReminder['action_type'] } : item))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none">
                              {REMINDER_ACTION_DROPDOWN_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <input value={reminder.reason} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, reason: e.target.value } : item))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium outline-none" placeholder="Λόγος υπενθύμισης" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {order && (
                  <div className="text-xs text-slate-500 font-medium pt-2 border-t border-slate-100">
                    <span className="font-black text-slate-700">Πελάτης:</span> {getOrderDisplayName(order)} · {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm">Ακύρωση</button>
          <button onClick={handleSave} disabled={!orderId || !targetAt} className="px-5 py-3 rounded-2xl bg-[#060b00] text-white font-bold text-sm disabled:opacity-40">
            Αποθήκευση
          </button>
        </div>
      </div>
    </div>
  );
}
