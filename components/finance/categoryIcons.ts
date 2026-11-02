import {
  Anchor, Anvil, Baby, BadgeEuro, Banknote, Battery, BedDouble, Beer, Bike, Book, Box, Boxes, Briefcase, Brush, Building, Building2,
  Bus, Cable, Cake, Calculator, Camera, Car, Castle, Church, Circle, Cloud, Coffee, Coins, Container, Cpu, CreditCard, Crown, Database,
  Diamond, Dog, Drill, Droplets, Euro, Factory, FileText, Fingerprint, Flame, FlaskConical, Flower2, Footprints, Fuel, Gauge, Gem, Gift,
  Glasses, Globe, GraduationCap, Hammer, HandCoins, Handshake, HardHat, Headphones, Heart, HeartPulse, Home, Hotel, KeyRound, Landmark, Laptop,
  Layers, Leaf, Lightbulb, Lock, Luggage, Magnet, Mail, Map, MapPin, Megaphone, Microscope, Monitor, Moon, Mountain, Newspaper,
  Package, PackageOpen, Paintbrush, Palette, Palmtree, PenTool, Percent, Phone, Pickaxe, PiggyBank, Pill, Pizza, Plane, Plug, Printer,
  Puzzle, Receipt, Recycle, Ribbon, Router, Ruler, Sailboat, Scale, School, Scissors, Server, Shapes, Shield, ShieldCheck, Ship, Shirt,
  ShoppingBag, ShoppingCart, Shovel, Smartphone, Snowflake, Sparkles, Sprout, Star, Stethoscope, Store, Sun, Tag, Tent, Thermometer,
  Ticket, Train, Trees, Truck, Tv, Users, UserRound, Utensils, Wallet, Warehouse, Watch, Wifi, Wind, Wine, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryIconOption {
  key: string;
  icon: LucideIcon;
  /** Greek search words (plus the English key). */
  words: string;
}

export interface CategoryIconGroup {
  label: string;
  icons: CategoryIconOption[];
}

const option = (key: string, icon: LucideIcon, words: string): CategoryIconOption => ({ key, icon, words });

/** Grouped library for the category editor. Keys are stored in finance_categories.icon; never rename one. */
export const CATEGORY_ICON_GROUPS: CategoryIconGroup[] = [
  {
    label: 'Λειτουργικά & λογαριασμοί',
    icons: [
      option('building', Building2, 'κτίριο γραφείο λειτουργικά'),
      option('store', Store, 'μαγαζί κατάστημα'),
      option('home', Home, 'σπίτι ενοίκιο'),
      option('warehouse', Warehouse, 'αποθήκη'),
      option('zap', Zap, 'ρεύμα ηλεκτρικό δεη'),
      option('lightbulb', Lightbulb, 'φωτισμός λάμπα'),
      option('droplets', Droplets, 'νερό εύδαπ'),
      option('flame', Flame, 'θέρμανση φυσικό αέριο πετρέλαιο'),
      option('thermometer', Thermometer, 'κλιματισμός θερμοκρασία'),
      option('snowflake', Snowflake, 'ψύξη κλιματιστικό'),
      option('wind', Wind, 'αερισμός'),
      option('phone', Phone, 'τηλέφωνο σταθερό'),
      option('smartphone', Smartphone, 'κινητό'),
      option('wifi', Wifi, 'internet ίντερνετ'),
      option('router', Router, 'δίκτυο router'),
      option('mail', Mail, 'ταχυδρομείο email'),
      option('shield', Shield, 'ασφάλεια ασφάλιστρα'),
      option('shieldcheck', ShieldCheck, 'συναγερμός φύλαξη'),
      option('lock', Lock, 'κλειδαριά ασφάλεια'),
      option('key', KeyRound, 'κλειδί'),
    ],
  },
  {
    label: 'Παραγωγή & εργασία',
    icons: [
      option('hammer', Hammer, 'σφυρί εργατικά τεχνίτης'),
      option('worker', HardHat, 'εργάτης συνεργάτης'),
      option('wrench', Wrench, 'επισκευή συντήρηση'),
      option('drill', Drill, 'τρυπάνι εργαλεία'),
      option('anvil', Anvil, 'αμόνι χύτευση'),
      option('pickaxe', Pickaxe, 'εξόρυξη'),
      option('factory', Factory, 'εργοστάσιο παραγωγή'),
      option('flask', FlaskConical, 'χημικά επιμετάλλωση χρύσωμα'),
      option('microscope', Microscope, 'έλεγχος ποιότητα'),
      option('magnet', Magnet, 'μαγνήτης'),
      option('ruler', Ruler, 'μέτρηση'),
      option('pen', PenTool, 'σχέδιο design'),
      option('paintbrush', Paintbrush, 'βαφή σμάλτο'),
      option('palette', Palette, 'χρώματα σμάλτα'),
      option('scissors', Scissors, 'κοπή δέρματα κορδόνια'),
      option('cable', Cable, 'σύρμα καλώδιο'),
      option('plug', Plug, 'μηχανήματα'),
      option('gauge', Gauge, 'μηχανές'),
    ],
  },
  {
    label: 'Πρώτες ύλες & υλικά',
    icons: [
      option('gem', Gem, 'πέτρες πολύτιμοι λίθοι'),
      option('diamond', Diamond, 'διαμάντι ζιργκόν'),
      option('sparkles', Sparkles, 'λάμψη χρύσωμα'),
      option('coins', Coins, 'μέταλλο ασήμι χρυσός'),
      option('crown', Crown, 'χρυσός'),
      option('circle', Circle, 'κρίκοι'),
      option('ribbon', Ribbon, 'κορδέλα'),
      option('shirt', Shirt, 'δέρματα υφάσματα'),
      option('footprints', Footprints, 'δέρμα'),
      option('leaf', Leaf, 'φυσικά υλικά'),
      option('flower', Flower2, 'λουλούδι'),
      option('shapes', Shapes, 'σχήματα εξαρτήματα'),
      option('puzzle', Puzzle, 'εξαρτήματα stx'),
      option('layers', Layers, 'υλικά στρώσεις'),
      option('box', Box, 'κουτί'),
      option('boxes', Boxes, 'αναλώσιμα'),
      option('package', Package, 'συσκευασία πακέτο'),
      option('packageopen', PackageOpen, 'συσκευασίες'),
      option('gift', Gift, 'δώρο κουτιά'),
      option('tag', Tag, 'καρτελάκια ετικέτες'),
      option('recycle', Recycle, 'ανακύκλωση'),
    ],
  },
  {
    label: 'Ταξίδια & μετακινήσεις',
    icons: [
      option('plane', Plane, 'αεροπλάνο ταξίδι πτήση'),
      option('mappin', MapPin, 'τόπος πόλη προορισμός'),
      option('map', Map, 'χάρτης περιοχή'),
      option('globe', Globe, 'εξωτερικό χώρα'),
      option('luggage', Luggage, 'βαλίτσα'),
      option('hotel', Hotel, 'ξενοδοχείο διαμονή'),
      option('bed', BedDouble, 'διαμονή ύπνος'),
      option('car', Car, 'αυτοκίνητο'),
      option('fuel', Fuel, 'καύσιμα βενζίνη'),
      option('bus', Bus, 'λεωφορείο'),
      option('train', Train, 'τρένο'),
      option('ship', Ship, 'πλοίο'),
      option('sailboat', Sailboat, 'σκάφος νησί'),
      option('anchor', Anchor, 'λιμάνι'),
      option('bike', Bike, 'μηχανάκι'),
      option('ticket', Ticket, 'εισιτήριο έκθεση'),
      option('tent', Tent, 'έκθεση περίπτερο'),
      option('mountain', Mountain, 'βουνό'),
      option('palmtree', Palmtree, 'νησί διακοπές'),
      option('castle', Castle, 'πόλη'),
      option('church', Church, 'εκκλησία'),
      option('utensils', Utensils, 'φαγητό εστιατόριο'),
      option('coffee', Coffee, 'καφές'),
      option('pizza', Pizza, 'φαγητό'),
      option('wine', Wine, 'κέρασμα'),
      option('beer', Beer, 'ποτό'),
      option('cake', Cake, 'γλυκό'),
    ],
  },
  {
    label: 'Πωλήσεις & προώθηση',
    icons: [
      option('handshake', Handshake, 'προμήθειες πλασιέ συνεργασία'),
      option('users', Users, 'πελάτες προσωπικό'),
      option('user', UserRound, 'πρόσωπο'),
      option('megaphone', Megaphone, 'διαφήμιση marketing'),
      option('camera', Camera, 'φωτογράφιση'),
      option('newspaper', Newspaper, 'έντυπα καταχωρήσεις'),
      option('printer', Printer, 'εκτυπώσεις'),
      option('bag', ShoppingBag, 'σακούλες αγορές'),
      option('cart', ShoppingCart, 'αγορές'),
      option('truck', Truck, 'μεταφορικά courier'),
      option('container', Container, 'εισαγωγές'),
      option('star', Star, 'αστέρι'),
      option('heart', Heart, 'χορηγία'),
    ],
  },
  {
    label: 'Οικονομικά & διοίκηση',
    icons: [
      option('landmark', Landmark, 'τράπεζα εφορία δημόσιο'),
      option('banknote', Banknote, 'μετρητά'),
      option('wallet', Wallet, 'πορτοφόλι'),
      option('creditcard', CreditCard, 'κάρτα'),
      option('piggybank', PiggyBank, 'αποταμίευση'),
      option('handcoins', HandCoins, 'πληρωμές'),
      option('euro', Euro, 'ευρώ'),
      option('badgeeuro', BadgeEuro, 'τέλη'),
      option('percent', Percent, 'φόροι φπα τόκοι'),
      option('scale', Scale, 'νομικά δικηγόρος'),
      option('calculator', Calculator, 'λογιστής'),
      option('filetext', FileText, 'έγγραφα συμβόλαια'),
      option('receipt', Receipt, 'απόδειξη γενικό'),
      option('briefcase', Briefcase, 'επαγγελματικά'),
      option('fingerprint', Fingerprint, 'ταυτοποίηση'),
    ],
  },
  {
    label: 'Τεχνολογία',
    icons: [
      option('laptop', Laptop, 'υπολογιστής'),
      option('monitor', Monitor, 'οθόνη'),
      option('cpu', Cpu, 'hardware'),
      option('server', Server, 'server'),
      option('cloud', Cloud, 'cloud συνδρομές'),
      option('database', Database, 'βάση δεδομένων'),
      option('headphones', Headphones, 'ήχος'),
      option('tv', Tv, 'τηλεόραση'),
      option('battery', Battery, 'μπαταρίες'),
    ],
  },
  {
    label: 'Διάφορα',
    icons: [
      option('graduation', GraduationCap, 'εκπαίδευση σεμινάρια'),
      option('school', School, 'σχολή'),
      option('book', Book, 'βιβλία'),
      option('heartpulse', HeartPulse, 'υγεία'),
      option('stethoscope', Stethoscope, 'γιατρός'),
      option('pill', Pill, 'φάρμακα'),
      option('baby', Baby, 'οικογένεια'),
      option('dog', Dog, 'κατοικίδιο'),
      option('sprout', Sprout, 'φυτά'),
      option('trees', Trees, 'κήπος'),
      option('sun', Sun, 'καλοκαίρι'),
      option('moon', Moon, 'βράδυ'),
      option('watch', Watch, 'ρολόγια'),
      option('glasses', Glasses, 'γυαλιά'),
      option('brush', Brush, 'καθαριότητα'),
      option('building-alt', Building, 'πολυκατοικία'),
      option('shovel', Shovel, 'κήπος'),
    ],
  },
];

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_GROUPS.flatMap((group) => group.icons.map((entry) => [entry.key, entry.icon])),
);

export function searchCategoryIcons(term: string): CategoryIconGroup[] {
  const query = term.trim().toLocaleLowerCase('el').normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!query) return CATEGORY_ICON_GROUPS;
  return CATEGORY_ICON_GROUPS
    .map((group) => ({
      ...group,
      icons: group.icons.filter((entry) => `${entry.key} ${entry.words}`.toLocaleLowerCase('el').normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(query)),
    }))
    .filter((group) => group.icons.length > 0);
}
