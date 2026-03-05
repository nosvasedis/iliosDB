import { CalendarDayEvent, DeliveryHolidayAnchor } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

interface OrthodoxCelebrationRule {
  id: string;
  title: string;
  month?: number;
  day?: number;
  easterOffsetDays?: number;
  priority: number;
}

const ORTHODOX_CELEBRATION_RULES: OrthodoxCelebrationRule[] = [
  { id: 'new-year', title: 'Πρωτοχρονιά', month: 1, day: 1, priority: 100 },
  { id: 'theophany', title: 'Θεοφάνεια', month: 1, day: 6, priority: 90 },
  { id: 'clean-monday', title: 'Καθαρά Δευτέρα', easterOffsetDays: -48, priority: 95 },
  { id: 'annunciation', title: 'Ευαγγελισμός της Θεοτόκου', month: 3, day: 25, priority: 100 },
  { id: 'palm-sunday', title: 'Κυριακή των Βαΐων', easterOffsetDays: -7, priority: 80 },
  { id: 'holy-monday', title: 'Μεγάλη Δευτέρα', easterOffsetDays: -6, priority: 70 },
  { id: 'holy-tuesday', title: 'Μεγάλη Τρίτη', easterOffsetDays: -5, priority: 70 },
  { id: 'holy-wednesday', title: 'Μεγάλη Τετάρτη', easterOffsetDays: -4, priority: 70 },
  { id: 'holy-thursday', title: 'Μεγάλη Πέμπτη', easterOffsetDays: -3, priority: 85 },
  { id: 'good-friday', title: 'Μεγάλη Παρασκευή', easterOffsetDays: -2, priority: 100 },
  { id: 'holy-saturday', title: 'Μεγάλο Σάββατο', easterOffsetDays: -1, priority: 95 },
  { id: 'easter', title: 'Κυριακή του Πάσχα', easterOffsetDays: 0, priority: 110 },
  { id: 'easter-monday', title: 'Δευτέρα του Πάσχα', easterOffsetDays: 1, priority: 95 },
  { id: 'thomas-sunday', title: 'Κυριακή του Θωμά', easterOffsetDays: 7, priority: 75 },
  { id: 'ascension', title: 'Ανάληψη', easterOffsetDays: 39, priority: 85 },
  { id: 'pentecost', title: 'Πεντηκοστή', easterOffsetDays: 49, priority: 95 },
  { id: 'holy-spirit', title: 'Αγίου Πνεύματος', easterOffsetDays: 50, priority: 90 },
  { id: 'transfiguration', title: 'Μεταμόρφωση του Σωτήρος', month: 8, day: 6, priority: 90 },
  { id: 'assumption', title: 'Κοίμηση της Θεοτόκου', month: 8, day: 15, priority: 100 },
  { id: 'elevation-cross', title: 'Ύψωση του Τιμίου Σταυρού', month: 9, day: 14, priority: 95 },
  { id: 'demetrios', title: 'Αγίου Δημητρίου', month: 10, day: 26, priority: 90 },
  { id: 'introduction-theotokos', title: 'Εισόδια της Θεοτόκου', month: 11, day: 21, priority: 85 },
  { id: 'christmas-eve', title: 'Παραμονή Χριστουγέννων', month: 12, day: 24, priority: 85 },
  { id: 'christmas', title: 'Χριστούγεννα', month: 12, day: 25, priority: 110 },
  { id: 'synaxis-theotokos', title: 'Σύναξη Υπεραγίας Θεοτόκου', month: 12, day: 26, priority: 80 },
  { id: 'new-years-eve', title: 'Παραμονή Πρωτοχρονιάς', month: 12, day: 31, priority: 80 }
];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getOrthodoxEaster(year: number): Date {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;

  const julian = new Date(Date.UTC(year, month - 1, day));
  julian.setUTCDate(julian.getUTCDate() + 13);
  julian.setUTCDate(julian.getUTCDate() + 7);
  return julian;
}

function getDateFromRule(rule: OrthodoxCelebrationRule, year: number): Date {
  if (typeof rule.easterOffsetDays === 'number') {
    const easter = getOrthodoxEaster(year);
    easter.setUTCDate(easter.getUTCDate() + rule.easterOffsetDays);
    return new Date(easter);
  }

  return new Date(Date.UTC(year, (rule.month || 1) - 1, rule.day || 1, 9, 0, 0));
}

export function getOrthodoxCelebrationsForYear(year: number): CalendarDayEvent[] {
  return ORTHODOX_CELEBRATION_RULES.map((rule) => {
    const date = getDateFromRule(rule, year);
    return {
      id: `${rule.id}-${year}`,
      date: localDateKey(new Date(date)),
      type: 'major_event' as const,
      title: rule.title,
      priority: rule.priority
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || b.priority - a.priority || a.title.localeCompare(b.title, 'el'));
}

export function getHolidayAnchorDate(anchor: DeliveryHolidayAnchor, year: number, offsetDays = 0): Date {
  const base = anchor === 'orthodox_easter'
    ? getOrthodoxEaster(year)
    : new Date(Date.UTC(year, 11, 25, 9, 0, 0));

  return new Date(base.getTime() + (offsetDays * DAY_MS));
}

export function getHolidayPeriod(anchor: DeliveryHolidayAnchor, year: number, offsetDays = 0): { start: Date; end: Date; target: Date } {
  const target = getHolidayAnchorDate(anchor, year, offsetDays);

  if (anchor === 'orthodox_christmas') {
    return {
      start: new Date(Date.UTC(year, 11, 1, 0, 0, 0)),
      end: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      target
    };
  }

  return {
    start: new Date(target.getTime() - (14 * DAY_MS)),
    end: new Date(target.getTime() + (2 * DAY_MS)),
    target
  };
}
