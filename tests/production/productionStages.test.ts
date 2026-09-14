import { describe, expect, it } from 'vitest';
import { getPolishingSubStageLabel } from '../../utils/productionStages';

describe('production stage labels', () => {
  it('keeps both Τεχνίτης substages explicit', () => {
    expect(getPolishingSubStageLabel('pending')).toBe('Τεχνίτης σε Αναμονή');
    expect(getPolishingSubStageLabel('dispatched')).toBe('Τεχνίτης στον Τεχνίτη');
  });
});
