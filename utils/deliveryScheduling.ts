import {
  Customer,
  DeliveryPlanStatus,
  DeliveryPlanningMode,
  DeliveryReminderAction,
  DeliveryUrgency,
  EnrichedDeliveryItem,
  Order,
  OrderDeliveryPlan,
  OrderDeliveryReminder,
  ProductionBatch,
  ProductionStage
} from '../types';
import { analyzeDeliveryContext } from './deliveryIntelligence';
import { getHolidayPeriod } from './orthodoxHoliday';
import { getOrderBatches, isOrderReady } from './orderReadiness';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function computeDeliveryPlanWindow(plan: Pick<OrderDeliveryPlan, 'planning_mode' | 'target_at' | 'window_start' | 'window_end' | 'holiday_anchor' | 'holiday_year' | 'holiday_offset_days'>): { targetAt?: string | null; windowStart?: string | null; windowEnd?: string | null } {
  if (plan.planning_mode === 'month' && plan.window_start) {
    const start = new Date(plan.window_start);
    const windowStart = new Date(start.getFullYear(), start.getMonth(), 1, 0, 0, 0, 0);
    const windowEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      targetAt: new Date(start.getFullYear(), start.getMonth(), 15, 9, 0, 0, 0).toISOString(),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString()
    };
  }

  if (plan.planning_mode === 'holiday_anchor' && plan.holiday_anchor && plan.holiday_year) {
    const period = getHolidayPeriod(plan.holiday_anchor, plan.holiday_year, plan.holiday_offset_days || 0);
    return {
      targetAt: period.target.toISOString(),
      windowStart: period.start.toISOString(),
      windowEnd: period.end.toISOString()
    };
  }

  return {
    targetAt: plan.target_at || null,
    windowStart: plan.window_start || null,
    windowEnd: plan.window_end || null
  };
}

export function buildDefaultReminderDrafts(mode: DeliveryPlanningMode, referenceDate: Date, windowEnd?: Date): Array<Pick<OrderDeliveryReminder, 'action_type' | 'reason' | 'sort_order' | 'source' | 'trigger_at'>> {
  const drafts: Array<Pick<OrderDeliveryReminder, 'action_type' | 'reason' | 'sort_order' | 'source' | 'trigger_at'>> = [];
  const addDraft = (offsetDays: number, actionType: DeliveryReminderAction, reason: string, sortOrder: number, baseDate?: Date) => {
    const ref = baseDate || referenceDate;
    const trigger = new Date(ref.getTime() - (offsetDays * DAY_MS));
    trigger.setHours(9, 0, 0, 0);
    drafts.push({
      action_type: actionType,
      reason,
      sort_order: sortOrder,
      source: 'auto',
      trigger_at: trigger.toISOString()
    });
  };

  if (mode === 'month') {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 9, 0, 0, 0);
    const middle = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 15, 9, 0, 0, 0);
    const last = windowEnd || new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 18, 0, 0, 0);
    drafts.push(
      { action_type: 'internal_followup', reason: 'Έλεγχος προόδου παραγγελίας· έναρξη μηνιαίας περιόδου παραδόσεων.', sort_order: 0, source: 'auto', trigger_at: start.toISOString() },
      { action_type: 'call_client', reason: 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη μέσα στον μήνα.', sort_order: 1, source: 'auto', trigger_at: middle.toISOString() },
    );
    addDraft(7, 'internal_followup', 'Έλεγχος προόδου παραγγελίας· πλησιάζει το τέλος του μήνα.', 2, last);
    addDraft(1, 'call_client', 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη πριν τη λήξη του μήνα.', 3, last);
    return drafts;
  }

  if (mode === 'custom_period') {
    const middle = new Date((referenceDate.getTime() + (windowEnd?.getTime() || referenceDate.getTime())) / 2);
    middle.setHours(9, 0, 0, 0);
    drafts.push(
      { action_type: 'internal_followup', reason: 'Έλεγχος προόδου παραγγελίας· έναρξη περιόδου παραδόσεων.', sort_order: 0, source: 'auto', trigger_at: referenceDate.toISOString() },
      { action_type: 'call_client', reason: 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη μέσα στην περίοδο.', sort_order: 1, source: 'auto', trigger_at: middle.toISOString() }
    );
    if (windowEnd) {
      addDraft(7, 'internal_followup', 'Έλεγχος προόδου παραγγελίας· η περίοδος λήγει σύντομα.', 2, windowEnd);
      addDraft(1, 'call_client', 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη πριν το τέλος της περιόδου.', 3, windowEnd);
    }
    return drafts;
  }

  if (mode === 'holiday_anchor') {
    addDraft(14, 'internal_followup', 'Έλεγχος προόδου παραγγελίας· προετοιμασία για γιορτινή περίοδο.', 0);
    addDraft(7, 'call_client', 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη πριν τη γιορτή.', 1);
    addDraft(2, 'internal_followup', 'Έλεγχος προόδου παραγγελίας· η γιορτή πλησιάζει.', 2);
    addDraft(0, 'call_client', 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη την ημέρα-στόχο.', 3);
    return drafts;
  }

  addDraft(7, 'internal_followup', 'Έλεγχος προόδου παραγγελίας σε έξυπνο διάστημα μέσα στο πλάνο παράδοσης.', 0);
  addDraft(1, 'call_client', 'Επιβεβαίωση ετοιμότητας, οργάνωση παράδοσης και κλήση πελάτη.', 1);
  return drafts;
}

export function isReminderPending(reminder: OrderDeliveryReminder, now = new Date()): boolean {
  if (reminder.completed_at) return false;
  if (reminder.snoozed_until && new Date(reminder.snoozed_until).getTime() > now.getTime()) return false;
  return true;
}

export function getReminderUrgency(reminder: OrderDeliveryReminder, now = new Date()): DeliveryUrgency {
  const trigger = new Date(reminder.trigger_at).getTime();
  const startToday = startOfDay(now).getTime();
  const endTodayTime = endOfDay(now).getTime();

  if (!isReminderPending(reminder, now)) return 'completed';
  if (trigger < startToday) return 'overdue';
  if (trigger <= endTodayTime) return 'today';
  if (trigger <= now.getTime() + (3 * DAY_MS)) return 'soon';
  return 'upcoming';
}

export function getPlanTargetTimestamp(plan: OrderDeliveryPlan): number {
  return new Date(plan.target_at || plan.window_start || plan.created_at).getTime();
}

export function getDeliveryUrgency(plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[], now = new Date()): DeliveryUrgency {
  if (plan.plan_status !== 'active') return 'completed';
  const pendingReminders = reminders.filter((reminder) => isReminderPending(reminder, now));
  const reminderUrgencies = pendingReminders.map((reminder) => getReminderUrgency(reminder, now));

  if (reminderUrgencies.includes('overdue')) return 'overdue';
  if (reminderUrgencies.includes('today')) return 'today';
  if (reminderUrgencies.includes('soon')) return 'soon';

  const targetTime = getPlanTargetTimestamp(plan);
  if (targetTime < startOfDay(now).getTime()) return 'overdue';
  if (targetTime <= endOfDay(now).getTime()) return 'today';
  if (targetTime <= now.getTime() + (3 * DAY_MS)) return 'soon';
  if (targetTime <= now.getTime() + (14 * DAY_MS)) return 'upcoming';
  return 'scheduled';
}

export function enrichDeliveryItems(
  orders: Order[],
  customers: Customer[],
  batches: ProductionBatch[],
  plans: OrderDeliveryPlan[],
  reminders: OrderDeliveryReminder[]
): EnrichedDeliveryItem[] {
  return plans.map((plan) => {
    const order = orders.find((candidate) => candidate.id === plan.order_id);
    if (!order) return null;
    const customer = customers.find((candidate) => candidate.id === order.customer_id);
    const planReminders = reminders
      .filter((reminder) => reminder.plan_id === plan.id)
      .sort((a, b) => new Date(a.trigger_at).getTime() - new Date(b.trigger_at).getTime());
    const pendingReminders = planReminders.filter((reminder) => isReminderPending(reminder));
    const nextReminder = pendingReminders[0];
    const intelligence = analyzeDeliveryContext(order, customer);
    const ready = isOrderReady(order, batches);
    const needsCall = pendingReminders.some((reminder) => reminder.action_type === 'call_client' || reminder.action_type === 'arrange_delivery')
      || intelligence.callReasons.length > 0
      || !!(intelligence.nextNameday && intelligence.nextNameday.days_until <= 7)
      || (!ready && getDeliveryUrgency(plan, planReminders) === 'soon');

    const orderBatches = getOrderBatches(plan.order_id, batches).filter((b) => b.current_stage !== ProductionStage.Ready);
    const not_ready_batches = orderBatches.map((b) => ({
      sku: b.sku,
      variant_suffix: b.variant_suffix,
      current_stage: b.current_stage,
      size_info: b.size_info,
      product_image: b.product_image ?? b.product_details?.image_url ?? null,
      gender: b.product_details?.gender
    }));
    const readiness_detail = not_ready_batches.length > 0 ? { not_ready_batches } : undefined;

    const callReasons = [...intelligence.callReasons];
    if (!ready && (getDeliveryUrgency(plan, planReminders) === 'soon' || getDeliveryUrgency(plan, planReminders) === 'today')) {
      if (not_ready_batches.length > 0) {
        callReasons.push(`Η ημερομηνία παράδοσης πλησιάζει· η παραγγελία δεν είναι ακόμη έτοιμη (${not_ready_batches.length} τμήμα/τα σε εξέλιξη).`);
      } else {
        callReasons.push('Η ημερομηνία πλησιάζει αλλά η παραγγελία δεν έχει ακόμη batches παραγωγής.');
      }
    }
    if (ready && plan.plan_status === 'active') {
      callReasons.push('Η παραγγελία είναι έτοιμη· απαιτείται επικοινωνία για οργάνωση παράδοσης.');
    }

    return {
      order,
      customer,
      plan,
      reminders: planReminders,
      next_reminder: nextReminder,
      pending_reminders: pendingReminders,
      phone: plan.contact_phone_override || customer?.phone || order.customer_phone || null,
      is_ready: ready,
      needs_call: needsCall,
      call_reasons: Array.from(new Set(callReasons)),
      readiness_detail,
      urgency: getDeliveryUrgency(plan, planReminders),
      suggestions: intelligence.suggestions,
      matched_keywords: intelligence.matchedKeywords,
      nameday_matches: intelligence.namedayMatches,
      next_nameday: intelligence.nextNameday,
      target_date: plan.target_at || null,
      window_start: plan.window_start || null,
      window_end: plan.window_end || null
    };
  }).filter(Boolean) as EnrichedDeliveryItem[];
}

export function getDeliveryNavBadgeCount(plans: OrderDeliveryPlan[], reminders: OrderDeliveryReminder[], now = new Date()): number {
  const activePlanIds = new Set(plans.filter((plan) => plan.plan_status === 'active').map((plan) => plan.id));
  return reminders.filter((reminder) => {
    if (!activePlanIds.has(reminder.plan_id)) return false;
    const urgency = getReminderUrgency(reminder, now);
    return urgency === 'overdue' || urgency === 'today';
  }).length;
}

export function syncPlanStatusWithOrder(orderStatus: Order['status']): DeliveryPlanStatus {
  if (orderStatus === 'Delivered') return 'completed';
  if (orderStatus === 'Cancelled') return 'cancelled';
  return 'active';
}
