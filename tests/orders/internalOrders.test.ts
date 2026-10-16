import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
import { api } from '../../lib/supabase';
import type { Customer, Order } from '../../types';
import { OrderStatus } from '../../types';
import { INTERNAL_CUSTOMER_ID, INTERNAL_CUSTOMER_NAME, isReservedCustomerName, isSystemCustomerId, RETAIL_CUSTOMER_ID } from '../../utils/retailConstants';
import { buildOrderCustomerFields, isInternalOrder, isRetailCustomerOrder } from '../../utils/orderCustomer';
import { buildLegalOrderPickerRows } from '../../utils/legalOrderSources';
import { buildCustomerDirectory, countRegions } from '../../features/customers/customerLocation';
import { SYSTEM_CUSTOMER_IDS } from '../../utils/retailConstants';
import { buildAssortmentIndex, findAllOverlaps, isTerritoryCustomer } from '../../features/customers/customerAssortment';

const internalOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'ORD-INT-1', customer_id: INTERNAL_CUSTOMER_ID, customer_name: INTERNAL_CUSTOMER_NAME, created_at: '2026-09-24T09:00:00Z',
  status: OrderStatus.InProduction, items: [{ sku: 'RN1', quantity: 2, price_at_order: 50 }], total_price: 124, vat_rate: 0.24, ...overrides,
} as Order);

describe('internal orders account', () => {
  it('is a reserved system account distinct from Λιανική', () => {
    expect(isSystemCustomerId(INTERNAL_CUSTOMER_ID)).toBe(true);
    expect(isSystemCustomerId(RETAIL_CUSTOMER_ID)).toBe(true);
    expect(isSystemCustomerId('x')).toBe(false);
    expect(isReservedCustomerName(' Εσωτερική παραγγελία ')).toBe(true);
    expect(isInternalOrder(internalOrder())).toBe(true);
    expect(isInternalOrder(internalOrder({ customer_id: undefined }))).toBe(true);
    expect(isRetailCustomerOrder(internalOrder())).toBe(false);
    expect(buildOrderCustomerFields({ customer_name: INTERNAL_CUSTOMER_NAME })).toMatchObject({ customer_id: INTERNAL_CUSTOMER_ID, customer_name: INTERNAL_CUSTOMER_NAME });
  });

  it('cannot be edited, deleted or impersonated through the API', async () => {
    await expect(api.saveCustomer({ id: INTERNAL_CUSTOMER_ID, full_name: 'X' })).rejects.toThrow('συστήματος');
    await expect(api.updateCustomer(INTERNAL_CUSTOMER_ID, { notes: 'x' })).rejects.toThrow();
    await expect(api.deleteCustomer(INTERNAL_CUSTOMER_ID)).rejects.toThrow();
    await expect(api.saveCustomer({ id: 'new', full_name: INTERNAL_CUSTOMER_NAME })).rejects.toThrow('δεσμευμένο');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('is never offered for invoicing', () => {
    const real = internalOrder({ id: 'aaaaaaaa-bbbb-cccc-dddd-000000000001', customer_id: 'c1', customer_name: 'Πελάτης' });
    expect(buildLegalOrderPickerRows([internalOrder(), real])).toHaveLength(1);
  });

  it('is a system entry in the directory (no map places) and outside territory analysis', () => {
    const customers: Customer[] = [
      { id: INTERNAL_CUSTOMER_ID, full_name: INTERNAL_CUSTOMER_NAME, address: 'Ματογιάννη 1, 84600 - Μύκονος', created_at: '' },
      { id: 'shop', full_name: 'Shop', address: 'Ματογιάννη 3, 84600 - Μύκονος', created_at: '' },
    ];
    const entry = buildCustomerDirectory(customers, [internalOrder()], { systemCustomerIds: SYSTEM_CUSTOMER_IDS })[0];
    expect(entry.isSystem).toBe(true);
    expect(entry.places).toEqual([]);
    expect(isTerritoryCustomer(INTERNAL_CUSTOMER_ID)).toBe(false);
    const index = buildAssortmentIndex({
      customers,
      orders: [internalOrder(), { ...internalOrder(), id: 'o2', customer_id: 'shop', customer_name: 'Shop' } as Order],
      products: [{ sku: 'RN1', category: 'Δαχτυλίδι' } as never],
      now: new Date('2026-10-01').getTime(),
    });
    expect(findAllOverlaps(index, { radiusKm: 5, window: 'all' })).toEqual([]);
  });

  it('never counts as «Χωρίς περιοχή» or reaches the map, even without an address', () => {
    const customers: Customer[] = [
      { id: INTERNAL_CUSTOMER_ID, full_name: INTERNAL_CUSTOMER_NAME, created_at: '' },
      { id: RETAIL_CUSTOMER_ID, full_name: 'Λιανική', created_at: '' },
      { id: 'shop', full_name: 'Shop', address: 'Ματογιάννη 3, 84600 - Μύκονος', created_at: '' },
    ];
    const directory = buildCustomerDirectory(customers, [internalOrder()], { systemCustomerIds: SYSTEM_CUSTOMER_IDS });
    expect(countRegions(directory).none).toBe(0);
    expect(directory.filter(e => !e.isSystem).map(e => e.customer.id)).toEqual(['shop']);
  });
});
