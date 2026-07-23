import { describe, expect, it } from 'vitest';
import type {
  InventoryAvailability,
  InventoryPostingResult,
} from '../../features/inventory/types';
import {
  applyInventoryCountBatchResult,
  buildInventoryCountBatches,
  calculateInventoryCountProgress,
  createInventoryCountSessionDraft,
  estimateInventoryCountDraftBytes,
  finalizeInventoryCountSession,
  markInventoryCountBatchFailed,
  markInventoryCountBatchSubmitting,
  mergeInventoryCountDraftEntries,
  mergeInventoryCountTargetedAvailability,
  parseInventoryCountQuantity,
  parseInventoryCountSessionDraft,
  removeInventoryCountDraftEntry,
  serializeInventoryCountSessionDraft,
} from '../../features/inventory/countSession';

const NOW = '2026-07-23T10:00:00.000Z';
const LATER = '2026-07-23T10:05:00.000Z';

function createSession(expectedIdentityCount = 0) {
  return createInventoryCountSessionDraft({
    sessionId: 'session-7100',
    expectedIdentityCount,
    activeWarehouseId: 'central',
    now: NOW,
  });
}

function draftEntry(index: number, quantity: string | number | null = '1') {
  return {
    productSku: `SKU${String(index).padStart(4, '0')}`,
    variantSuffix: 'X',
    sizeInfo: '',
    warehouseId: 'central',
    quantity,
    baselineOnHand: 0,
  };
}

function postingResult(
  balances: InventoryPostingResult['balances'] = [],
): InventoryPostingResult {
  return {
    postedCount: balances.length,
    changedCount: balances.length,
    countedZeroCount: balances.filter((balance) => balance.onHand === 0).length,
    idempotent: false,
    balances,
  };
}

function postingResultForBatch(
  batch: ReturnType<typeof buildInventoryCountBatches>[number],
): InventoryPostingResult {
  return postingResult(batch.input.lines.map((line) => ({
    ...line,
    onHand: line.quantity,
    reserved: 0,
    available: line.quantity,
  })));
}

function availability(
  overrides: Partial<InventoryAvailability> = {},
): InventoryAvailability {
  return {
    productSku: 'KL201',
    variantSuffix: 'X',
    sizeInfo: '',
    warehouseId: 'central',
    warehouseName: 'Κεντρική Αποθήκη',
    warehouseType: 'Central',
    onHand: 0,
    reserved: 0,
    available: 0,
    incoming: 1,
    outstandingDemand: 0,
    productionDemand: 0,
    purchaseDemand: 0,
    projectedAvailable: 1,
    reorderPoint: 0,
    preferredSupplierId: null,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('Συνεδρία Απογραφής', () => {
  it('distinguishes an uncounted blank from an explicit counted zero', () => {
    expect(parseInventoryCountQuantity('')).toEqual({
      kind: 'blank',
      quantity: null,
      canonicalText: '',
    });
    expect(parseInventoryCountQuantity('  ')).toEqual({
      kind: 'blank',
      quantity: null,
      canonicalText: '',
    });
    expect(parseInventoryCountQuantity('0')).toEqual({
      kind: 'valid',
      quantity: 0,
      canonicalText: '0',
    });
    expect(parseInventoryCountQuantity(0)).toEqual({
      kind: 'valid',
      quantity: 0,
      canonicalText: '0',
    });
  });

  it('returns professional Greek validation without exposing technical text', () => {
    expect(parseInventoryCountQuantity('-1')).toMatchObject({
      kind: 'invalid',
      message: 'Η μετρημένη ποσότητα δεν μπορεί να είναι αρνητική.',
    });
    expect(parseInventoryCountQuantity('2,5')).toMatchObject({
      kind: 'invalid',
      message: 'Η ποσότητα πρέπει να είναι ακέραιος αριθμός τεμαχίων.',
    });
  });

  it('merges normalized duplicate identities in place with last input winning', () => {
    const session = mergeInventoryCountDraftEntries(createSession(), [
      {
        productSku: ' kl201 ',
        variantSuffix: 'x',
        sizeInfo: '19CM',
        warehouseId: 'central',
        quantity: '1',
      },
      {
        productSku: 'KL201',
        variantSuffix: 'X',
        sizeInfo: '19 cm',
        warehouseId: 'central',
        quantity: '2',
      },
    ], NOW);

    expect(session.entryOrder).toHaveLength(1);
    expect(Object.values(session.entriesByIdentity)).toEqual([
      expect.objectContaining({
        productSku: 'KL201',
        variantSuffix: 'X',
        sizeInfo: '19cm',
        quantityText: '2',
      }),
    ]);
  });

  it('counts explicit zero as measured and blank as not measured', () => {
    const session = mergeInventoryCountDraftEntries(createSession(4), [
      draftEntry(1, ''),
      draftEntry(2, '0'),
      draftEntry(3, '3'),
    ], NOW);

    expect(calculateInventoryCountProgress(session)).toEqual({
      total: 4,
      counted: 2,
      notCounted: 2,
      posted: 0,
      pending: 2,
      failed: 0,
      submitting: 0,
      totalQuantity: 3,
      countedPercentage: 50,
      postedPercentage: 0,
      label: '2 από 4 στόχους SKU ή παραλλαγής καταμετρήθηκαν',
    });
  });

  it('removes an unposted draft identity without disturbing the remaining order', () => {
    const session = mergeInventoryCountDraftEntries(createSession(2), [
      draftEntry(1, 1),
      draftEntry(2, 2),
    ], NOW);
    const removedKey = session.entryOrder[0];
    const remainingKey = session.entryOrder[1];
    const updated = removeInventoryCountDraftEntry(session, removedKey, LATER);

    expect(updated.entryOrder).toEqual([remainingKey]);
    expect(updated.entriesByIdentity[removedKey]).toBeUndefined();
    expect(updated.entriesByIdentity[remainingKey]).toBe(session.entriesByIdentity[remainingKey]);
    expect(session.entryOrder).toHaveLength(2);
  });

  it('creates 36 bounded atomic batches for 7,100 variants', () => {
    const entries = Array.from({ length: 7_100 }, (_, index) => draftEntry(index, index % 4));
    const session = mergeInventoryCountDraftEntries(createSession(7_100), entries, NOW);
    const batches = buildInventoryCountBatches(session);

    expect(batches).toHaveLength(36);
    expect(batches.slice(0, -1).every((batch) => batch.input.lines.length === 200)).toBe(true);
    expect(batches.at(-1)?.input.lines).toHaveLength(100);
    expect(batches[0].input.mode).toBe('count');
    expect(batches[0].input.reason).toBe('Καταχώριση φυσικής απογραφής');
    expect(new Set(batches.flatMap((batch) => batch.identityKeys))).toHaveLength(7_100);
  });

  it('uses stable idempotency keys for retries and changes the key when content changes', () => {
    const session = mergeInventoryCountDraftEntries(createSession(2), [
      draftEntry(1, 1),
      draftEntry(2, 2),
    ], NOW);
    const first = buildInventoryCountBatches(session, 2)[0];
    const retry = buildInventoryCountBatches(session, 2)[0];
    const changed = mergeInventoryCountDraftEntries(session, [draftEntry(2, 3)], LATER);
    const changedBatch = buildInventoryCountBatches(changed, 2)[0];

    expect(first.input.idempotencyKey).toBe(retry.input.idempotencyKey);
    expect(changedBatch.input.idempotencyKey).not.toBe(first.input.idempotencyKey);
  });

  it('keeps every size of one variant in the same atomic batch', () => {
    const session = mergeInventoryCountDraftEntries(createSession(3), [
      draftEntry(1, 1),
      {
        ...draftEntry(2, 2),
        productSku: 'RING1',
        sizeInfo: '52',
      },
      {
        ...draftEntry(2, 3),
        productSku: 'RING1',
        sizeInfo: '54',
      },
      draftEntry(3, 4),
    ], NOW);

    const batches = buildInventoryCountBatches(session, 2);
    const ringBatch = batches.find((batch) => (
      batch.input.lines.some((line) => line.productSku === 'RING1')
    ));

    expect(ringBatch?.input.lines.filter((line) => line.productSku === 'RING1')).toHaveLength(2);
    expect(batches.filter((batch) => (
      batch.input.lines.some((line) => line.productSku === 'RING1')
    ))).toHaveLength(1);
    expect(calculateInventoryCountProgress(session).counted).toBe(3);
  });

  it('keeps submitting batches safely retryable after persistence and reload', () => {
    const original = mergeInventoryCountDraftEntries(createSession(1), [draftEntry(1, 2)], NOW);
    const batch = buildInventoryCountBatches(original)[0];
    const submitting = markInventoryCountBatchSubmitting(original, batch, LATER);
    const restored = parseInventoryCountSessionDraft(
      serializeInventoryCountSessionDraft(submitting),
    );
    const retry = buildInventoryCountBatches(restored)[0];

    expect(Object.values(restored.entriesByIdentity)[0].state).toBe('submitting');
    expect(retry.input.idempotencyKey).toBe(batch.input.idempotencyKey);
  });

  it('does not mark a newer operator edit as posted by an older in-flight response', () => {
    const original = mergeInventoryCountDraftEntries(createSession(1), [draftEntry(1, 2)], NOW);
    const batch = buildInventoryCountBatches(original)[0];
    const edited = mergeInventoryCountDraftEntries(original, [draftEntry(1, 5)], LATER);
    const afterOldResponse = applyInventoryCountBatchResult(
      edited,
      batch,
      postingResultForBatch(batch),
      '2026-07-23T10:06:00.000Z',
    );

    expect(Object.values(afterOldResponse.entriesByIdentity)[0]).toMatchObject({
      quantityText: '5',
      state: 'draft',
      postedQuantity: null,
    });
  });

  it('marks an atomic batch posted and allows completion only after every line succeeds', () => {
    const original = mergeInventoryCountDraftEntries(createSession(2), [
      draftEntry(1, 0),
      draftEntry(2, 3),
    ], NOW);
    const batch = buildInventoryCountBatches(original)[0];
    const posted = applyInventoryCountBatchResult(
      original,
      batch,
      postingResultForBatch(batch),
      LATER,
    );
    const complete = finalizeInventoryCountSession(posted, '2026-07-23T10:07:00.000Z');

    expect(calculateInventoryCountProgress(posted)).toMatchObject({
      counted: 2,
      posted: 2,
      pending: 0,
    });
    expect(complete.status).toBe('completed');
  });

  it('does not remove a line that has already been posted', () => {
    const session = mergeInventoryCountDraftEntries(createSession(1), [draftEntry(1, 2)], NOW);
    const batch = buildInventoryCountBatches(session)[0];
    const posted = applyInventoryCountBatchResult(
      session,
      batch,
      postingResultForBatch(batch),
      LATER,
    );

    expect(() => removeInventoryCountDraftEntry(
      posted,
      posted.entryOrder[0],
    )).toThrow(
      'Η γραμμή έχει ήδη καταχωριστεί και δεν μπορεί να αφαιρεθεί από τη συνεδρία απογραφής.',
    );
    expect(posted.entryOrder).toHaveLength(1);
  });

  it('keeps a batch pending when the targeted confirmation is incomplete', () => {
    const session = mergeInventoryCountDraftEntries(createSession(1), [draftEntry(1, 2)], NOW);
    const batch = buildInventoryCountBatches(session)[0];

    expect(() => applyInventoryCountBatchResult(
      session,
      batch,
      postingResult(),
      LATER,
    )).toThrow(
      'Η επιβεβαίωση της παρτίδας απογραφής δεν ήταν πλήρης. Η συνεδρία παραμένει σε αναμονή και μπορεί να υποβληθεί ξανά με ασφάλεια.',
    );
    expect(Object.values(session.entriesByIdentity)[0].state).toBe('draft');
  });

  it('prevents completion while blank lines remain', () => {
    const incomplete = mergeInventoryCountDraftEntries(createSession(2), [
      draftEntry(1, 0),
      draftEntry(2, ''),
    ], NOW);

    expect(() => finalizeInventoryCountSession(incomplete)).toThrow(
      'Η συνεδρία δεν μπορεί να ολοκληρωθεί. Απομένουν 1 μη καταμετρημένοι στόχοι SKU ή παραλλαγής.',
    );
  });

  it('stores only safe Greek failure feedback and never a raw backend error', () => {
    const session = mergeInventoryCountDraftEntries(createSession(1), [draftEntry(1, 1)], NOW);
    const batch = buildInventoryCountBatches(session)[0];
    const failed = markInventoryCountBatchFailed(session, batch, LATER);
    const message = Object.values(failed.entriesByIdentity)[0].errorMessage;

    expect(message).toBe(
      'Η παρτίδα απογραφής δεν καταχωρίστηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.',
    );
    expect(message).not.toMatch(/database|rpc|exception|stack/i);
  });

  it('round-trips a compact 7,100-variant draft below two megabytes', () => {
    const session = mergeInventoryCountDraftEntries(
      createSession(7_100),
      Array.from({ length: 7_100 }, (_, index) => draftEntry(index, index % 3)),
      NOW,
    );
    const serialized = serializeInventoryCountSessionDraft(session);
    const restored = parseInventoryCountSessionDraft(serialized);

    expect(restored.entryOrder).toHaveLength(7_100);
    expect(calculateInventoryCountProgress(restored).counted).toBe(7_100);
    expect(estimateInventoryCountDraftBytes(session)).toBeLessThan(2_000_000);
  });

  it('rejects corrupt persisted data with one safe Greek message', () => {
    expect(() => parseInventoryCountSessionDraft('not-json')).toThrow(
      'Η αποθηκευμένη συνεδρία απογραφής δεν είναι έγκυρη και δεν μπορεί να ανακτηθεί με ασφάλεια.',
    );
    expect(() => parseInventoryCountSessionDraft('{"v":99}')).toThrow(
      'Η αποθηκευμένη συνεδρία απογραφής δεν είναι έγκυρη και δεν μπορεί να ανακτηθεί με ασφάλεια.',
    );
  });

  it('patches KL201X from 0 to 2 without replacing unrelated availability rows', () => {
    const kl201 = availability();
    const unrelated = availability({
      productSku: 'OTHER',
      variantSuffix: 'D',
      onHand: 7,
      available: 7,
      projectedAvailable: 8,
    });
    const merged = mergeInventoryCountTargetedAvailability(
      [kl201, unrelated],
      [{
        productSku: 'KL201',
        variantSuffix: 'X',
        sizeInfo: '',
        warehouseId: 'central',
        onHand: 2,
        reserved: 0,
        available: 2,
      }],
      [],
      LATER,
    );

    expect(merged.rows[0]).toMatchObject({
      productSku: 'KL201',
      variantSuffix: 'X',
      onHand: 2,
      reserved: 0,
      available: 2,
      projectedAvailable: 3,
      updatedAt: LATER,
    });
    expect(merged.rows[1]).toBe(unrelated);
    expect(kl201.onHand).toBe(0);
    expect(merged.patchedIdentityKeys).toHaveLength(1);
    expect(merged.insertedIdentityKeys).toEqual([]);
  });

  it('inserts a newly counted size row from a targeted response', () => {
    const merged = mergeInventoryCountTargetedAvailability(
      [],
      [{
        productSku: 'DA100',
        variantSuffix: 'X',
        sizeInfo: '54',
        warehouseId: 'showroom',
        onHand: 1,
        reserved: 0,
        available: 1,
      }],
      [{
        warehouseId: 'showroom',
        warehouseName: 'Δειγματολόγιο',
        warehouseType: 'Showroom',
      }],
      LATER,
    );

    expect(merged.rows).toEqual([
      expect.objectContaining({
        productSku: 'DA100',
        variantSuffix: 'X',
        sizeInfo: '54',
        warehouseId: 'showroom',
        warehouseName: 'Δειγματολόγιο',
        onHand: 1,
        available: 1,
      }),
    ]);
    expect(merged.insertedIdentityKeys).toHaveLength(1);
  });

  it('rejects an impossible targeted balance without changing current rows', () => {
    const current = [availability()];
    expect(() => mergeInventoryCountTargetedAvailability(current, [{
      productSku: 'KL201',
      variantSuffix: 'X',
      sizeInfo: '',
      warehouseId: 'central',
      onHand: 1,
      reserved: 2,
      available: -1,
    }])).toThrow(
      'Η επιβεβαίωση αποθέματος επέστρεψε μη έγκυρο υπόλοιπο. Η τοπική προβολή δεν μεταβλήθηκε.',
    );
    expect(current[0].onHand).toBe(0);
  });
});
