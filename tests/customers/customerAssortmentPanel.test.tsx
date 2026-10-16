import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OrderStatus, type Customer, type Order, type Product } from '../../types';

const product = {
  sku: 'RN100', prefix: 'RN', category: 'Δαχτυλίδι', description: 'Δαχτυλίδι δοκιμής', image_url: null,
  collections: [7], is_component: false,
} as unknown as Product;

const customer: Customer = {
  id: 'customer-1', full_name: 'Πελάτης Δοκιμής', phone: '2100000000', address: 'Ματογιάννη 1, 84600 - Μύκονος',
  created_at: '2025-01-01T00:00:00.000Z',
  profile: { socials: { instagram: 'https://www.instagram.com/shop/' }, contacts: [{ id: 'c1', name: 'Μαρία', role: 'Ιδιοκτήτρια' }] },
};
const orders = [{
  id: 'order-1', customer_id: customer.id, customer_name: customer.full_name, created_at: new Date().toISOString(),
  status: OrderStatus.Delivered, items: [{ sku: 'RN100', quantity: 2, price_at_order: 100 }], total_price: 248, vat_rate: 0.24,
}] as Order[];

vi.mock('../../hooks/api/useProducts', () => ({ useProducts: () => ({ data: [product] }) }));
vi.mock('../../hooks/api/useCollections', () => ({ useCollections: () => ({ data: [{ id: 7, name: 'Ωρίων' }] }) }));
vi.mock('../../hooks/api/useOrders', () => ({
  useCustomers: () => ({ data: [customer] }),
  useOrdersWithItems: () => ({ data: orders }),
}));
vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn() }) }));

import CustomerAssortmentPanel from '../../components/customers/CustomerAssortmentPanel';
import MobileCustomerDetails from '../../components/mobile/MobileCustomerDetails';

describe('«Γκάμα & Περιοχή» surfaces', () => {
  it('renders the assortment with kinds, collections and SKUs', () => {
    const html = renderToStaticMarkup(<CustomerAssortmentPanel customer={customer} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Γκάμα');
    expect(html).toContain('Περιοχή');
    expect(html).toContain('Προτάσεις');
    expect(html).toContain('Δαχτυλίδια');
    expect(html).toContain('Ωρίων');
    expect(html).toContain('RN');
  });

  it('opens straight on the territory section when asked', () => {
    const html = renderToStaticMarkup(<CustomerAssortmentPanel customer={customer} initialSection="territory" />);
    expect(html).toContain('Καμία επικάλυψη στην περιοχή');
  });

  it('shows the mobile card with social links and the new tab', () => {
    const html = renderToStaticMarkup(<MobileCustomerDetails customer={customer} orders={orders} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(html).toContain('Γκάμα &amp; Περιοχή');
    expect(html).toContain('Social media');
    expect(html).toContain('https://www.instagram.com/shop/');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('Μαρία');
    expect(html).not.toContain('Ανάλυση');
  });
});
