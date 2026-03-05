import React, { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Plus, Trash2, X } from 'lucide-react';
import { Customer, DeliveryHolidayAnchor, DeliveryPlanningMode, Order, OrderDeliveryPlan, OrderDeliveryReminder } from '../../types';
import { DELIVERY_ACTION_LABELS, DELIVERY_HOLIDAY_LABELS, DELIVERY_MODE_LABELS } from '../../utils/deliveryLabels';
import { buildDefaultReminderDrafts, computeDeliveryPlanWindow } from '../../utils/deliveryScheduling';
import { analyzeDeliveryContext } from '../../utils/deliveryIntelligence';

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
  const [mode, setMode] = useState<DeliveryPlanningMode>(existingPlan?.planning_mode || 'exact');
  const [targetAt, setTargetAt] = useState(toLocalInputValue(existingPlan?.target_at));
  const [monthValue, setMonthValue] = useState(existingPlan?.window_start ? new Date(existingPlan.window_start).toISOString().slice(0, 7) : '');
  const [windowStart, setWindowStart] = useState(toLocalInputValue(existingPlan?.window_start));
  const [windowEnd, setWindowEnd] = useState(toLocalInputValue(existingPlan?.window_end));
  const [holidayAnchor, setHolidayAnchor] = useState<DeliveryHolidayAnchor>(existingPlan?.holiday_anchor || 'orthodox_easter');
  const [holidayYear, setHolidayYear] = useState<number>(existingPlan?.holiday_year || new Date().getFullYear());
  const [holidayOffsetDays, setHolidayOffsetDays] = useState<number>(existingPlan?.holiday_offset_days || 0);
  const [contactPhoneOverride, setContactPhoneOverride] = useState(existingPlan?.contact_phone_override || '');
  const [internalNotes, setInternalNotes] = useState(existingPlan?.internal_notes || '');
  const [reminders, setReminders] = useState<Array<{ id: string; trigger_at: string; action_type: OrderDeliveryReminder['action_type']; reason: string; source: OrderDeliveryReminder['source']; sort_order: number }>>([]);

  const order = useMemo(() => orders.find((candidate) => candidate.id === orderId) || null, [orders, orderId]);
  const customer = useMemo(() => customers.find((candidate) => candidate.id === order?.customer_id), [customers, order]);
  const intelligence = useMemo(() => order ? analyzeDeliveryContext(order, customer) : { suggestions: [], matchedKeywords: [], callReasons: [] }, [order, customer]);

  useEffect(() => {
    if (!isOpen) return;
    setOrderId(selectedOrder?.id || existingPlan?.order_id || '');
    setMode(existingPlan?.planning_mode || 'exact');
    setTargetAt(toLocalInputValue(existingPlan?.target_at));
    setMonthValue(existingPlan?.window_start ? new Date(existingPlan.window_start).toISOString().slice(0, 7) : '');
    setWindowStart(toLocalInputValue(existingPlan?.window_start));
    setWindowEnd(toLocalInputValue(existingPlan?.window_end));
    setHolidayAnchor(existingPlan?.holiday_anchor || 'orthodox_easter');
    setHolidayYear(existingPlan?.holiday_year || new Date().getFullYear());
    setHolidayOffsetDays(existingPlan?.holiday_offset_days || 0);
    setContactPhoneOverride(existingPlan?.contact_phone_override || '');
    setInternalNotes(existingPlan?.internal_notes || '');
  }, [existingPlan, isOpen, selectedOrder]);

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
      return;
    }

    let referenceDate = targetAt ? new Date(targetAt) : new Date();
    let computedWindowEnd: Date | undefined;

    if (mode === 'month' && monthValue) {
      const [year, month] = monthValue.split('-').map(Number);
      referenceDate = new Date(year, month - 1, 15, 9, 0, 0, 0);
      computedWindowEnd = new Date(year, month, 0, 23, 59, 0, 0);
    } else if (mode === 'custom_period' && windowStart) {
      referenceDate = new Date(windowStart);
      computedWindowEnd = windowEnd ? new Date(windowEnd) : undefined;
    }

    const defaults = buildDefaultReminderDrafts(mode, referenceDate, computedWindowEnd).map((reminder, index) => ({
      id: crypto.randomUUID(),
      trigger_at: toLocalInputValue(reminder.trigger_at),
      action_type: reminder.action_type,
      reason: reminder.reason,
      source: reminder.source,
      sort_order: index
    }));
    setReminders(defaults);
  }, [existingReminders, isOpen, mode, monthValue, targetAt, windowEnd, windowStart]);

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
    : 'w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl p-6 max-h-[92vh] overflow-y-auto animate-in zoom-in-95 duration-200';

  const handleAddReminder = () => {
    setReminders((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        trigger_at: toLocalInputValue(new Date().toISOString()),
        action_type: 'call_client',
        reason: 'Νέα χειροκίνητη υπενθύμιση',
        source: 'manual',
        sort_order: prev.length
      }
    ]);
  };

  const handleSave = async () => {
    if (!order) return;
    const now = new Date().toISOString();

    const basePlan: OrderDeliveryPlan = {
      id: existingPlan?.id || crypto.randomUUID(),
      order_id: order.id,
      plan_status: order.status === 'Delivered' ? 'completed' : order.status === 'Cancelled' ? 'cancelled' : 'active',
      planning_mode: mode,
      target_at: mode === 'exact' && targetAt ? new Date(targetAt).toISOString() : null,
      window_start: mode === 'custom_period' && windowStart ? new Date(windowStart).toISOString() : mode === 'month' && monthValue ? new Date(`${monthValue}-01T09:00`).toISOString() : null,
      window_end: mode === 'custom_period' && windowEnd ? new Date(windowEnd).toISOString() : null,
      holiday_anchor: mode === 'holiday_anchor' ? holidayAnchor : null,
      holiday_year: mode === 'holiday_anchor' ? holidayYear : null,
      holiday_offset_days: mode === 'holiday_anchor' ? holidayOffsetDays : null,
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

    const finalReminders: OrderDeliveryReminder[] = reminders.map((reminder, index) => ({
      id: reminder.id,
      plan_id: finalPlan.id,
      trigger_at: new Date(reminder.trigger_at).toISOString(),
      action_type: reminder.action_type,
      reason: reminder.reason,
      sort_order: index,
      source: reminder.source,
      acknowledged_at: null,
      completed_at: null,
      completion_note: null,
      completed_by: null,
      snoozed_until: null,
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
            <div className="text-xs font-black uppercase tracking-wider text-slate-400">Ημερολόγιο Παραδόσεων</div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">Προγραμματισμός παράδοσης</h2>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-6">
          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 space-y-4">
              <div>
                <label className="text-[11px] font-black uppercase tracking-wide text-slate-400 block mb-2">Παραγγελία</label>
                <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none">
                  <option value="">Επιλέξτε παραγγελία</option>
                  {orders.map((item) => (
                    <option key={item.id} value={item.id}>{item.customer_name} · #{item.id.slice(-6)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-black uppercase tracking-wide text-slate-400 block mb-2">Τρόπος προγραμματισμού</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(DELIVERY_MODE_LABELS) as DeliveryPlanningMode[]).map((value) => (
                    <button
                      key={value}
                      onClick={() => setMode(value)}
                      className={`px-4 py-3 rounded-2xl text-xs font-black border transition-all ${
                        mode === value ? 'bg-[#060b00] text-white border-[#060b00]' : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {DELIVERY_MODE_LABELS[value]}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'exact' && <input type="datetime-local" value={targetAt} onChange={(e) => setTargetAt(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />}
              {mode === 'month' && <input type="month" value={monthValue} onChange={(e) => setMonthValue(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />}

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
                  <input type="number" value={holidayOffsetDays} onChange={(e) => setHolidayOffsetDays(Number(e.target.value))} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={contactPhoneOverride} onChange={(e) => setContactPhoneOverride(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" placeholder="Τηλέφωνο επικοινωνίας" />
                <input value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none" placeholder="Εσωτερικές σημειώσεις" />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <CalendarRange size={16} className="text-slate-500" />
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Υπενθυμίσεις</h3>
                </div>
                <button onClick={handleAddReminder} className="px-3 py-2 rounded-xl bg-[#060b00] text-white text-xs font-bold flex items-center gap-1.5">
                  <Plus size={14} /> Νέα
                </button>
              </div>
              <div className="space-y-3">
                {reminders.map((reminder) => (
                  <div key={reminder.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_auto] gap-3">
                      <input type="datetime-local" value={reminder.trigger_at} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, trigger_at: e.target.value } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none" />
                      <select value={reminder.action_type} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, action_type: e.target.value as OrderDeliveryReminder['action_type'] } : item))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none">
                        {(Object.keys(DELIVERY_ACTION_LABELS) as OrderDeliveryReminder['action_type'][]).map((value) => (
                          <option key={value} value={value}>{DELIVERY_ACTION_LABELS[value]}</option>
                        ))}
                      </select>
                      <button onClick={() => setReminders((prev) => prev.filter((item) => item.id !== reminder.id))} className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-100 flex items-center justify-center">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <input value={reminder.reason} onChange={(e) => setReminders((prev) => prev.map((item) => item.id === reminder.id ? { ...item, reason: e.target.value } : item))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold outline-none" placeholder="Λόγος επικοινωνίας / ενέργεια" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm font-black uppercase tracking-wide text-slate-700 mb-3">Έξυπνες προτάσεις</div>
              <div className="space-y-3">
                {intelligence.suggestions.length === 0 && (
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 text-sm text-slate-500 font-medium">
                    Δεν βρέθηκαν αυτόματες προτάσεις από τις σημειώσεις της παραγγελίας.
                  </div>
                )}
                {intelligence.suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    onClick={() => {
                      if (suggestion.suggested_mode) setMode(suggestion.suggested_mode);
                      if (suggestion.suggested_holiday) setHolidayAnchor(suggestion.suggested_holiday);
                      if (suggestion.suggested_date) setTargetAt(toLocalInputValue(suggestion.suggested_date));
                    }}
                    className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 hover:border-amber-200 hover:bg-amber-50 transition-all"
                  >
                    <div className="font-bold text-slate-800">{suggestion.label}</div>
                    {suggestion.description && <div className="text-xs font-medium text-slate-500 mt-1">{suggestion.description}</div>}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="text-sm font-black uppercase tracking-wide text-slate-700 mb-3">Στοιχεία παραγγελίας</div>
              {order ? (
                <div className="space-y-2 text-sm text-slate-600 font-medium">
                  <div><span className="font-black text-slate-800">Πελάτης:</span> {order.customer_name}</div>
                  <div><span className="font-black text-slate-800">Τηλέφωνο:</span> {customer?.phone || order.customer_phone || 'Δεν υπάρχει'}</div>
                  <div><span className="font-black text-slate-800">Κατάσταση:</span> {order.status}</div>
                  {order.notes && <div><span className="font-black text-slate-800">Σημειώσεις:</span> {order.notes}</div>}
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-slate-200 p-4 text-sm text-slate-500 font-medium">
                  Επιλέξτε πρώτα παραγγελία.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-3 rounded-2xl bg-white border border-slate-200 text-slate-600 font-bold text-sm">Ακύρωση</button>
          <button onClick={handleSave} disabled={!orderId} className="px-5 py-3 rounded-2xl bg-[#060b00] text-white font-bold text-sm disabled:opacity-40">
            Αποθήκευση πλάνου
          </button>
        </div>
      </div>
    </div>
  );
}
