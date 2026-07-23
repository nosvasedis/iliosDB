import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../components/mobile/MobileProductDetails.tsx', import.meta.url),
  'utf8',
);

describe('mobile inventory canonical source contract', () => {
  it('does not render stock from legacy product snapshots', () => {
    expect(source).toContain('useInventoryAvailability()');
    expect(source).toContain('summarizeInventorySelectionByWarehouse');
    expect(source).not.toMatch(/activeVariant\.(stock_qty|reserved_qty|available_qty|location_stock|location_reserved|location_available)/);
    expect(source).not.toMatch(/product\.(stock_qty|sample_qty|reserved_qty|available_qty|location_stock|location_reserved|location_available)/);
  });

  it('confirms the canonical readback and blocks duplicate submissions', () => {
    expect(source).toContain('refreshInventoryAvailability(queryClient)');
    expect(source).toContain('stockMutationPending');
    expect(source).toContain('mutationCommitted');
    expect(source).toContain('Επιβεβαίωση υπολοίπου...');
  });
});
