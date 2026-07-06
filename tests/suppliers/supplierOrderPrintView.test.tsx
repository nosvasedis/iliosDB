import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SupplierOrderPrintView from '../../components/SupplierOrderPrintView';
import { Gender } from '../../types';

describe('SupplierOrderPrintView', () => {
  it('uses the shared three-column product grid layout', () => {
    const order = {
      id: 'supplier-order-1',
      supplier_id: 'supplier-1',
      supplier_name: 'Acme Supplies',
      created_at: '2026-07-01T10:00:00.000Z',
      status: 'Pending',
      total_amount: 0,
      items: [
        {
          id: 'item-1',
          item_id: 'RNG001',
          item_name: 'RNG001L',
          item_type: 'Product',
          quantity: 2,
          unit_cost: 0,
          total_cost: 0,
        },
      ],
    };
    const products = [
      {
        sku: 'RNG001',
        category: 'Ring',
        gender: Gender.Unisex,
        supplier_sku: 'SUP-RNG-001',
        image_url: 'https://example.test/ring.jpg',
        variants: [{ suffix: 'L', description: 'Lustre', stock_qty: 0 }],
      },
    ];

    const html = renderToStaticMarkup(
      <SupplierOrderPrintView order={order as any} products={products as any} />,
    );

    expect(html).toContain('grid-cols-3');
    expect(html).toContain('column-count:3');
    expect(html).not.toContain('column-count:2');
  });
});
