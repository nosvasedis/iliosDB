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

describe('movement documents carry party names and addresses (myDATA 204)', () => {
  it('sends issuer and counterpart name/address on Τιμολόγιο-ΔΑ and 9.3, not on a plain invoice', async () => {
    const { buildAadeInvoiceXml } = await import('../../utils/legalDocuments');
    const { sbzRejectionMessage } = await import('../../features/legal/sbz');
    const issuerSettings = { ...settings, issuer: { ...settings.issuer, business_name: 'ΑΝΤΩΝΙΑ ΤΣΟΤΟΓΛΟΥ ΕΕ' } };
    const base = buildManualLegalDocument({ settings: issuerSettings, kind: 'invoice_delivery' });
    const withPartner = applySupplierToLegalDocument(base, base.lines || [], foundry, issuerSettings).document;
    const delivery = buildAadeInvoiceXml(withPartner, withPartner.lines);
    expect(delivery).toContain('<issuer><vatNumber>094360202</vatNumber><country>GR</country><branch>0</branch><name>ΑΝΤΩΝΙΑ ΤΣΟΤΟΓΛΟΥ ΕΕ</name><address><street>ΑΒΕΡΩΦ</street>');
    expect(delivery).toContain('<name>Χυτήριο Δοκιμής</name><address><street>Θηβών</street>');
    const plain = buildAadeInvoiceXml({ ...withPartner, document_kind: 'invoice' }, withPartner.lines);
    expect(plain).not.toContain('<name>');
    expect(plain).not.toContain('<address>');
    expect(sbzRejectionMessage({ statusCode: 'ValidationError', errors: [{ code: '204', message: 'Counterpart Name is mandatory' }] })).toContain('Counterpart Name is mandatory');
  });
});
