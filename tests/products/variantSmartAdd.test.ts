import { describe, expect, it } from 'vitest';
import { Gender, PlatingType } from '../../types';
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

  it('builds lustre and finish stone suffixes', () => {
    expect(buildVariantSuffixFromFinishAndStone('', 'TG', PlatingType.None)).toBe('TG');
    expect(buildVariantSuffixFromFinishAndStone('X', 'TG', PlatingType.None)).toBe('XTG');
    expect(buildVariantSuffixFromFinishAndStone('X', 'TG', PlatingType.GoldPlated)).toBe('TG');
  });

  it('plans batch suffixes and skips duplicates', () => {
    const existing = new Set(['', 'XTG']);
    const plan = buildSmartAddSuffixPlan(['', 'X'], 'TG', PlatingType.None, existing);

    expect(plan).toEqual([
      { suffix: '', skippedIncompatible: false, skippedDuplicate: true },
      { suffix: 'XTG', skippedIncompatible: false, skippedDuplicate: true },
    ]);
  });
});
