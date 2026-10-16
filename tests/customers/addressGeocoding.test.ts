import { describe, expect, it } from 'vitest';
import { buildGeocodeUrl, cleanAddressQuery, parseGeocodeResults } from '../../features/customers/addressGeocoding';

describe('address geocoding for pin placement', () => {
  it('cleans the app address format and limits the search to the customer country', () => {
    expect(cleanAddressQuery('Ματογιάννη 12, 84600 - Μύκονος')).toBe('Ματογιάννη 12, 84600 Μύκονος');
    const url = new URL(buildGeocodeUrl('Ματογιάννη 12, 84600 - Μύκονος', 'EL'));
    expect(url.hostname).toBe('nominatim.openstreetmap.org');
    expect(url.searchParams.get('q')).toBe('Ματογιάννη 12, 84600 Μύκονος');
    expect(url.searchParams.get('countrycodes')).toBe('gr');
    expect(new URL(buildGeocodeUrl('Main St 1', null)).searchParams.has('countrycodes')).toBe(false);
  });

  it('parses results into labelled positions and skips invalid ones', () => {
    const results = parseGeocodeResults([
      { place_id: 1, lat: '37.4467', lon: '25.3289', addresstype: 'house', display_name: '12, Ματογιάννη, Μύκονος',
        address: { road: 'Ματογιάννη', house_number: '12', postcode: '84600', town: 'Μύκονος', country: 'Ελλάς' } },
      { place_id: 2, lat: '37.45', lon: '25.33', addresstype: 'town', display_name: 'Μύκονος, Κυκλάδες, Ελλάς', address: { town: 'Μύκονος', country: 'Ελλάς' } },
      { place_id: 3, lat: 'x', lon: '1' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ label: 'Ματογιάννη 12', detail: '84600 · Μύκονος · Ελλάς', coords: [37.4467, 25.3289], precise: true });
    expect(results[1].precise).toBe(false);
    expect(parseGeocodeResults({})).toEqual([]);
  });
});
