/**
 * Address → map position for placing a shop pin (Μετακίνηση στον χάρτη).
 * Uses OpenStreetMap Nominatim (same data as the map tiles); only the typed address is sent.
 * Results are cached per query for the session to respect Nominatim's usage policy.
 */
import type { LatLng } from './greekRegions';
import { normalizeCountry } from './customerLocation';

export interface GeocodeResult {
  id: string;
  label: string;
  /** Second line (area / country). */
  detail: string;
  coords: LatLng;
  /** Street-level hit (house number / road) vs. town/area. */
  precise: boolean;
}

interface NominatimItem {
  place_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  addresstype?: string;
  type?: string;
  name?: string;
  address?: Record<string, string>;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const PRECISE_TYPES = new Set(['house', 'building', 'road', 'street', 'residential', 'shop', 'amenity', 'tourism', 'commercial', 'retail', 'place']);

/** «Οδός 12, 84600 - Μύκονος» → «Οδός 12, 84600 Μύκονος» (the dash confuses the geocoder). */
export function cleanAddressQuery(query: string): string {
  return query
    .replace(/\s+[-–—]\s+/g, ' ')
    .replace(/\bΤ\.?\s?Κ\.?\s*/giu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildGeocodeUrl(query: string, country?: string | null, limit = 6): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: cleanAddressQuery(query),
    limit: String(limit),
    addressdetails: '1',
    'accept-language': 'el,en',
  });
  const code = country ? normalizeCountry(country) : null;
  if (code) params.set('countrycodes', code.toLowerCase());
  return `${ENDPOINT}?${params.toString()}`;
}

export function parseGeocodeResults(items: unknown): GeocodeResult[] {
  if (!Array.isArray(items)) return [];
  return (items as NominatimItem[]).flatMap((item, index) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const parts = (item.display_name ?? '').split(',').map(p => p.trim()).filter(Boolean);
    const a = item.address ?? {};
    const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(' ');
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.suburb ?? a.municipality;
    const label = [item.name && item.name !== street ? item.name : null, street || null].filter(Boolean).join(', ') || parts.slice(0, 2).join(', ') || 'Θέση';
    const detail = [a.postcode, town, a.country].filter(Boolean).join(' · ') || parts.slice(2, 5).join(', ');
    return [{
      id: String(item.place_id ?? `${lat},${lng},${index}`),
      label,
      detail,
      coords: [lat, lng] as const,
      precise: Boolean(a.house_number) || PRECISE_TYPES.has(item.addresstype ?? '') || PRECISE_TYPES.has(item.type ?? ''),
    }];
  });
}

const cache = new Map<string, GeocodeResult[]>();

export async function geocodeAddress(query: string, country?: string | null, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const url = buildGeocodeUrl(query, country);
  const hit = cache.get(url);
  if (hit) return hit;
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Η αναζήτηση διεύθυνσης απέτυχε (${response.status}).`);
  const results = parseGeocodeResults(await response.json());
  // A foreign country filter that finds nothing is retried worldwide once.
  if (results.length === 0 && country && normalizeCountry(country) !== 'GR') {
    const anywhere = await geocodeAddress(query, null, signal);
    cache.set(url, anywhere);
    return anywhere;
  }
  cache.set(url, results);
  return results;
}
