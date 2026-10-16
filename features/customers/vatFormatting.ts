import type { VatRegistryStatus, VatRegistryStatusKind } from '../../types';
import { GREEK_REGIONAL_UNITS, GREEK_TOWNS } from './greekRegions';

// The AADE registry (and VIES) return uppercase, unaccented text with irregular
// spacing. Every field is rewritten in normal casing with accents: from the
// vocabulary below, gazetteer town names and surname endings, and for unknown
// words from the Greek stress rules (see guessAccent).

const ACCENT_BASE: Record<string, string> = {
  ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω', ϊ: 'ι', ϋ: 'υ', ΐ: 'ι', ΰ: 'υ', ς: 'σ',
  Ά: 'Α', Έ: 'Ε', Ή: 'Η', Ί: 'Ι', Ό: 'Ο', Ύ: 'Υ', Ώ: 'Ω', Ϊ: 'Ι', Ϋ: 'Υ',
};
const LATIN_LOOKALIKES: Record<string, string> = {
  A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ', N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ',
};
const GREEK_LETTER = /[Ͱ-Ͽἀ-῿]/;

/** Uppercase without accents; keeps the string length so match offsets map back to the original. */
export function foldGreek(text: string): string {
  let out = '';
  for (const ch of String(text ?? '')) {
    const base = ACCENT_BASE[ch] ?? ch;
    const upper = base.toUpperCase();
    out += upper.length === base.length ? upper : base;
  }
  return out;
}

/** Latin A/E/O… typed inside Greek words by the registry → Greek letters. */
function greekize(token: string): string {
  if (!GREEK_LETTER.test(token)) return token;
  return token.replace(/[A-Z]/g, ch => LATIN_LOOKALIKES[ch] ?? ch);
}

export const LEGAL_FORM_ABBREVIATIONS = [
  'ΟΕ', 'ΕΕ', 'ΑΕ', 'ΙΚΕ', 'ΕΠΕ', 'ΜΙΚΕ', 'ΜΕΠΕ', 'ΜΑΕ', 'ΑΕΒΕ', 'ΑΒΕΕ', 'ΑΒΕ', 'ΑΕΕ', 'ΑΤΕ', 'ΑΤΕΕ',
  'ΑΤΕΒΕ', 'ΑΒΕΤΕ', 'ΑΕΤΕ', 'ΑΕΒΕΤ', 'ΚΟΙΝΣΕΠ', 'ΑΜΚΕ', 'ΝΠΙΔ', 'ΝΠΔΔ', 'ΣΥΝΠΕ', 'ΑΣ', 'ΚΑΣ',
] as const;
const LEGAL_FORMS = new Set<string>(LEGAL_FORM_ABBREVIATIONS);
const KEEP_UPPER = new Set<string>([
  ...LEGAL_FORM_ABBREVIATIONS,
  'ΑΦΜ', 'ΔΟΥ', 'ΓΕΜΗ', 'ΚΤΕΟ', 'ΕΚΟ', 'ΒΙΠΕ', 'ΕΒΕ', 'ΕΣΥ', 'ΤΕΕ', 'ΕΛΠΕ', 'ΜΚΟ', 'ΙΚΕ', 'ΚΑΔ', 'ΦΠΑ', 'ΑΑΔΕ', 'ΕΦΚΑ', 'ΙΚΑ', 'ΟΤΑ', 'ΔΕΗ', 'ΟΤΕ', 'ΕΛΤΑ', 'ΚΤΕΛ', 'ΚΕΦΟΔΕ', 'ΦΑΕ', 'ΗΠΑ', 'ΕΕ',
]);
const LATIN_KEEP_UPPER = new Set(['SA', 'LTD', 'LLC', 'GMBH', 'SRL', 'SAS', 'BV', 'NV', 'PLC', 'INC', 'AG', 'KG', 'OHG', 'SPA', 'EOOD', 'OOD', 'EU', 'USA', 'UK', 'VAT']);
const CONNECTORS = new Set(['ΚΑΙ', 'ΤΟΥ', 'ΤΗΣ', 'ΤΩΝ', 'ΤΟΝ', 'ΤΗΝ', 'ΤΟ', 'ΤΑ', 'Η', 'Ο', 'ΟΙ', 'ΣΕ', 'ΣΤΟ', 'ΣΤΗ', 'ΣΤΗΝ', 'ΣΤΟΝ', 'ΣΤΑ', 'ΣΤΙΣ', 'ΣΤΟΥΣ', 'ΓΙΑ', 'ΜΕ', 'ΑΠΟ', 'ΕΚ', 'ΕΝ', 'ΩΣ', 'ΚΑΤΑ', 'ΠΛΗΝ', 'ΑΝΕΥ']);
const LATIN_CONNECTORS = new Set(['AND', 'OF', 'THE', 'FOR', 'IN', 'ON', 'DE', 'DI', 'DA', 'DEL', 'LA', 'LE', 'ET', 'UND', 'VON', 'VAN']);

// Accented spellings (lowercase; a capital first letter marks a proper noun that
// keeps its capital in sentence case). Gazetteer town names are added below.
const WORDS = `
εταιρεία εταιρείας εταιρία εταιρίας εταιρειών ομόρρυθμη ετερόρρυθμη ανώνυμη περιορισμένης ευθύνης μονοπρόσωπη μονοπρόσωπος
συνεταιρισμός συνεταιρισμού επιχείρηση επιχειρήσεις επιχειρήσεων όμιλος ομίλου αφοί αδελφοί αδελφών υιοί υιών για από κατά πλην άνευ
κατασκευή κατασκευές κατασκευών εμπόριο εμπορίου εμπορία εμπορίας χονδρικής λιανικής λιανική χονδρική κόσμημα κοσμήματος
χρυσοχοΐα χρυσοχοΐας χρυσοχοΐες χρυσός χρυσού χρυσά χρυσών άργυρος αργύρου αργυρά αργυρών ασήμι ασημικά ασημένια ασημένιων
πολύτιμων πολύτιμα πολύτιμοι ημιπολύτιμων ημιπολύτιμα μετάλλων μέταλλα λίθων λίθοι πέτρες ρολόγια ρολογιών ωρολογίων είδη ειδών
δώρων δώρα αξεσουάρ ένδυσης ενδύματα υπόδησης καλλυντικά σουβενίρ εισαγωγές εισαγωγών εξαγωγές εξαγωγών εισαγωγή εξαγωγή
διανομή διανομές αντιπροσωπεία αντιπροσωπείες αντιπροσωπειών υπηρεσίες υπηρεσιών παροχή παροχής συναφών συναφή λοιπών άλλων άλλα άλλη
άλλο εκτός χώρα κατάστημα καταστήματος εξειδικευμένα εξειδικευμένων πώληση πωλήσεις πωλήσεων ενοικίαση επεξεργασία επεξεργασίας επισκευή
επισκευές επισκευής παραγωγή παραγωγής βιοτεχνία βιοτεχνίας βιομηχανία βιομηχανίας μηχανήματα εξοπλισμός εξοπλισμού προϊόντα προϊόντων
υλικά υλικών διαδικτύου μέσω ταχυδρομείου πάγκους αγορές αγορών υπαίθριο υπαίθριες πλανόδιο κέντρο κέντρου γραφείο γραφείου οίκος οίκου
νέα νέο νέος νέες μεγάλη μεγάλο μεγάλου μεγάλης ελληνικά Ελλάδα Ελλάδας Ευρώπη Μεσογείου ήλιος ηλίου σελήνη αστέρι αστέρια αυγή
θάλασσα γαλάζιο λευκό μαύρο κόκκινο ουρανός Αιγαίο Αιγαίου Ιόνιο Κρήτη Κρήτης Ρόδος Ρόδου αρχαία αρχαίο βυζαντινά βυζαντινό παράδοση
παραδοσιακά τέχνη τέχνης χειροποίητα δημιουργίες σχέδιο σχέδια σχεδίου σχεδιασμός μόδα μόδας στυλ κολιέ δαχτυλίδια σκουλαρίκια βραχιόλια
μενταγιόν αλυσίδες σταυροί φυλαχτά μάτι γάμος γάμου βέρες μονόπετρα γυαλιά οπτικά τυχερό φίλοι φίλων οικογένεια δοκιμή πελάτης πελάτες
εταίροι συμβουλές ακίνητα ακινήτων μεταφορές μεταφορών τροφίμων ποτών καφέ καφετέρια εστιατόριο δωμάτια διαμερίσματα ενοικιαζόμενα
μικτό μικτής ενοικιαζόμενων διάφορα διαφόρων λοιπά προσώπων φυσικό φυσικού πρόσωπο νομικό νομικού έργα έργων τέλη χειμώνα καλοκαίρι
γραφική γραφικές τυπογραφείο εκδόσεις εκδόσεων φωτογραφίες ξύλινα ξύλου γυαλί δέρμα δερμάτινα δερμάτινων υφάσματα ταξίδια ταξιδιών
οδός οδού λεωφόρος λεωφόρου πλατεία πλατείας πάροδος παρόδου αγίου αγίας αγίων άγιος αγία άγιοι αγίους εθνική εθνικής αντιστάσεως
αντίστασης Ελευθερίου Βενιζέλου Ερμού Σταδίου Πανεπιστημίου Ακαδημίας Πατησίων Κηφισίας Συγγρού Αλεξάνδρας Μεσογείων Βασιλίσσης
Βασιλέως Βασιλέων Σοφίας Αμαλίας Όθωνος Μητροπόλεως Αιόλου Αθηνάς Πειραιώς Τσιμισκή Εγνατίας Αριστοτέλους Κομνηνών Κωνσταντίνου
Γεωργίου Παύλου ηρώων Κολοκοτρώνη Καραϊσκάκη Μιαούλη Κανάρη Μπουμπουλίνας Ρήγα Φεραίου Κοραή Ομήρου Σωκράτους Πλάτωνος
Μακεδονίας Ηπείρου Θράκης Θεσσαλίας ελευθερίας δημοκρατίας ειρήνης αγάπης Μαρτίου Οκτωβρίου Νοεμβρίου Ιανουαρίου Φεβρουαρίου
Απριλίου Μαΐου Ιουνίου Ιουλίου Αυγούστου Σεπτεμβρίου Δεκεμβρίου Ναυαρίνου παλαιών Πατρών Αθηνών Μπενάκη Ιπποκράτους Χαριλάου
Τρικούπη Θεμιστοκλέους Περικλέους Δημοσθένους Λυκούργου Αριστείδου Μιλτιάδου Κύπρου Σμύρνης Ιωαννίνων Παπάγου Πλαστήρα Μεταξά
Καποδιστρίου Μαυρομιχάλη Ανδρέα Παπανδρέου Καραμανλή Σεφέρη Ελύτη Παλαμά Σολωμού Κάλβου Ζαΐμη Φιλελλήνων Μάρκου Μπότσαρη
Νικηταρά Ανδρούτσου Διάκου Νικολάου Δημητρίου Ιωάννου Χρήστου Φιλίππου Αλεξάνδρου κεντρική κεντρικής παραλία παραλίας λιμάνι λιμένος
αγορά αγοράς τέρμα θέση θέσεως συνοικία χωριό κτίριο κτιρίου ισόγειο όροφος ορόφου σταθμός σταθμού εκκλησίας Ολυμπίου Ολύμπου
Ποσειδώνος Αφροδίτης Απόλλωνος Ερμή Ήρας Αθηνά Ηρώων Πολυτεχνείου Ελευθερίας Δημοκρατίας Ειρήνης
Γεώργιος Ιωάννης Ιωάννη Κωνσταντίνος Δημήτριος Νικόλαος Παναγιώτης Παναγιώτη Βασίλειος Βασιλείου Χρήστος Μιχαήλ Ευάγγελος Ευαγγέλου
Αθανάσιος Αθανασίου Σπυρίδων Σπυρίδωνος Σπυρίδωνα Ελευθέριος Αντώνιος Αντωνίου Ανδρέας Θεόδωρος Θεοδώρου Εμμανουήλ Σταύρος Σταύρου
Απόστολος Αποστόλου Ηλίας Ηλία Γρηγόριος Γρηγορίου Πέτρος Πέτρου Παύλος Στέφανος Στεφάνου Αλέξανδρος Λεωνίδας Λεωνίδα Φώτιος Φωτίου
Χαράλαμπος Χαραλάμπους Χαραλάμπου Ζαχαρίας Μάριος Θωμάς Μάρκος Άγγελος Αγγέλου Λάμπρος Λάμπρου Στυλιανός Στυλιανού Σωτήριος Σωτηρίου
Κυριάκος Κυριάκου Ευστάθιος Ευσταθίου Ιάκωβος Νίκος Γιώργος Γιάννης Κώστας Δημήτρης Μανώλης Μιχάλης Βασίλης Θανάσης Σπύρος Τάσος
Χρυσόστομος Ευθύμιος Ευθυμίου Παντελής Αναστάσιος Αναστασίου Προκόπιος Φίλιππος Ορέστης Άρης Αχιλλέας Οδυσσέας Ηρακλής Περικλής Θεοφάνης
Ματθαίος Αριστείδης Μιλτιάδης Νεκτάριος Ραφαήλ Σάββας Τριαντάφυλλος Νικηφόρος Ευριπίδης Σωκράτης Αριστοτέλης Ξενοφών Κλεάνθης
Μαρία Ελένη Αικατερίνη Κατερίνα Βασιλική Σοφία Αναστασία Γεωργία Δήμητρα Ευαγγελία Ιωάννα Παναγιώτα Κωνσταντίνα Χριστίνα Αγγελική
Ειρήνη Δέσποινα Ευφροσύνη Θεοδώρα Φωτεινή Αθανασία Χρυσούλα Σταυρούλα Αλεξάνδρα Νίκη Βερονίκη Κυριακή Άννα Όλγα Ζωή Σταματία
Παρασκευή Μαργαρίτα Ευγενία Ευτυχία Αφροδίτη Ροδάνθη Ασπασία Λαμπρινή Πολυξένη Αρετή Σπυριδούλα Μυρτώ Αντωνία Ιφιγένεια Ευανθία
Χαρίκλεια Ουρανία Μόνικα Ήλιος
Πειραιά Πατρών Ηρακλείου Λάρισας Βόλου Χανίων Καλλιθέας Γλυφάδας Αμαρουσίου Κηφισιάς Χαλανδρίου Περιστερίου Αιγάλεω
Νίκαιας Ψυχικού Χολαργού Ζωγράφου Βύρωνα Ηλιούπολης Δημητρίου Νέας Σμύρνης Παλαιού Φαλήρου Κορίνθου Καλαμάτας Τρίπολης
Κέρκυρας Καβάλας Σερρών Δράμας Ξάνθης Κομοτηνής Αλεξανδρούπολης Κατερίνης Βέροιας Έδεσσας Κοζάνης Φλώρινας Καστοριάς Τρικάλων
Καρδίτσας Λαμίας Χαλκίδας Λιβαδειάς Αγρινίου Μεσολογγίου Πύργου Άρτας Πρέβεζας Ηγουμενίτσας Ζακύνθου Κεφαλληνίας Χίου Μυτιλήνης
Σάμου Νάξου Σύρου Ερμούπολης Θήρας Μυκόνου Ρεθύμνου Νικολάου Ιεράπετρας Σητείας Ιωνίας Αμπελοκήπων Καλαμαριάς Νεάπολης Τούμπας
Ευόσμου Ναυπλίου Άργους Σπάρτης Αιγίου Μεγάρων Ελευσίνας Αχαρνών Παλλήνης Κορωπίου Αγίου Κω
μεγάλων μεσαίων συμμόρφωσης φορολογίας φορολογικής φορολογικού ελέγχου
Οικονόμου Αναγνώστου Χριστοδούλου Αλεξίου Παπανικολάου Παπαγεωργίου Παπαδημητρίου Παπαϊωάννου Καραγιάννης Βλάχος Ζερβός
Σπανός Μακρής Παππάς Μεταξάς Κουτσός Ξανθός Κοντός Ψαράς Χαλκιάς Μπαλτάς Χατζής Πολίτης Μαργαρίτης Ζαφειρίου Λαζαρίδης Τζαννής
Μπέης Μαυρίδης Ρούσσος Γεωργίου Παπάς Καλός Φιλίππου Μαυρογιάννης Σταυρίδης Μελάς Ραπτής Καρράς Κουκουλάς Λιάπης Τσιρίγος
Μανωλάς Σκούρας Ζαχαρίου Κυριακίδης Βαρδάκης Δούκας Ράλλης Καραμάνος Αλεξανδρής Μπιτσάκος Πασχάλης Ρήγας Σαρρής Καλαμαράς
ελιά ελιές ελαιόλαδο κρασί κρασιά οινοποιείο αρτοποιείο ζαχαροπλαστείο κουρείο κομμωτήριο ιατρείο οδοντιατρείο φαρμακείο
ανταλλακτικά αυτοκινήτων οχημάτων μοτοσικλετών ηλεκτρικών συσκευών κινητών τηλεφώνων υπολογιστών λογισμικού δικτύων
μαρμάρων μάρμαρα οικοδομικών οικοδομικά τεχνικά τεχνικών ακινήτων ξενοδοχείων ταξιδιωτικό πρακτορείο γραφείων συνεδρίων
`;


const SUFFIX_RULES: Array<[string, string]> = ([
  ['ΟΠΟΥΛΟΣ', 'όπουλος'], ['ΟΠΟΥΛΟΥ', 'οπούλου'], ['ΟΠΟΥΛΩΝ', 'οπούλων'],
  ['ΙΑΔΗΣ', 'ιάδης'], ['ΙΑΔΗ', 'ιάδη'], ['ΙΑΔΟΥ', 'ιάδου'],
  ['ΙΔΗΣ', 'ίδης'], ['ΙΔΗ', 'ίδη'], ['ΙΔΟΥ', 'ίδου'],
  ['ΑΔΗΣ', 'άδης'], ['ΑΔΗ', 'άδη'], ['ΟΥΔΗΣ', 'ούδης'], ['ΟΥΔΗ', 'ούδη'],
  ['ΑΚΗΣ', 'άκης'], ['ΑΚΗ', 'άκη'], ['ΑΚΟΣ', 'άκος'], ['ΑΚΟΥ', 'άκου'], ['ΟΓΛΟΥ', 'όγλου'],
  ['ΙΩΤΗΣ', 'ιώτης'], ['ΙΩΤΗ', 'ιώτη'],
  ['ΙΚΗΣ', 'ικής'], ['ΙΚΗ', 'ική'], ['ΙΚΟΣ', 'ικός'], ['ΙΚΟΥ', 'ικού'], ['ΙΚΟΙ', 'ικοί'], ['ΙΚΟ', 'ικό'],
  ['ΙΚΩΝ', 'ικών'], ['ΙΚΕΣ', 'ικές'], ['ΙΚΑ', 'ικά'],
  ['ΤΗΡΙΟΥ', 'τηρίου'], ['ΤΗΡΙΟ', 'τήριο'], ['ΤΗΡΙΑ', 'τήρια'],
  ['ΙΣΜΟΣ', 'ισμός'], ['ΙΣΜΟΥ', 'ισμού'], ['ΟΤΗΤΑΣ', 'ότητας'], ['ΟΤΗΤΑ', 'ότητα'],
  ['ΜΑΤΩΝ', 'μάτων'], ['ΗΜΑΤΑ', 'ήματα'], ['ΗΜΑΤΟΣ', 'ήματος'],
  ['ΕΙΟΥ', 'είου'], ['ΕΙΟ', 'είο'], ['ΠΩΛΗΣ', 'πώλης'], ['ΠΟΙΟΣ', 'ποιός'], ['ΧΟΟΣ', 'χόος'],
  ['ΑΣΤΗΣ', 'αστής'], ['ΙΣΤΗΣ', 'ιστής'], ['ΕΑΣ', 'έας'],
] as Array<[string, string]>).sort((a, b) => b[0].length - a[0].length);

const HAS_ACCENT = /[άέήίόύώΐΰΆΈΉΊΌΎΏ]/;

const ACCENT_DICT: Map<string, string> = (() => {
  const dict = new Map<string, string>();
  const add = (word: string) => {
    const key = foldGreek(word);
    if (!dict.has(key)) dict.set(key, word);
  };
  WORDS.split(/\s+/).filter(Boolean).forEach(add);
  dict.set('ΣΙΑ', 'Σια');
  const placeNames = [...GREEK_TOWNS.flatMap(t => t.names), ...GREEK_REGIONAL_UNITS.map(u => u.label)];
  for (const name of placeNames) {
    for (const word of name.split(/[^\p{L}]+/u)) {
      if (word && GREEK_LETTER.test(word) && HAS_ACCENT.test(word)) add(word);
    }
  }
  return dict;
})();

const placeLookupKey = (value: string) => foldGreek(value).replace(/[^\p{L}\d]+/gu, ' ').trim();

const PLACE_DICT: Map<string, string> = (() => {
  const dict = new Map<string, string>();
  for (const town of GREEK_TOWNS) {
    const accented = town.names.find(n => GREEK_LETTER.test(n) && HAS_ACCENT.test(n));
    if (!accented) continue;
    for (const name of town.names) {
      const key = placeLookupKey(name);
      if (key && !dict.has(key)) dict.set(key, accented);
    }
  }
  return dict;
})();

const VOWELS = new Set('ΑΕΗΙΟΥΩ');
const DIPHTHONGS = new Set(['ΑΙ', 'ΕΙ', 'ΟΙ', 'ΟΥ', 'ΥΙ', 'ΑΥ', 'ΕΥ', 'ΗΥ']);
function syllableCount(folded: string): number {
  let count = 0;
  for (let i = 0; i < folded.length; i++) {
    if (!VOWELS.has(folded[i])) continue;
    count++;
    if (DIPHTHONGS.has(folded[i] + (folded[i + 1] ?? ''))) i++;
  }
  return count;
}

const lowerGreek = (value: string) => value.toLowerCase().replace(/σ$/, 'ς');
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const TONOS: Record<string, string> = { α: 'ά', ε: 'έ', η: 'ή', ι: 'ί', ο: 'ό', υ: 'ύ', ω: 'ώ' };

/** Index of the letter that carries the accent in each syllable (second letter of a diphthong). */
function syllableNuclei(folded: string): number[] {
  const nuclei: number[] = [];
  for (let i = 0; i < folded.length; i++) {
    const ch = folded[i];
    if (!VOWELS.has(ch)) continue;
    const pair = ch + (folded[i + 1] ?? '');
    if (ch === 'Ι' && i === 1 && folded[0] === 'Γ' && VOWELS.has(folded[2] ?? '')) continue; // «Γιάννης», «Γιώργος»
    if (DIPHTHONGS.has(pair)) { nuclei.push(i + 1); i++; continue; }
    nuclei.push(i);
  }
  return nuclei;
}

/**
 * Accent for a word that is not in the vocabulary: Greek stress falls most often
 * on the penultimate syllable; words in -μα(τα) / -ση / -σεων / -ιος / -ιο take the antepenultimate.
 */
export function guessAccent(folded: string): string {
  const lower = lowerGreek(folded);
  const nuclei = syllableNuclei(folded);
  if (nuclei.length <= 1) return lower;
  const antepenultimate = nuclei.length >= 3
    && /(?:ΜΑ|ΜΑΤΑ|ΣΗ|ΞΗ|ΨΗ|ΣΕΩΝ|ΞΕΩΝ|ΨΕΩΝ|[^ΑΕΟΥ]Ι(?:ΟΣ|Ο|ΟΙ))$/.test(folded); // «Διονύσιος», «συνέδριο»
  const at = nuclei[nuclei.length - (antepenultimate ? 3 : 2)];
  return lower.slice(0, at) + (TONOS[lower[at]] ?? lower[at]) + lower.slice(at + 1);
}

function accentedLower(folded: string): string | null {
  const known = ACCENT_DICT.get(folded);
  if (known) return known;
  for (const [suffix, accented] of SUFFIX_RULES) {
    if (folded.length >= suffix.length + 2 && folded.endsWith(suffix)) {
      return lowerGreek(folded.slice(0, -suffix.length)) + accented;
    }
  }
  return syllableCount(folded) <= 1 ? lowerGreek(folded) : null;
}

/** True when the text has letters and none of them is lowercase. */
export function isShouting(text: string): boolean {
  return /\p{L}/u.test(text) && !/\p{Ll}/u.test(text);
}

export type CaseMode = 'title' | 'sentence';

/**
 * Normal casing for registry capitals: vocabulary and surname endings first,
 * then the Greek stress rules for unknown words. Never leaves a word in capitals
 * except legal forms, acronyms, initials and ordinals.
 */
export function smartCase(text: string, mode: CaseMode = 'title'): string {
  if (!isShouting(text)) return text;
  const parts = text.split(/(\p{L}+)/u);
  let wordIndex = 0;
  for (let i = 1; i < parts.length; i += 2) {
    const token = greekize(parts[i]);
    const prev = parts[i - 1] ?? '';
    const next = parts[i + 1] ?? '';
    const folded = foldGreek(token);
    const first = wordIndex === 0;
    wordIndex++;
    if (/\d$/.test(prev)) { parts[i] = lowerGreek(token); continue; } // «25ης», «12α»
    if (!GREEK_LETTER.test(token)) {
      if (LATIN_KEEP_UPPER.has(token)) continue;
      const lower = token.toLowerCase();
      parts[i] = (mode === 'title' ? first || !LATIN_CONNECTORS.has(token) : first) ? capitalize(lower) : lower;
      continue;
    }
    if (KEEP_UPPER.has(folded)) { parts[i] = folded; continue; }
    if (folded.length === 1 && (next.startsWith('.') || next.startsWith("'") || !/[ΑΕΗΙΟΥΩ]/.test(folded))) {
      parts[i] = folded; // initial «Γ.» or ordinal «Α'»
      continue;
    }
    if (next.startsWith("'") && folded.length <= 3) { parts[i] = folded; continue; } // «ΙΒ'»
    if (!/[ΑΕΗΙΟΥΩ]/.test(folded)) { parts[i] = folded; continue; } // acronym without vowels
    const word = accentedLower(folded)
      ?? (next.startsWith('.') ? lowerGreek(folded) : guessAccent(folded)); // «ΛΕΩΦ.»: abbreviations drop the accent
    const proper = word.charAt(0) !== word.charAt(0).toLowerCase();
    const upper = mode === 'title' ? first || proper || !CONNECTORS.has(folded) : first || proper;
    parts[i] = upper ? capitalize(word) : word;
  }
  return parts.join('');
}

/** Spacing/punctuation cleanup shared by every registry field. */
export function cleanRegistryText(value?: string | null): string {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[  -​  　\t\r\n]+/g, ' ')
    .replace(/[΄’‘`´ʹ]/g, "'")
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+([,.;:!?)\]])/g, '$1')
    .replace(/([(\[])\s+/g, '$1')
    .replace(/,(?=[^\s\d])/g, ', ')
    // Ordinals such as «Α ' ΑΘΗΝΩΝ» / «ΙΒ'ΑΘΗΝΩΝ» → «Α' ΑΘΗΝΩΝ»
    .replace(/(?<!\p{L})([Α-Ω]{1,3}) *' *(?=\p{L})/gu, "$1' ")
    .replace(/\s*&\s*/g, ' & ')
    .replace(/\s+-\s*|\s*-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:\-–—/&]+|[\s,;:\-–—/&]+$/g, '')
    .trim();
}

/** «Ο.Ε.», «Ε. Π. Ε.», Latin «AE» inside a Greek name → «ΟΕ», «ΕΠΕ», «ΑΕ». */
export function normalizeLegalForms(text: string): string {
  const greekText = GREEK_LETTER.test(text);
  const collapse = (groups: string[]) => {
    const collapsed = foldGreek(greekize(groups.join('')));
    return greekText ? collapsed.replace(/[A-Z]/g, ch => LATIN_LOOKALIKES[ch] ?? ch) : collapsed;
  };
  let out = text.replace(/(?<![\p{L}\d])((?:\p{L}{1,4}\. ?){1,6}\p{L}{0,4}\.?)(?![\p{L}\d])/gu, match => {
    // «Γ. Ο.Ε.»: only the trailing groups may form the abbreviation.
    const groups = match.split(/[.\s]+/).filter(Boolean);
    const pieces = match.match(/\p{L}+[.\s]*/gu) ?? [];
    for (let k = 0; k < groups.length; k++) {
      const candidate = collapse(groups.slice(k));
      if (candidate.length < 2 || (!LEGAL_FORMS.has(candidate) && !KEEP_UPPER.has(candidate))) continue;
      return pieces.slice(0, k).join('') + candidate + (match.endsWith(' ') ? ' ' : '');
    }
    return match;
  });
  if (greekText) {
    out = out.replace(/(?<![\p{L}\d])[A-Z]{2,7}(?![\p{L}\d])/gu, token => {
      const candidate = token.replace(/[A-Z]/g, ch => LATIN_LOOKALIKES[ch] ?? '?');
      return LEGAL_FORMS.has(candidate) ? candidate : token;
    });
  }
  return out;
}

// --- Registry status words (never part of the trade name) -------------------

type StatusHit = Exclude<VatRegistryStatusKind, 'active' | 'unknown' | 'non_business'>;
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const STATUS_PATTERNS: Array<[StatusHit, RegExp]> = [
  ['liquidation', new RegExp(`${B}(?:(?:ΥΠΟ|ΣΕ|ΕΝ)\\.? ?)?(?:(?:ΑΝΑΓΚΑΣΤΙΚΗ|ΕΙΔΙΚΗ|ΕΚΟΥΣΙΑ) )?(?:ΕΚΚΑΘΑΡΙΣ(?:Η|ΗΣ|ΙΝ|ΕΙ|ΕΩΣ)${E}|ΕΚΚ(?:ΑΘ(?:ΑΡ)?)?(?:\\/ΣΗ${E}|\\.))`, 'gu')],
  ['liquidation', new RegExp(`${B}IN LIQUIDATION${E}`, 'gu')],
  ['bankruptcy', new RegExp(`${B}(?:(?:(?:ΥΠΟ|ΣΕ|ΕΝ) )?ΠΤΩΧΕΥΣ(?:Η|ΗΣ|ΕΙ)|ΠΤΩΧΕΥΜΕΝ(?:Η|ΟΣ|Ο|ΗΣ))${E}`, 'gu')],
  ['closed', new RegExp(`${B}(?:ΔΙΑΚΟΠΗ(?: ΕΡΓΑΣΙΩΝ)?|ΔΙΑΚΟΨΑΣΑ|ΔΙΑΓΡΑΦΕΙΣΑ|ΛΥΘΕΙΣΑ|(?:ΥΠΟ|ΣΕ) ΛΥΣΗ|ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ)${E}`, 'gu')],
  ['inactive', new RegExp(`${B}(?:ΑΝΕΝΕΡΓ(?:Η|ΟΣ|Ο|ΗΣ|ΟΥ)|ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝ(?:Η|ΟΣ|Ο|ΟΥ|ΗΣ)|ΣΕ ΑΔΡΑΝΕΙΑ|ΑΔΡΑΝΗΣ|ΑΔΡΑΝΗ)(?: ΑΦΜ)?${E}`, 'gu')],
];

/** Finds status words in any registry text. */
export function findStatusWords(text?: string | null): StatusHit[] {
  const folded = foldGreek(cleanRegistryText(text));
  const hits = new Set<StatusHit>();
  for (const [kind, pattern] of STATUS_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(folded)) hits.add(kind);
  }
  return [...hits];
}

/** Removes status words («ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ», «(ΣΕ ΠΤΩΧΕΥΣΗ)»…) and returns what was found. */
export function stripStatusWords(text: string): { text: string; hits: StatusHit[] } {
  let current = cleanRegistryText(text);
  const hits = new Set<StatusHit>();
  for (const [kind, pattern] of STATUS_PATTERNS) {
    const folded = foldGreek(current);
    const spans: Array<[number, number]> = [];
    pattern.lastIndex = 0;
    for (const match of folded.matchAll(pattern)) spans.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
    if (!spans.length) continue;
    hits.add(kind);
    for (const [start, end] of spans.reverse()) current = `${current.slice(0, start)} ${current.slice(end)}`;
    current = cleanRegistryText(current.replace(/\s+-\s*(?=[)\]])|(?<=[(\[])\s*-\s+/g, ''));
  }
  return { text: current, hits: [...hits] };
}

// --- Field formatters ------------------------------------------------------

export function formatRegistryName(raw?: string | null): { name: string; statusHits: StatusHit[] } {
  const { text, hits } = stripStatusWords(String(raw ?? ''));
  const normalized = cleanRegistryText(normalizeLegalForms(text));
  return { name: smartCase(normalized, 'title'), statusHits: hits };
}

export function formatProfession(raw?: string | null): string | null {
  const cleaned = cleanRegistryText(raw);
  if (!cleaned) return null;
  return smartCase(cleaned, 'sentence');
}

/** «Α  'ΑΘΗΝΩΝ» → «Α' Αθηνών». */
export function formatTaxOffice(raw?: string | null): string | null {
  const cleaned = cleanRegistryText(normalizeLegalForms(cleanRegistryText(raw)));
  if (!cleaned) return null;
  return smartCase(cleaned, 'title');
}

export function formatPlaceName(raw?: string | null): string {
  const cleaned = cleanRegistryText(raw);
  if (!cleaned) return '';
  const known = PLACE_DICT.get(placeLookupKey(cleaned));
  if (known) return known;
  return smartCase(cleaned, 'title');
}

function formatStreet(raw?: string | null): string {
  const cleaned = cleanRegistryText(raw).replace(/\.(?=\p{L})/gu, '. ');
  if (!cleaned) return '';
  return smartCase(cleaned, 'title');
}

const NO_NUMBER = /^(?:0+|-+|ΧΩΡΙΣ(?: ΑΡΙΘΜΟ)?|ΑΝΕΥ(?: ΑΡΙΘΜΟΥ)?|ΑΡ\.?)$/;

/** «Οδός 12, 10563 - Πόλη», the shape the region resolver and legal parser understand. */
export function formatRegistryAddress(address: {
  street?: string | null;
  number?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): string | null {
  const street = formatStreet(address.street);
  let number = cleanRegistryText(address.number).replace(/\s*-\s*/g, '-').replace(/\s+(?=\p{L}$)/u, '');
  if (NO_NUMBER.test(foldGreek(number))) number = '';
  number = foldGreek(number) === number ? number : number.toUpperCase();
  const digits = String(address.postalCode ?? '').replace(/\D/g, '');
  const postalCode = digits.length === 5 ? digits : cleanRegistryText(address.postalCode);
  const city = formatPlaceName(address.city);
  const line = street && number && !new RegExp(`(?:^|\\s)${number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(street)
    ? `${street} ${number}` : street || number;
  const place = [postalCode, city].filter(Boolean).join(' - ');
  return [line, place].filter(Boolean).join(', ') || null;
}

/** Free-text addresses (VIES): «ΕΡΜΟΥ 12\n10563 ΑΘΗΝΑ» → «Ερμού 12, 10563 - Αθήνα». */
export function formatFreeAddress(raw?: string | null): string | null {
  const cleaned = cleanRegistryText(String(raw ?? '').replace(/\s*[\r\n]+\s*/g, ', '));
  if (!cleaned) return null;
  const matches = [...cleaned.matchAll(/(?<!\d)(\d{3}) ?(\d{2})(?!\d)/g)];
  const last = matches[matches.length - 1];
  if (!last) return smartCase(cleaned, 'title');
  const start = last.index ?? 0;
  const before = cleaned.slice(0, start).replace(/[\s,\-–—]+$/, '');
  const after = cleaned.slice(start + last[0].length).replace(/^[\s,\-–—.]+/, '');
  return formatRegistryAddress({ street: before, postalCode: `${last[1]}${last[2]}`, city: after });
}

// --- Status ------------------------------------------------------------------

const STATUS_LABELS: Record<VatRegistryStatusKind, string> = {
  active: 'Ενεργό ΑΦΜ',
  liquidation: 'ΑΦΜ υπό εκκαθάριση',
  bankruptcy: 'ΑΦΜ σε πτώχευση',
  closed: 'Διακοπή εργασιών',
  inactive: 'Ανενεργό (απενεργοποιημένο) ΑΦΜ',
  non_business: 'Μη επιτηδευματίας',
  unknown: 'Κατάσταση ΑΦΜ μη επιβεβαιωμένη',
};
const BLOCKING: ReadonlySet<VatRegistryStatusKind> = new Set(['liquidation', 'bankruptcy', 'closed', 'inactive']);
const PRECEDENCE: VatRegistryStatusKind[] = ['inactive', 'bankruptcy', 'liquidation', 'closed', 'non_business'];

/** «2024-03-12» / «2024-03-12T00:00:00+02:00» → «12/03/2024». */
export function formatRegistryDate(value?: string | null): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const local = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  return local ? `${local[1].padStart(2, '0')}/${local[2].padStart(2, '0')}/${local[3]}` : text;
}

export function makeVatRegistryStatus(kind: VatRegistryStatusKind, extra: Partial<Pick<VatRegistryStatus, 'stopDate' | 'evidence'>> = {}): VatRegistryStatus {
  return {
    kind,
    label: STATUS_LABELS[kind],
    blocking: BLOCKING.has(kind),
    stopDate: extra.stopDate ?? null,
    evidence: extra.evidence ?? [],
  };
}

export function detectVatRegistryStatus(input: {
  active?: boolean | null;
  activeDescription?: string | null;
  businessStatus?: string | null;
  legalStatus?: string | null;
  stopDate?: string | null;
  names?: Array<string | null | undefined>;
}): VatRegistryStatus {
  const found = new Set<VatRegistryStatusKind>();
  const evidence: string[] = [];
  const note = (text?: string | null) => {
    const cleaned = cleanRegistryText(text);
    if (cleaned && !evidence.includes(cleaned)) evidence.push(cleaned);
  };
  const activeText = foldGreek(cleanRegistryText(input.activeDescription));
  const businessText = foldGreek(cleanRegistryText(input.businessStatus));
  if (input.active === false || /ΑΠΕΝΕΡΓ|ΑΝΕΝΕΡΓ/.test(activeText)) { found.add('inactive'); note(input.activeDescription); }
  if (/ΠΡΩΗΝ/.test(businessText)) { found.add('closed'); note(input.businessStatus); }
  else if (/ΜΗ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ/.test(businessText)) { found.add('non_business'); note(input.businessStatus); }
  const stopDate = formatRegistryDate(input.stopDate);
  if (stopDate) found.add('closed');
  for (const text of [input.legalStatus, input.businessStatus, input.activeDescription, ...(input.names ?? [])]) {
    const hits = findStatusWords(text);
    hits.forEach(hit => found.add(hit));
    if (hits.length) note(text);
  }
  const kind = PRECEDENCE.find(k => found.has(k))
    ?? (input.active === true || (/ΕΝΕΡΓ/.test(activeText) && !/ΑΠΕΝΕΡΓ|ΑΝΕΝΕΡΓ/.test(activeText)) ? 'active' : 'unknown');
  return makeVatRegistryStatus(kind, { stopDate, evidence: kind === 'active' ? [] : evidence });
}
