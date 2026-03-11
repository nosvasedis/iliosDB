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
  const shipmentsQuery = useQuery({ queryKey: ['order_shipments'], queryFn: api.getOrderShipments });
  const shipmentItemsQuery = useQuery({ queryKey: ['order_shipment_items'], queryFn: api.getOrderShipmentItems });

  const enrichedItems = useMemo(() => {
    if (!plansQuery.data || !remindersQuery.data || !ordersQuery.data || !customersQuery.data || !batchesQuery.data || !shipmentsQuery.data || !shipmentItemsQuery.data) {
      return [];
    }
    return enrichDeliveryItems(
      ordersQuery.data,
      customersQuery.data,
      batchesQuery.data,
      plansQuery.data,
      remindersQuery.data,
      productsQuery.data ?? [],
      shipmentsQuery.data,
      shipmentItemsQuery.data
    );
  }, [plansQuery.data, remindersQuery.data, ordersQuery.data, customersQuery.data, batchesQuery.data, productsQuery.data, shipmentsQuery.data, shipmentItemsQuery.data]);

  return {
    plansQuery,
    remindersQuery,
    ordersQuery,
    customersQuery,
    batchesQuery,
    productsQuery,
    shipmentsQuery,
    shipmentItemsQuery,
    enrichedItems,
    isLoading: plansQuery.isLoading || remindersQuery.isLoading || ordersQuery.isLoading || customersQuery.isLoading || batchesQuery.isLoading || productsQuery.isLoading || shipmentsQuery.isLoading || shipmentItemsQuery.isLoading
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
