import type { Customer } from '../../types';
import { isDomesticCountry, placeKey, resolvePlaceLocation, splitGreekAddress } from './customerLocation';
import { MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY, MOUNT_ATHOS_VAT_EXEMPTION_NOTE } from '../../utils/legalDocuments';

export const REDUCED_VAT_SOURCE = 'https://www.aade.gr/sites/default/files/2026-01/e2113_2025.pdf';

// E.2113/2025, effective 1 January 2026. Do not use an entire administrative
// region: Rhodes, Thasos and the Cyclades do not qualify.
const REDUCED_UNITS = new Set([
  'lesvos', 'chios', 'samos', 'limnos', 'ikaria', 'kos', 'kalymnos', 'leros',
  'patmos', 'karpathos', 'kasos', 'symi', 'astypalaia', 'nisyros-tilos',
]);
const SMALL_ISLANDS = [
  'Αγαθονήσι', 'Άγιος Ευστράτιος', 'Λειψοί', 'Μεγίστη', 'Καστελλόριζο',
  'Νίσυρος', 'Οινούσσες', 'Σαμοθράκη', 'Τήλος', 'Φούρνοι', 'Χάλκη', 'Ψαρά',
];

export interface GeographicVatSuggestion {
  rate: 0 | 0.17;
  area: string;
}

/** Suggestions only: the destination and supporting documents still need review. */
export function suggestGeographicVat(customer: Pick<Customer, 'address' | 'country'>): GeographicVatSuggestion | null {
  if (!isDomesticCountry(customer.country)) return null;
  const location = resolvePlaceLocation({ id: 'vat-profile', address: customer.address, country: customer.country });
  if (location.countryCode !== 'GR') return null;
  const { postalCode, place } = splitGreekAddress(customer.address);
  const key = placeKey(place || '');
  // 63087 is Ammouliani, not Mount Athos. Never use the map's broad area match
  // or ambiguous village names (e.g. Karyes/Dafni) as exemption evidence.
  if (postalCode === '63086' || /(^| )(αγιον? οροσ|αγιου ορουσ|mount athos|agio[n]? oros)( |$)/.test(key)) {
    return { rate: 0, area: 'Άγιον Όρος' };
  }
  const smallIsland = SMALL_ISLANDS.find(name => key === placeKey(name));
  if (smallIsland || postalCode === '68002') return { rate: 0.17, area: smallIsland || 'Σαμοθράκη' };
  // A postal code or a complete town name is needed; fuzzy text used for map
  // placement can confuse street names with islands.
  if (location.unitId && REDUCED_UNITS.has(location.unitId)
      && (postalCode || key === placeKey(location.town || ''))) {
    return { rate: 0.17, area: location.unitLabel || location.town || 'Νησιωτική περιοχή' };
  }
  return null;
}

export function applyGeographicVat(customer: Customer, suggestion: GeographicVatSuggestion): Customer {
  return {
    ...customer,
    vat_rate: suggestion.rate,
    vat_exemption_category: suggestion.rate === 0 ? MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY : null,
    vat_exemption_legal_note: suggestion.rate === 0 ? MOUNT_ATHOS_VAT_EXEMPTION_NOTE : null,
  };
}
