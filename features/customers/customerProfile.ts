import type {
  Customer,
  CustomerContact,
  CustomerExclusivity,
  CustomerExclusivityScope,
  CustomerProfile,
  CustomerSocialKey,
} from '../../types';
import { normalizeCountry } from './customerLocation';

// ---------------------------------------------------------------------------
// Social media
// ---------------------------------------------------------------------------

export interface SocialNetworkMeta {
  key: CustomerSocialKey;
  label: string;
  placeholder: string;
  /** Brand colour for chips/icons. */
  color: string;
  /** Builds a profile URL from a bare handle. */
  fromHandle: (handle: string) => string;
  /** Hostnames recognised as this network (for display handles). */
  hosts: string[];
  /** Show the handle with an @. */
  at?: boolean;
}

const cleanHandle = (value: string) => value.trim().replace(/^@+/, '').replace(/\/+$/, '');

export const SOCIAL_NETWORKS: SocialNetworkMeta[] = [
  { key: 'instagram', label: 'Instagram', placeholder: '@kosmimata.ilios ή σύνδεσμος', color: '#E1306C', hosts: ['instagram.com', 'instagr.am'], at: true,
    fromHandle: h => `https://www.instagram.com/${encodeURIComponent(cleanHandle(h))}/` },
  { key: 'facebook', label: 'Facebook', placeholder: 'όνομα σελίδας ή σύνδεσμος', color: '#1877F2', hosts: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com'],
    fromHandle: h => `https://www.facebook.com/${encodeURIComponent(cleanHandle(h))}` },
  { key: 'tiktok', label: 'TikTok', placeholder: '@όνομα ή σύνδεσμος', color: '#111827', hosts: ['tiktok.com'], at: true,
    fromHandle: h => `https://www.tiktok.com/@${encodeURIComponent(cleanHandle(h))}` },
  { key: 'website', label: 'Ιστοσελίδα', placeholder: 'www.example.gr', color: '#0284C7', hosts: [],
    fromHandle: h => `https://${cleanHandle(h)}` },
  { key: 'eshop', label: 'E-shop', placeholder: 'shop.example.gr', color: '#059669', hosts: [],
    fromHandle: h => `https://${cleanHandle(h)}` },
  { key: 'google_maps', label: 'Google Maps', placeholder: 'σύνδεσμος ή όνομα καταστήματος', color: '#EA4335', hosts: ['google.com', 'maps.google.com', 'goo.gl', 'maps.app.goo.gl', 'g.page'],
    fromHandle: h => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.trim())}` },
  { key: 'pinterest', label: 'Pinterest', placeholder: 'όνομα ή σύνδεσμος', color: '#E60023', hosts: ['pinterest.com', 'pin.it'],
    fromHandle: h => `https://www.pinterest.com/${encodeURIComponent(cleanHandle(h))}/` },
  { key: 'youtube', label: 'YouTube', placeholder: '@κανάλι ή σύνδεσμος', color: '#FF0000', hosts: ['youtube.com', 'youtu.be'], at: true,
    fromHandle: h => `https://www.youtube.com/@${encodeURIComponent(cleanHandle(h))}` },
];

export const SOCIAL_BY_KEY = Object.fromEntries(SOCIAL_NETWORKS.map(n => [n.key, n])) as Record<CustomerSocialKey, SocialNetworkMeta>;

const hasScheme = (value: string) => /^[a-z][a-z0-9+.-]*:/i.test(value);

/**
 * Turns whatever was typed (handle, «@name», bare domain or full link) into a safe https URL.
 * Returns null for empty input or non-web schemes (javascript:, data: …).
 */
export function normalizeSocialUrl(key: CustomerSocialKey, input?: string | null): string | null {
  const value = (input ?? '').trim();
  if (!value) return null;
  const meta = SOCIAL_BY_KEY[key];
  const lower = value.toLowerCase();
  const isSite = key === 'website' || key === 'eshop';
  // Handles may contain dots («kosmimata.ilios»), so only a scheme, the network's own
  // domain or a domain followed by a path counts as a link.
  const asUrl = isSite
    || hasScheme(value)
    || meta.hosts.some(host => lower.includes(host))
    || /^[\w-]+(\.[\w-]+)+\//.test(value);
  if (!asUrl) return meta.fromHandle(value);
  if (isSite && !hasScheme(value) && !/\.[\p{L}\w-]{2,}/u.test(value)) return null;
  if (hasScheme(value) && !/^https?:\/\//i.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Short label for a saved link: «@ilios», «example.gr», «facebook.com/ilios». */
export function socialDisplayHandle(key: CustomerSocialKey, url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const meta = SOCIAL_BY_KEY[key];
    const path = decodeURIComponent(parsed.pathname).replace(/^\/+|\/+$/g, '');
    if (key === 'google_maps') {
      const query = parsed.searchParams.get('query') || parsed.searchParams.get('q');
      return query || 'Χάρτης';
    }
    if (meta.hosts.some(h => host === h || host.endsWith(`.${h}`)) && path) {
      const first = path.split('/')[0];
      if (first === 'profile.php') return parsed.searchParams.get('id') ? `id ${parsed.searchParams.get('id')}` : host;
      const handle = first.replace(/^@/, '');
      return meta.at ? `@${handle}` : handle;
    }
    return path ? `${host}/${path}` : host;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/** International digits for chat deep links (Greek 10-digit numbers get the 30 prefix). */
export function internationalPhoneDigits(phone?: string | null, country?: string | null): string | null {
  const first = (phone ?? '').split(/[,;/\n]/)[0] ?? '';
  let digits = first.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (normalizeCountry(country) === 'GR' && /^(69\d{8}|2\d{9})$/.test(digits)) digits = `30${digits}`;
  digits = digits.replace(/\D/g, '');
  return digits.length >= 8 ? digits : null;
}

export const viberLink = (digits: string) => `viber://chat?number=%2B${digits}`;
export const whatsappLink = (digits: string) => `https://wa.me/${digits}`;

// ---------------------------------------------------------------------------
// Shop profile vocabulary
// ---------------------------------------------------------------------------

export const SHOP_TYPES = [
  'Κοσμηματοπωλείο',
  'Concept store',
  'Τουριστικό κατάστημα',
  'Κατάστημα δώρων',
  'Boutique ένδυσης',
  'Μουσειοπωλείο',
  'Κατάστημα ξενοδοχείου',
  'Ηλεκτρονικό κατάστημα',
  'Μεταπωλητής / χονδρέμπορος',
] as const;

export const POSITIONING_META: Record<NonNullable<CustomerProfile['positioning']>, { label: string; hint: string }> = {
  economy: { label: 'Οικονομικό', hint: 'Χαμηλές τιμές, μεγάλος όγκος' },
  mid: { label: 'Μεσαίο', hint: 'Ισορροπία τιμής και ποιότητας' },
  premium: { label: 'Premium', hint: 'Υψηλές τιμές, επιλεγμένα κομμάτια' },
};

export const CLIENTELE_META: Record<NonNullable<CustomerProfile['clientele']>, { label: string }> = {
  tourists: { label: 'Κυρίως τουρίστες' },
  locals: { label: 'Κυρίως ντόπιοι' },
  mixed: { label: 'Μικτό κοινό' },
};

export const PAYMENT_METHODS = ['Μετρητά', 'Τραπεζική κατάθεση', 'Επιταγή', 'Κάρτα', 'Αντικαταβολή'] as const;

export const CONTACT_ROLES = ['Ιδιοκτήτης', 'Υπεύθυνος αγορών', 'Υπεύθυνος καταστήματος', 'Πωλητής', 'Λογιστήριο'] as const;

export const MONTH_LABELS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const MONTH_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μάι', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

// ---------------------------------------------------------------------------
// Reading / cleaning
// ---------------------------------------------------------------------------

const str = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const num = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

const month = (value: unknown) => {
  const n = num(value, 1, 12);
  return n === null ? null : Math.round(n);
};

const SCOPE_KINDS = new Set<CustomerExclusivityScope['kind']>(['collection', 'jewelry_kind', 'sku']);

function readExclusivity(raw: unknown): CustomerExclusivity | null {
  if (!raw || typeof raw !== 'object') return null;
  const ex = raw as Record<string, unknown>;
  const scopes = Array.isArray(ex.scopes)
    ? (ex.scopes as unknown[]).flatMap(item => {
      const s = item as Record<string, unknown> | null;
      const kind = s?.kind as CustomerExclusivityScope['kind'];
      const key = str(s?.key);
      return s && SCOPE_KINDS.has(kind) && key ? [{ kind, key }] : [];
    })
    : [];
  return {
    enabled: Boolean(ex.enabled),
    radius_km: num(ex.radius_km, 0.1, 100) ?? 2,
    scopes: scopes.filter((s, i) => scopes.findIndex(o => o.kind === s.kind && o.key === s.key) === i),
    until: str(ex.until),
    notes: str(ex.notes),
  };
}

/** Tolerant reader: whatever is stored, the UI gets a well-formed profile. */
export function readCustomerProfile(customer: Pick<Customer, 'profile'> | null | undefined): CustomerProfile {
  const raw = customer?.profile;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const p = raw as Record<string, unknown>;
  const socials: CustomerProfile['socials'] = {};
  if (p.socials && typeof p.socials === 'object') {
    for (const network of SOCIAL_NETWORKS) {
      const url = normalizeSocialUrl(network.key, str((p.socials as Record<string, unknown>)[network.key]));
      if (url) socials[network.key] = url;
    }
  }
  const contacts: CustomerContact[] = Array.isArray(p.contacts)
    ? (p.contacts as unknown[]).flatMap((item, index) => {
      const c = item as Record<string, unknown> | null;
      if (!c || typeof c !== 'object') return [];
      const contact: CustomerContact = {
        id: str(c.id) ?? `contact-${index}`,
        name: str(c.name) ?? '',
        role: str(c.role),
        phone: str(c.phone),
        email: str(c.email),
        notes: str(c.notes),
      };
      return contact.name || contact.phone || contact.email ? [contact] : [];
    })
    : [];
  const season = p.season && typeof p.season === 'object' ? p.season as Record<string, unknown> : null;
  const tags = Array.isArray(p.tags) ? (p.tags as unknown[]).map(str).filter((t): t is string => Boolean(t)) : [];
  return {
    socials,
    viber: str(p.viber),
    whatsapp: str(p.whatsapp),
    contacts,
    shop_type: str(p.shop_type),
    positioning: (['economy', 'mid', 'premium'] as const).find(v => v === p.positioning) ?? null,
    clientele: (['tourists', 'locals', 'mixed'] as const).find(v => v === p.clientele) ?? null,
    season: season && (season.mode === 'seasonal' || season.mode === 'year_round')
      ? { mode: season.mode, open_month: month(season.open_month), close_month: month(season.close_month) }
      : null,
    opening_hours: str(p.opening_hours),
    payment_method: str(p.payment_method),
    credit_days: num(p.credit_days, 0, 365),
    credit_limit: num(p.credit_limit, 0, 10_000_000),
    tags: tags.filter((t, i) => tags.findIndex(o => o.toLocaleLowerCase('el-GR') === t.toLocaleLowerCase('el-GR')) === i),
    exclusivity: readExclusivity(p.exclusivity),
  };
}

/** What gets saved: no empty strings, no half-filled rows, null-free JSON. */
export function cleanCustomerProfile(profile: CustomerProfile): CustomerProfile {
  const read = readCustomerProfile({ profile });
  const out: CustomerProfile = {};
  if (read.socials && Object.keys(read.socials).length) out.socials = read.socials;
  if (read.viber) out.viber = read.viber;
  if (read.whatsapp) out.whatsapp = read.whatsapp;
  if (read.contacts?.length) {
    out.contacts = read.contacts.map(c => Object.fromEntries(Object.entries(c).filter(([, v]) => v !== null && v !== '')) as unknown as CustomerContact);
  }
  if (read.shop_type) out.shop_type = read.shop_type;
  if (read.positioning) out.positioning = read.positioning;
  if (read.clientele) out.clientele = read.clientele;
  if (read.season) {
    out.season = read.season.mode === 'seasonal'
      ? { mode: 'seasonal', open_month: read.season.open_month ?? 4, close_month: read.season.close_month ?? 10 }
      : { mode: 'year_round' };
  }
  if (read.opening_hours) out.opening_hours = read.opening_hours;
  if (read.payment_method) out.payment_method = read.payment_method;
  if (read.credit_days !== null && read.credit_days !== undefined) out.credit_days = Math.round(read.credit_days);
  if (read.credit_limit !== null && read.credit_limit !== undefined) out.credit_limit = Math.round(read.credit_limit * 100) / 100;
  if (read.tags?.length) out.tags = read.tags;
  if (read.exclusivity && (read.exclusivity.enabled || read.exclusivity.scopes.length || read.exclusivity.notes)) {
    const ex = read.exclusivity;
    out.exclusivity = { enabled: ex.enabled, radius_km: ex.radius_km, scopes: ex.scopes, ...(ex.until ? { until: ex.until } : {}), ...(ex.notes ? { notes: ex.notes } : {}) };
  }
  return out;
}

export function hasProfileContent(profile: CustomerProfile): boolean {
  return Object.keys(cleanCustomerProfile(profile)).length > 0;
}

export function savedSocials(profile: CustomerProfile): Array<{ meta: SocialNetworkMeta; url: string }> {
  return SOCIAL_NETWORKS.flatMap(meta => {
    const url = profile.socials?.[meta.key];
    return url ? [{ meta, url }] : [];
  });
}

/** «Απρ – Οκτ» / «Όλο τον χρόνο». */
export function seasonLabel(season: CustomerProfile['season']): string | null {
  if (!season) return null;
  if (season.mode === 'year_round') return 'Όλο τον χρόνο';
  const open = season.open_month ?? 4;
  const close = season.close_month ?? 10;
  return `${MONTH_SHORT[open - 1]} – ${MONTH_SHORT[close - 1]}`;
}

/** Whether a seasonal shop is open in the given month (1-12); wraps over the new year. */
export function isOpenInMonth(season: CustomerProfile['season'], monthNumber: number): boolean {
  if (!season || season.mode !== 'seasonal') return true;
  const open = season.open_month ?? 4;
  const close = season.close_month ?? 10;
  return open <= close ? monthNumber >= open && monthNumber <= close : monthNumber >= open || monthNumber <= close;
}

export function isExclusivityActive(ex: CustomerExclusivity | null | undefined, now = Date.now()): ex is CustomerExclusivity {
  if (!ex?.enabled) return false;
  if (!ex.until) return true;
  const end = new Date(`${ex.until.slice(0, 10)}T23:59:59`).getTime();
  return !Number.isFinite(end) || end >= now;
}

/** Tags used across all customers, most frequent first (for suggestions). */
export function collectCustomerTags(customers: Customer[] | undefined): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const customer of customers ?? []) {
    for (const tag of readCustomerProfile(customer).tags ?? []) {
      const key = tag.toLocaleLowerCase('el-GR');
      const row = counts.get(key) ?? { label: tag, count: 0 };
      row.count += 1;
      counts.set(key, row);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'el')).map(r => r.label);
}

export function newContactId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
