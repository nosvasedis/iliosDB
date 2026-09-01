import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SKU modal filters panel scroll wiring', () => {
  const source = readFileSync(
    resolve(__dirname, '../../components/dashboard/SkuModalFiltersPanel.tsx'),
    'utf8',
  );

  it('caps the open panel and scrolls the filter groups instead of clipping them', () => {
    const openBodyClass = source.match(/\{open && \([\s\S]*?<div className="([^"]+)"/)?.[1];
    expect(openBodyClass).toBeTruthy();
    expect(openBodyClass).toContain('overflow-y-auto');
    expect(openBodyClass).toContain('min-h-0');
    expect(openBodyClass).toContain('overscroll-contain');

    expect(source).toMatch(/open \? '[^']*min-h-0[^']*max-h-/);
    expect(source).toMatch(/open \? '[^']*flex-col/);
  });
});
