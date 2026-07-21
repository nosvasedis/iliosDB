import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Customer, OrderStatus, Product } from '../../types';
import { FinanceLineEvent } from '../../utils/financeAnalytics';

const product = {
  sku: 'A1',
  prefix: 'A1',
  category: 'Δαχτυλίδι',
  description: 'Δαχτυλίδι δοκιμής',
  gender: 'Unisex',
  image_url: null,
  weight_g: 1,
  plating_type: 'None',
  production_type: 'InHouse',
  active_price: 100,
  draft_price: 100,
  selling_price: 100,
  stock_qty: 0,
  sample_qty: 0,
  molds: [],
  is_component: false,
  recipe: [],
  labor: { casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0, plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0 },
} as Product;

const event = {
  source: 'shipment',
  orderId: 'order-1',
  date: '2026-06-01T00:00:00.000Z',
  customerId: 'customer-1',
  customerName: 'Πελάτης Δοκιμής',
  sellerCommissionPercent: 0,
  sku: 'A1',
  variantSuffix: null,
  quantity: 2,
  unitPrice: 100,
  subtotal: 200,
  discount: 0,
  net: 200,
  vat: 48,
  gross: 248,
  estimatedUnitCost: 40,
  estimatedCost: 80,
  profit: 120,
  margin: 60,
  category: 'Δαχτυλίδι',
  collectionId: null,
  collectionName: 'Χωρίς συλλογή',
  productImage: null,
  silverWeight: 0,
  costBreakdown: { silver: 0, labor: 0, materials: 80 },
  priceOverride: false,
} as FinanceLineEvent;

vi.mock('../../hooks/api/useProducts', () => ({
  useProducts: () => ({ data: [product], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('../../hooks/api/useFinanceAnalytics', () => ({
  useFinanceAnalytics: () => ({
    analytics: { events: { realized: [event], backlog: [] } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../components/UIProvider', () => ({
  useUI: () => ({ showToast: vi.fn() }),
}));

import CustomerAnalyticsPanel from '../../components/customers/CustomerAnalyticsPanel';
import MobileCustomerDetails from '../../components/mobile/MobileCustomerDetails';

const customer: Customer = { id: 'customer-1', full_name: 'Πελάτης Δοκιμής', phone: '2100000000', created_at: '2025-01-01T00:00:00.000Z' };
const orders = [{
  id: 'order-1',
  customer_id: customer.id,
  customer_name: customer.full_name,
  created_at: '2026-06-01T00:00:00.000Z',
  status: OrderStatus.Delivered,
  items: [{ sku: 'A1', quantity: 2, price_at_order: 100, product_details: product }],
  total_price: 248,
  vat_rate: 0.24,
}];

describe('customer analytics responsive surfaces', () => {
  it('renders the full accessible analysis navigation and summary content', () => {
    const html = renderToStaticMarkup(<CustomerAnalyticsPanel customer={customer} orders={orders} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Σύνοψη');
    expect(html).toContain('Προϊόντα');
    expect(html).toContain('Κατηγορίες');
    expect(html).toContain('Συμπεριφορά');
    expect(html).toContain('Ευκαιρίες');
    expect(html).toContain('Πραγματοποιημένος τζίρος');
    expect(html).toContain('A1');
  });

  it('renders a read-only mobile customer card with explicit edit and analysis tabs', () => {
    const html = renderToStaticMarkup(<MobileCustomerDetails customer={customer} orders={orders} onClose={vi.fn()} onEdit={vi.fn()} />);
    expect(html).toContain('Καρτέλα πελάτη');
    expect(html).toContain('aria-label="Επεξεργασία πελάτη"');
    expect(html).toContain('Επισκόπηση');
    expect(html).toContain('Ανάλυση');
    expect(html).toContain('Παραγγελίες');
    expect(html).toContain('Στοιχεία επικοινωνίας και τιμολόγησης');
  });
});
