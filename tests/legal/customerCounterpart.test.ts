import { describe, expect, it } from 'vitest';
import type { Customer } from '../../types';
import {
  buildCounterpartFromCustomer,
  buildDefaultDeliveryDetails,
  DEFAULT_LEGAL_SETTINGS,
  normalizeCounterpartVatNumber,
  resolveCustomerDeliveryAddress,
} from '../../utils/legalDocuments';

const base: Customer = {
  id: 'c1',
  full_name: 'Πελάτης',
  vat_number: '094259216',
  address: 'ΕΡΜΟΥ 1, 10563 - ΑΘΗΝΑ',
  created_at: '2026-01-01T00:00:00Z',
};

describe('customer counterpart on legal documents', () => {
  it('never copies a stale retail bucket tax identity into a document', () => {
    const party = buildCounterpartFromCustomer({ ...base, id: '00000000-0000-0000-0000-000000000003', full_name: 'Λιανική', customer_code: '0000', vat_number: '124471700' });
    expect(party).toMatchObject({ vat_number: '', name: '', customer_code: null, address: null });
  });
  it('keeps Greek customers as GR with a 9-digit ΑΦΜ and the fiscal seat address', () => {
    const party = buildCounterpartFromCustomer(base);
    expect(party.country).toBe('GR');
    expect(party.vat_number).toBe('094259216');
    expect(party.address).toMatchObject({ street: 'ΕΡΜΟΥ', number: '1', postal_code: '10563', city: 'ΑΘΗΝΑ' });
  });

  it('uses the overseas country and keeps the foreign VAT id', () => {
    const party = buildCounterpartFromCustomer({ ...base, country: 'DE', vat_number: 'de 123 456 789' });
    expect(party.country).toBe('DE');
    expect(party.vat_number).toBe('123456789');
    expect(normalizeCounterpartVatNumber('ATU12345678', 'AT')).toBe('U12345678');
    expect(normalizeCounterpartVatNumber('EL094259216', 'GR')).toBe('094259216');
  });

  it('delivers to the main shop, falling back to the fiscal seat', () => {
    expect(resolveCustomerDeliveryAddress(base)).toMatchObject({ postal_code: '10563', city: 'ΑΘΗΝΑ' });
    const withShops: Customer = {
      ...base,
      branches: [
        { id: 'a', label: 'Οία', street: 'Κεντρικός 2', postal_code: '84702', city: 'Οία' },
        { id: 'b', label: 'Μύκονος', street: 'Ματογιάννη 5', postal_code: '84600', city: 'Μύκονος', is_primary: true },
      ],
    };
    expect(resolveCustomerDeliveryAddress(withShops)).toMatchObject({ street: 'Ματογιάννη', number: '5', postal_code: '84600', city: 'Μύκονος' });
    expect(resolveCustomerDeliveryAddress(withShops, 'a')).toMatchObject({ postal_code: '84702', city: 'Οία' });
    expect(buildDefaultDeliveryDetails(DEFAULT_LEGAL_SETTINGS, withShops).delivery_address).toMatchObject({ city: 'Μύκονος' });
    // The counterpart (invoice) address stays the fiscal seat.
    expect(buildCounterpartFromCustomer(withShops).address).toMatchObject({ city: 'ΑΘΗΝΑ' });
  });
});
