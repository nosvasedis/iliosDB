import {
  DeliveryHolidayAnchor,
  DeliveryPlanStatus,
  DeliveryPlanningMode,
  DeliveryReminderAction,
  DeliveryUrgency,
  OrderDeliveryPlan,
  OrderDeliveryReminder,
  OrderStatus,
  ProductionStage
} from '../types';
import { RETAIL_CUSTOMER_ID } from '../lib/supabase';
import { extractRetailClientFromNotes } from './retailNotes';
import { getProductionStageLabel as getCanonicalProductionStageLabel } from './productionStages';

/** For delivery UI: show customer name, or for Λιανική show "Λιανική · {actual client id/label}" from notes. */
export function getOrderDisplayName(order: { customer_id?: string; customer_name: string; notes?: string }): string {
  if (order.customer_id === RETAIL_CUSTOMER_ID) {
    const { retailClientLabel } = extractRetailClientFromNotes(order.notes);
    return retailClientLabel ? `Λιανική · ${retailClientLabel}` : order.customer_name;
  }
  return order.customer_name;
}

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

/** Όλες οι ενέργειες επικοινωνίας εμφανίζονται ως "Κλήση πελάτη" (επιβεβαίωση ετοιμότητας + οργάνωση + κλήση). */
export const DELIVERY_ACTION_LABELS: Record<DeliveryReminderAction, string> = {
  call_client: 'Κλήση πελάτη',
  message_client: 'Μήνυμα σε πελάτη',
  confirm_ready: 'Κλήση πελάτη',
  arrange_delivery: 'Κλήση πελάτη',
  internal_followup: 'Έλεγχος Προόδου Παραγγελίας'
};

/** Dropdown options for reminder type: one entry per label (no duplicate "Κλήση πελάτη"). */
export const REMINDER_ACTION_DROPDOWN_OPTIONS: { value: DeliveryReminderAction; label: string }[] = [
  { value: 'call_client', label: 'Κλήση πελάτη' },
  { value: 'internal_followup', label: 'Έλεγχος Προόδου Παραγγελίας' },
  { value: 'message_client', label: 'Μήνυμα σε πελάτη' }
];

/** Tailwind-friendly classes for reminder type (border + bg tint + text). Use for color-coding. */
export const DELIVERY_ACTION_COLORS: Record<DeliveryReminderAction, { border: string; bg: string; text: string; badge: string }> = {
  call_client: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  message_client: { border: 'border-l-violet-500', bg: 'bg-violet-50', text: 'text-violet-800', badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  confirm_ready: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  arrange_delivery: { border: 'border-l-blue-500', bg: 'bg-blue-50', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  internal_followup: { border: 'border-l-amber-500', bg: 'bg-amber-50', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700 border-amber-200' }
};

export const DELIVERY_URGENCY_LABELS: Record<DeliveryUrgency, string> = {
  overdue: 'Εκπρόθεσμο',
  today: 'Σήμερα',
  soon: 'Άμεσα',
  upcoming: 'Επερχόμενο',
  scheduled: 'Προγραμματισμένο',
  completed: 'Ολοκληρωμένο'
};

/** Κατάσταση παραγγελίας στα Ελληνικά (όπως στην Παραγωγή). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.Pending]: 'Εκκρεμεί',
  [OrderStatus.InProduction]: 'Σε Παραγωγή',
  [OrderStatus.Ready]: 'Έτοιμο',
  [OrderStatus.PartiallyDelivered]: 'Μερική Παράδοση',
  [OrderStatus.Delivered]: 'Παραδόθηκε',
  [OrderStatus.Cancelled]: 'Ακυρώθηκε'
};

/** Tailwind classes for stage badges in delivery pane (match Παραγωγή colors). */
export const PRODUCTION_STAGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  [ProductionStage.AwaitingDelivery]: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  [ProductionStage.Waxing]: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  [ProductionStage.Casting]: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  [ProductionStage.Setting]: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  [ProductionStage.Polishing]: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  [ProductionStage.Assembly]: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  [ProductionStage.Labeling]: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  [ProductionStage.Ready]: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
};

export function getProductionStageLabel(stage: ProductionStage | string): string {
  return getCanonicalProductionStageLabel(stage);
}

/** Text colors for SKU in one line (Ροή Παραγωγής style). */
export const DELIVERY_SKU_FINISH_TEXT: Record<string, string> = {
  'X': 'text-amber-500', 'P': 'text-slate-500', 'D': 'text-orange-500', 'H': 'text-cyan-400', '': 'text-slate-400'
};
export const DELIVERY_SKU_STONE_TEXT: Record<string, string> = {
  'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
  'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
  'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
  'NF': 'text-green-700', 'CO': 'text-cyan-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
  'TMP': 'text-blue-600', 'PCO': 'text-teal-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
  'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
  'AM': 'text-teal-700', 'LR': 'text-indigo-700', 'BST': 'text-sky-400', 'MP': 'text-blue-400',
  'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
  'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400', 'SD': 'text-blue-800',
  'AX': 'text-emerald-700'
};

/** Container bg/border for SKU line (match Ροή Παραγωγής). */
export const DELIVERY_SKU_CONTAINER: Record<string, string> = {
  'X': 'bg-amber-50/60 border-amber-100', 'P': 'bg-stone-50 border-stone-100', 'D': 'bg-orange-50/60 border-orange-100', 'H': 'bg-cyan-50/60 border-cyan-100', '': 'bg-slate-50/80 border-slate-100'
};

/** Metal/finish chip styles for SKU suffix in delivery pane (match Παραγωγή). */
export const DELIVERY_SKU_FINISH_STYLES: Record<string, string> = {
  'X': 'bg-amber-100 text-amber-900 border-amber-200',
  'P': 'bg-stone-200 text-stone-800 border-stone-300',
  'D': 'bg-orange-100 text-orange-800 border-orange-200',
  'H': 'bg-cyan-100 text-cyan-900 border-cyan-200',
  '': 'bg-slate-100 text-slate-700 border-slate-200'
};

/** Stone chip styles for SKU suffix in delivery pane (match Παραγωγή). */
export const DELIVERY_SKU_STONE_STYLES: Record<string, string> = {
  'KR': 'bg-rose-100 text-rose-800 border-rose-200', 'QN': 'bg-slate-200 text-slate-900 border-slate-300', 'LA': 'bg-blue-100 text-blue-800 border-blue-200', 'TY': 'bg-teal-100 text-teal-800 border-teal-200',
  'TG': 'bg-orange-100 text-orange-800 border-orange-200', 'IA': 'bg-red-100 text-red-800 border-red-200', 'BSU': 'bg-slate-200 text-slate-800 border-slate-300', 'GSU': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'RSU': 'bg-rose-100 text-rose-800 border-rose-200', 'MA': 'bg-emerald-100 text-emerald-700 border-emerald-200', 'FI': 'bg-slate-100 text-slate-600 border-slate-200', 'OP': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'NF': 'bg-green-100 text-green-800 border-green-200', 'CO': 'bg-cyan-100 text-cyan-800 border-cyan-200', 'TPR': 'bg-emerald-100 text-emerald-700 border-emerald-200', 'TKO': 'bg-red-100 text-rose-700 border-red-200',
  'TMP': 'bg-indigo-100 text-indigo-700 border-indigo-200', 'PCO': 'bg-teal-100 text-teal-700 border-teal-200', 'MCO': 'bg-purple-100 text-purple-700 border-purple-200', 'PAX': 'bg-green-100 text-green-700 border-green-200',
  'MAX': 'bg-blue-100 text-blue-800 border-blue-200', 'KAX': 'bg-red-100 text-red-700 border-red-200', 'AI': 'bg-slate-100 text-slate-600 border-slate-200', 'AP': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'AM': 'bg-teal-100 text-teal-800 border-teal-200', 'LR': 'bg-indigo-100 text-indigo-700 border-indigo-200', 'BST': 'bg-sky-100 text-sky-700 border-sky-200', 'MP': 'bg-blue-100 text-blue-600 border-blue-200',
  'LE': 'bg-slate-100 text-slate-600 border-slate-200', 'PR': 'bg-green-100 text-green-600 border-green-200', 'KO': 'bg-red-100 text-red-600 border-red-200', 'MV': 'bg-purple-100 text-purple-500 border-purple-200',
  'RZ': 'bg-pink-100 text-pink-600 border-pink-200', 'AK': 'bg-cyan-100 text-cyan-400 border-cyan-200', 'XAL': 'bg-stone-100 text-stone-600 border-stone-200', 'SD': 'bg-blue-100 text-blue-800 border-blue-200',
  'AX': 'bg-emerald-100 text-emerald-800 border-emerald-200'
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

/** Short format for reminder suggestions: "1 Μαΐ, 09:00" */
export function formatGreekShortDateTime(dateLike?: string | Date | null): string {
  if (!dateLike) return '';
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  const day = date.getDate();
  const month = date.toLocaleDateString('el-GR', { month: 'short' });
  const time = date.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${month}, ${time}`;
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
