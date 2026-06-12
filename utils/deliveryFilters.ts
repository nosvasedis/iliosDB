import { EnrichedDeliveryItem } from '../types';
import { DeliveryFilterKey } from '../components/deliveries/DeliveryFilters';
import { getOrderDisplayName } from './deliveryLabels';
import { isItemDueToday } from './deliveryScheduling';

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
    return true;
  });
}

export function getDefaultDeliveryFilter(items: EnrichedDeliveryItem[]): DeliveryFilterKey {
  const hasUrgent = items.some(
    (item) => item.plan.plan_status === 'active' && (item.urgency === 'overdue' || item.urgency === 'today')
  );
  return hasUrgent ? 'today' : 'all';
}
