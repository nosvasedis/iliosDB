import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLegalSettings: vi.fn(),
  lookupAadeVatRegistry: vi.fn(),
  lookupAfm: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ api: mocks }));

import { applyCustomerVatLookup, describeCustomerVatLookup, describeVatRegistryStatus, lookupCustomerVat, vatLookupStatus } from '../../features/customers/vatLookup';

describe('customer VAT registry lookup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the official AADE registry and selects the main activity', async () => {
    mocks.getLegalSettings.mockResolvedValue({ issuer: { vat_number: '094259216' } });
    mocks.lookupAadeVatRegistry.mockResolvedValue({
      businessName: 'ΔΟΚΙΜΗ ΑΕ', tradeName: null, active: true, normalVatRegime: true,
      taxOfficeDescription: 'ΔΟΥ ΑΘΗΝΩΝ', taxOfficeCode: '1101', phone: null, email: null,
      address: { street: 'Ερμού', number: '1', postalCode: '10563', city: 'Αθήνα' },
      activities: [
        { code: '2', description: 'Δευτερεύουσα', kindDescription: 'ΔΕΥΤΕΡΕΥΟΥΣΑ' },
        { code: '1', description: 'Χονδρικό εμπόριο κοσμημάτων', kindDescription: 'ΚΥΡΙΑ' },
      ],
    });

    const result = await lookupCustomerVat('987654324');
    expect(result).toMatchObject({
      source: 'aade_registry', name: 'Δοκιμή ΑΕ', profession: 'Χονδρικό εμπόριο κοσμημάτων', normalVatRegime: true, vatNumber: '987654324',
      taxOffice: 'ΔΟΥ Αθηνών', address: 'Ερμού 1, 10563 - Αθήνα', active: true, status: { kind: 'active', blocking: false },
    });
    expect(mocks.lookupAfm).not.toHaveBeenCalled();
  });

  it('formats raw registry text and strips «ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ» from the name into the status', async () => {
    mocks.getLegalSettings.mockResolvedValue({ issuer: { vat_number: '094259216' } });
    mocks.lookupAadeVatRegistry.mockResolvedValue({
      businessName: 'ΚΟΣΜΗΜΑΤΑ   ΗΛΙΟΣ  Ο.Ε.  ΥΠΟ ΕΚΚΑΘΑΡΙΣΗ', tradeName: null, active: true, normalVatRegime: true,
      activeDescription: 'ΕΝΕΡΓΟΣ ΑΦΜ', businessStatus: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ',
      taxOfficeDescription: "Α  'ΑΘΗΝΩΝ", taxOfficeCode: '1101', phone: null, email: null,
      address: { street: 'ΕΡΜΟΥ ', number: '12', postalCode: '10563', city: 'ΑΘΗΝΑ' },
      activities: [{ code: '1', description: 'ΧΟΝΔΡΙΚΟ  ΕΜΠΟΡΙΟ ΚΟΣΜΗΜΑΤΩΝ', kindDescription: 'ΚΥΡΙΑ' }],
    });

    const result = await lookupCustomerVat('987654324');
    expect(result).toMatchObject({
      name: 'Κοσμήματα Ήλιος ΟΕ', address: 'Ερμού 12, 10563 - Αθήνα', taxOffice: "Α' Αθηνών",
      profession: 'Χονδρικό εμπόριο κοσμημάτων', active: true,
      status: { kind: 'liquidation', label: 'ΑΦΜ υπό εκκαθάριση', blocking: true },
    });
    expect(describeCustomerVatLookup(result)).toContain('ΠΡΟΣΟΧΗ: ΑΦΜ υπό εκκαθάριση');
    expect(describeVatRegistryStatus(result.status!)).toContain('εκκαθάριση');
  });

  it('reports cessation with the stop date and a deactivated AFM as inactive', async () => {
    mocks.getLegalSettings.mockResolvedValue({ issuer: { vat_number: '094259216' } });
    mocks.lookupAadeVatRegistry.mockResolvedValueOnce({
      businessName: 'ΗΛΙΟΣ ΑΕ', active: true, normalVatRegime: null, businessStatus: 'ΠΡΩΗΝ ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ',
      stopDate: '2024-03-12', address: {}, activities: [],
    }).mockResolvedValueOnce({
      businessName: 'ΗΛΙΟΣ ΑΕ', active: null, activeDescription: 'ΑΝΕΝΕΡΓΟΣ ΑΦΜ', normalVatRegime: null, address: {}, activities: [],
    });

    const closed = await lookupCustomerVat('987654324');
    expect(closed.status).toMatchObject({ kind: 'closed', stopDate: '12/03/2024', blocking: true });
    expect(describeVatRegistryStatus(closed.status!)).toContain('Διακοπή από 12/03/2024');
    const inactive = await lookupCustomerVat('987654324');
    expect(inactive).toMatchObject({ active: false, status: { kind: 'inactive' } });
  });

  it('detects status words in VIES names too', async () => {
    mocks.getLegalSettings.mockRejectedValue(new Error('Μη ρυθμισμένη υπηρεσία'));
    mocks.lookupAfm.mockResolvedValue({ source: 'vies', name: 'ΗΛΙΟΣ Α.Ε. (ΣΕ ΠΤΩΧΕΥΣΗ)', address: 'ΕΡΜΟΥ 12\n10563 ΑΘΗΝΑ', phone: null, email: null });
    const result = await lookupCustomerVat('987654324');
    expect(result).toMatchObject({ name: 'Ήλιος ΑΕ', address: 'Ερμού 12, 10563 - Αθήνα', status: { kind: 'bankruptcy', blocking: true } });
  });

  it('derives a status for results without one', () => {
    expect(vatLookupStatus({ active: false }).kind).toBe('inactive');
    expect(vatLookupStatus({ active: null }).kind).toBe('unknown');
  });

  it('labels the public lookup as fallback and never invents profession or tax office', async () => {
    mocks.getLegalSettings.mockRejectedValue(new Error('Μη ρυθμισμένη υπηρεσία'));
    mocks.lookupAfm.mockResolvedValue({ source: 'vies', name: 'ΔΟΚΙΜΗ ΟΕ', address: 'Αθήνα', phone: null, email: null });

    const result = await lookupCustomerVat('987654324');
    expect(result).toMatchObject({ source: 'vies', name: 'Δοκιμή ΟΕ', profession: null, taxOffice: null, normalVatRegime: null, fallbackReason: 'Μη ρυθμισμένη υπηρεσία', status: { kind: 'unknown' } });
    expect(describeCustomerVatLookup(result)).toContain('δεν επιβεβαιώθηκαν από την ΑΑΔΕ');
  });

  it('applies fiscal data without overwriting customer-entered contact details', () => {
    const applied = applyCustomerVatLookup(
      { full_name: '', phone: '2100000000', email: 'manual@example.com' },
      { source: 'aade_registry', name: 'ΔΟΚΙΜΗ ΑΕ', address: 'Αθήνα', phone: '2111111111', email: 'registry@example.com', profession: 'Εμπόριο', taxOffice: 'Αθηνών', active: true },
    );
    expect(applied).toMatchObject({ full_name: 'ΔΟΚΙΜΗ ΑΕ', phone: '2100000000', email: 'manual@example.com', profession: 'Εμπόριο', tax_office: 'Αθηνών' });
  });

  it('rejects a late result for a different AFM', () => {
    const customer = { full_name: 'New', vat_number: '094259216', vat_rate: 0.17 };
    expect(applyCustomerVatLookup(customer, {
      vatNumber: '987654324', source: 'aade_registry', name: 'Old', address: 'Αθήνα',
      phone: null, email: null, profession: null, taxOffice: null, active: true,
    })).toBe(customer);
  });

  it.each([true, false, null])('never converts registry regime %s into an unsupported sales rate', normalVatRegime => {
    const customer = { full_name: '', vat_rate: 0.17 };
    expect(applyCustomerVatLookup(customer, {
      source: 'aade_registry', name: 'Δοκιμή', address: 'Αθήνα', normalVatRegime,
      phone: null, email: null, profession: null, taxOffice: null, active: true,
    }).vat_rate).toBe(0.17);
  });
});
