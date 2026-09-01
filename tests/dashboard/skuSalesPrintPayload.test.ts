import { describe, expect, it } from 'vitest';
import { buildSkuSalesPrintData } from '../../features/dashboard/skuSalesPrint';

describe('buildSkuSalesPrintData', () => {
  it('builds a report payload for the currently displayed SKU rows', () => {
    const data = buildSkuSalesPrintData({
      periodLabel: 'Τρέχον έτος',
      sortLabel: 'Τεμάχια',
      filterSummary: 'Συλλογή: Ωρίων',
      view: 'skus',
      kpis: { quantity: 4, revenue: 400, profit: 120, skuCount: 2 },
      skuRows: [
        { rank: 1, sku: 'RN315', variantSuffix: 'X', name: '', quantity: 3, revenue: 300, profit: 90 },
        { rank: 2, sku: 'XR615', variantSuffix: '', name: '', quantity: 1, revenue: 100, profit: 30 },
      ],
      designRows: [],
    });

    expect(data.title).toContain('Αναφορά πωλήσεων SKU');
    expect(data.periodLabel).toBe('Τρέχον έτος');
    expect(data.view).toBe('skus');
    expect(data.rows).toHaveLength(2);
    expect(data.kpis.quantity).toBe(4);
  });

  it('prints παραστάσεις when that view is active', () => {
    const data = buildSkuSalesPrintData({
      periodLabel: 'Όλα',
      sortLabel: 'Έσοδα',
      filterSummary: 'Συλλογή: Ωρίων · Δαχτυλίδια',
      view: 'designs',
      kpis: { quantity: 6, revenue: 550, profit: 440, skuCount: 1 },
      skuRows: [],
      designRows: [
        { rank: 1, sku: '15', variantSuffix: '', name: 'Περικεφαλαία', quantity: 6, revenue: 550, profit: 440 },
      ],
    });

    expect(data.view).toBe('designs');
    expect(data.rows[0].name).toBe('Περικεφαλαία');
  });
});
