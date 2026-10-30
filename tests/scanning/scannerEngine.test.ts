import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCAN_LOCK,
  SCAN_LOCK_TIMING,
  computeObjectCoverCrop,
  describeCameraError,
  expireScanLock,
  getAdaptiveDecodeInterval,
  getFrameDiagnostics,
  isCurrentScannerSession,
  isDuplicateScan,
  mapVideoPointToViewport,
  observeScanLock,
  pickAimedCandidate,
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

describe('aim-and-hold scan gating', () => {
  it('maps a source-video point back onto the viewport it was cropped from', () => {
    const mapping = { videoWidth: 1920, videoHeight: 1080, viewportWidth: 1000, viewportHeight: 1000, digitalZoom: 1.5 };
    const crop = computeObjectCoverCrop({ ...mapping, target: { x: 400, y: 300, width: 100, height: 100 }, paddingRatio: 0 });
    const centre = mapVideoPointToViewport({ x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }, mapping);
    expect(centre.x).toBeCloseTo(450, -1);
    expect(centre.y).toBeCloseTo(350, -1);
  });

  it('ignores neighbouring labels and picks the code under the aim circle', () => {
    const aim = { x: 200, y: 200, radius: 60 };
    const candidates = [
      { text: 'LEFT', x: 90, y: 200, size: 50 },
      { text: 'AIMED', x: 215, y: 190, size: 50 },
      { text: 'EDGE', x: 250, y: 200, size: 50 },
    ];
    expect(pickAimedCandidate(candidates, aim)?.text).toBe('AIMED');
    expect(pickAimedCandidate([candidates[0]], aim)).toBeNull();
  });

  const holdFor = (text: string, from: number, until: number, state = EMPTY_SCAN_LOCK) => {
    let result = observeScanLock(state, text, from);
    for (let now = from + 100; now <= until && !result.confirmed; now += 100) {
      result = observeScanLock(result.state, text, now);
    }
    return result;
  };

  it('only confirms a code after it has been held for the dwell with repeated decodes', () => {
    const almost = holdFor('RN150P', 1_000, 1_000 + SCAN_LOCK_TIMING.dwellMs - 60);
    expect(almost.confirmed).toBe(false);
    expect(almost.progress).toBeGreaterThan(0.5);
    const held = holdFor('RN150P', 1_000, 1_000 + SCAN_LOCK_TIMING.dwellMs + 100);
    expect(held.confirmed).toBe(true);
  });

  it('does not confirm when decodes stop for longer than the grace window', () => {
    const first = observeScanLock(EMPTY_SCAN_LOCK, 'RN150P', 1_000);
    const late = observeScanLock(first.state, 'RN150P', 1_000 + SCAN_LOCK_TIMING.dwellMs);
    expect(late.confirmed).toBe(false);
    expect(late.state.startedAt).toBe(1_000 + SCAN_LOCK_TIMING.dwellMs);
  });

  it('restarts the dwell when the aim slides onto a different code', () => {
    const first = observeScanLock(EMPTY_SCAN_LOCK, 'BR220', 1_000);
    const switched = observeScanLock(first.state, 'RN150P', 1_000 + SCAN_LOCK_TIMING.dwellMs);
    expect(switched.confirmed).toBe(false);
    expect(switched.state.text).toBe('RN150P');
    expect(switched.state.startedAt).toBe(1_000 + SCAN_LOCK_TIMING.dwellMs);
  });

  it('drops a lock after the grace window and blocks re-accepting until the code is released', () => {
    const started = observeScanLock(EMPTY_SCAN_LOCK, 'RN150P', 1_000).state;
    expect(expireScanLock(started, 1_000 + SCAN_LOCK_TIMING.graceMs + 1).text).toBeNull();

    const held = holdFor('RN150P', 1_000, 3_000);
    expect(held.confirmed).toBe(true);
    const acceptedAt = held.state.releaseSeenAt;
    const stillThere = observeScanLock(held.state, 'RN150P', acceptedAt + 200);
    expect(stillThere.confirmed).toBe(false);
    expect(stillThere.progress).toBe(0);
    const released = expireScanLock(stillThere.state, acceptedAt + 200 + SCAN_LOCK_TIMING.releaseMs + 1);
    expect(released.releaseText).toBeNull();
  });
});
