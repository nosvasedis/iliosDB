import { describe, expect, it } from 'vitest';
import {
  getMovementStageSurfaceClass,
  getMovementProgressPercent,
  getMovementSurfaceClass,
  MOVEMENT_CARD_SHIMMER_CLASS,
  MOVEMENT_STAGE_SURFACE_CLASS,
  MOVEMENT_SURFACE_CLASS,
} from '../../components/production/movementFeedback';

describe('movement feedback classes', () => {
  it('uses one shared moving-card shimmer vocabulary', () => {
    const classes = getMovementSurfaceClass(true);

    expect(classes).toContain(MOVEMENT_SURFACE_CLASS);
    expect(classes).toContain(MOVEMENT_CARD_SHIMMER_CLASS);
    expect(classes).toContain('emerald');
  });

  it('does not add movement classes while idle', () => {
    expect(getMovementSurfaceClass(false)).toBe('');
    expect(getMovementStageSurfaceClass(false)).toBe('');
  });

  it('uses a shared stage surface indicator while batches are moving', () => {
    expect(getMovementStageSurfaceClass(true)).toBe(MOVEMENT_STAGE_SURFACE_CLASS);
  });

  it('keeps bulk movement progress bounded and count-based', () => {
    expect(getMovementProgressPercent(0, 10)).toBe(0);
    expect(getMovementProgressPercent(2, 10)).toBe(20);
    expect(getMovementProgressPercent(12, 10)).toBe(100);
  });
});
