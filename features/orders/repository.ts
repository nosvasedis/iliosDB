import { api } from '../../lib/supabase';
import { Customer, Material, Order, OrderShipment, OrderShipmentItem, Product, ProductionBatch } from '../../types';

export const ordersRepository = {
  getOrders: () => api.getOrders(),
  getCustomers: () => api.getCustomers(),
  saveCustomer: (customer: Customer) => api.saveCustomer(customer),
  updateCustomer: (customerId: string, customer: Customer) => api.updateCustomer(customerId, customer),
  deleteCustomer: (customerId: string) => api.deleteCustomer(customerId),
  saveOrder: (order: Order) => api.saveOrder(order),
  updateOrder: (order: Order, isNewPart?: boolean) => api.updateOrder(order, isNewPart),
  deleteOrder: (orderId: string) => api.deleteOrder(orderId),
  archiveOrder: (orderId: string, archive: boolean) => api.archiveOrder(orderId, archive),
  updateOrderStatus: (orderId: string, status: Order['status']) => api.updateOrderStatus(orderId, status),
  sendOrderToProduction: (orderId: string, products: Product[], materials: Material[]) =>
    api.sendOrderToProduction(orderId, products, materials),
  sendPartialOrderToProduction: (
    orderId: string,
    itemsToSend: Array<{ sku: string; variant: string | null; qty: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; notes?: string; line_id?: string | null }>,
    products: Product[],
    materials: Material[],
    stockFulfilledItems?: Array<{ sku: string; variant_suffix: string | null; qty: number; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>,
  ) => api.sendPartialOrderToProduction(orderId, itemsToSend, products, materials, stockFulfilledItems),
  revertOrderFromProduction: (orderId: string) => api.revertOrderFromProduction(orderId),
  createPartialShipment: (params: {
    orderId: string;
    orderItems: Array<{ sku: string; variant_suffix?: string; quantity: number; price_at_order: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>;
    items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }>;
    shippedBy: string;
    deliveryPlanId?: string | null;
    notes?: string | null;
    allBatches: ProductionBatch[];
  }) => api.createPartialShipment(params),
  getShipments: (): Promise<OrderShipment[]> => api.getOrderShipments(),
  getShipmentItems: (shipmentId: string): Promise<OrderShipmentItem[]> => api.getOrderShipmentItems(shipmentId),
  getShipmentsForOrder: (orderId: string) => api.getShipmentsForOrder(orderId),
  revertPartialShipment: (params: { shipmentId: string; orderId: string; revertedBy: string }) =>
    api.revertPartialShipment(params),
};
