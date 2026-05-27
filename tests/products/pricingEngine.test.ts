import { describe, expect, it } from 'vitest';
import { Gender } from '../../types';
import { analyzeSuffix, getVariantComponents } from '../../utils/pricingEngine';

describe('Swiss Blue stone code (SB)', () => {
  it('parses XSB suffix as finish X with stone SB', () => {
    const { stone, finish } = getVariantComponents('XSB', Gender.Women);
    expect(stone.code).toBe('SB');
    expect(stone.name).toBe('Swiss Blue');
    expect(finish.code).toBe('X');
  });

  it('generates Swiss Blue in auto variant description for DSB', () => {
    const description = analyzeSuffix('DSB', Gender.Women);
    expect(description).toContain('Swiss Blue');
    expect(description).not.toContain('Blue Sky Topaz');
  });
});
