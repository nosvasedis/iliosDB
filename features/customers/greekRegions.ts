/**
 * Static Greek geography used to derive a customer's Περιοχή and map position
 * from the free-text address (AADE style: "ΟΔΟΣ 12, 21100 - ΝΑΥΠΛΙΟ").
 *
 * Top level = the geographic areas people actually use when talking about customers
 * (e.g. Κυκλάδες / Δωδεκάνησα instead of the administrative "Νότιο Αιγαίο", Αχαΐα & Ηλεία
 * under Πελοπόννησος). Second level = Περιφερειακή Ενότητα or, for island groups, the island.
 * Coordinates are the seat / main town (good enough as an area pin).
 */

export type LatLng = readonly [number, number];

export interface GreekPeriferia {
  id: string;
  label: string;
  short: string;
}

export interface GreekRegionalUnit {
  id: string;
  label: string;
  periferiaId: string;
  center: LatLng;
}

/** Overseas customers are grouped under one top-level area, split by country. */
export const ABROAD_PERIFERIA_ID = 'exoteriko';
export const countryUnitId = (code: string) => `country-${code.toUpperCase()}`;

export function countryDisplayName(code: string): string {
  const upper = code.toUpperCase();
  try {
    return new Intl.DisplayNames(['el'], { type: 'region' }).of(upper) || upper;
  } catch {
    return upper;
  }
}

/** Capital / main business city per country (ISO-3166 alpha-2). */
export const COUNTRY_CENTERS: Record<string, LatLng> = {
  CY: [35.1856, 33.3823], DE: [52.5200, 13.4050], IT: [41.9028, 12.4964], FR: [48.8566, 2.3522],
  ES: [40.4168, -3.7038], NL: [52.3676, 4.9041], BE: [50.8503, 4.3517], AT: [48.2082, 16.3738],
  BG: [42.6977, 23.3219], RO: [44.4268, 26.1025], PL: [52.2297, 21.0122], CZ: [50.0755, 14.4378],
  HU: [47.4979, 19.0402], PT: [38.7223, -9.1393], SE: [59.3293, 18.0686], DK: [55.6761, 12.5683],
  FI: [60.1699, 24.9384], IE: [53.3498, -6.2603], LU: [49.6116, 6.1319], MT: [35.8989, 14.5146],
  SI: [46.0569, 14.5058], SK: [48.1486, 17.1077], HR: [45.8150, 15.9819], LT: [54.6872, 25.2797],
  LV: [56.9496, 24.1052], EE: [59.4370, 24.7536], GB: [51.5074, -0.1278], US: [40.7128, -74.0060],
  CH: [47.3769, 8.5417], TR: [41.0082, 28.9784], AL: [41.3275, 19.8187], MK: [41.9981, 21.4254],
  RS: [44.7866, 20.4489], BA: [43.8563, 18.4131], ME: [42.4304, 19.2594], UA: [50.4501, 30.5234],
  CN: [39.9042, 116.4074], IN: [28.6139, 77.2090], AE: [25.2048, 55.2708], IL: [32.0853, 34.7818],
  EG: [30.0444, 31.2357], AU: [-33.8688, 151.2093], CA: [43.6532, -79.3832], JP: [35.6762, 139.6503],
  NO: [59.9139, 10.7522], RU: [55.7558, 37.6173], SA: [24.7136, 46.6753], QA: [25.2854, 51.5310],
  LB: [33.8938, 35.5018], JO: [31.9454, 35.9284], ZA: [-26.2041, 28.0473], BR: [-23.5505, -46.6333],
  AR: [-34.6037, -58.3816], MX: [19.4326, -99.1332], KR: [37.5665, 126.9780], SG: [1.3521, 103.8198],
  HK: [22.3193, 114.1694], GE: [41.7151, 44.8271], AM: [40.1792, 44.4991], MD: [47.0105, 28.8638],
};

export const GREEK_PERIFERIES: GreekPeriferia[] = [
  { id: 'attiki', label: 'Αττική & Αργοσαρωνικός', short: 'Αττική' },
  { id: 'peloponnisos', label: 'Πελοπόννησος', short: 'Πελοπόννησος' },
  { id: 'sterea', label: 'Στερεά Ελλάδα & Εύβοια', short: 'Στερεά' },
  { id: 'thessalia', label: 'Θεσσαλία & Σποράδες', short: 'Θεσσαλία' },
  { id: 'ipeiros', label: 'Ήπειρος', short: 'Ήπειρος' },
  { id: 'kentriki-makedonia', label: 'Κεντρική Μακεδονία & Χαλκιδική', short: 'Κ. Μακεδονία' },
  { id: 'dytiki-makedonia', label: 'Δυτική Μακεδονία', short: 'Δ. Μακεδονία' },
  { id: 'anatoliki-makedonia-thraki', label: 'Ανατ. Μακεδονία & Θράκη', short: 'Θράκη' },
  { id: 'ionia', label: 'Ιόνια Νησιά', short: 'Ιόνια' },
  { id: 'kyklades', label: 'Κυκλάδες', short: 'Κυκλάδες' },
  { id: 'dodekanisa', label: 'Δωδεκάνησα', short: 'Δωδεκάνησα' },
  { id: 'voreio-aigaio', label: 'Βόρειο Αιγαίο', short: 'Β. Αιγαίο' },
  { id: 'kriti', label: 'Κρήτη', short: 'Κρήτη' },
  { id: 'agion-oros', label: 'Άγιον Όρος', short: 'Άγιον Όρος' },
  { id: ABROAD_PERIFERIA_ID, label: 'Εξωτερικό', short: 'Εξωτερικό' },
];

const unit = (id: string, label: string, periferiaId: string, lat: number, lng: number): GreekRegionalUnit =>
  ({ id, label, periferiaId, center: [lat, lng] });

export const GREEK_REGIONAL_UNITS: GreekRegionalUnit[] = [
  // Αττική
  unit('athina-kentro', 'Αθήνα (Κέντρο)', 'attiki', 37.9838, 23.7275),
  unit('athina-voreia', 'Βόρεια Προάστια', 'attiki', 38.0567, 23.8085),
  unit('athina-notia', 'Νότια Προάστια', 'attiki', 37.9000, 23.7300),
  unit('athina-dytika', 'Δυτικά Προάστια', 'attiki', 38.0154, 23.6919),
  unit('peiraias', 'Πειραιάς', 'attiki', 37.9420, 23.6465),
  unit('attiki-nisoi', 'Αργοσαρωνικός & Κύθηρα', 'attiki', 37.7467, 23.4283),
  unit('anatoliki-attiki', 'Ανατολική Αττική', 'attiki', 38.0000, 23.8800),
  unit('dytiki-attiki', 'Δυτική Αττική', 'attiki', 38.0413, 23.5427),
  // Κεντρική Μακεδονία
  unit('thessaloniki', 'Θεσσαλονίκη', 'kentriki-makedonia', 40.6401, 22.9444),
  unit('imathia', 'Ημαθία', 'kentriki-makedonia', 40.5240, 22.2029),
  unit('kilkis', 'Κιλκίς', 'kentriki-makedonia', 40.9937, 22.8754),
  unit('pella', 'Πέλλα', 'kentriki-makedonia', 40.8017, 22.0446),
  unit('pieria', 'Πιερία', 'kentriki-makedonia', 40.2719, 22.5025),
  unit('serres', 'Σέρρες', 'kentriki-makedonia', 41.0856, 23.5484),
  unit('chalkidiki', 'Χαλκιδική', 'kentriki-makedonia', 40.3781, 23.4426),
  // Ανατολική Μακεδονία & Θράκη
  unit('drama', 'Δράμα', 'anatoliki-makedonia-thraki', 41.1500, 24.1467),
  unit('evros', 'Έβρος', 'anatoliki-makedonia-thraki', 40.8457, 25.8739),
  unit('thasos', 'Θάσος', 'anatoliki-makedonia-thraki', 40.7797, 24.7097),
  unit('kavala', 'Καβάλα', 'anatoliki-makedonia-thraki', 40.9396, 24.4069),
  unit('xanthi', 'Ξάνθη', 'anatoliki-makedonia-thraki', 41.1349, 24.8880),
  unit('rodopi', 'Ροδόπη', 'anatoliki-makedonia-thraki', 41.1224, 25.4066),
  // Δυτική Μακεδονία
  unit('grevena', 'Γρεβενά', 'dytiki-makedonia', 40.0846, 21.4273),
  unit('kastoria', 'Καστοριά', 'dytiki-makedonia', 40.5193, 21.2687),
  unit('kozani', 'Κοζάνη', 'dytiki-makedonia', 40.3007, 21.7887),
  unit('florina', 'Φλώρινα', 'dytiki-makedonia', 40.7817, 21.4098),
  // Ήπειρος
  unit('arta', 'Άρτα', 'ipeiros', 39.1600, 20.9850),
  unit('thesprotia', 'Θεσπρωτία', 'ipeiros', 39.5061, 20.2656),
  unit('ioannina', 'Ιωάννινα', 'ipeiros', 39.6650, 20.8537),
  unit('preveza', 'Πρέβεζα', 'ipeiros', 38.9597, 20.7517),
  // Θεσσαλία
  unit('karditsa', 'Καρδίτσα', 'thessalia', 39.3640, 21.9214),
  unit('larisa', 'Λάρισα', 'thessalia', 39.6390, 22.4191),
  unit('magnisia', 'Μαγνησία', 'thessalia', 39.3622, 22.9422),
  unit('sporades', 'Σποράδες', 'thessalia', 39.1218, 23.7260),
  unit('trikala', 'Τρίκαλα', 'thessalia', 39.5557, 21.7679),
  // Στερεά Ελλάδα
  unit('voiotia', 'Βοιωτία', 'sterea', 38.4361, 22.8758),
  unit('evvoia', 'Εύβοια', 'sterea', 38.4636, 23.6025),
  unit('evrytania', 'Ευρυτανία', 'sterea', 38.9131, 21.7928),
  unit('fthiotida', 'Φθιώτιδα', 'sterea', 38.8999, 22.4344),
  unit('fokida', 'Φωκίδα', 'sterea', 38.5276, 22.3762),
  unit('aitoloakarnania', 'Αιτωλοακαρνανία', 'sterea', 38.6218, 21.4077),
  // Πελοπόννησος
  unit('achaia', 'Αχαΐα', 'peloponnisos', 38.2466, 21.7346),
  unit('ileia', 'Ηλεία', 'peloponnisos', 37.6751, 21.4410),
  unit('argolida', 'Αργολίδα', 'peloponnisos', 37.5673, 22.8015),
  unit('arkadia', 'Αρκαδία', 'peloponnisos', 37.5089, 22.3794),
  unit('korinthia', 'Κορινθία', 'peloponnisos', 37.9386, 22.9322),
  unit('lakonia', 'Λακωνία', 'peloponnisos', 37.0731, 22.4297),
  unit('messinia', 'Μεσσηνία', 'peloponnisos', 37.0389, 22.1142),
  // Ιόνια Νησιά
  unit('zakynthos', 'Ζάκυνθος', 'ionia', 37.7870, 20.8999),
  unit('ithaki', 'Ιθάκη', 'ionia', 38.3667, 20.7167),
  unit('kerkyra', 'Κέρκυρα', 'ionia', 39.6243, 19.9217),
  unit('kefalonia', 'Κεφαλονιά', 'ionia', 38.1754, 20.4890),
  unit('lefkada', 'Λευκάδα', 'ionia', 38.8336, 20.7069),
  // Βόρειο Αιγαίο
  unit('ikaria', 'Ικαρία', 'voreio-aigaio', 37.6127, 26.2950),
  unit('lesvos', 'Λέσβος', 'voreio-aigaio', 39.1071, 26.5547),
  unit('limnos', 'Λήμνος', 'voreio-aigaio', 39.8740, 25.0740),
  unit('samos', 'Σάμος', 'voreio-aigaio', 37.7548, 26.9777),
  unit('chios', 'Χίος', 'voreio-aigaio', 38.3710, 26.1358),
  // Κυκλάδες (ανά νησί)
  unit('mykonos', 'Μύκονος', 'kyklades', 37.4467, 25.3289),
  unit('thira', 'Σαντορίνη', 'kyklades', 36.4167, 25.4320),
  unit('paros', 'Πάρος', 'kyklades', 37.0853, 25.1500),
  unit('antiparos', 'Αντίπαρος', 'kyklades', 37.0390, 25.0820),
  unit('naxos', 'Νάξος', 'kyklades', 37.1036, 25.3763),
  unit('syros', 'Σύρος', 'kyklades', 37.4448, 24.9430),
  unit('tinos', 'Τήνος', 'kyklades', 37.5380, 25.1630),
  unit('andros', 'Άνδρος', 'kyklades', 37.8420, 24.9370),
  unit('milos', 'Μήλος', 'kyklades', 36.7260, 24.4460),
  unit('sifnos', 'Σίφνος', 'kyklades', 36.9750, 24.7190),
  unit('serifos', 'Σέριφος', 'kyklades', 37.1530, 24.5040),
  unit('ios', 'Ίος', 'kyklades', 36.7230, 25.2820),
  unit('folegandros', 'Φολέγανδρος', 'kyklades', 36.6200, 24.9200),
  unit('amorgos', 'Αμοργός', 'kyklades', 36.8330, 25.9000),
  unit('kea', 'Κέα', 'kyklades', 37.6660, 24.3190),
  unit('kythnos', 'Κύθνος', 'kyklades', 37.3880, 24.4250),
  unit('kyklades-loipa', 'Μικρές Κυκλάδες', 'kyklades', 36.9000, 25.6000),
  // Δωδεκάνησα (ανά νησί)
  unit('rodos', 'Ρόδος', 'dodekanisa', 36.4349, 28.2176),
  unit('kos', 'Κως', 'dodekanisa', 36.8933, 27.2889),
  unit('kalymnos', 'Κάλυμνος', 'dodekanisa', 36.9500, 26.9833),
  unit('leros', 'Λέρος', 'dodekanisa', 37.1500, 26.8500),
  unit('patmos', 'Πάτμος', 'dodekanisa', 37.3220, 26.5450),
  unit('karpathos', 'Κάρπαθος', 'dodekanisa', 35.5078, 27.2130),
  unit('kasos', 'Κάσος', 'dodekanisa', 35.4170, 26.9250),
  unit('symi', 'Σύμη', 'dodekanisa', 36.6150, 27.8380),
  unit('astypalaia', 'Αστυπάλαια', 'dodekanisa', 36.5470, 26.3520),
  unit('nisyros-tilos', 'Νίσυρος & Τήλος', 'dodekanisa', 36.5870, 27.1640),
  // Κρήτη
  unit('irakleio', 'Ηράκλειο', 'kriti', 35.3387, 25.1442),
  unit('lasithi', 'Λασίθι', 'kriti', 35.1904, 25.7164),
  unit('rethymno', 'Ρέθυμνο', 'kriti', 35.3644, 24.4822),
  unit('chania', 'Χανιά', 'kriti', 35.5138, 24.0180),
  // Άγιον Όρος
  unit('agion-oros', 'Άγιον Όρος', 'agion-oros', 40.2550, 24.2440),
];

/** One unit per known country under «Εξωτερικό». */
export const ABROAD_UNITS: GreekRegionalUnit[] = Object.entries(COUNTRY_CENTERS)
  .map(([code, center]) => ({ id: countryUnitId(code), label: countryDisplayName(code), periferiaId: ABROAD_PERIFERIA_ID, center }));
GREEK_REGIONAL_UNITS.push(...ABROAD_UNITS);

export const REGIONAL_UNIT_BY_ID: Record<string, GreekRegionalUnit> =
  Object.fromEntries(GREEK_REGIONAL_UNITS.map(u => [u.id, u]));

export const PERIFERIA_BY_ID: Record<string, GreekPeriferia> =
  Object.fromEntries(GREEK_PERIFERIES.map(p => [p.id, p]));

/** Centres for postal areas shared by several ΠΕ (e.g. 840xx "rest of Cyclades"). */
export const PERIFERIA_FALLBACK_CENTER: Record<string, LatLng> = {
  kyklades: [37.0500, 25.2000],
  dodekanisa: [36.4000, 27.4000],
};

/**
 * Postal prefix → ΠΕ. Ranges are inclusive 3-digit prefixes; `exact` lists 5-digit overrides.
 * A target starting with "periferia:" only resolves the Περιφέρεια (ambiguous area).
 */
const PREFIX_RANGES: Array<[number, number, string]> = [
  [100, 119, 'athina-kentro'],
  [120, 139, 'athina-dytika'],
  [140, 159, 'athina-voreia'],
  [160, 179, 'athina-notia'],
  [180, 180, 'attiki-nisoi'],
  [181, 188, 'peiraias'],
  [189, 189, 'attiki-nisoi'],
  [190, 190, 'anatoliki-attiki'],
  [191, 193, 'dytiki-attiki'],
  [194, 195, 'anatoliki-attiki'],
  [196, 196, 'dytiki-attiki'],
  [197, 199, 'anatoliki-attiki'],
  [200, 209, 'korinthia'],
  [210, 219, 'argolida'],
  [220, 229, 'arkadia'],
  [230, 239, 'lakonia'],
  [240, 249, 'messinia'],
  [250, 269, 'achaia'],
  [270, 279, 'ileia'],
  [280, 282, 'kefalonia'],
  [283, 283, 'ithaki'],
  [284, 289, 'kefalonia'],
  [290, 299, 'zakynthos'],
  [300, 309, 'aitoloakarnania'],
  [310, 319, 'lefkada'],
  [320, 329, 'voiotia'],
  [330, 339, 'fokida'],
  [340, 349, 'evvoia'],
  [350, 359, 'fthiotida'],
  [360, 369, 'evrytania'],
  [370, 389, 'magnisia'],
  [400, 419, 'larisa'],
  [420, 429, 'trikala'],
  [430, 439, 'karditsa'],
  [440, 459, 'ioannina'],
  [460, 469, 'thesprotia'],
  [470, 479, 'arta'],
  [480, 489, 'preveza'],
  [490, 499, 'kerkyra'],
  [500, 509, 'kozani'],
  [510, 519, 'grevena'],
  [520, 529, 'kastoria'],
  [530, 539, 'florina'],
  [540, 579, 'thessaloniki'],
  [580, 589, 'pella'],
  [590, 599, 'imathia'],
  [600, 609, 'pieria'],
  [610, 619, 'kilkis'],
  [620, 629, 'serres'],
  [630, 639, 'chalkidiki'],
  [640, 659, 'kavala'],
  [660, 669, 'drama'],
  [670, 679, 'xanthi'],
  [680, 689, 'evros'],
  [690, 699, 'rodopi'],
  [700, 719, 'irakleio'],
  [720, 729, 'lasithi'],
  [730, 739, 'chania'],
  [740, 749, 'rethymno'],
  [810, 813, 'lesvos'],
  [814, 814, 'limnos'],
  [815, 819, 'lesvos'],
  [820, 829, 'chios'],
  [830, 832, 'samos'],
  [833, 833, 'ikaria'],
  [834, 839, 'samos'],
  [840, 840, 'periferia:kyklades'],
  [841, 841, 'syros'],
  [842, 842, 'tinos'],
  [843, 843, 'naxos'],
  [844, 844, 'paros'],
  [845, 845, 'andros'],
  [846, 846, 'mykonos'],
  [847, 847, 'thira'],
  [848, 848, 'milos'],
  [849, 849, 'periferia:kyklades'],
  [850, 850, 'periferia:dodekanisa'],
  [851, 851, 'rodos'],
  [852, 852, 'kalymnos'],
  [853, 853, 'kos'],
  [854, 854, 'leros'],
  [855, 855, 'patmos'],
  [856, 856, 'symi'],
  [857, 857, 'karpathos'],
  [858, 858, 'kasos'],
  [859, 859, 'astypalaia'],
];

const EXACT_POSTAL: Record<string, string> = {
  '37002': 'sporades', // Σκιάθος
  '37003': 'sporades', // Σκόπελος
  '37004': 'sporades', // Γλώσσα
  '37005': 'sporades', // Αλόννησος
  '63086': 'agion-oros',
  '63087': 'agion-oros',
  '64002': 'thasos',
  '64004': 'thasos',
  '64010': 'thasos',
};

export interface PostalAreaMatch {
  unitId: string | null;
  periferiaId: string;
}

export function lookupPostalArea(postalCode: string): PostalAreaMatch | null {
  if (!/^\d{5}$/.test(postalCode)) return null;
  const exact = EXACT_POSTAL[postalCode];
  const prefix = Number(postalCode.slice(0, 3));
  const target = exact ?? PREFIX_RANGES.find(([from, to]) => prefix >= from && prefix <= to)?.[2];
  if (!target) return null;
  if (target.startsWith('periferia:')) return { unitId: null, periferiaId: target.slice('periferia:'.length) };
  const unitMatch = REGIONAL_UNIT_BY_ID[target];
  return unitMatch ? { unitId: unitMatch.id, periferiaId: unitMatch.periferiaId } : null;
}

export interface GreekTown {
  names: string[];
  unitId: string;
  center: LatLng;
}

const town = (names: string[], unitId: string, lat: number, lng: number): GreekTown =>
  ({ names, unitId, center: [lat, lng] });

/** Towns and islands that commonly appear in addresses. Names are matched accent/case-insensitively. */
export const GREEK_TOWNS: GreekTown[] = [
  // Αττική
  town(['Αθήνα', 'Αθηνα', 'Athens'], 'athina-kentro', 37.9838, 23.7275),
  town(['Ζωγράφου'], 'athina-kentro', 37.9760, 23.7690),
  town(['Βύρωνας'], 'athina-kentro', 37.9600, 23.7530),
  town(['Μαρούσι', 'Αμαρούσιο'], 'athina-voreia', 38.0567, 23.8085),
  town(['Κηφισιά'], 'athina-voreia', 38.0740, 23.8110),
  town(['Χαλάνδρι'], 'athina-voreia', 38.0210, 23.7990),
  town(['Αγία Παρασκευή'], 'athina-voreia', 38.0110, 23.8200),
  town(['Ψυχικό'], 'athina-voreia', 38.0010, 23.7730),
  town(['Γλυφάδα'], 'athina-notia', 37.8650, 23.7530),
  town(['Καλλιθέα'], 'athina-notia', 37.9550, 23.7020),
  town(['Νέα Σμύρνη'], 'athina-notia', 37.9450, 23.7140),
  town(['Παλαιό Φάληρο'], 'athina-notia', 37.9280, 23.7000),
  town(['Άλιμος'], 'athina-notia', 37.9100, 23.7200),
  town(['Ηλιούπολη'], 'athina-notia', 37.9310, 23.7590),
  town(['Περιστέρι'], 'athina-dytika', 38.0154, 23.6919),
  town(['Αιγάλεω'], 'athina-dytika', 37.9920, 23.6820),
  town(['Ίλιον'], 'athina-dytika', 38.0330, 23.7000),
  town(['Πειραιάς', 'Πειραιεύς', 'Piraeus'], 'peiraias', 37.9420, 23.6465),
  town(['Νίκαια'], 'peiraias', 37.9660, 23.6480),
  town(['Κορυδαλλός'], 'peiraias', 37.9840, 23.6500),
  town(['Κερατσίνι'], 'peiraias', 37.9620, 23.6200),
  town(['Αίγινα'], 'attiki-nisoi', 37.7467, 23.4283),
  town(['Πόρος'], 'attiki-nisoi', 37.4980, 23.4550),
  town(['Ύδρα'], 'attiki-nisoi', 37.3490, 23.4650),
  town(['Σπέτσες'], 'attiki-nisoi', 37.2630, 23.1580),
  town(['Σαλαμίνα'], 'attiki-nisoi', 37.9640, 23.4960),
  town(['Κύθηρα'], 'attiki-nisoi', 36.1450, 22.9950),
  town(['Μέθανα'], 'attiki-nisoi', 37.5800, 23.3880),
  town(['Ραφήνα'], 'anatoliki-attiki', 38.0220, 24.0060),
  town(['Μαραθώνας'], 'anatoliki-attiki', 38.1530, 23.9630),
  town(['Κορωπί'], 'anatoliki-attiki', 37.9000, 23.8730),
  town(['Λαύριο'], 'anatoliki-attiki', 37.7140, 24.0560),
  town(['Βούλα'], 'anatoliki-attiki', 37.8430, 23.7750),
  town(['Βουλιαγμένη'], 'anatoliki-attiki', 37.8100, 23.7800),
  town(['Βάρκιζα'], 'anatoliki-attiki', 37.8170, 23.8030),
  town(['Παλλήνη'], 'anatoliki-attiki', 38.0000, 23.8800),
  town(['Ελευσίνα'], 'dytiki-attiki', 38.0413, 23.5427),
  town(['Μέγαρα'], 'dytiki-attiki', 37.9960, 23.3440),
  town(['Ασπρόπυργος'], 'dytiki-attiki', 38.0610, 23.5880),
  // Κεντρική Μακεδονία
  town(['Θεσσαλονίκη', 'Thessaloniki'], 'thessaloniki', 40.6401, 22.9444),
  town(['Καλαμαριά'], 'thessaloniki', 40.5820, 22.9500),
  town(['Θέρμη'], 'thessaloniki', 40.5470, 23.0200),
  town(['Βέροια'], 'imathia', 40.5240, 22.2029),
  town(['Νάουσα'], 'imathia', 40.6290, 22.0680),
  town(['Αλεξάνδρεια'], 'imathia', 40.6280, 22.4440),
  town(['Κιλκίς'], 'kilkis', 40.9937, 22.8754),
  town(['Έδεσσα'], 'pella', 40.8017, 22.0446),
  town(['Γιαννιτσά'], 'pella', 40.7920, 22.4080),
  town(['Κατερίνη'], 'pieria', 40.2719, 22.5025),
  town(['Λιτόχωρο'], 'pieria', 40.1020, 22.5040),
  town(['Παραλία Κατερίνης', 'Παραλία'], 'pieria', 40.2690, 22.5960),
  town(['Σέρρες'], 'serres', 41.0856, 23.5484),
  town(['Πολύγυρος'], 'chalkidiki', 40.3781, 23.4426),
  town(['Νέα Μουδανιά', 'Ν Μουδανιά', 'Ν. Μουδανιά'], 'chalkidiki', 40.2390, 23.2830),
  town(['Ιερισσός'], 'chalkidiki', 40.3986, 23.8784),
  town(['Νέος Μαρμαράς', 'Ν Μαρμαράς'], 'chalkidiki', 40.0957, 23.7836),
  town(['Κασσάνδρεια'], 'chalkidiki', 40.0480, 23.4130),
  town(['Χανιώτη'], 'chalkidiki', 39.9420, 23.5950),
  town(['Πευκοχώρι'], 'chalkidiki', 39.9910, 23.6170),
  town(['Ουρανούπολη'], 'chalkidiki', 40.3260, 23.9830),
  town(['Νικήτη'], 'chalkidiki', 40.2240, 23.6640),
  town(['Σάρτη'], 'chalkidiki', 40.0910, 23.9790),
  town(['Αφυτος', 'Άφυτος'], 'chalkidiki', 40.0990, 23.4380),
  // Ανατολική Μακεδονία & Θράκη
  town(['Δράμα'], 'drama', 41.1500, 24.1467),
  town(['Αλεξανδρούπολη'], 'evros', 40.8457, 25.8739),
  town(['Ορεστιάδα'], 'evros', 41.5030, 26.5300),
  town(['Σαμοθράκη'], 'evros', 40.4750, 25.5230),
  town(['Θάσος', 'Λιμένας Θάσου', 'Λιμένας'], 'thasos', 40.7797, 24.7097),
  town(['Λιμενάρια'], 'thasos', 40.6270, 24.5770),
  town(['Καβάλα'], 'kavala', 40.9396, 24.4069),
  town(['Ξάνθη'], 'xanthi', 41.1349, 24.8880),
  town(['Κομοτηνή'], 'rodopi', 41.1224, 25.4066),
  // Δυτική Μακεδονία
  town(['Γρεβενά'], 'grevena', 40.0846, 21.4273),
  town(['Καστοριά'], 'kastoria', 40.5193, 21.2687),
  town(['Κοζάνη'], 'kozani', 40.3007, 21.7887),
  town(['Πτολεμαΐδα', 'Πτολεμαιδα'], 'kozani', 40.5126, 21.6786),
  town(['Φλώρινα'], 'florina', 40.7817, 21.4098),
  // Ήπειρος
  town(['Άρτα'], 'arta', 39.1600, 20.9850),
  town(['Ηγουμενίτσα'], 'thesprotia', 39.5061, 20.2656),
  town(['Ιωάννινα', 'Γιάννενα'], 'ioannina', 39.6650, 20.8537),
  town(['Μέτσοβο'], 'ioannina', 39.7700, 21.1830),
  town(['Πρέβεζα'], 'preveza', 38.9597, 20.7517),
  town(['Πάργα'], 'preveza', 39.2847, 20.3997),
  // Θεσσαλία
  town(['Καρδίτσα'], 'karditsa', 39.3640, 21.9214),
  town(['Παλαμάς'], 'karditsa', 39.4667, 22.0833),
  town(['Λάρισα'], 'larisa', 39.6390, 22.4191),
  town(['Τύρναβος'], 'larisa', 39.7380, 22.2880),
  town(['Βόλος'], 'magnisia', 39.3622, 22.9422),
  town(['Αλμυρός'], 'magnisia', 39.1810, 22.7600),
  town(['Σκιάθος'], 'sporades', 39.1620, 23.4900),
  town(['Σκόπελος'], 'sporades', 39.1218, 23.7260),
  town(['Αλόννησος'], 'sporades', 39.1490, 23.8680),
  town(['Τρίκαλα'], 'trikala', 39.5557, 21.7679),
  town(['Καλαμπάκα'], 'trikala', 39.7060, 21.6270),
  // Στερεά Ελλάδα
  town(['Λιβαδειά'], 'voiotia', 38.4361, 22.8758),
  town(['Θήβα'], 'voiotia', 38.3250, 23.3190),
  town(['Αράχωβα'], 'voiotia', 38.4790, 22.5840),
  town(['Χαλκίδα'], 'evvoia', 38.4636, 23.6025),
  town(['Ερέτρια'], 'evvoia', 38.3950, 23.7930),
  town(['Κύμη'], 'evvoia', 38.6330, 24.1000),
  town(['Αιδηψός', 'Λουτρά Αιδηψού'], 'evvoia', 38.8590, 23.0490),
  town(['Καρπενήσι'], 'evrytania', 38.9131, 21.7928),
  town(['Λαμία'], 'fthiotida', 38.8999, 22.4344),
  town(['Άμφισσα'], 'fokida', 38.5276, 22.3762),
  town(['Δελφοί'], 'fokida', 38.4824, 22.5010),
  town(['Γαλαξίδι'], 'fokida', 38.3790, 22.3810),
  town(['Αγρίνιο'], 'aitoloakarnania', 38.6218, 21.4077),
  town(['Μεσολόγγι'], 'aitoloakarnania', 38.3687, 21.4300),
  town(['Ναύπακτος'], 'aitoloakarnania', 38.3920, 21.8280),
  town(['Αστακός'], 'aitoloakarnania', 38.5333, 21.0833),
  town(['Πάτρα', 'Πάτραι'], 'achaia', 38.2466, 21.7346),
  town(['Αίγιο'], 'achaia', 38.2500, 22.0810),
  town(['Καλάβρυτα'], 'achaia', 38.0330, 22.1100),
  town(['Πύργος'], 'ileia', 37.6751, 21.4410),
  town(['Αμαλιάδα'], 'ileia', 37.7980, 21.3500),
  town(['Αρχαία Ολυμπία', 'Ολυμπία'], 'ileia', 37.6450, 21.6250),
  // Πελοπόννησος
  town(['Ναύπλιο', 'Ναύπλιον'], 'argolida', 37.5673, 22.8015),
  town(['Άργος'], 'argolida', 37.6333, 22.7333),
  town(['Ερμιόνη'], 'argolida', 37.3850, 23.2470),
  town(['Πόρτο Χέλι'], 'argolida', 37.3200, 23.1470),
  town(['Κρανίδι'], 'argolida', 37.3800, 23.1600),
  town(['Τολό'], 'argolida', 37.5200, 22.8600),
  town(['Τρίπολη'], 'arkadia', 37.5089, 22.3794),
  town(['Μεγαλόπολη'], 'arkadia', 37.4010, 22.1410),
  town(['Κόρινθος'], 'korinthia', 37.9386, 22.9322),
  town(['Λουτράκι'], 'korinthia', 37.9750, 22.9770),
  town(['Κιάτο'], 'korinthia', 38.0110, 22.7480),
  town(['Ξυλόκαστρο'], 'korinthia', 38.0770, 22.6340),
  town(['Σπάρτη'], 'lakonia', 37.0731, 22.4297),
  town(['Γύθειο'], 'lakonia', 36.7550, 22.5660),
  town(['Μονεμβασιά', 'Μονεμβασία'], 'lakonia', 36.6870, 23.0560),
  town(['Καλαμάτα'], 'messinia', 37.0389, 22.1142),
  town(['Πύλος'], 'messinia', 36.9130, 21.6960),
  town(['Μεθώνη'], 'messinia', 36.8197, 21.7049),
  town(['Κορώνη'], 'messinia', 36.7950, 21.9570),
  town(['Φιλιατρά'], 'messinia', 37.1569, 21.5853),
  town(['Κυπαρισσία'], 'messinia', 37.2500, 21.6730),
  town(['Καρδαμύλη'], 'messinia', 36.8880, 22.2330),
  // Ιόνια Νησιά
  town(['Ζάκυνθος'], 'zakynthos', 37.7870, 20.8999),
  town(['Ιθάκη', 'Βαθύ Ιθάκης'], 'ithaki', 38.3667, 20.7167),
  town(['Κέρκυρα', 'Corfu'], 'kerkyra', 39.6243, 19.9217),
  town(['Παλαιοκαστρίτσα'], 'kerkyra', 39.6730, 19.7060),
  town(['Αργοστόλι'], 'kefalonia', 38.1754, 20.4890),
  town(['Ληξούρι'], 'kefalonia', 38.2010, 20.4370),
  town(['Φισκάρδο'], 'kefalonia', 38.4600, 20.5770),
  town(['Σάμη'], 'kefalonia', 38.2510, 20.6460),
  town(['Λευκάδα'], 'lefkada', 38.8336, 20.7069),
  town(['Νυδρί'], 'lefkada', 38.7070, 20.7110),
  // Βόρειο Αιγαίο
  town(['Άγιος Κήρυκος', 'Ικαρία'], 'ikaria', 37.6127, 26.2950),
  town(['Μυτιλήνη', 'Λέσβος'], 'lesvos', 39.1071, 26.5547),
  town(['Μόλυβος', 'Μήθυμνα'], 'lesvos', 39.3680, 26.1730),
  town(['Πλωμάρι'], 'lesvos', 38.9750, 26.3700),
  town(['Μύρινα', 'Λήμνος'], 'limnos', 39.8740, 25.0740),
  town(['Σάμος', 'Βαθύ'], 'samos', 37.7548, 26.9777),
  town(['Πυθαγόρειο'], 'samos', 37.6910, 26.9440),
  town(['Καρλόβασι'], 'samos', 37.7920, 26.7050),
  town(['Χίος'], 'chios', 38.3710, 26.1358),
  // Κυκλάδες
  town(['Άνδρος'], 'andros', 37.8420, 24.9370),
  town(['Σαντορίνη', 'Θήρα', 'Φηρά', 'Santorini'], 'thira', 36.4167, 25.4320),
  town(['Οία'], 'thira', 36.4610, 25.3750),
  town(['Καμάρι'], 'thira', 36.3770, 25.4800),
  town(['Πύργος Καλλίστης'], 'thira', 36.3830, 25.4500),
  town(['Ίος', 'Χώρα Ίου'], 'ios', 36.7230, 25.2820),
  town(['Φολέγανδρος'], 'folegandros', 36.6200, 24.9200),
  town(['Αμοργός', 'Κατάπολα', 'Αιγιάλη'], 'amorgos', 36.8330, 25.9000),
  town(['Ανάφη'], 'kyklades-loipa', 36.3580, 25.7770),
  town(['Κουφονήσια', 'Κουφονήσι'], 'kyklades-loipa', 36.9360, 25.6000),
  town(['Σίκινος'], 'kyklades-loipa', 36.6830, 25.1170),
  town(['Κέα', 'Τζιά', 'Ιουλίδα'], 'kea', 37.6660, 24.3190),
  town(['Κύθνος'], 'kythnos', 37.3880, 24.4250),
  town(['Μήλος', 'Αδάμαντας', 'Αδάμας', 'Πλάκα Μήλου'], 'milos', 36.7260, 24.4460),
  town(['Κίμωλος'], 'milos', 36.7950, 24.5720),
  town(['Σίφνος', 'Απολλωνία', 'Καμάρες'], 'sifnos', 36.9750, 24.7190),
  town(['Σέριφος'], 'serifos', 37.1530, 24.5040),
  town(['Μύκονος', 'Mykonos'], 'mykonos', 37.4467, 25.3289),
  town(['Νάξος'], 'naxos', 37.1036, 25.3763),
  town(['Πάρος', 'Παροικιά'], 'paros', 37.0853, 25.1500),
  town(['Νάουσα Πάρου', 'Νάουσα'], 'paros', 37.1240, 25.2370),
  town(['Αντίπαρος'], 'antiparos', 37.0390, 25.0820),
  town(['Σύρος', 'Ερμούπολη'], 'syros', 37.4448, 24.9430),
  town(['Τήνος'], 'tinos', 37.5380, 25.1630),
  // Δωδεκάνησα
  town(['Ρόδος', 'Rhodes'], 'rodos', 36.4349, 28.2176),
  town(['Ιαλυσός'], 'rodos', 36.4170, 28.1580),
  town(['Λίνδος'], 'rodos', 36.0917, 28.0858),
  town(['Φαληράκι'], 'rodos', 36.3410, 28.2000),
  town(['Αφάντου'], 'rodos', 36.2930, 28.1660),
  town(['Αρχάγγελος'], 'rodos', 36.2130, 28.1150),
  town(['Κρεμαστή'], 'rodos', 36.4100, 28.1200),
  town(['Σύμη'], 'symi', 36.6150, 27.8380),
  town(['Τήλος'], 'nisyros-tilos', 36.4330, 27.3830),
  town(['Κάλυμνος', 'Πόθια'], 'kalymnos', 36.9500, 26.9833),
  town(['Λέρος', 'Λακκί', 'Αγία Μαρίνα Λέρου'], 'leros', 37.1500, 26.8500),
  town(['Πάτμος', 'Σκάλα Πάτμου'], 'patmos', 37.3220, 26.5450),
  town(['Αστυπάλαια'], 'astypalaia', 36.5470, 26.3520),
  town(['Κάρπαθος', 'Πηγάδια'], 'karpathos', 35.5078, 27.2130),
  town(['Κάσος'], 'kasos', 35.4170, 26.9250),
  town(['Κως', 'Κώς', 'Kos'], 'kos', 36.8933, 27.2889),
  town(['Νίσυρος'], 'nisyros-tilos', 36.5870, 27.1640),
  town(['Καρδάμαινα'], 'kos', 36.7830, 27.1440),
  // Κρήτη
  town(['Ηράκλειο', 'Ηρακλειο', 'Heraklion'], 'irakleio', 35.3387, 25.1442),
  town(['Λιμένας Χερσονήσου', 'Χερσόνησος'], 'irakleio', 35.3164, 25.3928),
  town(['Μάλια'], 'irakleio', 35.2860, 25.4620),
  town(['Μοίρες'], 'irakleio', 35.0520, 24.8740),
  town(['Αγία Πελαγία'], 'irakleio', 35.4060, 24.9790),
  town(['Ματάλα'], 'irakleio', 34.9950, 24.7500),
  town(['Άγιος Νικόλαος'], 'lasithi', 35.1904, 25.7164),
  town(['Ιεράπετρα'], 'lasithi', 35.0100, 25.7400),
  town(['Σητεία'], 'lasithi', 35.2070, 26.1050),
  town(['Ελούντα'], 'lasithi', 35.2620, 25.7230),
  town(['Ρέθυμνο'], 'rethymno', 35.3644, 24.4822),
  town(['Αγία Γαλήνη'], 'rethymno', 35.0960, 24.6880),
  town(['Πλακιάς'], 'rethymno', 35.1910, 24.3940),
  town(['Μπαλί'], 'rethymno', 35.4100, 24.7830),
  town(['Χανιά', 'Chania'], 'chania', 35.5138, 24.0180),
  town(['Κίσσαμος', 'Καστέλλι Κισσάμου'], 'chania', 35.4944, 23.6540),
  town(['Χώρα Σφακίων', 'Σφακιά'], 'chania', 35.2017, 24.1380),
  town(['Πλατανιάς'], 'chania', 35.5150, 23.9050),
  town(['Παλαιόχωρα'], 'chania', 35.2330, 23.6800),
  town(['Γεωργιούπολη'], 'chania', 35.3620, 24.2600),
  // Άγιον Όρος
  town(['Καρυές'], 'agion-oros', 40.2550, 24.2440),
  town(['Δάφνη Άθω', 'Δάφνη'], 'agion-oros', 40.2120, 24.2220),
];

export interface WorldCity {
  names: string[];
  country: string;
  center: LatLng;
  /** US state (USPS code) — must agree with the state written in the address. */
  state?: string;
}

const city = (names: string[], country: string, lat: number, lng: number, state?: string): WorldCity => ({ names, country, center: [lat, lng], state });

/** Main cities for overseas customers (matched only inside the customer's country). */
export const WORLD_CITIES: WorldCity[] = [
  // Κύπρος
  city(['Λευκωσία', 'Nicosia', 'Lefkosia'], 'CY', 35.1856, 33.3823),
  city(['Λεμεσός', 'Limassol', 'Lemesos'], 'CY', 34.7071, 33.0226),
  city(['Λάρνακα', 'Larnaca', 'Larnaka'], 'CY', 34.9003, 33.6232),
  city(['Πάφος', 'Paphos', 'Pafos'], 'CY', 34.7754, 32.4245),
  city(['Αγία Νάπα', 'Ayia Napa', 'Agia Napa'], 'CY', 34.9823, 33.9999),
  city(['Παραλίμνι', 'Paralimni', 'Πρωταράς', 'Protaras'], 'CY', 35.0381, 33.9822),
  // ΗΠΑ / Καναδάς
  city(['New York', 'Νέα Υόρκη', 'NYC', 'Manhattan', 'Brooklyn'], 'US', 40.7128, -74.0060, 'NY'),
  city(['Astoria', 'Queens', 'Αστόρια'], 'US', 40.7644, -73.9235, 'NY'),
  city(['Chicago', 'Σικάγο'], 'US', 41.8781, -87.6298, 'IL'),
  city(['Los Angeles', 'Λος Άντζελες'], 'US', 34.0522, -118.2437, 'CA'),
  city(['Boston', 'Βοστώνη'], 'US', 42.3601, -71.0589, 'MA'),
  city(['Miami', 'Μαϊάμι'], 'US', 25.7617, -80.1918, 'FL'),
  city(['San Francisco', 'Σαν Φρανσίσκο'], 'US', 37.7749, -122.4194, 'CA'),
  city(['Las Vegas', 'Λας Βέγκας'], 'US', 36.1699, -115.1398, 'NV'),
  city(['Washington', 'Ουάσιγκτον'], 'US', 38.9072, -77.0369, 'DC'),
  city(['Toronto', 'Τορόντο'], 'CA', 43.6532, -79.3832),
  city(['Montreal', 'Μόντρεαλ'], 'CA', 45.5017, -73.5673),
  city(['Vancouver', 'Βανκούβερ'], 'CA', 49.2827, -123.1207),
  // Ευρώπη
  city(['London', 'Λονδίνο'], 'GB', 51.5074, -0.1278),
  city(['Paris', 'Παρίσι'], 'FR', 48.8566, 2.3522),
  city(['Nice', 'Νίκαια Γαλλίας'], 'FR', 43.7102, 7.2620),
  city(['Berlin', 'Βερολίνο'], 'DE', 52.5200, 13.4050),
  city(['München', 'Munich', 'Μόναχο'], 'DE', 48.1351, 11.5820),
  city(['Frankfurt', 'Φρανκφούρτη'], 'DE', 50.1109, 8.6821),
  city(['Hamburg', 'Αμβούργο'], 'DE', 53.5511, 9.9937),
  city(['Stuttgart', 'Στουτγάρδη'], 'DE', 48.7758, 9.1829),
  city(['Düsseldorf', 'Dusseldorf', 'Ντίσελντορφ'], 'DE', 51.2277, 6.7735),
  city(['Köln', 'Cologne', 'Κολωνία'], 'DE', 50.9375, 6.9603),
  city(['Roma', 'Rome', 'Ρώμη'], 'IT', 41.9028, 12.4964),
  city(['Milano', 'Milan', 'Μιλάνο'], 'IT', 45.4642, 9.1900),
  city(['Venezia', 'Venice', 'Βενετία'], 'IT', 45.4408, 12.3155),
  city(['Firenze', 'Florence', 'Φλωρεντία'], 'IT', 43.7696, 11.2558),
  city(['Madrid', 'Μαδρίτη'], 'ES', 40.4168, -3.7038),
  city(['Barcelona', 'Βαρκελώνη'], 'ES', 41.3851, 2.1734),
  city(['Amsterdam', 'Άμστερνταμ'], 'NL', 52.3676, 4.9041),
  city(['Rotterdam', 'Ρότερνταμ'], 'NL', 51.9244, 4.4777),
  city(['Brussels', 'Bruxelles', 'Βρυξέλλες'], 'BE', 50.8503, 4.3517),
  city(['Antwerpen', 'Antwerp', 'Αμβέρσα'], 'BE', 51.2194, 4.4025),
  city(['Wien', 'Vienna', 'Βιέννη'], 'AT', 48.2082, 16.3738),
  city(['Zürich', 'Zurich', 'Ζυρίχη'], 'CH', 47.3769, 8.5417),
  city(['Genève', 'Geneva', 'Γενεύη'], 'CH', 46.2044, 6.1432),
  city(['Sofia', 'Σόφια'], 'BG', 42.6977, 23.3219),
  city(['Plovdiv', 'Φιλιππούπολη'], 'BG', 42.1354, 24.7453),
  city(['Bucharest', 'București', 'Βουκουρέστι'], 'RO', 44.4268, 26.1025),
  city(['Istanbul', 'Κωνσταντινούπολη', 'Πόλη'], 'TR', 41.0082, 28.9784),
  city(['İzmir', 'Izmir', 'Σμύρνη'], 'TR', 38.4237, 27.1428),
  city(['Tirana', 'Τίρανα'], 'AL', 41.3275, 19.8187),
  city(['Skopje', 'Σκόπια'], 'MK', 41.9981, 21.4254),
  city(['Belgrade', 'Beograd', 'Βελιγράδι'], 'RS', 44.7866, 20.4489),
  city(['Stockholm', 'Στοκχόλμη'], 'SE', 59.3293, 18.0686),
  city(['København', 'Copenhagen', 'Κοπεγχάγη'], 'DK', 55.6761, 12.5683),
  city(['Lisboa', 'Lisbon', 'Λισαβόνα'], 'PT', 38.7223, -9.1393),
  city(['Dublin', 'Δουβλίνο'], 'IE', 53.3498, -6.2603),
  city(['Warszawa', 'Warsaw', 'Βαρσοβία'], 'PL', 52.2297, 21.0122),
  city(['Praha', 'Prague', 'Πράγα'], 'CZ', 50.0755, 14.4378),
  city(['Budapest', 'Βουδαπέστη'], 'HU', 47.4979, 19.0402),
  // Μέση Ανατολή / λοιπά
  city(['Dubai', 'Ντουμπάι'], 'AE', 25.2048, 55.2708),
  city(['Abu Dhabi', 'Άμπου Ντάμπι'], 'AE', 24.4539, 54.3773),
  city(['Tel Aviv', 'Τελ Αβίβ'], 'IL', 32.0853, 34.7818),
  city(['Cairo', 'Κάιρο'], 'EG', 30.0444, 31.2357),
  city(['Sydney', 'Σίδνεϊ'], 'AU', -33.8688, 151.2093),
  city(['Melbourne', 'Μελβούρνη'], 'AU', -37.8136, 144.9631),
];

/** Approximate centre per US state (USPS code) — area pins for US customers outside the big cities. */
export const US_STATE_CENTERS: Record<string, LatLng> = {
  AL: [32.8, -86.8], AK: [61.4, -152.3], AZ: [34.2, -111.7], AR: [34.9, -92.4], CA: [36.8, -119.4],
  CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4],
  GA: [32.7, -83.4], HI: [20.8, -156.3], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
  IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.1, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7],
  MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6],
  NJ: [40.1, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.6, -79.4], ND: [47.5, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7],
  VT: [44.1, -72.7], VA: [37.5, -78.8], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9],
  WY: [43.0, -107.6],
};

/** Extra spellings people type for a country (besides the Greek/English names from Intl). */
export const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['ΗΠΑ', 'Η.Π.Α.', 'USA', 'U.S.A.', 'United States', 'United States of America', 'Αμερική', 'America'],
  GB: ['UK', 'U.K.', 'United Kingdom', 'Great Britain', 'England', 'Αγγλία', 'Μεγάλη Βρετανία', 'Ηνωμένο Βασίλειο'],
  CY: ['Cyprus', 'Κύπρος', 'Kibris'],
  DE: ['Germany', 'Deutschland', 'Γερμανία'],
  NL: ['Holland', 'Ολλανδία', 'Netherlands'],
  AE: ['UAE', 'U.A.E.', 'Εμιράτα', 'Ηνωμένα Αραβικά Εμιράτα'],
  CH: ['Switzerland', 'Schweiz', 'Suisse', 'Ελβετία'],
  AU: ['Australia', 'Αυστραλία'],
  CA: ['Canada', 'Καναδάς'],
};
