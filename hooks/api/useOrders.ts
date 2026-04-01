import { useQuery } from '@tanstack/react-query';
import { orderKeys, ordersRepository } from '../../features/orders';
import { Order, OrderShipment, OrderShipmentItem } from '../../types';

export const useOrders = () => {
  return useQuery<Order[]>({
    queryKey: orderKeys.all,
    queryFn: ordersRepository.getOrders,
  });
};

export const useCustomers = () => {
  return useQuery({
    queryKey: orderKeys.customers(),
    queryFn: ordersRepository.getCustomers,
  });
};

export const useOrderShipmentsForOrder = (orderId: string) => {
  return useQuery<{ shipments: OrderShipment[]; items: OrderShipmentItem[] }>({
    queryKey: orderKeys.shipmentsForOrder(orderId),
    queryFn: () => ordersRepository.getShipmentsForOrder(orderId),
    enabled: !!orderId,
  });
};
