import { api } from '../../lib/supabase';
import { Order, OrderDeliveryPlan, OrderDeliveryReminder, ProductionBatch } from '../../types';

export const deliveriesRepository = {
  getOrderDeliveryPlans: () => api.getOrderDeliveryPlans(),
  getOrderDeliveryReminders: () => api.getOrderDeliveryReminders(),
  saveOrderDeliveryPlan: (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => api.saveOrderDeliveryPlan(plan, reminders),
  updateOrderDeliveryPlan: (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => api.updateOrderDeliveryPlan(plan, reminders),
  deleteOrderDeliveryPlan: (planId: string) => api.deleteOrderDeliveryPlan(planId),
  acknowledgeDeliveryReminder: (reminderId: string) => api.acknowledgeDeliveryReminder(reminderId),
  completeDeliveryReminder: (reminderId: string, completionNote?: string, completedBy?: string) =>
    api.completeDeliveryReminder(reminderId, completionNote, completedBy),
  snoozeDeliveryReminder: (reminderId: string, until: string) => api.snoozeDeliveryReminder(reminderId, until),
  completeOrderDeliveryPlan: (planId: string, orderId: string) => api.completeOrderDeliveryPlan(planId, orderId),
  cancelOrderDeliveryPlan: (planId: string) => api.cancelOrderDeliveryPlan(planId),
  createPartialShipment: (params: {
    orderId: string;
    orderItems: Array<{ sku: string; variant_suffix?: string; quantity: number; price_at_order: number; size_info?: string; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }>;
    items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; quantity: number; price_at_order: number; line_id?: string | null }>;
    shippedBy: string;
    deliveryPlanId?: string | null;
    notes?: string | null;
    allBatches: ProductionBatch[];
  }) => api.createPartialShipment(params),
  getOrderShipments: () => api.getOrderShipments(),
  getOrderShipmentItems: (shipmentId: string) => api.getOrderShipmentItems(shipmentId),
  getShipmentsForOrder: (orderId: string) => api.getShipmentsForOrder(orderId),
  getOrthodoxCalendarEvents: (year: number) => api.getOrthodoxCalendarEvents(year),
  updateOrderStatus: (orderId: string, status: Order['status']) => api.updateOrderStatus(orderId, status),
};
