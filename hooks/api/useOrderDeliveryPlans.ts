import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { OrderShipment } from '../../types';
import { getDeliveryNavBadgeCount, enrichDeliveryItems } from '../../utils/deliveryScheduling';
import { deliveriesRepository, deliveryKeys } from '../../features/deliveries';
import { useCustomers, useOrders } from './useOrders';
import { useProductionBatches } from './useProductionBatches';
import { useProducts } from './useProducts';

export function useOrderDeliveryPlans() {
  const plansQuery = useQuery({ queryKey: deliveryKeys.plans(), queryFn: deliveriesRepository.getOrderDeliveryPlans });
  const remindersQuery = useQuery({ queryKey: deliveryKeys.reminders(), queryFn: deliveriesRepository.getOrderDeliveryReminders });
  const ordersQuery = useOrders();
  const customersQuery = useCustomers();
  const batchesQuery = useProductionBatches();
  const productsQuery = useProducts();
  const shipmentsQuery = useQuery({ queryKey: deliveryKeys.shipments(), queryFn: deliveriesRepository.getOrderShipments });

  const enrichedItems = useMemo(() => {
    if (!plansQuery.data || !remindersQuery.data || !ordersQuery.data || !customersQuery.data || !batchesQuery.data) {
      return [];
    }
    const items = enrichDeliveryItems(
      ordersQuery.data,
      customersQuery.data,
      batchesQuery.data,
      plansQuery.data,
      remindersQuery.data,
      productsQuery.data ?? []
    );

    // Attach shipment history per order
    const shipments = shipmentsQuery.data || [];
    if (shipments.length > 0) {
      const byOrder = new Map<string, OrderShipment[]>();
      for (const s of shipments) {
        const list = byOrder.get(s.order_id);
        if (list) list.push(s);
        else byOrder.set(s.order_id, [s]);
      }
      for (const item of items) {
        item.shipment_history = byOrder.get(item.order.id);
      }
    }

    return items;
  }, [plansQuery.data, remindersQuery.data, ordersQuery.data, customersQuery.data, batchesQuery.data, productsQuery.data, shipmentsQuery.data]);

  return {
    plansQuery,
    remindersQuery,
    ordersQuery,
    customersQuery,
    batchesQuery,
    productsQuery,
    shipmentsQuery,
    enrichedItems,
    isLoading: plansQuery.isLoading || remindersQuery.isLoading || ordersQuery.isLoading || customersQuery.isLoading || batchesQuery.isLoading || productsQuery.isLoading
  };
}

export function useDeliveryNavBadge() {
  const plansQuery = useQuery({ queryKey: deliveryKeys.plans(), queryFn: deliveriesRepository.getOrderDeliveryPlans });
  const remindersQuery = useQuery({ queryKey: deliveryKeys.reminders(), queryFn: deliveriesRepository.getOrderDeliveryReminders });

  const badgeCount = useMemo(() => {
    return getDeliveryNavBadgeCount(plansQuery.data || [], remindersQuery.data || []);
  }, [plansQuery.data, remindersQuery.data]);

  return {
    badgeCount,
    isLoading: plansQuery.isLoading || remindersQuery.isLoading
  };
}
