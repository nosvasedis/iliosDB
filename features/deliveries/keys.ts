export const deliveryKeys = {
  all: ['deliveries'] as const,
  plans: () => ['order_delivery_plans'] as const,
  reminders: () => ['order_delivery_reminders'] as const,
  shipments: () => ['order_shipments'] as const,
  shipmentItems: (shipmentId?: string) =>
    shipmentId ? (['order_shipment_items', shipmentId] as const) : (['order_shipment_items'] as const),
  calendar: (year: number) => ['orthodox_calendar_events', year] as const,
};
