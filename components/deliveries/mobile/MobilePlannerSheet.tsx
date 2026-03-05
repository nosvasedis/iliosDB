import React from 'react';
import { Customer, Order, OrderDeliveryPlan, OrderDeliveryReminder } from '../../../types';
import DeliveryPlannerModal from '../DeliveryPlannerModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => Promise<void>;
  orders: Order[];
  customers: Customer[];
  selectedOrder?: Order | null;
  existingPlan?: OrderDeliveryPlan | null;
  existingReminders?: OrderDeliveryReminder[];
}

export default function MobilePlannerSheet(props: Props) {
  return <DeliveryPlannerModal {...props} mobile />;
}
