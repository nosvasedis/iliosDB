import { describe, expect, it } from 'vitest';
import { Gender } from '../../types';
import {
  buildSmartAddSuffixPlan,
  buildVariantSuffixFromFinishAndStone,
  getStoneCatalogForGender,
} from '../../features/products/variantSmartAdd';

describe('variantSmartAdd', () => {
  it('returns gender-specific stone catalogs', () => {
    const men = getStoneCatalogForGender(Gender.Men);
    const women = getStoneCatalogForGender(Gender.Women);

    expect(men.some((stone) => stone.code === 'TG')).toBe(true);
    expect(women.some((stone) => stone.code === 'CO')).toBe(true);
    expect(men.some((stone) => stone.code === 'CO')).toBe(false);
  });

  it('builds lustre and metal-finish stone suffixes regardless of master plating', () => {
    expect(buildVariantSuffixFromFinishAndStone('', 'TG')).toBe('TG');
    expect(buildVariantSuffixFromFinishAndStone('X', 'TG')).toBe('XTG');
    expect(buildVariantSuffixFromFinishAndStone('X', 'AZM')).toBe('XAZM');
    expect(buildVariantSuffixFromFinishAndStone('P', 'AZM')).toBe('PAZM');
    expect(buildVariantSuffixFromFinishAndStone('X', '')).toBe('X');
  });

  it('allows any finish on gold-plated masters when editing the registry', () => {
    const existing = new Set<string>();
    const plan = buildSmartAddSuffixPlan(['', 'P', 'X'], 'AZM', existing);

    expect(plan).toEqual([
      { suffix: 'AZM', skippedDuplicate: false },
      { suffix: 'PAZM', skippedDuplicate: false },
      { suffix: 'XAZM', skippedDuplicate: false },
    ]);
  });

  it('plans batch suffixes and skips duplicates', () => {
    const existing = new Set(['', 'XTG']);
    const plan = buildSmartAddSuffixPlan(['', 'X'], 'TG', existing);

    expect(plan).toEqual([
      { suffix: 'TG', skippedDuplicate: false },
      { suffix: 'XTG', skippedDuplicate: true },
    ]);
  });
});
