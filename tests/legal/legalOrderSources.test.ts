import { describe, expect, it } from 'vitest';
import { Order, OrderShipment, OrderShipmentItem } from '../../types';
import {
  LEGAL_REMAINING_SOURCE_VALUE,
  buildLegalLineSourceOptions,
  buildLegalOrderPickerRows,
  buildOrderWithRemainingItems,
  findOrderByShortId,
  parseTransferInShortId,
  parseTransferOutShortId,
} from '../../utils/legalOrderSources';

const baseOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  customer_id: 'cust-1',
  customer_name: 'Δοκιμαστικός Πελάτης',
  status: 'InProduction' as Order['status'],
  items: [
    { sku: 'STX-1', quantity: 2, price_at_order: 100 },
    { sku: 'STX-2', quantity: 1, price_at_order: 50 },
  ],
  total_price: 300,
  vat_rate: 0.24,
  discount_percent: 0,
  created_at: '2026-06-01T10:00:00.000Z',
  ...overrides,
});

describe('legalOrderSources', () => {
  it('parses transfer notes from order history', () => {
    expect(parseTransferOutShortId('\n\n[ΜΕΤΑΦΟΡΑ 1/6/2026] Υπόλοιπο 5 τεμ. μεταφέρθηκε → παρ. #eeeeee | User')).toBe('eeeeee');
    expect(parseTransferInShortId('\n\n[ΜΕΤΑΦΟΡΑ 1/6/2026] Ελήφθησαν 5 τεμ. από παρ. #aaaaaa | User')).toBe('aaaaaa');
  });

  it('marks emptied transferred orders as non-selectable and links to target order', () => {
    const source = baseOrder({
      id: '11111111-1111-1111-1111-111111111111',
      items: [],
      total_price: 0,
      notes: '[ΜΕΤΑΦΟΡΑ 1/6/2026] Υπόλοιπο 5 τεμ. μεταφέρθηκε → παρ. #eeeeee | User',
    });
    const target = baseOrder({
      id: '22222222-2222-2222-2222-eeeeeeeeeeee',
      items: [{ sku: 'STX-1', quantity: 5, price_at_order: 100 }],
      total_price: 620,
      notes: '[ΜΕΤΑΦΟΡΑ 1/6/2026] Ελήφθησαν 5 τεμ. από παρ. #111111 | User',
    });

    const rows = buildLegalOrderPickerRows([source, target]);
    const sourceRow = rows.find((row) => row.order.id === source.id);
    const targetRow = rows.find((row) => row.order.id === target.id);

    expect(sourceRow?.selectable).toBe(false);
    expect(sourceRow?.redirectOrderId).toBe(target.id);
    expect(targetRow?.selectable).toBe(true);
    expect(targetRow?.transferInShortId).toBe('111111');
    expect(findOrderByShortId([source, target], 'eeeeee')?.id).toBe(target.id);
  });

  it('builds line source options with remaining items and shipments', () => {
    const order = baseOrder();
    const shipments: OrderShipment[] = [{
      id: 'ship-1',
      order_id: order.id,
      shipment_number: 1,
      shipped_at: '2026-06-05T12:00:00.000Z',
      shipped_by: 'Tester',
      notes: null,
      created_at: '2026-06-05T12:00:00.000Z',
    }];
    const shipmentItems: OrderShipmentItem[] = [{
      id: 'item-1',
      shipment_id: 'ship-1',
      sku: 'STX-1',
      quantity: 1,
      price_at_order: 100,
      created_at: '2026-06-05T12:00:00.000Z',
    }];

    const options = buildLegalLineSourceOptions({ order, shipments, shipmentItems });
    expect(options.map((option) => option.value)).toEqual(['', LEGAL_REMAINING_SOURCE_VALUE, 'ship-1']);
    expect(options[1]?.label).toContain('Υπόλειπα είδη');
    expect(options[2]?.label).toContain('ΔΑ #1');
  });

  it('builds a remaining-only order snapshot for legal documents', () => {
    const order = baseOrder();
    const shipmentItems: OrderShipmentItem[] = [{
      id: 'item-1',
      shipment_id: 'ship-1',
      sku: 'STX-1',
      quantity: 1,
      price_at_order: 100,
      created_at: '2026-06-05T12:00:00.000Z',
    }];

    const remainingOrder = buildOrderWithRemainingItems(order, shipmentItems);
    expect(remainingOrder?.items).toHaveLength(2);
    expect(remainingOrder?.items.find((item) => item.sku === 'STX-1')?.quantity).toBe(1);
    expect(remainingOrder?.items.find((item) => item.sku === 'STX-2')?.quantity).toBe(1);
  });
});
