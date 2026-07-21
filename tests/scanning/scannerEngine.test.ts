import { describe, expect, it } from 'vitest';
import {
  computeObjectCoverCrop,
  describeCameraError,
  getAdaptiveDecodeInterval,
  getFrameDiagnostics,
  isCurrentScannerSession,
  isDuplicateScan,
} from '../../features/scanning/scannerEngine';

describe('scanner crop geometry', () => {
  it('maps the visible reticle through object-cover and adds 25% padding', () => {
    const crop = computeObjectCoverCrop({
      videoWidth: 1920,
      videoHeight: 1080,
      viewportWidth: 1000,
      viewportHeight: 1000,
      target: { x: 350, y: 350, width: 300, height: 300 },
      paddingRatio: 0.25,
    });

    expect(crop.width).toBeCloseTo(486, -1);
    expect(crop.height).toBeCloseTo(486, -1);
    expect(crop.x + crop.width / 2).toBeCloseTo(960, 0);
    expect(crop.y + crop.height / 2).toBeCloseTo(540, 0);
  });

  it('uses the same centered region shown by digital preview zoom', () => {
    const normal = computeObjectCoverCrop({
      videoWidth: 1600,
      videoHeight: 1200,
      viewportWidth: 800,
      viewportHeight: 800,
      target: { x: 200, y: 200, width: 400, height: 400 },
      paddingRatio: 0,
      digitalZoom: 1,
    });
    const zoomed = computeObjectCoverCrop({
      videoWidth: 1600,
      videoHeight: 1200,
      viewportWidth: 800,
      viewportHeight: 800,
      target: { x: 200, y: 200, width: 400, height: 400 },
      paddingRatio: 0,
      digitalZoom: 2,
    });

    expect(Math.abs(zoomed.width - normal.width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(zoomed.height - normal.height / 2)).toBeLessThanOrEqual(1);
    expect(zoomed.x + zoomed.width / 2).toBeCloseTo(normal.x + normal.width / 2, 0);
    expect(zoomed.y + zoomed.height / 2).toBeCloseTo(normal.y + normal.height / 2, 0);
  });
});

describe('scanner scheduling and acceptance', () => {
  it('adapts worker cadence within the 120–350 ms guardrails', () => {
    expect(getAdaptiveDecodeInterval(20)).toBe(120);
    expect(getAdaptiveDecodeInterval(100)).toBe(170);
    expect(getAdaptiveDecodeInterval(500)).toBe(350);
  });

  it('suppresses the same value for 1.5 seconds without blocking a different SKU', () => {
    const previous = { text: 'RN150P', at: 1_000 };
    expect(isDuplicateScan('RN150P', previous, 2_499)).toBe(true);
    expect(isDuplicateScan('RN150P', previous, 2_500)).toBe(false);
    expect(isDuplicateScan('BR220', previous, 1_050)).toBe(false);
  });

  it('rejects a decoder response from an obsolete camera session', () => {
    expect(isCurrentScannerSession(7, 8)).toBe(false);
    expect(isCurrentScannerSession(8, 8)).toBe(true);
  });
});

describe('scanner diagnostics and camera errors', () => {
  it('detects dark frames and preserves useful edge information', () => {
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 20, 20, 20, 255,
      0, 0, 0, 255, 20, 20, 20, 255,
    ]);
    const result = getFrameDiagnostics(data, 2, 2);
    expect(result.brightness).toBe(10);
    expect(result.sharpness).toBeGreaterThan(0);
  });

  it.each([
    ['NotAllowedError', 'permission-denied'],
    ['NotReadableError', 'camera-busy'],
    ['NotFoundError', 'camera-unavailable'],
    ['UnknownError', 'error'],
  ])('maps %s to a useful scanner state', (name, expected) => {
    expect(describeCameraError({ name }).status).toBe(expected);
  });
});
