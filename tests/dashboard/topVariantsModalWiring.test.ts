import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('top variants modal wiring', () => {
  const modal = readFileSync(resolve(__dirname, '../../components/dashboard/TopVariantsAnalyticsModal.tsx'), 'utf8');
  const shell = readFileSync(resolve(__dirname, '../../components/dashboard/SkuModalSkeleton.tsx'), 'utf8');
  const dashboard = readFileSync(resolve(__dirname, '../../components/Dashboard.tsx'), 'utf8');
  const printManager = readFileSync(resolve(__dirname, '../../components/PrintManager.tsx'), 'utf8');
  const printContext = readFileSync(resolve(__dirname, '../../components/PrintContext.tsx'), 'utf8');

  it('binds the dashboard period selector inside Κορυφαία SKU and does not refetch orders on open', () => {
    expect(dashboard).toContain('periodMode={financePeriodMode}');
    expect(dashboard).toContain('onPeriodChange={setFinancePeriodMode}');
    expect(dashboard).not.toMatch(/handleOpenTopVariants[\s\S]*invalidateQueries/);
    expect(shell).toContain('FinancePeriodSelector');
    expect(shell).toContain('onPeriodChange');
  });

  it('prints the current sales analysis through PrintManager', () => {
    expect(modal).toContain('setSkuSalesPrintData');
    expect(shell).toContain('Εκτύπωση PDF');
    expect(printContext).toContain('skuSalesPrintData');
    expect(printManager).toContain('SkuSalesPrintReport');
  });

  it('opens παραστάσεις automatically for Ωρίων', () => {
    expect(modal).toContain('shouldShowOrionDesignView');
    expect(modal).toContain('OrionDesignRankList');
    expect(modal).toContain('aggregateOrionDesignRankings');
  });
});
