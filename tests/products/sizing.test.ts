import { describe, expect, it } from 'vitest';
import { getSizingInfo } from '../../utils/sizing';
import { parseSku } from '../../utils/pricingEngine';
import { classifyJewelryKind } from '../../features/customers/jewelryKinds';

describe('getSizingInfo', () => {
  it.each([
    ['BDA001', 'BDA'], ['ΒΔΑ001', 'ΒΔΑ'],
    ['BDA001', 'BD'], ['ΒΔΑ001', 'ΒΔ'],
    [' bda001 ', ''], [' βδα001 ', ' βδ '],
  ])('recognizes ring %s with stored prefix %s', (sku, prefix) => {
    const sizing = getSizingInfo({ sku, prefix, category: 'Γενικό' });
    expect(sizing).toEqual(getSizingInfo({ prefix: 'DA' }));
    expect(sizing?.sizes).toContain('52');
  });

  it.each(['BDA001', 'ΒΔΑ001'])('categorizes %s as a ring when importing', sku => {
    expect(parseSku(sku).category).toBe('Δαχτυλίδι');
    expect(classifyJewelryKind(sku, 'Γενικό').id).toBe('ring');
  });

  it('does not classify other BD products as rings', () => {
    expect(getSizingInfo({ sku: 'BD001', prefix: 'BD' })).toBeNull();
  });

  it('treats DM products categorized as rings as women sized rings', () => {
    expect(getSizingInfo({
      prefix: 'DM',
      sku: 'DM123',
      category: 'Δαχτυλίδι',
      gender: 'Women',
    })?.sizes).toContain('52');

    const menTaggedDmRingSizing = getSizingInfo({
      prefix: 'DM',
      sku: 'DM456',
      category: 'Δαχτυλίδι',
      gender: 'Men',
    });

    expect(menTaggedDmRingSizing?.sizes).toContain('52');
    expect(menTaggedDmRingSizing?.sizes).not.toContain('67');
  });

  it('does not make non-ring DM products sizable', () => {
    expect(getSizingInfo({
      prefix: 'DM',
      sku: 'DM789',
      category: 'Μενταγιόν',
      gender: 'Women',
    })).toBeNull();
  });
});
