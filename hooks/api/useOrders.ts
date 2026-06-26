import { useQuery } from '@tanstack/react-query';
import { orderKeys, ordersRepository } from '../../features/orders';
import { Order, OrderShipment, OrderShipmentItem } from '../../types';

const THIRTY_MINUTES_MS = 1000 * 60 * 30;

type OrdersQueryOptions = {
  staleTime?: number;
  refetchOnMount?: boolean | 'always';
  enabled?: boolean;
};

export const useOrdersList = () => {
  return useQuery<Order[]>({
    queryKey: orderKeys.list(),
    queryFn: ordersRepository.getOrdersList,
    staleTime: THIRTY_MINUTES_MS,
  });
};

/** Full orders with items JSON — use only where line-item detail is required for every order. */
export const useOrdersWithItems = (options: OrdersQueryOptions = {}) => {
  return useQuery<Order[]>({
    queryKey: orderKeys.all,
    queryFn: ordersRepository.getOrders,
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? THIRTY_MINUTES_MS,
    refetchOnMount: options.refetchOnMount,
  });
};

export const useOrders = () => useOrdersList();

export const useOrderDetail = (orderId: string | null | undefined) => {
  return useQuery<Order | null>({
    queryKey: orderKeys.detail(orderId || ''),
    queryFn: () => (orderId ? ordersRepository.getOrderById(orderId) : Promise.resolve(null)),
    enabled: !!orderId,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useProductionBoardOrders = () => {
  return useQuery<Order[]>({
    queryKey: orderKeys.productionBoard(),
    queryFn: ordersRepository.getProductionBoardOrders,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useCustomers = () => {
  return useQuery({
    queryKey: orderKeys.customers(),
    queryFn: ordersRepository.getCustomers,
    staleTime: THIRTY_MINUTES_MS,
  });
};

export const useOrderShipmentsForOrder = (orderId: string) => {
  return useQuery<{ shipments: OrderShipment[]; items: OrderShipmentItem[] }>({
    queryKey: orderKeys.shipmentsForOrder(orderId),
    queryFn: () => ordersRepository.getShipmentsForOrder(orderId),
    enabled: !!orderId,
  });
};

export const useAllShipments = (options: OrdersQueryOptions = {}) => {
  return useQuery<OrderShipment[]>({
    queryKey: orderKeys.shipments(),
    queryFn: ordersRepository.getShipments,
    enabled: options.enabled ?? true,
  });
};

export const useAllShipmentItems = (options: OrdersQueryOptions = {}) => {
  return useQuery<OrderShipmentItem[]>({
    queryKey: orderKeys.shipmentItems(),
    queryFn: ordersRepository.getAllShipmentItems,
    enabled: options.enabled ?? true,
  });
};
