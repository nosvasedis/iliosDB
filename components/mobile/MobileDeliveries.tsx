import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Sparkles } from 'lucide-react';
import { useOrthodoxCalendarEvents } from '../../hooks/api/useOrthodoxCalendarEvents';
import { useOrderDeliveryPlans } from '../../hooks/api/useOrderDeliveryPlans';
import { useDeliveryAlerts } from '../../hooks/useDeliveryAlerts';
import { api } from '../../lib/supabase';
import { EnrichedDeliveryItem, Order, OrderDeliveryPlan, OrderDeliveryReminder, OrderShipment, OrderShipmentItem, OrderStatus } from '../../types';
import { getOrderDisplayName } from '../../utils/deliveryLabels';
import { getTodayEortologioSummary } from '../../utils/namedays';
import { useUI } from '../UIProvider';
import DeliveryFilters, { DeliveryFilterKey } from '../deliveries/DeliveryFilters';
import DeliverySummaryCards from '../deliveries/DeliverySummaryCards';
import MobilePlannerSheet from '../deliveries/mobile/MobilePlannerSheet';
import MobileDeliveryDayList from '../deliveries/mobile/MobileDeliveryDayList';
import MobileDeliveryDetailSheet from '../deliveries/mobile/MobileDeliveryDetailSheet';

interface Props {
  pendingOrderId?: string | null;
  onConsumePendingOrderId?: () => void;
  onOpenOrder?: (order: Order) => void;
  onPrintShipmentDocument?: (order: Order, shipment: OrderShipment, shipmentItems: OrderShipmentItem[], fulfillment?: any) => void;
}

function filterItems(items: EnrichedDeliveryItem[], filter: DeliveryFilterKey, search: string) {
  return items.filter((item) => {
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
    if (filter === 'week') return new Date(item.target_date || item.window_start || item.plan.created_at).getTime() <= Date.now() + (7 * 24 * 60 * 60 * 1000);
    if (filter === 'month') return new Date(item.target_date || item.window_start || item.plan.created_at).getMonth() === new Date().getMonth();
    if (filter === 'holiday') return item.plan.planning_mode === 'holiday_anchor' || !!item.next_nameday;
    if (filter === 'call_needed') return item.needs_call;
    return true;
  });
}

export default function MobileDeliveries({ pendingOrderId, onConsumePendingOrderId, onOpenOrder, onPrintShipmentDocument }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { plansQuery, remindersQuery, ordersQuery, customersQuery, enrichedItems, isLoading } = useOrderDeliveryPlans();
  const orthodoxEventsQuery = useOrthodoxCalendarEvents(new Date().getFullYear());
  const { alerts, notificationPermission, requestBrowserPermission } = useDeliveryAlerts(enrichedItems, showToast);
  const [filter, setFilter] = useState<DeliveryFilterKey>('all');
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<EnrichedDeliveryItem | null>(null);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [plannerOrder, setPlannerOrder] = useState<Order | null>(null);

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
    return plansQuery.data?.find((plan) => plan.order_id === plannerOrder.id) || null;
  }, [plannerOrder, plansQuery.data]);

  const plannerReminders = useMemo(() => {
    if (!plannerPlan) return [];
    return remindersQuery.data?.filter((reminder) => reminder.plan_id === plannerPlan.id) || [];
  }, [plannerPlan, remindersQuery.data]);

  const todayNamedays = useMemo(() => getTodayEortologioSummary(new Date(), orthodoxEventsQuery.data || []), [orthodoxEventsQuery.data]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['order_delivery_plans'] });
    queryClient.invalidateQueries({ queryKey: ['order_delivery_reminders'] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    queryClient.invalidateQueries({ queryKey: ['batches'] });
    queryClient.invalidateQueries({ queryKey: ['order_shipments'] });
    queryClient.invalidateQueries({ queryKey: ['order_shipment_items'] });
    queryClient.invalidateQueries({ queryKey: ['orthodox_calendar_events'] });
  };

  const handleSavePlan = async (plan: OrderDeliveryPlan, reminders: OrderDeliveryReminder[]) => {
    if (plansQuery.data?.some((item) => item.id === plan.id)) {
      await api.updateOrderDeliveryPlan(plan, reminders);
    } else {
      await api.saveOrderDeliveryPlan(plan, reminders);
    }
    showToast('Delivery plan saved.', 'success');
    handleRefresh();
  };

  const handleReminderAction = async (reminder: OrderDeliveryReminder, action: 'ack' | 'complete' | 'snooze') => {
    if (action === 'ack') await api.acknowledgeDeliveryReminder(reminder.id);
    if (action === 'complete') await api.completeDeliveryReminder(reminder.id);
    if (action === 'snooze') await api.snoozeDeliveryReminder(reminder.id, new Date(Date.now() + (60 * 60 * 1000)).toISOString());
    handleRefresh();
  };

  const handleCreateShipment = async (item: EnrichedDeliveryItem) => {
    const fulfillment = item.fulfillment;
    if (!fulfillment || fulfillment.total_ready_qty <= 0) {
      showToast('No ready items are available for shipment.', 'info');
      return;
    }

    const selections = fulfillment.lines
      .filter((line) => line.qty_ready > 0)
      .map((line) => ({ order_item_key: line.order_item_key, quantity: line.qty_ready }));

    await api.createOrderShipmentFromReadySelection(item.order.id, selections);
    showToast('Shipment created from ready items.', 'success');
    handleRefresh();
  };

  const handleMarkShipmentDelivered = async (item: EnrichedDeliveryItem, shipmentId: string) => {
    await api.deliverOrderShipment(shipmentId);
    const updatedFulfillment = await api.getOrderFulfillmentSummary(item.order.id);
    if (updatedFulfillment && updatedFulfillment.total_remaining_to_ship_qty === 0) {
      await api.completeOrderDeliveryPlan(item.plan.id, item.order.id);
    }
    showToast('Shipment marked as delivered.', 'success');
    handleRefresh();
  };

  const handlePrintShipmentDocument = (item: EnrichedDeliveryItem, shipmentId: string) => {
    const shipment = item.shipments?.find((candidate) => candidate.id === shipmentId);
    if (!shipment) {
      showToast('Shipment not found.', 'error');
      return;
    }
    const items = (item.shipment_items || []).filter((shipmentItem) => shipmentItem.shipment_id === shipmentId);
    onPrintShipmentDocument?.(item.order, shipment, items, item.fulfillment);
  };

  const handleDeletePlan = async (item: EnrichedDeliveryItem) => {
    await api.deleteOrderDeliveryPlan(item.plan.id);
    showToast('Delivery plan deleted.', 'success');
    setSelectedItem(null);
    handleRefresh();
  };

  if (isLoading) {
    return <div className="p-4 text-sm font-medium text-slate-500">Loading deliveries...</div>;
  }

  return (
    <div className="p-4 pb-28 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Deliveries</h1>
          <p className="text-xs font-medium text-slate-500 mt-1">Mobile hub for delivery reminders, calls, and shipment follow-up.</p>
        </div>
        <button onClick={() => { setPlannerOrder(null); setSelectedItem(null); setIsPlannerOpen(true); }} className="w-12 h-12 rounded-2xl bg-[#060b00] text-white flex items-center justify-center shadow-lg">
          <Plus size={18} />
        </button>
      </div>

      {notificationPermission !== 'granted' && (
        <button onClick={requestBrowserPermission} className="w-full rounded-3xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-700 flex items-center justify-center gap-2 shadow-sm">
          <Bell size={16} /> Enable notifications while the app is open
        </button>
      )}

      <DeliverySummaryCards stats={stats} />
      <DeliveryFilters filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} />

      {todayNamedays.length > 0 && (
        <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-4 shadow-sm">
          <div className="flex items-center gap-2 text-sky-800 mb-2">
            <Sparkles size={16} />
            <div className="text-xs font-black uppercase tracking-wide">Today's namedays</div>
          </div>
          <div className="space-y-2">
            {todayNamedays.map((event) => (
              <div key={event.id} className="rounded-2xl bg-white/80 border border-white px-3 py-2">
                <div className="text-sm font-black text-slate-800">{event.title}</div>
                {event.subtitle && <div className="text-xs font-medium text-slate-600 mt-1">{event.subtitle}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-3xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          There are {alerts.length} active alerts that need attention.
        </div>
      )}

      <MobileDeliveryDayList items={filteredItems} onSelect={setSelectedItem} />

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
        onCreateShipment={handleCreateShipment}
        onMarkShipmentDelivered={handleMarkShipmentDelivered}
        onPrintShipmentDocument={handlePrintShipmentDocument}
        onDeletePlan={handleDeletePlan}
        onAcknowledgeReminder={(reminder) => handleReminderAction(reminder, 'ack')}
        onCompleteReminder={(reminder) => handleReminderAction(reminder, 'complete')}
        onSnoozeReminder={(reminder) => handleReminderAction(reminder, 'snooze')}
      />
    </div>
  );
}
