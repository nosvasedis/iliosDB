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

describe('Azurite-Malachite stone code (AZM)', () => {
  it('parses AZM suffix as lustre with stone AZM', () => {
    const { stone, finish } = getVariantComponents('AZM', Gender.Women);
    expect(stone.code).toBe('AZM');
    expect(stone.name).toBe('Αζουρίτης - Μαλαχίτης');
    expect(finish.code).toBe('');
  });

  it('parses PAZM suffix as finish P with stone AZM', () => {
    const { stone, finish } = getVariantComponents('PAZM', Gender.Women);
    expect(stone.code).toBe('AZM');
    expect(stone.name).toBe('Αζουρίτης - Μαλαχίτης');
    expect(finish.code).toBe('P');
  });

  it('generates Αζουρίτης - Μαλαχίτης in auto variant description for XAZM', () => {
    const description = analyzeSuffix('XAZM', Gender.Women);
    expect(description).toContain('Αζουρίτης - Μαλαχίτης');
  });
});
