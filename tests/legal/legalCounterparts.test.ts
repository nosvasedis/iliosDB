import { describe, expect, it } from 'vitest';
import {
  applyCustomerVatProfileToLegalDocument,
  applyLegalSystemItemToLine,
  applySupplierToLegalDocument,
  buildManualLegalDocument,
  DEFAULT_LEGAL_SETTINGS,
  resolveLegalLoadingAddress,
  supplierCounterpartCode,
  supplierLegalProfileFromCounterpart,
  validateLegalDocument,
} from '../../utils/legalDocuments';
import { validateSbzDocument } from '../../features/legal/sbz';
import { LEGAL_DEFAULT_SYSTEM_ITEMS } from '../../utils/legalSystemItems';
import type { Customer, LegalSettings, Supplier } from '../../types';

const settings: LegalSettings = {
  ...DEFAULT_LEGAL_SETTINGS,
  issuer: { ...DEFAULT_LEGAL_SETTINGS.issuer, vat_number: '094360202', address: { street: 'ΑΒΕΡΩΦ', number: '73', postal_code: '18120', city: 'ΚΟΡΥΔΑΛΛΟΣ' } },
  loading_address: { street: '', number: '', postal_code: '', city: '' },
};

const foundry: Supplier = {
  id: '6ad7ce15-5bb1-43d9-afbc-ded2be309a7e',
  name: 'Χυτήριο Δοκιμής',
  kind: 'worker',
  vat_number: '094537720',
  phone: '2100000000',
  address: 'Θηβών 10, 18233 Ρέντης',
  legal_profile: { profession: 'Χυτήριο μετάλλων', tax_office: 'ΦΑΕ Πειραιά', address: { street: 'Θηβών', number: '10', postal_code: '18233', city: 'Ρέντης' } },
};

describe('documents to partners (Προμηθευτές & Συνεργάτες)', () => {
  it('uses the issuer seat as loading address when no separate one is set', () => {
    expect(resolveLegalLoadingAddress(settings)).toEqual({ street: 'ΑΒΕΡΩΦ', number: '73', postal_code: '18120', city: 'ΚΟΡΥΔΑΛΛΟΣ' });
  });

  it('fills counterpart, SBZ code, ΔΟΥ, profession and both delivery addresses from the partner', () => {
    const draft = buildManualLegalDocument({ settings, kind: 'delivery_note' });
    const { document } = applySupplierToLegalDocument(draft, draft.lines || [], foundry, settings);
    expect(document.counterpart_customer_id).toBeNull();
    expect(document.counterpart).toMatchObject({ supplier_id: foundry.id, name: 'Χυτήριο Δοκιμής', vat_number: '094537720', tax_office: 'ΦΑΕ Πειραιά', profession: 'Χυτήριο μετάλλων' });
    expect(document.counterpart.customer_code).toBe(supplierCounterpartCode(foundry));
    expect(document.counterpart.customer_code).toMatch(/^ΣΥΝ-[0-9A-F]{6}$/);
    expect(document.delivery?.loading_address?.street).toBe('ΑΒΕΡΩΦ');
    expect(document.delivery?.delivery_address).toEqual(foundry.legal_profile!.address);
    expect(validateSbzDocument(document, document.lines || []).join(' ')).not.toContain('κωδικό ERP');
  });

  it('switching to a customer moves the destination to the customer', () => {
    const draft = buildManualLegalDocument({ settings, kind: 'delivery_note' });
    const toPartner = applySupplierToLegalDocument(draft, draft.lines || [], foundry, settings);
    const customer = { id: 'c1', full_name: 'Πελάτης', vat_number: '094404866', address: 'Ερμού 1, 10563 Αθήνα', customer_code: '0018' } as Customer;
    const { document } = applyCustomerVatProfileToLegalDocument(toPartner.document, toPartner.lines, customer, settings);
    expect(document.counterpart.supplier_id).toBeUndefined();
    expect(document.delivery?.delivery_address?.street).toContain('Ερμού');
  });

  it('keeps tax details for the partner and drops weight warnings on system codes', () => {
    const profile = supplierLegalProfileFromCounterpart({ profession: 'Χυτήριο', tax_office: 'ΦΑΕ Πειραιά', address: { street: 'Θηβών', city: 'Ρέντης' } }, null, true);
    expect(profile).toMatchObject({ profession: 'Χυτήριο', tax_office: 'ΦΑΕ Πειραιά', country: 'GR' });
    expect(profile.verified_at).toBeTruthy();
    const draft = buildManualLegalDocument({ settings, kind: 'delivery_note' });
    const line = { ...(draft.lines || [])[0], sku: 'ΑΦΟΣ', item_code: 'ΑΦΟΣ', source_metadata: { invoice_total_weight_source: 'missing' as const, invoice_total_weight_missing_items: ['Προϊόν ΑΦΟΣ: μηδενικό συνολικό βάρος'] } };
    const picked = applyLegalSystemItemToLine(line, LEGAL_DEFAULT_SYSTEM_ITEMS);
    expect(picked.source_metadata?.invoice_total_weight_source).toBeUndefined();
    expect(validateLegalDocument({ ...draft, lines: [picked] }, [picked]).some((issue) => issue.message.includes('Συνολικό Βάρος'))).toBe(false);
  });
});
