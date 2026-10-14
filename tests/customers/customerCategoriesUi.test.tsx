import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { OrderStatus, type Customer, type Order } from '../../types';
import { buildCustomerDirectory } from '../../features/customers/customerLocation';
import CustomerCard from '../../components/customers/CustomerCard';
import CustomerListView from '../../components/customers/CustomerListView';
import CustomerCategoryFilter from '../../components/customers/CustomerCategoryFilter';
import { ActivityBadge, CustomerCategorySummary } from '../../components/customers/customerUi';
import { formatCurrency } from '../../utils/numberFormat';

const now = Date.parse('2026-10-14T10:00:00Z');
const customers: Customer[] = ['top', 'key', 'steady', 'regular', 'quiet', 'inactive', 'none', 'system']
  .map(id => ({ id, full_name: `Πελάτης ${id}`, created_at: '2024-01-01T00:00:00Z' }));
const orders: Order[] = [10000, 5000, 2000, 500, 100, 4000].map((net, index) => ({
  id: `order-${index}`, customer_id: customers[index].id, customer_name: customers[index].full_name,
  created_at: index === 5 ? '2025-12-31T12:00:00Z' : '2026-10-01T00:00:00Z',
  status: OrderStatus.Delivered, total_price: net * 1.24, vat_rate: 0.24, items: [],
}));
const entries = buildCustomerDirectory(customers, orders, { now, systemCustomerId: 'system' });

describe('customer category presentation', () => {
  it('shows each active tier on cards and in the list with the same annual net turnover', () => {
    const labels = ['Κορυφαίος', 'Βασικός', 'Σταθερός', 'Τακτικός'];
    entries.slice(0, 4).forEach((entry, index) => {
      const card = renderToStaticMarkup(<CustomerCard entry={entry} onOpen={vi.fn()} />);
      const list = renderToStaticMarkup(<CustomerListView entries={[entry]} sortKey="revenue" sortDir="desc" onSort={vi.fn()} onOpen={vi.fn()} onShowOnMap={vi.fn()} />);
      for (const html of [card, list]) {
        expect(html).toContain(`Ενεργός · ${labels[index]}`);
        expect(html).toContain(formatCurrency(entry.yearRevenue));
        expect(html).toContain('Τζίρος φέτος');
        expect(html).toContain('Χωρίς ΦΠΑ');
      }
    });
  });

  it('shows zero this year for inactive customers even with historic turnover', () => {
    const card = renderToStaticMarkup(<CustomerCard entry={entries[5]} onOpen={vi.fn()} />);
    expect(card).toContain('Ανενεργός');
    expect(card).toContain(formatCurrency(0));
    expect(card).not.toContain(formatCurrency(4000));
  });

  it('makes compact badges accessible and explains the next tier on profiles', () => {
    expect(renderToStaticMarkup(<ActivityBadge activity="active" tier="key" compact />)).toContain('aria-label="Ενεργός · Βασικός"');
    const html = renderToStaticMarkup(<CustomerCategorySummary summary={entries[3]} />);
    expect(html).toContain('Κατηγορία φέτος');
    expect(html).toContain('Τακτικός');
    expect(html).toContain(formatCurrency(1500));
    expect(html).toContain('Σταθερός');
    expect(html).toContain('ακυρωμένες εξαιρούνται');
  });

  it('filters active tiers and clears the tier when changing activity', () => {
    const onChange = vi.fn();
    let renderer: ReturnType<typeof create>;
    act(() => { renderer = create(<CustomerCategoryFilter entries={entries} activity="active" tier="key" onChange={onChange} />); });
    const select = renderer!.root.findByProps({ 'aria-label': 'Υποκατηγορία ενεργών πελατών' });
    expect(select.props.value).toBe('key');
    expect(select.findAllByType('option').map(option => option.props.value)).toEqual(['', 'top', 'key', 'steady', 'regular']);
    act(() => select.props.onChange({ target: { value: 'steady' } }));
    expect(onChange).toHaveBeenLastCalledWith('active', 'steady');
    const quietButton = renderer!.root.findAllByType('button').find(button => button.props.title?.includes('κάτω από 500'))!;
    act(() => quietButton.props.onClick());
    expect(onChange).toHaveBeenLastCalledWith('quiet', null);
    act(() => renderer!.update(<CustomerCategoryFilter entries={entries} activity="quiet" tier={null} onChange={onChange} />));
    expect(renderer!.root.findAllByType('select')).toHaveLength(0);
    act(() => renderer!.root.findAllByType('button')[0].props.onClick());
    expect(onChange).toHaveBeenLastCalledWith(null, null);
    act(() => renderer!.unmount());
  });

  it('excludes the system customer from category counts', () => {
    const html = renderToStaticMarkup(<CustomerCategoryFilter entries={entries} activity="active" tier={null} onChange={vi.fn()} />);
    expect(html).toContain('Όλοι οι ενεργοί (4)');
    expect(html).toMatch(/Χωρίς παραγγελίες <span[^>]*>1<\/span>/);
  });
});
