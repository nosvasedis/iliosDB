import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { getDeliveryNavBadgeCount, enrichDeliveryItems } from '../../utils/deliveryScheduling';

export function useOrderDeliveryPlans() {
  const plansQuery = useQuery({ queryKey: ['order_delivery_plans'], queryFn: api.getOrderDeliveryPlans });
  const remindersQuery = useQuery({ queryKey: ['order_delivery_reminders'], queryFn: api.getOrderDeliveryReminders });
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: api.getOrders });
  const customersQuery = useQuery({ queryKey: ['customers'], queryFn: api.getCustomers });
  const batchesQuery = useQuery({ queryKey: ['batches'], queryFn: api.getProductionBatches });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: api.getProducts });

  const enrichedItems = useMemo(() => {
    if (!plansQuery.data || !remindersQuery.data || !ordersQuery.data || !customersQuery.data || !batchesQuery.data) {
      return [];
    }
    return enrichDeliveryItems(
      ordersQuery.data,
      customersQuery.data,
      batchesQuery.data,
      plansQuery.data,
      remindersQuery.data,
      productsQuery.data ?? []
    );
  }, [plansQuery.data, remindersQuery.data, ordersQuery.data, customersQuery.data, batchesQuery.data, productsQuery.data]);

  return {
    plansQuery,
    remindersQuery,
    ordersQuery,
    customersQuery,
    batchesQuery,
    productsQuery,
    enrichedItems,
    isLoading: plansQuery.isLoading || remindersQuery.isLoading || ordersQuery.isLoading || customersQuery.isLoading || batchesQuery.isLoading || productsQuery.isLoading
  };
}

export function useDeliveryNavBadge() {
  const plansQuery = useQuery({ queryKey: ['order_delivery_plans'], queryFn: api.getOrderDeliveryPlans });
  const remindersQuery = useQuery({ queryKey: ['order_delivery_reminders'], queryFn: api.getOrderDeliveryReminders });

  const badgeCount = useMemo(() => {
    return getDeliveryNavBadgeCount(plansQuery.data || [], remindersQuery.data || []);
  }, [plansQuery.data, remindersQuery.data]);

  return {
    badgeCount,
    isLoading: plansQuery.isLoading || remindersQuery.isLoading
  };
}
