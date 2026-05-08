import { describe, expect, it } from 'vitest';
import { getSizingInfo } from '../../utils/sizing';

describe('getSizingInfo', () => {
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
