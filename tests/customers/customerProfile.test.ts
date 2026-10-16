import { describe, expect, it } from 'vitest';
import {
  cleanCustomerProfile,
  internationalPhoneDigits,
  isExclusivityActive,
  isOpenInMonth,
  normalizeSocialUrl,
  readCustomerProfile,
  seasonLabel,
  socialDisplayHandle,
} from '../../features/customers/customerProfile';

describe('social links', () => {
  it('turns handles and bare domains into openable https links', () => {
    expect(normalizeSocialUrl('instagram', '@kosmimata.ilios')).toBe('https://www.instagram.com/kosmimata.ilios/');
    expect(normalizeSocialUrl('instagram', 'instagram.com/ilios')).toBe('https://instagram.com/ilios');
    expect(normalizeSocialUrl('tiktok', 'ilios')).toBe('https://www.tiktok.com/@ilios');
    expect(normalizeSocialUrl('facebook', 'https://www.facebook.com/ilios.jewels')).toBe('https://www.facebook.com/ilios.jewels');
    expect(normalizeSocialUrl('website', 'ilios.gr')).toBe('https://ilios.gr/');
    expect(normalizeSocialUrl('google_maps', 'Ilios Μύκονος')).toContain('google.com/maps/search');
  });

  it('rejects non-web schemes and empty input', () => {
    expect(normalizeSocialUrl('website', 'javascript:alert(1)')).toBeNull();
    expect(normalizeSocialUrl('instagram', '   ')).toBeNull();
    expect(normalizeSocialUrl('website', 'not a site')).toBeNull();
  });

  it('shows short handles for saved links', () => {
    expect(socialDisplayHandle('instagram', 'https://www.instagram.com/kosmimata.ilios/')).toBe('@kosmimata.ilios');
    expect(socialDisplayHandle('website', 'https://ilios.gr/')).toBe('ilios.gr');
  });

  it('builds international numbers for Viber / WhatsApp', () => {
    expect(internationalPhoneDigits('691 234 5678', 'GR')).toBe('306912345678');
    expect(internationalPhoneDigits('+357 99 699023', 'CY')).toBe('35799699023');
    expect(internationalPhoneDigits('0044 7700 900123', 'GB')).toBe('447700900123');
    expect(internationalPhoneDigits('', 'GR')).toBeNull();
  });
});

describe('profile reading and cleaning', () => {
  it('drops empty values and half-filled rows before saving', () => {
    const cleaned = cleanCustomerProfile({
      socials: { instagram: '@shop', facebook: '  ' },
      contacts: [{ id: '1', name: 'Μαρία', role: 'Ιδιοκτήτρια', phone: '', email: null }, { id: '2', name: '' }],
      tags: ['Λιμάνι', 'λιμάνι', ' '],
      season: { mode: 'seasonal' },
      credit_days: 60,
      exclusivity: { enabled: false, radius_km: 2, scopes: [] },
    });
    expect(cleaned).toEqual({
      socials: { instagram: 'https://www.instagram.com/shop/' },
      contacts: [{ id: '1', name: 'Μαρία', role: 'Ιδιοκτήτρια' }],
      tags: ['Λιμάνι'],
      season: { mode: 'seasonal', open_month: 4, close_month: 10 },
      credit_days: 60,
    });
  });

  it('tolerates malformed stored JSON', () => {
    expect(readCustomerProfile({ profile: 'oops' as never })).toEqual({});
    const read = readCustomerProfile({ profile: { exclusivity: { enabled: true, radius_km: 'x', scopes: [{ kind: 'bad', key: '1' }, { kind: 'sku', key: 'RN1' }] } } as never });
    expect(read.exclusivity).toMatchObject({ enabled: true, radius_km: 2, scopes: [{ kind: 'sku', key: 'RN1' }] });
  });

  it('handles seasons that wrap the new year and exclusivity end dates', () => {
    expect(seasonLabel({ mode: 'seasonal', open_month: 11, close_month: 2 })).toBe('Νοε – Φεβ');
    expect(isOpenInMonth({ mode: 'seasonal', open_month: 11, close_month: 2 }, 1)).toBe(true);
    expect(isOpenInMonth({ mode: 'seasonal', open_month: 4, close_month: 10 }, 12)).toBe(false);
    const now = new Date('2026-10-16T12:00:00').getTime();
    expect(isExclusivityActive({ enabled: true, radius_km: 1, scopes: [], until: '2026-10-15' }, now)).toBe(false);
    expect(isExclusivityActive({ enabled: true, radius_km: 1, scopes: [], until: '2026-10-16' }, now)).toBe(true);
  });
});
