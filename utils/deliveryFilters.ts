import { EnrichedDeliveryItem } from '../types';
import { getOrderDisplayName } from './deliveryLabels';
import { getReminderUrgency, isItemDueToday, isReminderPending } from './deliveryScheduling';

export type DeliveryFilterKey = 'all' | 'today' | 'overdue' | 'attention' | 'completed';

export function filterDeliveryItems(
  items: EnrichedDeliveryItem[],
  filter: DeliveryFilterKey,
  search: string
): EnrichedDeliveryItem[] {
  return items.filter((item) => {
    const displayName = getOrderDisplayName(item.order);
    const matchesSearch = search.trim() === ''
      || displayName.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR'))
      || item.order.id.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR'));

    if (!matchesSearch) return false;
    if (filter === 'all') return item.plan.plan_status === 'active';
    if (filter === 'completed') return item.plan.plan_status !== 'active';
    if (filter === 'overdue') return item.urgency === 'overdue';
    if (filter === 'today') return isItemDueToday(item);
    if (filter === 'attention') {
      if (item.plan.plan_status !== 'active') return false;
      return item.pending_reminders.some((reminder) => {
        if (!isReminderPending(reminder)) return false;
        const urgency = getReminderUrgency(reminder);
        return urgency === 'overdue' || urgency === 'today';
      });
    }
    return true;
  });
}

export function getDefaultDeliveryFilter(items: EnrichedDeliveryItem[]): DeliveryFilterKey {
  const hasUrgent = items.some(
    (item) => item.plan.plan_status === 'active' && (item.urgency === 'overdue' || item.urgency === 'today')
  );
  return hasUrgent ? 'today' : 'all';
}
