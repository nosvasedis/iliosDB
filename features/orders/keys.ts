export const orderKeys = {
  all: ['orders'] as const,
  customers: () => ['customers'] as const,
  list: () => [...orderKeys.all, 'list'] as const,
  detail: (orderId: string) => [...orderKeys.all, 'detail', orderId] as const,
  shipments: () => [...orderKeys.all, 'shipments'] as const,
  shipmentsForOrder: (orderId: string) => [...orderKeys.all, 'shipments', orderId] as const,
  shipmentItems: () => [...orderKeys.all, 'shipment-items'] as const,
  deliveryPlans: () => [...orderKeys.all, 'delivery-plans'] as const,
  deliveryReminders: () => [...orderKeys.all, 'delivery-reminders'] as const,
};
