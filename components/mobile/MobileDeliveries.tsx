import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarRange } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { useOrderDeliveryPlans } from '../../hooks/api/useOrderDeliveryPlans';
import { useDeliveryAlerts } from '../../hooks/useDeliveryAlerts';
import { api } from '../../lib/supabase';
import { EnrichedDeliveryItem, Order, OrderDeliveryPlan, OrderDeliveryReminder, OrderStatus } from '../../types';
import { filterDeliveryItems, getDefaultDeliveryFilter } from '../../utils/deliveryFilters';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import DeliveryFilters, { DeliveryFilterKey } from '../deliveries/DeliveryFilters';
import DeliveryAlertRail from '../deliveries/DeliveryAlertRail';
import MobilePlannerSheet from '../deliveries/mobile/MobilePlannerSheet';
import MobileDeliveryDayList from '../deliveries/mobile/MobileDeliveryDayList';
import MobileDeliveryDetailSheet from '../deliveries/mobile/MobileDeliveryDetailSheet';
import ShipmentCreationModal from '../deliveries/ShipmentCreationModal';
import { invalidateAndRefetchAfterShipmentChange, invalidateOrdersAndBatches } from '../../lib/queryInvalidation';

interface Props {
  pendingOrderId?: string | null;
  onConsumePendingOrderId?: () => void;
  onOpenOrder?: (order: Order) => void;
}

export default function MobileDeliveries({ pendingOrderId, onConsumePendingOrderId, onOpenOrder }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { profile } = useAuth();
  const { plansQuery, remindersQuery, ordersQuery, customersQuery, batchesQuery, productsQuery, enrichedItems, isLoading } = useOrderDeliveryPlans();
  const { attentionItems } = useDeliveryAlerts(enrichedItems);
  const [filter, setFilter] = useState<DeliveryFilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<EnrichedDeliveryItem | null>(null);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerOrder, setPlannerOrder] = useState<Order | null>(null);
  const [shipmentItem, setShipmentItem] = useState<EnrichedDeliveryItem | null>(null);
  const [loadingReminders, setLoadingReminders] = useState<Set<string>>(new Set());
  const defaultFilterApplied = useRef(false);

  useEffect(() => {
    if (defaultFilterApplied.current || isLoading) return;
    setFilter(getDefaultDeliveryFilter(enrichedItems));
    defaultFilterApplied.current = true;
  }, [enrichedItems, isLoading]);

  useEffect(() => {
    if (!pendingOrderId || !ordersQuery.data) return;
    const pendingOrder = ordersQuery.data.find((order) => order.id === pendingOrderId);
    if (pendingOrder) {
      setPlannerOrder(pendingOrder);
      setIsPlannerOpen(true);
      onConsumePendingOrderId?.();
    }
  }, [ordersQuery.data, onConsumePendingOrderId, pendingOrderId]);

  const filteredItems = useMemo(() => filterDeliveryItems(enrichedItems, filter, search), [enrichedItems, filter, search]);

  const plannerPlan = useMemo(() => {
    if (!plannerOrder) return null;
    return plansQuery.data?.find((plan) => plan.order_id === plannerOrder.id) || null;
  }, [plannerOrder, plansQuery.data]);

  const plannerReminders = useMemo(() => {
    if (!plannerPlan) return [];
    return remindersQuery.data?.filter((reminder) => reminder.plan_id === plannerPlan.id) || [];
  }, [plannerPlan, remindersQuery.data]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['order_delivery_plans'] });
    queryClient.invalidateQueries({ queryKey: ['order_delivery_reminders'] });
    void invalidateOrdersAndBatches(queryClient);
    queryClient.invalidateQueries({ queryKey: ['order_shipments'] });
    queryClient.invalidateQueries({ queryKey: ['orthodox_calendar_events'] });
  };

  const handleSavePlan = async (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => {
    if (plansQuery.data?.some((item) => item.id === plan.id)) {
      await api.updateOrderDeliveryPlan(plan, reminders);
    } else {
      await api.saveOrderDeliveryPlan(plan, reminders);
    }
    showToast('Το πλάνο παράδοσης αποθηκεύτηκε.', 'success');
    handleRefresh();
  };

  const handleReminderAction = async (reminder: OrderDeliveryReminder, action: 'ack' | 'complete' | 'snooze') => {
    setLoadingReminders(prev => new Set(prev).add(reminder.id));
    try {
      if (action === 'ack') await api.acknowledgeDeliveryReminder(reminder.id);
      if (action === 'complete') await api.completeDeliveryReminder(reminder.id);
      if (action === 'snooze') await api.snoozeDeliveryReminder(reminder.id, new Date(Date.now() + (60 * 60 * 1000)).toISOString());
      handleRefresh();
    } finally {
      setLoadingReminders(prev => {
        const newSet = new Set(prev);
        newSet.delete(reminder.id);
        return newSet;
      });
    }
  };

  const handleMarkDelivered = async (item: EnrichedDeliveryItem) => {
    const sr = item.shipment_readiness;
    if (sr && sr.total_batches > 0 && !sr.is_fully_ready) {
      const confirmed = await confirm({
        title: sr.ready_batches === 0 ? 'Δεν υπάρχει ετοιμότητα' : 'Μερική Ετοιμότητα',
        message: sr.ready_batches === 0
          ? `Κανένα τεμάχιο δεν είναι έτοιμο (0/${sr.total_qty} τεμ. σε παραγωγή). Θέλετε σίγουρα να τη σημειώσετε ως παραδομένη;`
          : `Η παραγγελία δεν είναι πλήρως έτοιμη (${sr.ready_qty}/${sr.total_qty} τεμ. έτοιμα). Θέλετε σίγουρα να τη σημειώσετε ως παραδομένη;`,
        confirmText: 'Ναι, σήμανση ως παραδομένη',
        isDestructive: sr.ready_batches === 0
      });
      if (!confirmed) return;
    }
    await api.completeOrderDeliveryPlan(item.plan.id, item.order.id);
    showToast('Η παράδοση σημειώθηκε ως ολοκληρωμένη.', 'success');
    handleRefresh();
    setSelectedItem(null);
  };

  const handleDeletePlan = async (item: EnrichedDeliveryItem) => {
    await api.deleteOrderDeliveryPlan(item.plan.id);
    showToast('Το πλάνο παράδοσης διαγράφηκε.', 'success');
    setSelectedItem(null);
    handleRefresh();
  };

  const handleShipReady = (item: EnrichedDeliveryItem) => {
    setShipmentItem(item);
  };

  const handleConfirmShipment = async (
    items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: Order['items'][number]['cord_color']; enamel_color?: Order['items'][number]['enamel_color']; quantity: number; price_at_order: number; line_id?: string | null }>,
    notes: string | null
  ) => {
    if (!shipmentItem) return;
    const order = shipmentItem.order;
    try {
      await api.createPartialShipment({
        orderId: order.id,
        orderItems: order.items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, quantity: i.quantity, price_at_order: i.price_at_order, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, line_id: i.line_id || null })),
        items: items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, quantity: i.quantity, price_at_order: i.price_at_order, line_id: i.line_id || null })),
        shippedBy: profile?.full_name || 'Σύστημα',
        deliveryPlanId: shipmentItem.plan.id,
        notes,
        allBatches: batchesQuery.data || []
      });
      await invalidateAndRefetchAfterShipmentChange(queryClient, order.id);
      showToast(`Αποστολή #${items.reduce((s, i) => s + i.quantity, 0)} τεμαχίων καταχωρήθηκε επιτυχώς.`, 'success');
      setShipmentItem(null);
      setSelectedItem(null);
      handleRefresh();
    } catch (e: any) {
      showToast(e?.message || 'Σφάλμα κατά την αποστολή.', 'error');
      throw e;
    }
  };

  if (isLoading) {
    return <div className="p-4 text-sm font-medium text-slate-500">Φόρτωση ημερολογίου...</div>;
  }

  return (
    <div className="flex min-h-0 flex-col bg-slate-50 pb-28">
      <MobileScreenHeader
        icon={CalendarRange}
        title="Ημερολόγιο"
        subtitle="Προγραμματισμένες παραδόσεις"
        iconClassName="text-emerald-700"
        right={
          <button
            type="button"
            onClick={() => { setPlannerOrder(null); setSelectedItem(null); setIsPlannerOpen(true); }}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#060b00] text-white shadow-lg transition-transform active:scale-95"
            aria-label="Νέο πλάνο"
          >
            <Plus size={18} />
          </button>
        }
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pt-3">
        <DeliveryAlertRail
          attentionItems={attentionItems}
          onSelectItem={(entry) => setSelectedItem(entry.item)}
          onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
          onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
          onShowAll={() => setFilter('today')}
          loadingReminders={loadingReminders}
        />

        <DeliveryFilters filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} />

        <MobileDeliveryDayList items={filteredItems} onSelect={setSelectedItem} />
      </div>

      <MobilePlannerSheet
        isOpen={isPlannerOpen}
        onClose={() => setIsPlannerOpen(false)}
        onSave={handleSavePlan}
        orders={(ordersQuery.data || []).filter((o) => o.status !== OrderStatus.Delivered)}
        customers={customersQuery.data || []}
        selectedOrder={plannerOrder}
        existingPlan={plannerPlan}
        existingReminders={plannerReminders}
      />

      <MobileDeliveryDetailSheet
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onEditPlan={(item) => { setPlannerOrder(item.order); setIsPlannerOpen(true); }}
        onOpenOrder={(item) => onOpenOrder?.(item.order)}
        onMarkDelivered={handleMarkDelivered}
        onDeletePlan={handleDeletePlan}
        onAcknowledgeReminder={(reminder) => handleReminderAction(reminder, 'ack')}
        onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
        onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
        onShipReady={handleShipReady}
        loadingReminders={loadingReminders}
      />

      {shipmentItem && (
        <ShipmentCreationModal
          order={shipmentItem.order}
          batches={batchesQuery.data || []}
          products={productsQuery.data || []}
          deliveryPlanId={shipmentItem.plan.id}
          userName={profile?.full_name || 'Σύστημα'}
          onConfirm={handleConfirmShipment}
          onClose={() => setShipmentItem(null)}
        />
      )}
    </div>
  );
}
