import { describe, expect, it } from 'vitest';
import { OrderStatus, type Customer, type Order } from '../../types';
import {
  activityFromDays,
  buildCustomerDirectory,
  composeBranchAddress,
  matchesEntryRegion,
  countRegions,
  customerInitials,
  matchesCustomerSearch,
  matchesRegionFilter,
  resolveCustomerLocation,
  splitGreekAddress,
} from '../../features/customers/customerLocation';
import { GREEK_REGIONAL_UNITS, GREEK_TOWNS, lookupPostalArea, PERIFERIA_BY_ID, REGIONAL_UNIT_BY_ID } from '../../features/customers/greekRegions';

const customer = (address: string | undefined, extra: Partial<Customer> = {}): Customer => ({
  id: `c-${address ?? 'none'}`,
  full_name: 'Δοκιμή Πελάτης',
  address,
  created_at: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('splitGreekAddress', () => {
  it('reads AADE style addresses', () => {
    expect(splitGreekAddress('ΣΥΓΓΡΟΥ 12, 21100 - ΝΑΥΠΛΙΟ')).toEqual({ postalCode: '21100', place: 'ΝΑΥΠΛΙΟ' });
    expect(splitGreekAddress('ΟΔΟΣ 1, 43100, ΚΑΡΔΙΤΣΑ')).toEqual({ postalCode: '43100', place: 'ΚΑΡΔΙΤΣΑ' });
    expect(splitGreekAddress('ΟΔΟΣ 5, 16452 ')).toEqual({ postalCode: '16452', place: null });
    expect(splitGreekAddress('Ερμού 10, 105 63 Αθήνα')).toEqual({ postalCode: '10563', place: 'Αθήνα' });
    expect(splitGreekAddress('')).toEqual({ postalCode: null, place: null });
  });
});

describe('resolveCustomerLocation', () => {
  const cases: Array<[string, string, string, string]> = [
    ['ΟΔΟΣ 1, 21100 - ΝΑΥΠΛΙΟ', 'argolida', 'Ναύπλιο', 'town'],
    ['ΟΔΟΣ 1, 63087 ΔΑΦΝΗ ΑΘΩ', 'agion-oros', 'Δάφνη Άθω', 'town'],
    ['ΟΔΟΣ 1, 70014 - ΛΙΜΕΝΑΣ ΧΕΡΣ', 'irakleio', 'Λιμένας Χερσονήσου', 'town'],
    ['ΟΔΟΣ 1, 85101 - ΙΑΛΥΣΟΣ', 'rodos', 'Ιαλυσός', 'town'],
    ['ΟΔΟΣ 1, 84801, ΑΔΑΜΑΝΤΑΣ-ΜΗΛΟΣ', 'milos', 'Μήλος', 'town'],
    ['ΟΔΟΣ 1, 63200 - Ν ΜΟΥΔΑΝΙΑ', 'chalkidiki', 'Νέα Μουδανιά', 'town'],
    ['ΟΔΟΣ 1, 18020 - ΠΟΡΟΣ', 'attiki-nisoi', 'Πόρος', 'town'],
    ['ΟΔΟΣ 1, 50200 - ΠΤΟΛΕΜΑΙΔΑ', 'kozani', 'Πτολεμαΐδα', 'town'],
    ['ΟΔΟΣ 1, 84700 - ΘΗΡΑ', 'thira', 'Σαντορίνη', 'town'],
    ['ΟΔΟΣ 1, 85303 - ΝΙΣΥΡΟΣ', 'nisyros-tilos', 'Νίσυρος', 'town'],
    ['ΟΔΟΣ 1, 84001 - ΙΟΣ', 'ios', 'Ίος', 'town'],
    ['ΟΔΟΣ 1, 73011 - ΧΩΡΑ ΣΦΑΚΙΩΝ', 'chania', 'Χώρα Σφακίων', 'town'],
  ];
  it.each(cases)('%s → %s', (address, unitId, town, precision) => {
    const loc = resolveCustomerLocation(customer(address));
    expect(loc.unitId).toBe(unitId);
    expect(loc.town).toBe(town);
    expect(loc.precision).toBe(precision);
    expect(loc.coords).not.toBeNull();
  });

  it('falls back to the postal area when the town is unknown or missing', () => {
    const kyklades = resolveCustomerLocation(customer('ΟΔΟΣ 1, 84600, ΚΥΚΛΑΔΩΝ'));
    expect(kyklades.unitId).toBe('mykonos');
    expect(kyklades.precision).toBe('area');
    const noTown = resolveCustomerLocation(customer('ΟΔΟΣ 5, 16452'));
    expect(noTown.periferiaId).toBe('attiki');
    expect(noTown.precision).toBe('area');
  });

  it('ignores a town that contradicts the postal code', () => {
    // Νάουσα exists in Ημαθία and in Πάρο; 844xx picks the Πάρος one.
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 84401 - ΝΑΟΥΣΑ'))).toMatchObject({ unitId: 'paros', precision: 'town' });
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 59200 - ΝΑΟΥΣΑ'))).toMatchObject({ unitId: 'imathia', precision: 'town' });
    // Βέροια is in Ημαθία; a Cretan postal code must win.
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 71201 - ΒΕΡΟΙΑ'))).toMatchObject({ unitId: 'irakleio', precision: 'area' });
  });

  it('groups islands as Κυκλάδες / Δωδεκάνησα', () => {
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 84600 - ΜΥΚΟΝΟΣ')).periferiaLabel).toBe('Κυκλάδες');
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 85100 - ΡΟΔΟΣ')).periferiaLabel).toBe('Δωδεκάνησα');
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 26221 - ΠΑΤΡΑ')).periferiaId).toBe('peloponnisos');
  });

  it('prefers saved coordinates', () => {
    const loc = resolveCustomerLocation(customer('ΟΔΟΣ 1, 21100 - ΝΑΥΠΛΙΟ', { latitude: 37.5, longitude: 22.8 }));
    expect(loc.precision).toBe('exact');
    expect(loc.coords).toEqual([37.5, 22.8]);
    expect(loc.unitId).toBe('argolida');
  });

  it('returns no location for empty addresses', () => {
    const loc = resolveCustomerLocation(customer(undefined));
    expect(loc.precision).toBe('none');
    expect(loc.periferiaId).toBeNull();
  });
});

describe('region data integrity', () => {
  it('links every unit and town to known regions', () => {
    for (const u of GREEK_REGIONAL_UNITS) expect(PERIFERIA_BY_ID[u.periferiaId]).toBeDefined();
    for (const t of GREEK_TOWNS) expect(REGIONAL_UNIT_BY_ID[t.unitId]).toBeDefined();
  });
  it('maps postal prefixes for the main areas', () => {
    expect(lookupPostalArea('10563')?.unitId).toBe('athina-kentro');
    expect(lookupPostalArea('54622')?.unitId).toBe('thessaloniki');
    expect(lookupPostalArea('49100')?.unitId).toBe('kerkyra');
    expect(lookupPostalArea('64004')?.unitId).toBe('thasos');
    expect(lookupPostalArea('84001')).toEqual({ unitId: null, periferiaId: 'kyklades' });
    expect(lookupPostalArea('85100')?.unitId).toBe('rodos');
    expect(lookupPostalArea('85400')?.unitId).toBe('leros');
    expect(lookupPostalArea('99999')).toBeNull();
  });
});

describe('customer directory', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  const order = (customer_id: string, created_at: string, total_price: number, status = OrderStatus.Delivered): Order =>
    ({ id: `${customer_id}-${created_at}`, customer_id, customer_name: '', created_at, status, items: [], total_price });

  it('aggregates orders, ignores cancelled ones and buckets activity', () => {
    const a = customer('ΟΔΟΣ 1, 21100 - ΝΑΥΠΛΙΟ', { id: 'a' });
    const b = customer('ΟΔΟΣ 1, 49100 - ΚΕΡΚΥΡΑ', { id: 'b' });
    const sys = customer(undefined, { id: 'sys', full_name: 'Λιανική' });
    const directory = buildCustomerDirectory([a, b, sys], [
      order('a', '2026-10-01T00:00:00Z', 100),
      order('a', '2026-01-01T00:00:00Z', 50),
      order('a', '2026-10-10T00:00:00Z', 999, OrderStatus.Cancelled),
      order('b', '2025-01-01T00:00:00Z', 10),
    ], { systemCustomerId: 'sys', now });
    const [ea, eb, es] = directory;
    expect(ea).toMatchObject({ orderCount: 2, revenue: 150, activity: 'active', daysSinceLastOrder: 13 });
    expect(eb.activity).toBe('inactive');
    expect(es).toMatchObject({ isSystem: true, activity: 'none' });

    const counts = countRegions(directory);
    expect(counts.periferia).toEqual({ peloponnisos: 1, ionia: 1 });
    expect(counts.none).toBe(0);

    expect(matchesRegionFilter(ea.location, ['p:peloponnisos'])).toBe(true);
    expect(matchesRegionFilter(ea.location, ['u:kerkyra'])).toBe(false);
    expect(matchesRegionFilter(es.location, ['none'])).toBe(true);
    expect(matchesCustomerSearch(ea, 'ναυπλιο')).toBe(true);
    expect(matchesCustomerSearch(ea, 'Αργολίδα')).toBe(true);
    expect(matchesCustomerSearch(ea, '21100')).toBe(true);
  });

  it('buckets activity thresholds', () => {
    expect(activityFromDays(null)).toBe('none');
    expect(activityFromDays(90)).toBe('active');
    expect(activityFromDays(200)).toBe('quiet');
    expect(activityFromDays(400)).toBe('inactive');
  });

  it('builds initials', () => {
    expect(customerInitials('Κοσμήματα Ήλιος ΟΕ')).toBe('ΚΗ');
    expect(customerInitials('Μάριος')).toBe('ΜΑ');
  });
});

describe('production address coverage', () => {
  // Distinct "postal code + town" tails seen in the customers table (2026-10).
  const tails = [
    '10555 - ΑΘΗΝΑ', '10562 - ΑΘΗΝΑ', '11526 - ΑΘΗΝΑ', '16452', '18020 - ΠΟΡΟΣ', '21100 - ΝΑΥΠΛΙΟ', '21200 - ΑΡΓΟΣ',
    '22100 - ΤΡΙΠΟΛΗ', '23100 - ΣΠΑΡΤΗ', '24006 - ΜΕΘΩΝΗ', '24100 ΚΑΛΑΜΑΤΑ', '24300 - ΦΙΛΙΑΤΡΑ', '24500 - ΚΥΠΑΡΙΣΣΙΑ',
    '28100 - ΑΡΓΟΣΤΟΛΙ', '30006 - ΑΣΤΑΚΟΣ', '33054 - ΔΕΛΦΟΙ', '41221 - ΛΑΡΙΣΑ', '41222 - ΛΑΡΙΣΑ', '43100 - ΚΑΡΔΙΤΣΑ',
    '43100, ΚΑΡΔΙΤΣΑ', '43200 - ΠΑΛΑΜΑΣ', '45221 - ΙΩΑΝΝΙΝΑ', '48060 - ΠΑΡΓΑ', '49100 - ΚΕΡΚΥΡΑ', '50200 - ΠΤΟΛΕΜΑΙΔΑ',
    '60100 - ΚΑΤΕΡΙΝΗ', '63075 - ΙΕΡΙΣΣΟΣ', '63081 - ΝΕΟΣ ΜΑΡΜΑΡΑΣ', '63087 ΔΑΦΝΗ ΑΘΩ', '63200 - Ν ΜΟΥΔΑΝΙΑ',
    '65302 - ΚΑΒΑΛΑ', '70014 - ΛΙΜΕΝΑΣ ΧΕΡΣ', '71201 - ΗΡΑΚΛΕΙΟ', '71202 - ΗΡΑΚΛΕΙΟ', '73011 - ΧΩΡΑ ΣΦΑΚΙΩΝ',
    '73132 - ΧΑΝΙΑ', '73400 - ΚΙΣΣΑΜΟΣ', '74100 - ΡΕΘΥΜΝΟ', '74100 ΡΕΘΥΜΝΟ', '81100 - ΜΥΤΙΛΗΝΗ', '82100 - ΧΙΟΣ',
    '84300 - ΝΑΞΟΣ', '84300, ΝΑΞΟΣ', '84600 - ΜΥΚΟΝΟΣ', '84600, ΚΥΚΛΑΔΩΝ', '84600, ΜΥΚΟΝΟΣ', '84700 - ΘΗΡΑ',
    '84801, ΑΔΑΜΑΝΤΑΣ-ΜΗΛΟΣ', '85100', '85100 - ΡΟΔΟΣ', '85100 ΡΟΔΟΣ', '85100, ΡΟΔΟΣ', '85101', '85101 - ΙΑΛΥΣΟΣ',
    '85107 - ΛΙΝΔΟΣ', '85131, Δωδεκάνησα', '85200 - ΚΑΛΥΜΝΟΣ', '85300 - ΚΩΣ', '85300, ΔΩΔΕΚΑΝΗΣΩΝ', '85700 - ΚΑΡΠΑΘΟΣ',
  ];
  const regionWords = new Set(['ΚΥΚΛΑΔΩΝ', 'Δωδεκάνησα', 'ΔΩΔΕΚΑΝΗΣΩΝ']);

  it.each(tails)('%s', (tail) => {
    const loc = resolveCustomerLocation(customer(`ΟΔΟΣ 1, ${tail}`));
    expect(loc.periferiaId).not.toBeNull();
    expect(loc.unitId).not.toBeNull();
    expect(loc.coords).not.toBeNull();
    const place = splitGreekAddress(`ΟΔΟΣ 1, ${tail}`).place;
    expect(loc.precision).toBe(place && !regionWords.has(place) ? 'town' : 'area');
  });
});

describe('overseas customers and shops', () => {
  it('places overseas customers under «Εξωτερικό» by country and city', () => {
    const ny = resolveCustomerLocation(customer('New York', { country: 'US' }));
    expect(ny).toMatchObject({ countryCode: 'US', periferiaId: 'exoteriko', unitId: 'country-US', town: 'New York', precision: 'town' });
    const cy = resolveCustomerLocation(customer('Μακαρίου 12, 3030 Λεμεσός', { country: 'CY' }));
    expect(cy).toMatchObject({ unitId: 'country-CY', town: 'Λεμεσός', precision: 'town' });
    const de = resolveCustomerLocation(customer('Hauptstr. 1, 99999 Kleinstadt', { country: 'DE' }));
    expect(de).toMatchObject({ unitId: 'country-DE', precision: 'area' });
    expect(de.coords).not.toBeNull();
  });

  it('treats a missing / EL country as Greece', () => {
    expect(resolveCustomerLocation(customer('ΟΔΟΣ 1, 21100 - ΝΑΥΠΛΙΟ', { country: 'EL' })).countryCode).toBe('GR');
    expect(resolveCustomerLocation(customer('Σαντορίνη')).unitId).toBe('thira');
  });

  it('uses shops for the map/region and keeps the fiscal seat separately', () => {
    const c = customer('ΟΔΟΣ 1, 10563 - ΑΘΗΝΑ', {
      id: 'shops',
      branches: [
        { id: 'b2', label: 'Οία', street: 'Κεντρικός 2', postal_code: '84702', city: 'Οία' },
        { id: 'b1', label: 'Μύκονος', street: 'Ματογιάννη 5', postal_code: '84600', city: 'Μύκονος', is_primary: true },
      ],
    });
    const [entry] = buildCustomerDirectory([c], [], {});
    expect(entry.fiscalLocation.unitId).toBe('athina-kentro');
    expect(entry.places.map(p => p.branchId)).toEqual(['b1', 'b2']);
    expect(entry.location.unitId).toBe('mykonos');
    expect(matchesEntryRegion(entry, ['u:thira'])).toBe(true);
    expect(matchesEntryRegion(entry, ['u:athina-kentro'])).toBe(false);
    const counts = countRegions([entry]);
    expect(counts.periferia).toEqual({ kyklades: 1 });
    expect(counts.units).toEqual({ mykonos: 1, thira: 1 });
  });

  it('falls back to the fiscal seat when shops have no usable address', () => {
    const c = customer('ΟΔΟΣ 1, 49100 - ΚΕΡΚΥΡΑ', { id: 'empty-shop', branches: [{ id: 'x', label: 'Νέο' }] });
    const [entry] = buildCustomerDirectory([c], [], {});
    expect(entry.places).toHaveLength(1);
    expect(entry.location.unitId).toBe('kerkyra');
    expect(matchesEntryRegion(entry, ['p:ionia'])).toBe(true);
  });

  it('composes shop addresses like AADE', () => {
    expect(composeBranchAddress({ street: 'Ερμού 1', postal_code: '10563', city: 'Αθήνα' })).toBe('Ερμού 1, 10563 - Αθήνα');
    expect(composeBranchAddress({ street: '', postal_code: '', city: 'Ρόδος' })).toBe('Ρόδος');
  });
});
