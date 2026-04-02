import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useOrthodoxCalendarEvents } from '../hooks/api/useOrthodoxCalendarEvents';
import { useOrderDeliveryPlans } from '../hooks/api/useOrderDeliveryPlans';
import { useDeliveryAlerts } from '../hooks/useDeliveryAlerts';
import { api } from '../lib/supabase';
import { EnrichedDeliveryItem, Order, OrderDeliveryPlan, OrderDeliveryReminder, OrderStatus } from '../types';
import { endOfDay, startOfDay } from '../utils/deliveryScheduling';
import { getOrderDisplayName } from '../utils/deliveryLabels';
import { getCalendarDayEvents } from '../utils/namedays';
import { useAuth } from './AuthContext';
import { useUI } from './UIProvider';
import DeliveryAgendaList from './deliveries/DeliveryAgendaList';
import DeliveryAlertRail from './deliveries/DeliveryAlertRail';
import DeliveryCalendarGrid from './deliveries/DeliveryCalendarGrid';
import DeliveryDetailPanel from './deliveries/DeliveryDetailPanel';
import DeliveryFilters, { DeliveryFilterKey } from './deliveries/DeliveryFilters';
import DeliveryPlannerModal from './deliveries/DeliveryPlannerModal';
import DeliverySummaryCards from './deliveries/DeliverySummaryCards';
import ShipmentCreationModal from './deliveries/ShipmentCreationModal';
import { invalidateOrdersAndBatches } from '../lib/queryInvalidation';

interface Props {
  pendingOrderId?: string | null;
  onConsumePendingOrderId?: () => void;
  onOpenOrder?: (order: Order) => void;
}

function filterItems(items: EnrichedDeliveryItem[], filter: DeliveryFilterKey, search: string) {
  return items.filter((item) => {
    const targetTime = new Date(item.target_date || item.window_start || item.plan.created_at).getTime();
    const displayName = getOrderDisplayName(item.order);
    const matchesSearch = search.trim() === ''
      || displayName.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR'))
      || item.order.id.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR'))
      || item.call_reasons.some((reason) => reason.toLocaleLowerCase('el-GR').includes(search.toLocaleLowerCase('el-GR')));

    if (!matchesSearch) return false;
    if (filter === 'all') return item.plan.plan_status === 'active';
    if (filter === 'completed') return item.plan.plan_status !== 'active';
    if (filter === 'overdue') return item.urgency === 'overdue';
    if (filter === 'today') return item.urgency === 'today';
    if (filter === 'week') return targetTime <= Date.now() + (7 * 24 * 60 * 60 * 1000);
    if (filter === 'month') return new Date(targetTime).getMonth() === new Date().getMonth();
    if (filter === 'holiday') return item.plan.planning_mode === 'holiday_anchor' || !!item.next_nameday;
    if (filter === 'call_needed') return item.needs_call;
    return true;
  });
}

export default function DeliveriesPage({ pendingOrderId, onConsumePendingOrderId, onOpenOrder }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { profile } = useAuth();
  const { plansQuery, remindersQuery, ordersQuery, customersQuery, batchesQuery, productsQuery, enrichedItems, isLoading } = useOrderDeliveryPlans();
  const [monthDate, setMonthDate] = useState(new Date());
  const orthodoxEventsQuery = useOrthodoxCalendarEvents(monthDate.getFullYear());
  const { alerts, notificationPermission, requestBrowserPermission } = useDeliveryAlerts(enrichedItems, showToast);
  const [filter, setFilter] = useState<DeliveryFilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState<EnrichedDeliveryItem | null>(null);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerOrder, setPlannerOrder] = useState<Order | null>(null);
  const [shipmentItem, setShipmentItem] = useState<EnrichedDeliveryItem | null>(null);
  const [loadingReminders, setLoadingReminders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pendingOrderId || !ordersQuery.data) return;
    const pendingOrder = ordersQuery.data.find((order) => order.id === pendingOrderId);
    if (pendingOrder) {
      setPlannerOrder(pendingOrder);
      setIsPlannerOpen(true);
      onConsumePendingOrderId?.();
    }
  }, [ordersQuery.data, onConsumePendingOrderId, pendingOrderId]);

  const filteredItems = useMemo(() => filterItems(enrichedItems, filter, search), [enrichedItems, filter, search]);

  const agendaItems = useMemo(() => {
    const start = startOfDay(selectedDate).getTime();
    const end = endOfDay(selectedDate).getTime();
    const exactMatches = filteredItems.filter((item) => {
      const time = new Date(item.target_date || item.window_start || item.plan.created_at).getTime();
      return time >= start && time <= end;
    });
    return exactMatches.length > 0 ? exactMatches : filteredItems;
  }, [filteredItems, selectedDate]);

  const selectedDateEvents = useMemo(
    () => getCalendarDayEvents(selectedDate, orthodoxEventsQuery.data || []),
    [orthodoxEventsQuery.data, selectedDate]
  );

  const stats = useMemo(() => ({
    overdue: enrichedItems.filter((item) => item.urgency === 'overdue').length,
    today: enrichedItems.filter((item) => item.urgency === 'today').length,
    upcoming: enrichedItems.filter((item) => {
      const time = new Date(item.target_date || item.window_start || item.plan.created_at).getTime();
      return time > Date.now() && time <= Date.now() + (7 * 24 * 60 * 60 * 1000);
    }).length,
    callNeeded: enrichedItems.filter((item) => item.needs_call).length
  }), [enrichedItems]);

  const plannerPlan = useMemo(() => {
    if (!plannerOrder) return null;
    return selectedItem?.order.id === plannerOrder.id
      ? selectedItem.plan
      : plansQuery.data?.find((plan) => plan.order_id === plannerOrder.id) || null;
  }, [plannerOrder, plansQuery.data, selectedItem]);

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
      showToast('Το πλάνο παράδοσης ενημερώθηκε.', 'success');
    } else {
      await api.saveOrderDeliveryPlan(plan, reminders);
      showToast('Το πλάνο παράδοσης αποθηκεύτηκε.', 'success');
    }
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
          ? `Κανένα τμήμα παραγωγής δεν είναι έτοιμο (0/${sr.total_batches}). Θέλετε σίγουρα να τη σημειώσετε ως παραδομένη;`
          : `Η παραγγελία δεν είναι πλήρως έτοιμη (${sr.ready_batches}/${sr.total_batches} τμήματα). Θέλετε σίγουρα να τη σημειώσετε ως παραδομένη;`,
        confirmText: 'Ναι, σήμανση ως παραδομένη',
        isDestructive: sr.ready_batches === 0
      });
      if (!confirmed) return;
    }
    await api.completeOrderDeliveryPlan(item.plan.id, item.order.id);
    showToast('Η παράδοση σημειώθηκε ως ολοκληρωμένη.', 'success');
    handleRefresh();
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
    await api.createPartialShipment({
      orderId: order.id,
      orderItems: order.items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, quantity: i.quantity, price_at_order: i.price_at_order, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, line_id: i.line_id || null })),
      items: items.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, quantity: i.quantity, price_at_order: i.price_at_order, line_id: i.line_id || null })),
      shippedBy: profile?.full_name || 'Σύστημα',
      deliveryPlanId: shipmentItem.plan.id,
      notes,
      allBatches: batchesQuery.data || []
    });
    showToast(`Αποστολή #${items.reduce((s, i) => s + i.quantity, 0)} τεμαχίων καταχωρήθηκε επιτυχώς.`, 'success');
    setShipmentItem(null);
    setSelectedItem(null);
    handleRefresh();
  };

  if (isLoading) {
    return <div className="p-8 text-slate-500 font-medium">Φόρτωση ημερολογίου...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Ημερολόγιο</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Ατζέντα ημέρας, ενέργειες που χρειάζονται τώρα και λεπτομέρειες ανά παράδοση.</p>
        </div>
        <div className="flex gap-3">
          {notificationPermission !== 'granted' && (
            <button onClick={requestBrowserPermission} className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2">
              <Bell size={16} /> Ενεργοποίηση ειδοποιήσεων
            </button>
          )}
          <button onClick={() => { setPlannerOrder(null); setSelectedItem(null); setIsPlannerOpen(true); }} className="px-4 py-3 rounded-2xl bg-[#060b00] text-white font-bold text-sm flex items-center gap-2">
            <Plus size={16} /> Νέο πλάνο
          </button>
        </div>
      </div>

      <DeliverySummaryCards stats={stats} />
      <DeliveryFilters filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} />

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.95fr] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
            <button onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))} className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <div className="text-sm font-black uppercase tracking-wide text-slate-400">Μήνας προβολής</div>
              <div className="text-xl font-black text-slate-900 mt-1">{monthDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}</div>
            </div>
            <button onClick={() => setMonthDate(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))} className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
              <ChevronRight size={18} />
            </button>
          </div>

          <DeliveryCalendarGrid monthDate={monthDate} items={filteredItems} majorEvents={orthodoxEventsQuery.data || []} selectedDate={selectedDate} selectedItem={selectedItem} onSelectDate={setSelectedDate} onSelectItem={setSelectedItem} />
          <DeliveryAgendaList items={agendaItems} onSelectItem={setSelectedItem} dayEvents={selectedDateEvents} />
        </div>

        <div className="space-y-6">
          <DeliveryAlertRail
            items={filteredItems}
            onSelectItem={setSelectedItem}
            onAcknowledgeReminder={(reminder) => handleReminderAction(reminder, 'ack')}
            onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
            onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
            loadingReminders={loadingReminders}
          />
          <DeliveryDetailPanel
            item={selectedItem}
            onEditPlan={(item) => { setPlannerOrder(item.order); setSelectedItem(item); setIsPlannerOpen(true); }}
            onOpenOrder={(item) => onOpenOrder?.(item.order)}
            onMarkDelivered={handleMarkDelivered}
            onDeletePlan={handleDeletePlan}
            onAcknowledgeReminder={(reminder) => handleReminderAction(reminder, 'ack')}
            onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
            onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
            onShipReady={handleShipReady}
            loadingReminders={loadingReminders}
          />
        </div>
      </div>

      <DeliveryPlannerModal
        isOpen={isPlannerOpen}
        onClose={() => setIsPlannerOpen(false)}
        onSave={handleSavePlan}
        orders={(ordersQuery.data || []).filter((o) => o.status !== OrderStatus.Delivered)}
        customers={customersQuery.data || []}
        selectedOrder={plannerOrder}
        existingPlan={plannerPlan}
        existingReminders={plannerReminders}
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

      {alerts.length > 0 && <div className="hidden">{alerts.length}</div>}
    </div>
  );
}
