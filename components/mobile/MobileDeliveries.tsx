import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, CalendarRange } from 'lucide-react';
import MobileScreenHeader from './MobileScreenHeader';
import { useOrderDeliveryPlans } from '../../hooks/api/useOrderDeliveryPlans';
import { useDeliveryAlerts } from '../../hooks/useDeliveryAlerts';
import { api } from '../../lib/supabase';
import { EnrichedDeliveryItem, Order, OrderDeliveryPlan, OrderDeliveryReminder, OrderShipment, OrderShipmentItem, OrderStatus } from '../../types';
import { filterDeliveryItems, getDefaultDeliveryFilter, DeliveryFilterKey } from '../../utils/deliveryFilters';
import { formatSelectedDayLabel } from '../../utils/deliveryWorklist';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import DeliveryFilters from '../deliveries/DeliveryFilters';
import DeliveryAlertRail from '../deliveries/DeliveryAlertRail';
import DeliveryAgendaList from '../deliveries/DeliveryAgendaList';
import MobilePlannerSheet from '../deliveries/mobile/MobilePlannerSheet';
import MobileDeliveryDetailSheet from '../deliveries/mobile/MobileDeliveryDetailSheet';
import ShipmentCreationModal from '../deliveries/ShipmentCreationModal';
import ShipmentUndoConfirmationModal from '../deliveries/ShipmentUndoConfirmationModal';
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
  const [shipmentUndoRequest, setShipmentUndoRequest] = useState<{ item: EnrichedDeliveryItem; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null>(null);
  const [isUndoingShipment, setIsUndoingShipment] = useState(false);
  const [loadingReminders, setLoadingReminders] = useState<Set<string>>(new Set());
  const defaultFilterApplied = useRef(false);
  const today = useMemo(() => new Date(), []);

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

  useEffect(() => {
    setSelectedItem((prev) => {
      if (!prev) return null;
      return enrichedItems.find((item) => item.plan.id === prev.plan.id) || null;
    });
  }, [enrichedItems]);

  const filteredItems = useMemo(
    () => filterDeliveryItems(enrichedItems, filter, search),
    [enrichedItems, filter, search]
  );

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

  const handleReminderAction = async (reminder: OrderDeliveryReminder, action: 'complete' | 'snooze') => {
    setLoadingReminders((prev) => new Set(prev).add(reminder.id));
    try {
      if (action === 'complete') await api.completeDeliveryReminder(reminder.id);
      if (action === 'snooze') {
        await api.snoozeDeliveryReminder(reminder.id, new Date(Date.now() + 60 * 60 * 1000).toISOString());
      }
      handleRefresh();
    } finally {
      setLoadingReminders((prev) => {
        const next = new Set(prev);
        next.delete(reminder.id);
        return next;
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
        isDestructive: sr.ready_batches === 0,
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

  const handleRevertShipment = async (shipment: OrderShipment, item: EnrichedDeliveryItem) => {
    try {
      const shipmentItems = await api.getOrderShipmentItems(shipment.id);
      setShipmentUndoRequest({ item, shipment, shipmentItems });
    } catch (e: any) {
      showToast(e?.message || 'Δεν φορτώθηκαν με ασφάλεια τα τεμάχια της αποστολής.', 'error');
    }
  };

  const handleConfirmShipmentUndo = async () => {
    if (!shipmentUndoRequest) return;
    const { shipment, item } = shipmentUndoRequest;
    setIsUndoingShipment(true);
    try {
      await api.revertPartialShipment({
        shipmentId: shipment.id,
        orderId: item.order.id,
        revertedBy: profile?.full_name || 'Σύστημα',
      });
      showToast(`Η αποστολή #${shipment.shipment_number} αναιρέθηκε επιτυχώς.`, 'success');
      await invalidateAndRefetchAfterShipmentChange(queryClient, item.order.id);
      setShipmentUndoRequest(null);
      setSelectedItem(null);
    } catch (e: any) {
      showToast(e?.message || 'Σφάλμα κατά την αναίρεση αποστολής.', 'error');
    } finally {
      setIsUndoingShipment(false);
    }
  };

  const handleConfirmShipment = async (
    items: Array<{
      sku: string;
      variant_suffix?: string | null;
      size_info?: string | null;
      cord_color?: Order['items'][number]['cord_color'];
      enamel_color?: Order['items'][number]['enamel_color'];
      quantity: number;
      price_at_order: number;
      line_id?: string | null;
    }>,
    notes: string | null
  ) => {
    if (!shipmentItem) return;
    const order = shipmentItem.order;
    try {
      await api.createPartialShipment({
        orderId: order.id,
        orderItems: order.items.map((i) => ({
          sku: i.sku,
          variant_suffix: i.variant_suffix,
          quantity: i.quantity,
          price_at_order: i.price_at_order,
          size_info: i.size_info,
          cord_color: i.cord_color,
          enamel_color: i.enamel_color,
          line_id: i.line_id || null,
        })),
        items: items.map((i) => ({
          sku: i.sku,
          variant_suffix: i.variant_suffix,
          size_info: i.size_info,
          cord_color: i.cord_color,
          enamel_color: i.enamel_color,
          quantity: i.quantity,
          price_at_order: i.price_at_order,
          line_id: i.line_id || null,
        })),
        shippedBy: profile?.full_name || 'Σύστημα',
        deliveryPlanId: shipmentItem.plan.id,
        notes,
        allBatches: batchesQuery.data || [],
      });
      await invalidateAndRefetchAfterShipmentChange(queryClient, order.id);
      setSelectedItem(null);
      handleRefresh();
    } catch (e: any) {
      showToast(e?.message || 'Σφάλμα κατά την αποστολή.', 'error');
      throw e;
    }
  };

  return (
    <div className="flex min-h-0 flex-col bg-slate-50 pb-28">
      <MobileScreenHeader
        icon={CalendarRange}
        title="Ημερολόγιο"
        subtitle={`${formatSelectedDayLabel(today)} · κλήσεις & παραδόσεις`}
        iconClassName="text-emerald-700"
        right={(
          <button
            type="button"
            onClick={() => {
              setPlannerOrder(null);
              setSelectedItem(null);
              setIsPlannerOpen(true);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#060b00] text-white shadow-lg transition-transform active:scale-95"
            aria-label="Νέο πλάνο"
          >
            <Plus size={18} />
          </button>
        )}
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pt-3">
        <div className="rounded-xl border border-slate-100 bg-white/80 p-3 space-y-3 shadow-sm">
          <DeliveryAlertRail
            attentionItems={attentionItems}
            onSelectItem={(entry) => setSelectedItem(entry.item)}
            onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
            onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
            onShowAll={() => setFilter('attention')}
            loadingReminders={loadingReminders}
          />
          <DeliveryFilters
            filter={filter}
            search={search}
            onFilterChange={setFilter}
            onSearchChange={setSearch}
            compact
          />
        </div>

        <DeliveryAgendaList
          items={filteredItems}
          selectedItemId={selectedItem?.plan.id || null}
          onSelectItem={setSelectedItem}
          onShowAll={() => setFilter('all')}
          onShowToday={() => setFilter('today')}
          onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
          loadingReminders={loadingReminders}
          grouped={filter === 'today' || filter === 'attention' || filter === 'overdue' || filter === 'all'}
        />
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
        onEditPlan={(item) => {
          setPlannerOrder(item.order);
          setIsPlannerOpen(true);
        }}
        onOpenOrder={(item) => onOpenOrder?.(item.order)}
        onMarkDelivered={handleMarkDelivered}
        onDeletePlan={handleDeletePlan}
        onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
        onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
        onShipReady={handleShipReady}
        onRevertShipment={handleRevertShipment}
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

      {shipmentUndoRequest && (
        <ShipmentUndoConfirmationModal
          order={shipmentUndoRequest.item.order}
          shipment={shipmentUndoRequest.shipment}
          shipmentItems={shipmentUndoRequest.shipmentItems}
          isSubmitting={isUndoingShipment}
          onCancel={() => {
            if (!isUndoingShipment) setShipmentUndoRequest(null);
          }}
          onConfirm={handleConfirmShipmentUndo}
        />
      )}
    </div>
  );
}
