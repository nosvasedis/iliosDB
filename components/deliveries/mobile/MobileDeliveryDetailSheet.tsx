import React from 'react';
import { X } from 'lucide-react';
import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../../../types';
import DeliveryDetailPanel from '../DeliveryDetailPanel';

interface Props {
  item?: EnrichedDeliveryItem | null;
  onClose: () => void;
  onEditPlan: (item: EnrichedDeliveryItem) => void;
  onOpenOrder: (item: EnrichedDeliveryItem) => void;
  onMarkDelivered: (item: EnrichedDeliveryItem) => void;
  onDeletePlan: (item: EnrichedDeliveryItem) => void;
  onAcknowledgeReminder: (reminder: OrderDeliveryReminder) => void;
  onCompleteReminder: (reminder: OrderDeliveryReminder) => void;
  onSnoozeReminder: (reminder: OrderDeliveryReminder) => void;
}

export default function MobileDeliveryDetailSheet(props: Props) {
  if (!props.item) return null;

  return (
    <div className="fixed inset-0 z-[165] bg-slate-900/50 backdrop-blur-sm flex items-end">
      <div className="w-full max-h-[92vh] overflow-y-auto bg-slate-50 rounded-t-[2.5rem] p-4 pb-safe animate-in slide-in-from-bottom-full duration-300">
        <div className="flex justify-end mb-3">
          <button onClick={props.onClose} className="w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <DeliveryDetailPanel
          item={props.item}
          onEditPlan={props.onEditPlan}
          onOpenOrder={props.onOpenOrder}
          onMarkDelivered={props.onMarkDelivered}
          onDeletePlan={props.onDeletePlan}
          onAcknowledgeReminder={props.onAcknowledgeReminder}
          onCompleteReminder={props.onCompleteReminder}
          onSnoozeReminder={props.onSnoozeReminder}
        />
      </div>
    </div>
  );
}
