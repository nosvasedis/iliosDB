import {
  DeliveryHolidayAnchor,
  DeliveryPlanStatus,
  DeliveryPlanningMode,
  DeliveryReminderAction,
  DeliveryUrgency,
  OrderDeliveryPlan,
  OrderDeliveryReminder
} from '../types';

export const DELIVERY_MODE_LABELS: Record<DeliveryPlanningMode, string> = {
  exact: 'Ακριβής ημερομηνία',
  month: 'Μήνας',
  custom_period: 'Περίοδος',
  holiday_anchor: 'Σχετικά με γιορτή'
};

export const DELIVERY_HOLIDAY_LABELS: Record<DeliveryHolidayAnchor, string> = {
  orthodox_easter: 'Ορθόδοξο Πάσχα',
  orthodox_christmas: 'Χριστούγεννα'
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryPlanStatus, string> = {
  active: 'Ενεργό',
  completed: 'Ολοκληρωμένο',
  cancelled: 'Ακυρωμένο'
};

export const DELIVERY_ACTION_LABELS: Record<DeliveryReminderAction, string> = {
  call_client: 'Κλήση πελάτη',
  message_client: 'Μήνυμα σε πελάτη',
  confirm_ready: 'Επιβεβαίωση ετοιμότητας',
  arrange_delivery: 'Οργάνωση παράδοσης',
  internal_followup: 'Εσωτερική υπενθύμιση'
};

export const DELIVERY_URGENCY_LABELS: Record<DeliveryUrgency, string> = {
  overdue: 'Εκπρόθεσμο',
  today: 'Σήμερα',
  soon: 'Άμεσα',
  upcoming: 'Επερχόμενο',
  scheduled: 'Προγραμματισμένο',
  completed: 'Ολοκληρωμένο'
};

export function formatGreekDate(dateLike?: string | Date | null): string {
  if (!dateLike) return 'Δεν ορίστηκε';
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return date.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

export function formatGreekDateTime(dateLike?: string | Date | null): string {
  if (!dateLike) return 'Δεν ορίστηκε';
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return date.toLocaleString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatGreekMonth(dateLike?: string | Date | null): string {
  if (!dateLike) return 'Δεν ορίστηκε';
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return date.toLocaleDateString('el-GR', {
    month: 'long',
    year: 'numeric'
  });
}

export function formatDeliveryWindow(plan: Pick<OrderDeliveryPlan, 'planning_mode' | 'target_at' | 'window_start' | 'window_end' | 'holiday_anchor' | 'holiday_year' | 'holiday_offset_days'>): string {
  if (plan.planning_mode === 'exact') {
    return formatGreekDateTime(plan.target_at);
  }

  if (plan.planning_mode === 'month') {
    return formatGreekMonth(plan.window_start || plan.target_at);
  }

  if (plan.planning_mode === 'holiday_anchor') {
    const holiday = plan.holiday_anchor ? DELIVERY_HOLIDAY_LABELS[plan.holiday_anchor] : 'Γιορτή';
    const offset = plan.holiday_offset_days ? ` (${plan.holiday_offset_days > 0 ? '+' : ''}${plan.holiday_offset_days} ημέρες)` : '';
    return `${holiday}${plan.holiday_year ? ` ${plan.holiday_year}` : ''}${offset}`;
  }

  if (plan.window_start || plan.window_end) {
    return `${formatGreekDate(plan.window_start)} - ${formatGreekDate(plan.window_end)}`;
  }

  return 'Δεν ορίστηκε';
}

export function getReminderStateLabel(reminder: Pick<OrderDeliveryReminder, 'completed_at' | 'acknowledged_at' | 'snoozed_until'>): string {
  if (reminder.completed_at) return 'Ολοκληρώθηκε';
  if (reminder.snoozed_until && new Date(reminder.snoozed_until).getTime() > Date.now()) return 'Σε αναβολή';
  if (reminder.acknowledged_at) return 'Αναγνωρίστηκε';
  return 'Ενεργή';
}
