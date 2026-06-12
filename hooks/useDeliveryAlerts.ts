import { useMemo } from 'react';
import { EnrichedDeliveryItem } from '../types';
import { getAttentionItems } from '../utils/deliveryScheduling';

/** Quiet in-page attention list — no toasts or browser notifications. */
export function useDeliveryAlerts(items: EnrichedDeliveryItem[]) {
  const attentionItems = useMemo(() => getAttentionItems(items), [items]);

  return { attentionItems };
}

export { getAttentionItems } from '../utils/deliveryScheduling';
