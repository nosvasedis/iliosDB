import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderStatus, type Customer, type Order, type Product } from '../../types';
import { RETAIL_CUSTOMER_ID, RETAIL_CUSTOMER_NAME } from '../../lib/supabase';

const product = {
  sku: 'RN100', prefix: 'RN', category: 'Δαχτυλίδι', description: 'Δαχτυλίδι δοκιμής', image_url: null,
  collections: [], is_component: false, variants: [], selling_price: 100,
} as unknown as Product;

// Two Mykonos shops a few hundred metres apart.
const shopA: Customer = {
  id: 'A', full_name: 'Κατάστημα Α', address: 'Ματογιάννη 1, 84600 - Μύκονος', latitude: 37.4467, longitude: 25.3289,
  country: 'GR', created_at: '2024-01-01T00:00:00Z',
};
const shopB: Customer = {
  id: 'B', full_name: 'Κατάστημα Β', address: 'Ενόπλων Δυνάμεων 5, 84600 - Μύκονος', latitude: 37.4475, longitude: 25.3275,
  country: 'GR', created_at: '2024-01-01T00:00:00Z',
};
const history = [{
  id: 'O-1', customer_id: 'B', customer_name: shopB.full_name, created_at: new Date().toISOString(),
  status: OrderStatus.Delivered, items: [{ sku: 'RN100', quantity: 4, price_at_order: 100 }], total_price: 496, vat_rate: 0.24,
}] as Order[];

vi.mock('../../hooks/api/useProducts', () => ({ useProducts: () => ({ data: [product] }) }));
vi.mock('../../hooks/api/useCollections', () => ({ useCollections: () => ({ data: [] }) }));
vi.mock('../../hooks/api/useOrders', () => ({
  useCustomers: () => ({ data: [shopA, shopB] }),
  useOrdersWithItems: () => ({ data: history }),
}));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn(), confirm: vi.fn() }) }));
vi.mock('../../components/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, profile: { id: 'u1', role: 'admin' } }) }));

import MobileOrderBuilder from '../../components/mobile/MobileOrderBuilder';

const draft = (customer: { id: string; name: string }): Order => ({
  id: 'ORD-NEW', customer_id: customer.id, customer_name: customer.name, created_at: new Date().toISOString(),
  status: OrderStatus.Pending, items: [{ sku: 'RN100', quantity: 1, price_at_order: 100 }], total_price: 124, vat_rate: 0.24,
} as Order);

const render = (order: Order) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MobileOrderBuilder onBack={() => {}} initialOrder={order} products={[product]} />
  </QueryClientProvider>,
);

describe('mobile order builder «Γκάμα & Περιοχή» warning', () => {
  it('warns when a neighbouring shop already carries a draft SKU', () => {
    const html = render(draft({ id: 'A', name: shopA.full_name }));
    expect(html).toContain('role="status"');
    expect(html).toContain('υπάρχει ήδη σε γειτονικό πελάτη');
  });

  it('stays silent for the Λιανική retail customer', () => {
    const html = render(draft({ id: RETAIL_CUSTOMER_ID, name: RETAIL_CUSTOMER_NAME }));
    expect(html).not.toContain('γειτονικό πελάτη');
  });
});
