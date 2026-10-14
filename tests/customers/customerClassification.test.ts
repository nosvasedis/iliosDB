import { describe, expect, it } from 'vitest';
import { OrderStatus, type Customer, type Order } from '../../types';
import {
  buildCustomerDirectory, classifyCustomer, nextCategoryGap, orderNetValue,
  sortCustomerDirectory, summarizeCustomerOrders,
} from '../../features/customers/customerLocation';

const now = Date.parse('2026-10-14T10:00:00Z');
const customer = (id: string): Customer => ({ id, full_name: id, created_at: '2024-01-01T00:00:00Z' });
const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', customer_id: 'customer-1', customer_name: 'Customer',
  created_at: '2026-10-01T10:00:00Z', status: OrderStatus.Delivered,
  items: [], total_price: 620, vat_rate: 0.24, ...overrides,
});

describe('annual customer categories', () => {
  it.each([
    [0, 'quiet', null], [0.01, 'quiet', null], [499.99, 'quiet', null],
    [500, 'active', 'regular'], [1999.99, 'active', 'regular'],
    [2000, 'active', 'steady'], [4999.99, 'active', 'steady'],
    [5000, 'active', 'key'], [9999.99, 'active', 'key'],
    [10000, 'active', 'top'], [50000, 'active', 'top'],
  ])('classifies €%s this year as %s / %s', (revenue, activity, tier) => {
    expect(classifyCustomer(revenue as number, true, true)).toEqual({ activity, tier });
  });

  it('keeps customers without history separate from customers with no purchases this year', () => {
    expect(summarizeCustomerOrders([], now)).toMatchObject({ activity: 'none', tier: null });
    expect(summarizeCustomerOrders([order({ created_at: '2025-12-31T12:00:00Z' })], now))
      .toMatchObject({ activity: 'inactive', tier: null, revenue: 500, yearRevenue: 0, yearOrderCount: 0 });
    expect(summarizeCustomerOrders([order({ status: OrderStatus.Cancelled })], now))
      .toMatchObject({ activity: 'none', orderCount: 0, yearRevenue: 0 });
  });

  it('uses annual net spending rather than recency or lifetime spending', () => {
    expect(summarizeCustomerOrders([order({ created_at: '2026-01-01T12:00:00Z' })], now))
      .toMatchObject({ activity: 'active', tier: 'regular', yearRevenue: 500 });
    expect(summarizeCustomerOrders([
      order({ total_price: 12400, created_at: '2025-12-31T12:00:00Z' }),
      order({ total_price: 124, created_at: '2026-10-14T09:00:00Z' }),
      order({ total_price: 12400, status: OrderStatus.Cancelled }),
    ], now)).toMatchObject({ activity: 'quiet', tier: null, revenue: 10100, yearRevenue: 100, orderCount: 2, yearOrderCount: 1 });
  });

  it('counts the year from midnight January 1 in Greece and resets on the next January 1', () => {
    const orders = [
      order({ total_price: 124, created_at: '2025-12-31T21:59:59Z' }),
      order({ total_price: 620, created_at: '2025-12-31T22:00:00Z' }),
      order({ total_price: 248, created_at: '2026-01-01T00:00:00Z' }),
    ];
    expect(summarizeCustomerOrders(orders, now)).toMatchObject({ revenue: 800, yearRevenue: 700, yearOrderCount: 2, activity: 'active' });
    expect(summarizeCustomerOrders(orders, Date.parse('2026-12-31T22:00:00Z')))
      .toMatchObject({ yearRevenue: 0, yearOrderCount: 0, activity: 'inactive' });
    expect(summarizeCustomerOrders([order({ created_at: '2026-12-31T22:00:00Z' })], Date.parse('2026-12-31T22:00:00Z')))
      .toMatchObject({ yearRevenue: 500, activity: 'active', tier: 'regular' });
  });

  it('ignores future and invalid dates for turnover, categories and the last order', () => {
    expect(summarizeCustomerOrders([
      order({ total_price: 124 }),
      order({ created_at: '2026-11-01T00:00:00Z' }),
      order({ created_at: '2027-01-01T00:00:00Z' }),
      order({ created_at: 'invalid' }),
    ], now)).toMatchObject({ orderCount: 1, yearRevenue: 100, activity: 'quiet', lastOrderAt: '2026-10-01T10:00:00Z' });
  });

  it('uses each order VAT rate, including zero VAT and the legacy default', () => {
    expect(orderNetValue({ total_price: 620, vat_rate: 0.24 })).toBe(500);
    expect(orderNetValue({ total_price: 585, vat_rate: 0.17 })).toBe(500);
    expect(orderNetValue({ total_price: 500, vat_rate: 0 })).toBe(500);
    expect(orderNetValue({ total_price: 620 })).toBe(500);
    const summary = summarizeCustomerOrders([
      order({ total_price: 124 }), order({ total_price: 117, vat_rate: 0.17 }),
      order({ total_price: 100, vat_rate: 0 }), order({ total_price: 248, vat_rate: undefined }),
    ], now);
    expect(summary).toMatchObject({ yearRevenue: 500, tier: 'regular' });
  });

  it('handles accumulated decimal amounts exactly at tier boundaries', () => {
    const summary = summarizeCustomerOrders([
      order({ total_price: 166.67, vat_rate: 0 }), order({ total_price: 166.67, vat_rate: 0 }),
      order({ total_price: 166.66, vat_rate: 0 }),
    ], now);
    expect(summary).toMatchObject({ yearRevenue: 500, activity: 'active', tier: 'regular' });
  });

  it('sorts turnover by this year while preserving the all-time total', () => {
    const directory = buildCustomerDirectory([customer('a'), customer('b'), customer('empty')], [
      order({ customer_id: 'a', total_price: 12400, created_at: '2025-01-01T00:00:00Z' }),
      order({ customer_id: 'a', total_price: 124 }),
      order({ customer_id: 'b' }),
    ], { now });
    expect(directory[0]).toMatchObject({ revenue: 10100, yearRevenue: 100, activity: 'quiet' });
    expect(sortCustomerDirectory(directory, 'revenue', 'desc').map(entry => entry.customer.id)).toEqual(['b', 'a', 'empty']);
    expect(sortCustomerDirectory(directory, 'revenue', 'asc').map(entry => entry.customer.id)).toEqual(['a', 'b', 'empty']);
  });

  it('explains the amount needed to reach the next tier', () => {
    expect(nextCategoryGap(0)).toEqual({ label: 'Τακτικός', missing: 500 });
    expect(nextCategoryGap(499.99)).toEqual({ label: 'Τακτικός', missing: 0.01 });
    expect(nextCategoryGap(500)).toEqual({ label: 'Σταθερός', missing: 1500 });
    expect(nextCategoryGap(2000)).toEqual({ label: 'Βασικός', missing: 3000 });
    expect(nextCategoryGap(5000)).toEqual({ label: 'Κορυφαίος', missing: 5000 });
    expect(nextCategoryGap(10000)).toBeNull();
  });
});
