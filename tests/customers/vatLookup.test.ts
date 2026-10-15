import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getLegalSettings: vi.fn(),
  lookupAadeVatRegistry: vi.fn(),
  lookupAfm: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({ api: mocks }));

import { applyCustomerVatLookup, describeCustomerVatLookup, lookupCustomerVat } from '../../features/customers/vatLookup';

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
      source: 'aade_registry', name: 'ΔΟΚΙΜΗ ΑΕ', profession: 'Χονδρικό εμπόριο κοσμημάτων', normalVatRegime: true, vatNumber: '987654324',
      taxOffice: 'ΔΟΥ ΑΘΗΝΩΝ', address: 'Ερμού 1, 10563 Αθήνα', active: true,
    });
    expect(mocks.lookupAfm).not.toHaveBeenCalled();
  });

  it('labels the public lookup as fallback and never invents profession or tax office', async () => {
    mocks.getLegalSettings.mockRejectedValue(new Error('Μη ρυθμισμένη υπηρεσία'));
    mocks.lookupAfm.mockResolvedValue({ source: 'vies', name: 'ΔΟΚΙΜΗ ΟΕ', address: 'Αθήνα', phone: null, email: null });

    const result = await lookupCustomerVat('987654324');
    expect(result).toMatchObject({ source: 'vies', profession: null, taxOffice: null, normalVatRegime: null, fallbackReason: 'Μη ρυθμισμένη υπηρεσία' });
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
