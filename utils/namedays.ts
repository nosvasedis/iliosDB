import { CalendarDayEvent, NamedayMatch } from '../types';
import { getOrthodoxEaster } from './orthodoxHoliday';

interface NamedayRule {
  id: string;
  canonical: string;
  names: string[];
  month?: number;
  day?: number;
  easterOffsetDays?: number;
}

interface MajorEventRule {
  id: string;
  title: string;
  month?: number;
  day?: number;
  easterOffsetDays?: number;
  priority: number;
}

const FIXED_NAMEDAYS: NamedayRule[] = [
  { id: 'vasilis', canonical: 'Βασίλης - Βασιλική', names: ['βασιλης', 'βασίλης', 'βασιλικη', 'βασιλική', 'βασω', 'βάσω'], month: 1, day: 1 },
  { id: 'giannis', canonical: 'Ιωάννης - Ιωάννα', names: ['γιάννης', 'γιαννης', 'ιωαννης', 'ιωάννης', 'ιωαννα', 'ιωάννα', 'γιαννα', 'γιάννα'], month: 1, day: 7 },
  { id: 'antonis', canonical: 'Αντώνιος - Αντωνία', names: ['αντωνης', 'αντώνης', 'αντωνια', 'αντωνία'], month: 1, day: 17 },
  { id: 'thanasis', canonical: 'Αθανάσιος - Αθανασία', names: ['θανασης', 'θανάσης', 'αθανασιος', 'αθανάσιος', 'αθανασια', 'αθανασία'], month: 1, day: 18 },
  { id: 'charalabos', canonical: 'Χαράλαμπος', names: ['χαραλαμπος', 'χαράλαμπος', 'μπαμπης', 'μπάμπης'], month: 2, day: 10 },
  { id: 'evangelos', canonical: 'Ευάγγελος - Ευαγγελία', names: ['ευαγγελος', 'ευάγγελος', 'ευαγγελια', 'ευαγγελία', 'βαγγελης', 'βαγγέλης', 'βαγγελιω', 'βαγγελιώ'], month: 3, day: 25 },
  { id: 'george', canonical: 'Γεώργιος - Γεωργία', names: ['γιωργος', 'γιώργος', 'γεωργιος', 'γεώργιος', 'γεωργια', 'γεωργία', 'γιωργια', 'γιωργία'], month: 4, day: 23 },
  { id: 'markos', canonical: 'Μάρκος', names: ['μαρκος', 'μάρκος'], month: 4, day: 25 },
  { id: 'thomas', canonical: 'Θωμάς', names: ['θωμας', 'θωμάς'], month: 4, day: 27 },
  { id: 'konstantinos', canonical: 'Κωνσταντίνος - Ελένη', names: ['κωστας', 'κώστας', 'κωνσταντινος', 'κωνσταντίνος', 'κωνσταντινα', 'κωνσταντίνα', 'κοστας', 'κωστας', 'ελενη', 'ελένη', 'λενα', 'λένα'], month: 5, day: 21 },
  { id: 'nikos', canonical: 'Νικόλαος - Νίκη', names: ['νικος', 'νίκος', 'νικολας', 'νικόλας', 'νικολαος', 'νικόλαος', 'νικη', 'νίκη'], month: 12, day: 6 },
  { id: 'petros-pavlos', canonical: 'Πέτρος - Παύλος', names: ['πετρος', 'πέτρος', 'παυλος', 'παύλος', 'παυλινα', 'παυλίνα'], month: 6, day: 29 },
  { id: 'kyriaki', canonical: 'Κυριάκος - Κυριακή', names: ['κυριακος', 'κυριάκος', 'κυριακη', 'κυριακή'], month: 7, day: 7 },
  { id: 'olga', canonical: 'Όλγα', names: ['ολγα', 'όλγα'], month: 7, day: 11 },
  { id: 'margarita', canonical: 'Μαργαρίτα - Μαρίνα', names: ['μαργαριτα', 'μαργαρίτα', 'μαρινα', 'μαρίνα'], month: 7, day: 17 },
  { id: 'ilias', canonical: 'Ηλίας', names: ['ηλιας', 'ηλίας', 'λιας', 'λιάς'], month: 7, day: 20 },
  { id: 'paraskevi', canonical: 'Παρασκευή', names: ['παρασκευη', 'παρασκευή', 'βιβη', 'βίβη', 'ευη', 'εύη'], month: 7, day: 26 },
  { id: 'sotiris', canonical: 'Σωτήρης', names: ['σωτηρης', 'σωτήρης', 'σωτηρια', 'σωτηρία'], month: 8, day: 6 },
  { id: 'maria', canonical: 'Μαρία - Παναγιώτης - Παναγιώτα - Δέσποινα', names: ['μαρια', 'μαρία', 'μαριανα', 'μαριάννα', 'παναγιωτης', 'παναγιώτης', 'παναγιωτα', 'παναγιώτα', 'δεσποινα', 'δέσποινα'], month: 8, day: 15 },
  { id: 'alexandros', canonical: 'Αλέξανδρος - Αλεξάνδρα', names: ['αλεξανδρος', 'αλέξανδρος', 'αλεξανδρα', 'αλεξάνδρα'], month: 8, day: 30 },
  { id: 'sofia', canonical: 'Σοφία', names: ['σοφια', 'σοφία'], month: 9, day: 17 },
  { id: 'stathis', canonical: 'Ευστάθιος', names: ['ευσταθιος', 'ευστάθιος', 'σταθης', 'στάθης', 'σταθης'], month: 9, day: 20 },
  { id: 'dionysis', canonical: 'Διονύσιος', names: ['διονυσης', 'διονύσης', 'διονυσιος', 'διονύσιος'], month: 10, day: 3 },
  { id: 'dimitris', canonical: 'Δημήτριος - Δήμητρα', names: ['δημητρης', 'δημήτρης', 'δημητριος', 'δημήτριος', 'μητσος', 'μήτσος', 'δημητρα', 'δήμητρα'], month: 10, day: 26 },
  { id: 'anargyroi', canonical: 'Κοσμάς - Δαμιανός', names: ['κοσμας', 'κοσμάς', 'δαμιανος', 'δαμιανός'], month: 11, day: 1 },
  { id: 'michael', canonical: 'Μιχάλης - Αγγελική - Άγγελος', names: ['μιχαλης', 'μιχάλης', 'μιχαηλ', 'μιχαήλ', 'αγγελικη', 'αγγελική', 'αγγελος', 'άγγελος', 'αγγελοσ'], month: 11, day: 8 },
  { id: 'mina', canonical: 'Μηνάς', names: ['μηνας', 'μηνάς', 'μινας', 'μινάς'], month: 11, day: 11 },
  { id: 'katerina', canonical: 'Αικατερίνη', names: ['κατερινα', 'κατερίνα', 'αικατερινη', 'αικατερίνη', 'κατινα', 'κατίνα'], month: 11, day: 25 },
  { id: 'stelios', canonical: 'Στέλιος - Στέλλα', names: ['στελιος', 'στέλιος', 'στελλα', 'στέλλα', 'στυλιανος', 'στυλιανός'], month: 11, day: 26 },
  { id: 'andreas', canonical: 'Ανδρέας', names: ['ανδρεας', 'ανδρέας'], month: 11, day: 30 },
  { id: 'savvas', canonical: 'Σάββας', names: ['σαββας', 'σάββας'], month: 12, day: 5 },
  { id: 'spyros', canonical: 'Σπύρος', names: ['σπυρος', 'σπύρος', 'σπυριδων', 'σπυρίδων'], month: 12, day: 12 },
  { id: 'stavros', canonical: 'Σταύρος - Σταυρούλα', names: ['σταυρος', 'σταύρος', 'σταυρουλα', 'σταυρούλα'], month: 9, day: 14 },
  { id: 'zoi', canonical: 'Ζωή', names: ['ζωη', 'ζωή'], month: 12, day: 18 },
  { id: 'anastasia', canonical: 'Αναστασία', names: ['αναστασια', 'αναστασία'], month: 12, day: 22 },
  { id: 'christos', canonical: 'Χρήστος - Χριστίνα', names: ['χρηστος', 'χρήστος', 'χριστινα', 'χριστίνα'], month: 12, day: 25 },
  { id: 'manolis', canonical: 'Εμμανουήλ - Μανώλης', names: ['εμμανουηλ', 'εμμανουήλ', 'μανωλης', 'μανώλης'], month: 12, day: 26 }
];

const MOVABLE_NAMEDAYS: NamedayRule[] = [
  { id: 'lazaros', canonical: 'Λάζαρος', names: ['λαζαρος', 'λάζαρος'], easterOffsetDays: -8 }
];

const MAJOR_EVENTS: MajorEventRule[] = [
  { id: 'new-year', title: 'Πρωτοχρονιά', month: 1, day: 1, priority: 100 },
  { id: 'theophany', title: 'Θεοφάνεια', month: 1, day: 6, priority: 90 },
  { id: 'clean-monday', title: 'Καθαρά Δευτέρα', easterOffsetDays: -48, priority: 95 },
  { id: 'independence-day', title: '25η Μαρτίου - Ευαγγελισμός', month: 3, day: 25, priority: 100 },
  { id: 'palm-sunday', title: 'Κυριακή των Βαΐων', easterOffsetDays: -7, priority: 80 },
  { id: 'holy-week', title: 'Μεγάλη Εβδομάδα', easterOffsetDays: -6, priority: 70 },
  { id: 'good-friday', title: 'Μεγάλη Παρασκευή', easterOffsetDays: -2, priority: 100 },
  { id: 'holy-saturday', title: 'Μεγάλο Σάββατο', easterOffsetDays: -1, priority: 95 },
  { id: 'easter', title: 'Κυριακή του Πάσχα', easterOffsetDays: 0, priority: 110 },
  { id: 'easter-monday', title: 'Δευτέρα του Πάσχα', easterOffsetDays: 1, priority: 95 },
  { id: 'labour-day', title: 'Πρωτομαγιά', month: 5, day: 1, priority: 90 },
  { id: 'holy-spirit', title: 'Αγίου Πνεύματος', easterOffsetDays: 50, priority: 85 },
  { id: 'assumption', title: 'Κοίμηση της Θεοτόκου', month: 8, day: 15, priority: 100 },
  { id: 'oxi-day', title: '28η Οκτωβρίου', month: 10, day: 28, priority: 100 },
  { id: 'christmas-eve', title: 'Παραμονή Χριστουγέννων', month: 12, day: 24, priority: 85 },
  { id: 'christmas', title: 'Χριστούγεννα', month: 12, day: 25, priority: 110 },
  { id: 'boxing-day', title: 'Σύναξη Υπεραγίας Θεοτόκου', month: 12, day: 26, priority: 80 },
  { id: 'new-years-eve', title: 'Παραμονή Πρωτοχρονιάς', month: 12, day: 31, priority: 80 }
];

function normalizeGreek(value: string): string {
  return value
    .toLocaleLowerCase('el-GR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .replace(/[^a-zα-ω]/g, '');
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromRule(rule: Pick<NamedayRule, 'month' | 'day' | 'easterOffsetDays'>, year: number): Date {
  if (typeof rule.easterOffsetDays === 'number') {
    const easter = getOrthodoxEaster(year);
    easter.setDate(easter.getDate() + rule.easterOffsetDays);
    return easter;
  }

  return new Date(year, (rule.month || 1) - 1, rule.day || 1, 9, 0, 0, 0);
}

function getNameTokens(fullName: string): string[] {
  return fullName
    .split(/[\s\-–—/]+/)
    .map((token) => normalizeGreek(token))
    .filter((token) => token.length >= 3);
}

function diffInDays(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function buildNamedayMatch(rule: NamedayRule, token: string, referenceDate: Date): NamedayMatch {
  const currentYear = referenceDate.getFullYear();
  const thisYear = dateFromRule(rule, currentYear);
  const nextYear = dateFromRule(rule, currentYear + 1);
  const chosen = thisYear.getTime() >= new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime()
    ? thisYear
    : nextYear;
  const daysUntil = diffInDays(referenceDate, chosen);

  return {
    id: `${rule.id}-${localDateKey(chosen)}`,
    matched_name: token,
    canonical_name: rule.canonical,
    label: rule.canonical,
    date: chosen.toISOString(),
    days_until: daysUntil,
    is_today: daysUntil === 0,
    is_upcoming: daysUntil >= 0 && daysUntil <= 30
  };
}

export function getNamedayMatchesForName(fullName: string, referenceDate = new Date()): NamedayMatch[] {
  const tokens = getNameTokens(fullName);
  const matches: NamedayMatch[] = [];
  const seen = new Set<string>();

  [...FIXED_NAMEDAYS, ...MOVABLE_NAMEDAYS].forEach((rule) => {
    const matchedToken = tokens.find((token) => rule.names.some((name) => normalizeGreek(name) === token));
    if (!matchedToken) return;

    const match = buildNamedayMatch(rule, matchedToken, referenceDate);
    if (seen.has(match.id)) return;
    seen.add(match.id);
    matches.push(match);
  });

  return matches.sort((a, b) => a.days_until - b.days_until || a.label.localeCompare(b.label, 'el'));
}

export function getNextNamedayForName(fullName: string, referenceDate = new Date()): NamedayMatch | null {
  return getNamedayMatchesForName(fullName, referenceDate)[0] || null;
}

export function getCalendarDayEvents(date: Date): CalendarDayEvent[] {
  const year = date.getFullYear();
  const key = localDateKey(date);
  const events: CalendarDayEvent[] = [];

  const dayNamedays = [...FIXED_NAMEDAYS, ...MOVABLE_NAMEDAYS]
    .filter((rule) => localDateKey(dateFromRule(rule, year)) === key)
    .map((rule) => rule.canonical);

  if (dayNamedays.length > 0) {
    events.push({
      id: `nameday-${key}`,
      date: key,
      type: 'nameday',
      title: 'Ονομαστικές Εορτές',
      subtitle: dayNamedays.join(', '),
      priority: 60
    });
  }

  MAJOR_EVENTS
    .filter((rule) => localDateKey(dateFromRule(rule, year)) === key)
    .forEach((rule) => {
      events.push({
        id: `${rule.id}-${key}`,
        date: key,
        type: 'major_event',
        title: rule.title,
        priority: rule.priority
      });
    });

  return events.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'el'));
}

export function getTodayEortologioSummary(referenceDate = new Date()): CalendarDayEvent[] {
  return getCalendarDayEvents(referenceDate);
}
