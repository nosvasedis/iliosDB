import { describe, expect, it } from 'vitest';
import {
  calculateInventoryCountProgress,
  createInventoryCountSessionDraft,
  createInventoryCountSessionDraftFromServer,
  finalizeInventoryCountSession,
  getInventoryOperationCategory,
  getInventoryOperationLabel,
  markInventoryCountBatchFailed,
  buildInventoryCountBatches,
  mergeInventoryCountDraftEntries,
  mergeServerPostedCountEntries,
  repairGreekMojibake,
} from '../../features/inventory';

const WAREHOUSE = '00000000-0000-0000-0000-000000000001';

const WINDOWS_1253_PUNCTUATION: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x89: '‰',
  0x8b: '‹', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x99: '™', 0x9b: '›', 0xa1: '΅', 0xa2: 'Ά', 0xaf: '―', 0xb4: '΄',
};

/** Reproduces the server-side corruption: UTF-8 bytes read as Windows-1253. */
function toMojibake(text: string): string {
  return Array.from(new TextEncoder().encode(text), (byte) => {
    if (byte < 0x80) return String.fromCharCode(byte);
    if (WINDOWS_1253_PUNCTUATION[byte]) return WINDOWS_1253_PUNCTUATION[byte];
    if (byte >= 0xb8 && byte !== 0xbb && byte !== 0xbd) return String.fromCodePoint(0x0388 + byte - 0xb8);
    return String.fromCharCode(byte);
  }).join('');
}

describe('repairGreekMojibake', () => {
  it('restores Greek stored as UTF-8 decoded through Windows-1253', () => {
    for (const original of [
      'Ανακατανομή αποθέματος μετά από μεταβολή παραγγελίας.',
      'Αυτόματη δέσμευση κατά την αποθήκευση παραγγελίας.',
      'Ακύρωση κίνησης: ΈΛΕΓΧΟΣ · Μέγεθος 52',
    ]) {
      const garbled = toMojibake(original);
      expect(garbled).not.toBe(original);
      expect(repairGreekMojibake(garbled)).toBe(original);
    }
  });

  it('leaves correct Greek, Latin and empty text untouched', () => {
    expect(repairGreekMojibake('Αρχική φυσική απογραφή 23/07/2026')).toBe('Αρχική φυσική απογραφή 23/07/2026');
    expect(repairGreekMojibake('Stock count')).toBe('Stock count');
    expect(repairGreekMojibake(null)).toBe('');
  });
});

describe('workflow operation labels', () => {
  it('labels consignment and repair movements in Greek', () => {
    expect(getInventoryOperationLabel('consignment_handoff_out')).toBe('Παράδοση σε Παρακαταθήκη · εξαγωγή');
    expect(getInventoryOperationLabel('consignment_handoff_in')).toBe('Παράδοση σε Παρακαταθήκη · εισαγωγή');
    expect(getInventoryOperationLabel('consignment_sale')).toBe('Πώληση από Παρακαταθήκη');
    expect(getInventoryOperationLabel('repair_consumption')).toBe('Ανάλωση υλικού επισκευής');
    expect(getInventoryOperationLabel('unknown_thing')).toBe('Κίνηση αποθέματος');
  });

  it('groups operations into history filter categories', () => {
    expect(getInventoryOperationCategory('stock_count')).toBe('count');
    expect(getInventoryOperationCategory('transfer_in')).toBe('transfer');
    expect(getInventoryOperationCategory('consignment_return_out')).toBe('consignment');
    expect(getInventoryOperationCategory('shipment_issue')).toBe('shipment');
    expect(getInventoryOperationCategory('movement_reversal')).toBe('reversal');
  });
});

describe('count session recovery', () => {
  const baseDraft = () => mergeInventoryCountDraftEntries(
    createInventoryCountSessionDraft({ sessionId: 's1', activeWarehouseId: WAREHOUSE, expectedIdentityCount: 10 }),
    [
      { productSku: 'DA100', variantSuffix: 'P', sizeInfo: '52', warehouseId: WAREHOUSE, quantity: '3' },
      { productSku: 'DA100', variantSuffix: 'P', sizeInfo: '54', warehouseId: WAREHOUSE, quantity: '0' },
      { productSku: 'XR200', variantSuffix: '', sizeInfo: '', warehouseId: WAREHOUSE, quantity: '7' },
    ],
  );

  it('marks lines the server already posted as posted, so they are never retried', () => {
    const merged = mergeServerPostedCountEntries(baseDraft(), [
      { productSku: 'DA100', variantSuffix: 'P', sizeInfo: '52', warehouseId: WAREHOUSE, countedQuantity: 3, onHandBefore: 1, countedAt: '2026-10-16T10:00:00Z' },
      { productSku: 'DA100', variantSuffix: 'P', sizeInfo: '54', warehouseId: WAREHOUSE, countedQuantity: 0, onHandBefore: 0, countedAt: '2026-10-16T10:00:00Z' },
    ]);
    const batches = buildInventoryCountBatches(merged);
    expect(batches).toHaveLength(1);
    expect(batches[0].input.lines.map((line) => line.productSku)).toEqual(['XR200']);
    expect(calculateInventoryCountProgress(merged).posted).toBe(1);
  });

  it('flags local lines of an already-finalized target instead of resubmitting them', () => {
    const merged = mergeServerPostedCountEntries(baseDraft(), [
      { productSku: 'DA100', variantSuffix: 'P', sizeInfo: '52', warehouseId: WAREHOUSE, countedQuantity: 3, onHandBefore: 1, countedAt: '2026-10-16T10:00:00Z' },
    ]);
    const orphan = Object.values(merged.entriesByIdentity).find((entry) => entry.sizeInfo === '54');
    expect(orphan?.state).toBe('failed');
    expect(orphan?.errorMessage).toContain('ήδη οριστικοποιηθεί');
  });

  it('rebuilds a draft for a session started on another device', () => {
    const draft = createInventoryCountSessionDraftFromServer(
      { sessionId: 's2', title: 'Απογραφή', reason: 'Ετήσια', activeWarehouseId: WAREHOUSE, expectedIdentityCount: 5 },
      [{ productSku: 'XR200', variantSuffix: '', sizeInfo: '', warehouseId: WAREHOUSE, countedQuantity: 4, onHandBefore: 2, countedAt: '2026-10-16T10:00:00Z' }],
    );
    expect(draft.sessionId).toBe('s2');
    expect(calculateInventoryCountProgress(draft)).toMatchObject({ counted: 1, posted: 1, notCounted: 4 });
  });

  it('allows explicit partial completion only when every counted line is posted', () => {
    const posted = mergeServerPostedCountEntries(
      createInventoryCountSessionDraft({ sessionId: 's3', expectedIdentityCount: 10 }),
      [{ productSku: 'XR200', variantSuffix: '', sizeInfo: '', warehouseId: WAREHOUSE, countedQuantity: 4, onHandBefore: 2, countedAt: '2026-10-16T10:00:00Z' }],
    );
    expect(() => finalizeInventoryCountSession(posted)).toThrow();
    expect(finalizeInventoryCountSession(posted, undefined, true).status).toBe('completed');
    expect(() => finalizeInventoryCountSession(baseDraft(), undefined, true)).toThrow();
  });

  it('keeps the server error message on a failed batch', () => {
    const draft = baseDraft();
    const [batch] = buildInventoryCountBatches(draft);
    const failed = markInventoryCountBatchFailed(draft, batch, undefined, 'Παραλείφθηκε υφιστάμενο μέγεθος.');
    expect(Object.values(failed.entriesByIdentity).every((entry) => entry.errorMessage === 'Παραλείφθηκε υφιστάμενο μέγεθος.')).toBe(true);
  });
});
