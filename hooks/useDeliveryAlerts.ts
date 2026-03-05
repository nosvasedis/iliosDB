import { useEffect, useMemo, useRef, useState } from 'react';
import { EnrichedDeliveryItem, OrderDeliveryReminder } from '../types';
import { DELIVERY_ACTION_LABELS, formatGreekDateTime, getOrderDisplayName } from '../utils/deliveryLabels';
import { getReminderUrgency } from '../utils/deliveryScheduling';

interface DeliveryAlertEntry {
  id: string;
  itemId: string;
  reminder: OrderDeliveryReminder;
  title: string;
  body: string;
  urgency: 'overdue' | 'today' | 'soon';
}

export function useDeliveryAlerts(items: EnrichedDeliveryItem[], showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void) {
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const seenAlertsRef = useRef<Set<string>>(new Set());

  const alerts = useMemo(() => {
    const entries: DeliveryAlertEntry[] = [];

    items.forEach((item) => {
      item.pending_reminders.forEach((reminder) => {
        const urgency = getReminderUrgency(reminder);
        if (urgency !== 'overdue' && urgency !== 'today' && urgency !== 'soon') return;

        entries.push({
          id: `${item.plan.id}:${reminder.id}:${urgency}`,
          itemId: item.order.id,
          reminder,
          urgency,
          title: `${getOrderDisplayName(item.order)} · ${DELIVERY_ACTION_LABELS[reminder.action_type]}`,
          body: `${reminder.reason} · ${formatGreekDateTime(reminder.trigger_at)}`
        });
      });
    });

    return entries.sort((a, b) => new Date(a.reminder.trigger_at).getTime() - new Date(b.reminder.trigger_at).getTime());
  }, [items]);

  useEffect(() => {
    alerts.forEach((alert) => {
      if (seenAlertsRef.current.has(alert.id)) return;
      seenAlertsRef.current.add(alert.id);

      showToast(`${alert.title}: ${alert.body}`, alert.urgency === 'overdue' ? 'warning' : 'info');

      if (typeof Notification !== 'undefined' && notificationPermission === 'granted' && document.visibilityState === 'visible') {
        new Notification(alert.title, {
          body: alert.body,
          tag: alert.id
        });
      }
    });
  }, [alerts, notificationPermission, showToast]);

  const requestBrowserPermission = async () => {
    if (typeof Notification === 'undefined') return 'denied' as NotificationPermission;
    const result = await Notification.requestPermission();
    setNotificationPermission(result);
    return result;
  };

  return {
    alerts,
    notificationPermission,
    requestBrowserPermission
  };
}
