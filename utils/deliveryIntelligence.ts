import { Customer, DeliveryHolidayAnchor, DeliverySuggestion, NamedayMatch, Order } from '../types';
import { formatGreekDate } from './deliveryLabels';
import { getNamedayMatchesForName, getNextNamedayForName } from './namedays';

const HOLIDAY_KEYWORDS: Array<{ keyword: string; holiday: DeliveryHolidayAnchor; label: string }> = [
  { keyword: 'πάσχα', holiday: 'orthodox_easter', label: 'Αναφορά σε Πάσχα' },
  { keyword: 'ανάσταση', holiday: 'orthodox_easter', label: 'Αναφορά σε Ανάσταση' },
  { keyword: 'easter', holiday: 'orthodox_easter', label: 'Αναφορά σε Easter' },
  { keyword: 'χριστούγεννα', holiday: 'orthodox_christmas', label: 'Αναφορά σε Χριστούγεννα' },
  { keyword: 'christmas', holiday: 'orthodox_christmas', label: 'Αναφορά σε Christmas' }
];

const REASON_KEYWORDS: Array<{ keyword: string; reason: string }> = [
  { keyword: 'επείγον', reason: 'Η παραγγελία έχει χαρακτηριστεί ως επείγουσα' },
  { keyword: 'urgent', reason: 'Η παραγγελία έχει χαρακτηριστεί ως επείγουσα' },
  { keyword: 'γιορτή', reason: 'Η παράδοση σχετίζεται με γιορτή' },
  { keyword: 'δώρο', reason: 'Η παράδοση φαίνεται να αφορά δώρο' },
  { keyword: 'γενέθλια', reason: 'Η παράδοση φαίνεται να αφορά γενέθλια' },
  { keyword: 'παράδοση', reason: 'Υπάρχει ρητή αναφορά σε παράδοση' },
  { keyword: 'παραλαβή', reason: 'Υπάρχει ρητή αναφορά σε παραλαβή' },
  { keyword: 'τηλέφωνο', reason: 'Οι σημειώσεις υποδεικνύουν ανάγκη επικοινωνίας' },
  { keyword: 'να καλέσετε', reason: 'Οι σημειώσεις ζητούν κλήση στον πελάτη' }
];

function normalize(text: string): string {
  return text.toLocaleLowerCase('el-GR');
}

function collectOrderText(order: Order, customer?: Customer): string {
  return [
    order.customer_name,
    order.notes || '',
    order.tags?.join(' ') || '',
    customer?.notes || '',
    ...order.items.map((item) => item.notes || '')
  ].join(' \n ');
}

export function extractSuggestedDates(text: string): DeliverySuggestion[] {
  const suggestions: DeliverySuggestion[] = [];
  const regex = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
  const currentYear = new Date().getFullYear();
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = regex.exec(text)) !== null) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : currentYear;
    const date = new Date(year, month, day, 9, 0, 0);

    if (!Number.isNaN(date.getTime())) {
      suggestions.push({
        id: `date-${index += 1}`,
        category: 'date',
        label: 'Εντοπίστηκε πιθανή ημερομηνία στις σημειώσεις',
        description: date.toLocaleDateString('el-GR'),
        suggested_mode: 'exact',
        suggested_date: date.toISOString()
      });
    }
  }

  return suggestions;
}

export function analyzeDeliveryContext(order: Order, customer?: Customer): {
  suggestions: DeliverySuggestion[];
  matchedKeywords: string[];
  callReasons: string[];
  namedayMatches: NamedayMatch[];
  nextNameday: NamedayMatch | null;
} {
  const text = normalize(collectOrderText(order, customer));
  const suggestions: DeliverySuggestion[] = [];
  const matchedKeywords = new Set<string>();
  const callReasons = new Set<string>();
  const namedaySourceName = customer?.full_name || order.customer_name;
  const namedayMatches = getNamedayMatchesForName(namedaySourceName);
  const nextNameday = getNextNamedayForName(namedaySourceName);

  HOLIDAY_KEYWORDS.forEach(({ keyword, holiday, label }, index) => {
    if (text.includes(keyword)) {
      matchedKeywords.add(keyword);
      suggestions.push({
        id: `holiday-${index}`,
        category: 'holiday',
        label,
        description: 'Προτείνεται προγραμματισμός σε σχέση με γιορτινή περίοδο',
        suggested_mode: 'holiday_anchor',
        suggested_holiday: holiday
      });
      callReasons.add('Πλησιάζει περίοδος γιορτής και χρειάζεται επιβεβαίωση');
    }
  });

  REASON_KEYWORDS.forEach(({ keyword, reason }, index) => {
    if (text.includes(keyword)) {
      matchedKeywords.add(keyword);
      suggestions.push({
        id: `reason-${index}`,
        category: 'reason',
        label: reason,
        suggested_reason: reason
      });
      callReasons.add(reason);
    }
  });

  extractSuggestedDates(text).forEach((suggestion) => suggestions.push(suggestion));

  if (!(customer?.phone || order.customer_phone)) {
    suggestions.push({
      id: 'warning-no-phone',
      category: 'warning',
      label: 'Λείπει τηλέφωνο πελάτη',
      description: 'Χρειάζεται καταχώρηση ή επιβεβαίωση στοιχείων επικοινωνίας',
      suggested_reason: 'Λείπει τηλέφωνο πελάτη'
    });
    callReasons.add('Λείπει τηλέφωνο πελάτη');
  }

  if (nextNameday) {
    suggestions.push({
      id: `nameday-${nextNameday.id}`,
      category: 'nameday',
      label: nextNameday.is_today
        ? 'Ο πελάτης γιορτάζει σήμερα'
        : nextNameday.days_until === 1
          ? 'Ο πελάτης γιορτάζει αύριο'
          : 'Πλησιάζει η ονομαστική εορτή του πελάτη',
      description: `${nextNameday.label} • ${formatGreekDate(nextNameday.date)}`,
      suggested_mode: 'exact',
      suggested_date: new Date(new Date(nextNameday.date).setHours(9, 0, 0, 0)).toISOString(),
      suggested_reason: `Ονομαστική εορτή πελάτη: ${nextNameday.label}`
    });
  }

  if (nextNameday && nextNameday.days_until <= 14) {
    callReasons.add(
      nextNameday.is_today
        ? `Ο πελάτης γιορτάζει σήμερα: ${nextNameday.label}`
        : `Πλησιάζει η ονομαστική εορτή του πελάτη στις ${formatGreekDate(nextNameday.date)}`
    );
  }

  return {
    suggestions,
    matchedKeywords: Array.from(matchedKeywords),
    callReasons: Array.from(callReasons),
    namedayMatches,
    nextNameday
  };
}
