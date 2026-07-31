import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../types';
import { endOfDay, getReminderUrgency, isReminderPending, startOfDay } from './deliveryScheduling';

export type DeliveryWorklistGroupKey = 'overdue' | 'calls_today' | 'due' | 'ship_ready' | 'other';

export interface DeliveryWorklistGroup {
  key: DeliveryWorklistGroupKey;
  label: string;
  items: EnrichedDeliveryItem[];
}

const CALL_ACTIONS = new Set<OrderDeliveryReminder['action_type']>([
  'call_client',
  'confirm_ready',
  'arrange_delivery',
]);

export function isCallReminderAction(action: OrderDeliveryReminder['action_type']): boolean {
  return CALL_ACTIONS.has(action);
}

export function itemFallsOnDate(item: EnrichedDeliveryItem, date: Date): boolean {
  const start = startOfDay(date).getTime();
  const end = endOfDay(date).getTime();

  const isSpanning =
    item.plan.planning_mode === 'month'
    || item.plan.planning_mode === 'custom_period'
    || item.plan.planning_mode === 'holiday_anchor';

  if (isSpanning && item.window_start && item.window_end) {
    const windowStart = new Date(item.window_start).getTime();
    const windowEnd = new Date(item.window_end).getTime();
    if (item.plan.planning_mode === 'holiday_anchor' && item.target_date) {
      const target = new Date(item.target_date).getTime();
      return target >= start && target <= end;
    }
    return windowStart <= end && windowEnd >= start;
  }

  const time = new Date(item.target_date || item.window_start || item.plan.created_at).getTime();
  return time >= start && time <= end;
}

export function filterItemsForSelectedDay(
  items: EnrichedDeliveryItem[],
  selectedDate: Date | null
): EnrichedDeliveryItem[] {
  if (!selectedDate) return items;
  return items.filter((item) => itemFallsOnDate(item, selectedDate));
}

function hasUrgentCallReminder(item: EnrichedDeliveryItem, now = new Date()): boolean {
  return item.pending_reminders.some((reminder) => {
    if (!isCallReminderAction(reminder.action_type)) return false;
    if (!isReminderPending(reminder, now)) return false;
    const urgency = getReminderUrgency(reminder, now);
    return urgency === 'overdue' || urgency === 'today';
  });
}

function isShipReady(item: EnrichedDeliveryItem): boolean {
  const sr = item.shipment_readiness;
  if (!sr || sr.total_batches === 0) return false;
  return sr.is_partially_ready || sr.is_fully_ready;
}

/** Assign each item to exactly one worklist group (priority order). */
export function classifyWorklistItem(
  item: EnrichedDeliveryItem,
  now = new Date()
): DeliveryWorklistGroupKey {
  if (item.plan.plan_status !== 'active') return 'other';
  if (item.urgency === 'overdue') return 'overdue';
  if (hasUrgentCallReminder(item, now)) return 'calls_today';
  if (isShipReady(item)) return 'ship_ready';
  if (item.urgency === 'today' || item.urgency === 'soon') return 'due';
  return 'other';
}

const GROUP_ORDER: DeliveryWorklistGroupKey[] = [
  'overdue',
  'calls_today',
  'due',
  'ship_ready',
  'other',
];

const GROUP_LABELS: Record<DeliveryWorklistGroupKey, string> = {
  overdue: 'Εκπρόθεσμα',
  calls_today: 'Σήμερα — κλήσεις',
  due: 'Προθεσμίες',
  ship_ready: 'Έτοιμα για αποστολή',
  other: 'Προγραμματισμένα',
};

export function buildDeliveryWorklistGroups(
  items: EnrichedDeliveryItem[],
  options?: { grouped?: boolean; now?: Date }
): DeliveryWorklistGroup[] {
  const now = options?.now ?? new Date();
  const grouped = options?.grouped ?? true;

  if (!grouped || items.length === 0) {
    return items.length === 0
      ? []
      : [{ key: 'other', label: 'Παραδόσεις', items }];
  }

  const buckets = new Map<DeliveryWorklistGroupKey, EnrichedDeliveryItem[]>();
  GROUP_ORDER.forEach((key) => buckets.set(key, []));

  items.forEach((item) => {
    const key = classifyWorklistItem(item, now);
    buckets.get(key)!.push(item);
  });

  return GROUP_ORDER
    .map((key) => ({
      key,
      label: GROUP_LABELS[key],
      items: buckets.get(key) || [],
    }))
    .filter((group) => group.items.length > 0);
}

export function formatSelectedDayLabel(date: Date): string {
  const today = startOfDay(new Date()).getTime();
  const day = startOfDay(date).getTime();
  if (day === today) return 'Σήμερα';
  if (day === today + 24 * 60 * 60 * 1000) return 'Αύριο';
  if (day === today - 24 * 60 * 60 * 1000) return 'Χθες';
  return date.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
}
