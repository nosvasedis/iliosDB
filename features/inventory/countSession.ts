import {
  inventoryPostingIdentityKey,
  normalizeInventorySizeInfo,
} from './posting';
import type {
  InventoryAvailability,
  InventoryIdentity,
  InventoryPostingBalance,
  InventoryPostingInput,
  InventoryPostingResult,
} from './types';

export const INVENTORY_COUNT_SESSION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_INVENTORY_COUNT_BATCH_SIZE = 200;
export const MAX_INVENTORY_COUNT_BATCH_SIZE = 500;
export const MAX_INVENTORY_COUNT_TARGETS_PER_BATCH = 200;

export type InventoryCountSessionStatus = 'open' | 'completed';
export type InventoryCountEntryState = 'draft' | 'submitting' | 'posted' | 'failed';

export interface InventoryCountSessionEntry extends InventoryIdentity {
  quantityText: string;
  baselineOnHand: number | null;
  state: InventoryCountEntryState;
  postedQuantity: number | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface InventoryCountSessionDraft {
  schemaVersion: typeof INVENTORY_COUNT_SESSION_SCHEMA_VERSION;
  sessionId: string;
  title: string;
  reason: string;
  status: InventoryCountSessionStatus;
  activeWarehouseId: string | null;
  expectedIdentityCount: number;
  createdAt: string;
  updatedAt: string;
  entryOrder: string[];
  entriesByIdentity: Record<string, InventoryCountSessionEntry>;
}

export interface InventoryCountSessionDraftInput {
  sessionId: string;
  title?: string;
  reason?: string;
  activeWarehouseId?: string | null;
  expectedIdentityCount?: number;
  now?: string;
}

export interface InventoryCountDraftEntryInput extends InventoryIdentity {
  quantity: string | number | null | undefined;
  baselineOnHand?: number | null;
  updatedAt?: string;
}

/**
 * Compact storage tuple:
 * SKU, suffix, size, warehouse, quantity text, baseline, state,
 * posted quantity, error, updated timestamp.
 */
export type InventoryCountPersistedEntryV1 = [
  string,
  string,
  string,
  string,
  string,
  number | null,
  InventoryCountEntryState,
  number | null,
  string | null,
  string,
];

/**
 * Compact, versioned local persistence contract. Short internal keys keep a
 * 7,100-identity draft comfortably below normal browser storage limits.
 */
export interface InventoryCountSessionPersistedV1 {
  v: typeof INVENTORY_COUNT_SESSION_SCHEMA_VERSION;
  id: string;
  t: string;
  r: string;
  s: InventoryCountSessionStatus;
  w: string | null;
  n: number;
  c: string;
  u: string;
  e: InventoryCountPersistedEntryV1[];
}

export type InventoryCountQuantityResult =
  | { kind: 'blank'; quantity: null; canonicalText: '' }
  | { kind: 'valid'; quantity: number; canonicalText: string }
  | { kind: 'invalid'; quantity: null; canonicalText: string; message: string };

export interface InventoryCountProgress {
  total: number;
  counted: number;
  notCounted: number;
  posted: number;
  pending: number;
  failed: number;
  submitting: number;
  totalQuantity: number;
  countedPercentage: number;
  postedPercentage: number;
  label: string;
}

export interface InventoryCountBatch {
  batchNumber: number;
  totalBatches: number;
  identityKeys: string[];
  input: InventoryPostingInput;
}

export interface InventoryWarehousePatchDescriptor {
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
}

export interface InventoryTargetedAvailabilityMerge {
  rows: InventoryAvailability[];
  patchedIdentityKeys: string[];
  insertedIdentityKeys: string[];
}

function nowIso(now?: string): string {
  return now || new Date().toISOString();
}

function normalizeIdentity(identity: InventoryIdentity): InventoryIdentity {
  return {
    productSku: identity.productSku.trim().toLocaleUpperCase('el-GR'),
    variantSuffix: (identity.variantSuffix || '').trim().toLocaleUpperCase('el-GR'),
    sizeInfo: normalizeInventorySizeInfo(identity.sizeInfo),
    warehouseId: identity.warehouseId.trim(),
  };
}

function assertIdentity(identity: InventoryIdentity): void {
  if (!identity.productSku) {
    throw new Error('Δεν έχει επιλεγεί κωδικός είδους για τη γραμμή απογραφής.');
  }
  if (!identity.warehouseId) {
    throw new Error('Δεν έχει επιλεγεί αποθήκη για τη γραμμή απογραφής.');
  }
}

function quantityTextFromUnknown(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'number' ? String(value) : String(value).trim();
}

export function parseInventoryCountQuantity(
  value: string | number | null | undefined,
): InventoryCountQuantityResult {
  const raw = quantityTextFromUnknown(value);
  if (!raw) {
    return { kind: 'blank', quantity: null, canonicalText: '' };
  }

  const quantity = Number(raw.replace(',', '.'));
  if (!Number.isFinite(quantity) || !Number.isSafeInteger(quantity)) {
    return {
      kind: 'invalid',
      quantity: null,
      canonicalText: raw,
      message: 'Η ποσότητα πρέπει να είναι ακέραιος αριθμός τεμαχίων.',
    };
  }
  if (quantity < 0) {
    return {
      kind: 'invalid',
      quantity: null,
      canonicalText: raw,
      message: 'Η μετρημένη ποσότητα δεν μπορεί να είναι αρνητική.',
    };
  }
  return {
    kind: 'valid',
    quantity,
    canonicalText: String(quantity),
  };
}

export function createInventoryCountSessionDraft(
  input: InventoryCountSessionDraftInput,
): InventoryCountSessionDraft {
  const timestamp = nowIso(input.now);
  const sessionId = input.sessionId.trim();
  if (!sessionId) {
    throw new Error('Δεν ήταν δυνατή η δημιουργία συνεδρίας απογραφής χωρίς αναγνωριστικό.');
  }

  return {
    schemaVersion: INVENTORY_COUNT_SESSION_SCHEMA_VERSION,
    sessionId,
    title: input.title?.trim() || 'Συνεδρία Απογραφής',
    reason: input.reason?.trim() || 'Καταχώριση φυσικής απογραφής',
    status: 'open',
    activeWarehouseId: input.activeWarehouseId?.trim() || null,
    expectedIdentityCount: Math.max(0, Math.trunc(input.expectedIdentityCount || 0)),
    createdAt: timestamp,
    updatedAt: timestamp,
    entryOrder: [],
    entriesByIdentity: {},
  };
}

/**
 * Merges entries by normalized SKU/variant/size/warehouse identity.
 * Repeated identities are updated in place, so scanning the same item never
 * produces a duplicate posting line.
 *
 * The two containers are copied only once per call. This keeps a catalog-sized
 * 7,100-entry import linear instead of repeatedly cloning a growing draft.
 */
export function mergeInventoryCountDraftEntries(
  session: InventoryCountSessionDraft,
  inputs: InventoryCountDraftEntryInput[],
  now?: string,
): InventoryCountSessionDraft {
  const timestamp = nowIso(now);
  if (inputs.length === 0) return session;

  const entryOrder = [...session.entryOrder];
  const entriesByIdentity = { ...session.entriesByIdentity };
  let latestTimestamp = timestamp;

  inputs.forEach((input) => {
    const identity = normalizeIdentity(input);
    assertIdentity(identity);
    const identityKey = inventoryPostingIdentityKey(identity);
    const current = entriesByIdentity[identityKey];
    const parsed = parseInventoryCountQuantity(input.quantity);
    const quantityChanged = current?.quantityText !== parsed.canonicalText;
    const errorMessage = parsed.kind === 'invalid' ? parsed.message : null;
    const state: InventoryCountEntryState = errorMessage
      ? 'failed'
      : quantityChanged
        ? 'draft'
        : current?.state || 'draft';
    latestTimestamp = input.updatedAt || timestamp;

    entriesByIdentity[identityKey] = {
      ...identity,
      quantityText: parsed.canonicalText,
      baselineOnHand: input.baselineOnHand === undefined
        ? current?.baselineOnHand ?? null
        : input.baselineOnHand,
      state,
      postedQuantity: quantityChanged ? null : current?.postedQuantity ?? null,
      errorMessage,
      updatedAt: latestTimestamp,
    };
    if (!current) entryOrder.push(identityKey);
  });

  return {
    ...session,
    status: 'open',
    updatedAt: latestTimestamp,
    entryOrder,
    entriesByIdentity,
  };
}

export function removeInventoryCountDraftEntry(
  session: InventoryCountSessionDraft,
  identityKey: string,
  now?: string,
): InventoryCountSessionDraft {
  const entry = session.entriesByIdentity[identityKey];
  if (!entry) return session;
  if (entry.state === 'posted') {
    throw new Error(
      'Η γραμμή έχει ήδη καταχωριστεί και δεν μπορεί να αφαιρεθεί από τη συνεδρία απογραφής.',
    );
  }

  const entriesByIdentity = { ...session.entriesByIdentity };
  delete entriesByIdentity[identityKey];
  return {
    ...session,
    status: 'open',
    updatedAt: nowIso(now),
    entryOrder: session.entryOrder.filter((key) => key !== identityKey),
    entriesByIdentity,
  };
}

function entryQuantity(entry: InventoryCountSessionEntry): InventoryCountQuantityResult {
  return parseInventoryCountQuantity(entry.quantityText);
}

function greekProgressLabel(counted: number, total: number): string {
  if (total === 1) {
    return `${counted.toLocaleString('el-GR')} από 1 στόχο SKU ή παραλλαγής καταμετρήθηκε`;
  }
  return `${counted.toLocaleString('el-GR')} από ${total.toLocaleString('el-GR')} στόχους SKU ή παραλλαγής καταμετρήθηκαν`;
}

export function calculateInventoryCountProgress(
  session: InventoryCountSessionDraft,
): InventoryCountProgress {
  let totalQuantity = 0;
  const targets = new Map<string, {
    validLineCount: number;
    postedLineCount: number;
    failed: boolean;
    submitting: boolean;
  }>();

  session.entryOrder.forEach((identityKey) => {
    const entry = session.entriesByIdentity[identityKey];
    if (!entry) return;
    const parsed = entryQuantity(entry);
    const targetKey = `${entry.productSku}\u001f${entry.variantSuffix}`;
    const target = targets.get(targetKey) || {
      validLineCount: 0,
      postedLineCount: 0,
      failed: false,
      submitting: false,
    };
    if (parsed.kind !== 'valid') {
      target.failed ||= entry.state === 'failed';
      targets.set(targetKey, target);
      return;
    }
    target.validLineCount += 1;
    totalQuantity += parsed.quantity;
    if (entry.state === 'posted' && entry.postedQuantity === parsed.quantity) {
      target.postedLineCount += 1;
    }
    target.failed ||= entry.state === 'failed';
    target.submitting ||= entry.state === 'submitting';
    targets.set(targetKey, target);
  });

  const validTargets = [...targets.values()].filter((target) => target.validLineCount > 0);
  const counted = validTargets.length;
  const posted = validTargets.filter(
    (target) => target.postedLineCount === target.validLineCount,
  ).length;
  const failed = validTargets.filter((target) => target.failed).length;
  const submitting = validTargets.filter((target) => target.submitting).length;
  const normalizedTotal = Math.max(session.expectedIdentityCount, counted);
  const notCounted = Math.max(0, normalizedTotal - counted);
  const pending = Math.max(0, counted - posted);
  return {
    total: normalizedTotal,
    counted,
    notCounted,
    posted,
    pending,
    failed,
    submitting,
    totalQuantity,
    countedPercentage: normalizedTotal === 0 ? 0 : Math.round((counted / normalizedTotal) * 10_000) / 100,
    postedPercentage: normalizedTotal === 0 ? 0 : Math.round((posted / normalizedTotal) * 10_000) / 100,
    label: greekProgressLabel(counted, normalizedTotal),
  };
}

function hashText(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function batchIdempotencyKey(
  sessionId: string,
  identityKeys: string[],
  quantities: number[],
): string {
  const content = identityKeys
    .map((identityKey, index) => `${identityKey}=${quantities[index]}`)
    .join('|');
  return `inventory-count:${sessionId}:${hashText(content, 2166136261)}${hashText(content, 2246822519)}`;
}

function validatedBatchSize(batchSize?: number): number {
  const requested = batchSize ?? DEFAULT_INVENTORY_COUNT_BATCH_SIZE;
  if (!Number.isInteger(requested) || requested < 1 || requested > MAX_INVENTORY_COUNT_BATCH_SIZE) {
    throw new Error(
      `Κάθε παρτίδα απογραφής πρέπει να περιέχει από 1 έως ${MAX_INVENTORY_COUNT_BATCH_SIZE.toLocaleString('el-GR')} γραμμές.`,
    );
  }
  return requested;
}

/**
 * Produces bounded, deterministic posting payloads. Posted rows are excluded;
 * submitting rows remain retryable with the same idempotency key after reload.
 */
export function buildInventoryCountBatches(
  session: InventoryCountSessionDraft,
  batchSize?: number,
): InventoryCountBatch[] {
  const limit = validatedBatchSize(batchSize);
  const pendingGroups = new Map<string, Array<{
    identityKey: string;
    entry: InventoryCountSessionEntry;
    quantity: number;
  }>>();

  session.entryOrder.forEach((identityKey) => {
    const entry = session.entriesByIdentity[identityKey];
    if (!entry || entry.state === 'posted') return;
    const parsed = entryQuantity(entry);
    if (parsed.kind !== 'valid') return;
    const targetKey = `${entry.productSku}\u001f${entry.variantSuffix}`;
    const group = pendingGroups.get(targetKey) || [];
    group.push({
      identityKey,
      entry,
      quantity: parsed.quantity,
    });
    pendingGroups.set(targetKey, group);
  });

  const slices: Array<Array<{
    identityKey: string;
    entry: InventoryCountSessionEntry;
    quantity: number;
  }>> = [];
  let currentSlice: Array<{
    identityKey: string;
    entry: InventoryCountSessionEntry;
    quantity: number;
  }> = [];
  let currentTargetCount = 0;

  pendingGroups.forEach((group) => {
    if (group.length > limit) {
      throw new Error(
        `Ένα SKU ή παραλλαγή περιέχει ${group.length.toLocaleString('el-GR')} γραμμές καταμέτρησης και δεν χωρά σε ατομική παρτίδα ${limit.toLocaleString('el-GR')} γραμμών. Μειώστε τις θέσεις της συγκεκριμένης καταμέτρησης και δοκιμάστε ξανά.`,
      );
    }
    if (
      currentSlice.length > 0
      && (
        currentSlice.length + group.length > limit
        || currentTargetCount >= MAX_INVENTORY_COUNT_TARGETS_PER_BATCH
      )
    ) {
      slices.push(currentSlice);
      currentSlice = [];
      currentTargetCount = 0;
    }
    currentSlice.push(...group);
    currentTargetCount += 1;
  });
  if (currentSlice.length > 0) slices.push(currentSlice);

  const totalBatches = slices.length;
  return slices.map((slice, index) => {
    const identityKeys = slice.map((item) => item.identityKey);
    const quantities = slice.map((item) => item.quantity);
    return {
      batchNumber: index + 1,
      totalBatches,
      identityKeys,
      input: {
        mode: 'count',
        reason: session.reason,
        idempotencyKey: batchIdempotencyKey(session.sessionId, identityKeys, quantities),
        lines: slice.map(({ entry, quantity }) => ({
          productSku: entry.productSku,
          variantSuffix: entry.variantSuffix,
          sizeInfo: entry.sizeInfo,
          warehouseId: entry.warehouseId,
          quantity,
        })),
      },
    };
  });
}

function updateBatchEntries(
  session: InventoryCountSessionDraft,
  batch: InventoryCountBatch,
  update: (
    entry: InventoryCountSessionEntry,
    quantity: number,
  ) => InventoryCountSessionEntry,
  now?: string,
): InventoryCountSessionDraft {
  const timestamp = nowIso(now);
  const entriesByIdentity = { ...session.entriesByIdentity };
  let changed = false;

  batch.identityKeys.forEach((identityKey, index) => {
    const entry = entriesByIdentity[identityKey];
    const quantity = batch.input.lines[index]?.quantity;
    if (!entry || quantity === undefined) return;
    const parsed = entryQuantity(entry);
    // The operator may edit a quantity while a request is in flight. Never mark
    // that newer draft as posted by an older response.
    if (parsed.kind !== 'valid' || parsed.quantity !== quantity) return;
    entriesByIdentity[identityKey] = update(entry, quantity);
    changed = true;
  });

  if (!changed) return session;
  return {
    ...session,
    updatedAt: timestamp,
    entriesByIdentity,
  };
}

export function markInventoryCountBatchSubmitting(
  session: InventoryCountSessionDraft,
  batch: InventoryCountBatch,
  now?: string,
): InventoryCountSessionDraft {
  const timestamp = nowIso(now);
  return updateBatchEntries(session, batch, (entry) => ({
    ...entry,
    state: 'submitting',
    errorMessage: null,
    updatedAt: timestamp,
  }), timestamp);
}

export function applyInventoryCountBatchResult(
  session: InventoryCountSessionDraft,
  batch: InventoryCountBatch,
  result: InventoryPostingResult,
  now?: string,
): InventoryCountSessionDraft {
  const returnedKeys = new Set(result.balances.map((balance) => (
    inventoryPostingIdentityKey(normalizeIdentity(balance))
  )));
  const completeResult = result.postedCount === batch.input.lines.length
    && batch.identityKeys.every((identityKey) => returnedKeys.has(identityKey));
  if (!completeResult) {
    throw new Error(
      'Η επιβεβαίωση της παρτίδας απογραφής δεν ήταν πλήρης. Η συνεδρία παραμένει σε αναμονή και μπορεί να υποβληθεί ξανά με ασφάλεια.',
    );
  }

  const timestamp = nowIso(now);
  return updateBatchEntries(session, batch, (entry, quantity) => ({
    ...entry,
    state: 'posted',
    postedQuantity: quantity,
    errorMessage: null,
    updatedAt: timestamp,
  }), timestamp);
}

export function markInventoryCountBatchFailed(
  session: InventoryCountSessionDraft,
  batch: InventoryCountBatch,
  now?: string,
): InventoryCountSessionDraft {
  const timestamp = nowIso(now);
  const safeMessage = 'Η παρτίδα απογραφής δεν καταχωρίστηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.';
  return updateBatchEntries(session, batch, (entry) => ({
    ...entry,
    state: 'failed',
    errorMessage: safeMessage,
    updatedAt: timestamp,
  }), timestamp);
}

export function finalizeInventoryCountSession(
  session: InventoryCountSessionDraft,
  now?: string,
): InventoryCountSessionDraft {
  const progress = calculateInventoryCountProgress(session);
  if (progress.notCounted > 0) {
    throw new Error(
      `Η συνεδρία δεν μπορεί να ολοκληρωθεί. Απομένουν ${progress.notCounted.toLocaleString('el-GR')} μη καταμετρημένοι στόχοι SKU ή παραλλαγής.`,
    );
  }
  if (progress.pending > 0 || progress.failed > 0) {
    throw new Error(
      'Η συνεδρία δεν μπορεί να ολοκληρωθεί. Υπάρχουν SKU ή παραλλαγές με γραμμές που δεν έχουν καταχωριστεί επιτυχώς.',
    );
  }
  return {
    ...session,
    status: 'completed',
    updatedAt: nowIso(now),
  };
}

export function serializeInventoryCountSessionDraft(
  session: InventoryCountSessionDraft,
): string {
  const persisted: InventoryCountSessionPersistedV1 = {
    v: INVENTORY_COUNT_SESSION_SCHEMA_VERSION,
    id: session.sessionId,
    t: session.title,
    r: session.reason,
    s: session.status,
    w: session.activeWarehouseId,
    n: session.expectedIdentityCount,
    c: session.createdAt,
    u: session.updatedAt,
    e: session.entryOrder.flatMap((identityKey) => {
      const entry = session.entriesByIdentity[identityKey];
      if (!entry) return [];
      const tuple: InventoryCountPersistedEntryV1 = [
        entry.productSku,
        entry.variantSuffix,
        entry.sizeInfo,
        entry.warehouseId,
        entry.quantityText,
        entry.baselineOnHand,
        entry.state,
        entry.postedQuantity,
        entry.errorMessage,
        entry.updatedAt,
      ];
      return [tuple];
    }),
  };
  return JSON.stringify(persisted);
}

function invalidDraftError(): Error {
  return new Error(
    'Η αποθηκευμένη συνεδρία απογραφής δεν είναι έγκυρη και δεν μπορεί να ανακτηθεί με ασφάλεια.',
  );
}

export function parseInventoryCountSessionDraft(
  serialized: string,
): InventoryCountSessionDraft {
  let value: InventoryCountSessionPersistedV1;
  try {
    value = JSON.parse(serialized) as InventoryCountSessionPersistedV1;
  } catch {
    throw invalidDraftError();
  }
  if (
    !value
    || value.v !== INVENTORY_COUNT_SESSION_SCHEMA_VERSION
    || typeof value.id !== 'string'
    || typeof value.t !== 'string'
    || typeof value.r !== 'string'
    || (value.s !== 'open' && value.s !== 'completed')
    || typeof value.n !== 'number'
    || !Number.isInteger(value.n)
    || value.n < 0
    || typeof value.c !== 'string'
    || typeof value.u !== 'string'
    || !Array.isArray(value.e)
  ) {
    throw invalidDraftError();
  }

  const session = createInventoryCountSessionDraft({
    sessionId: value.id,
    title: value.t,
    reason: value.r,
    activeWarehouseId: value.w,
    expectedIdentityCount: value.n,
    now: value.c,
  });
  const entryOrder: string[] = [];
  const entriesByIdentity: Record<string, InventoryCountSessionEntry> = {};

  try {
    value.e.forEach((tuple) => {
      if (
        !Array.isArray(tuple)
        || tuple.length !== 10
        || typeof tuple[0] !== 'string'
        || typeof tuple[1] !== 'string'
        || typeof tuple[2] !== 'string'
        || typeof tuple[3] !== 'string'
        || typeof tuple[4] !== 'string'
        || (tuple[5] !== null && typeof tuple[5] !== 'number')
        || !['draft', 'submitting', 'posted', 'failed'].includes(tuple[6])
        || (tuple[7] !== null && typeof tuple[7] !== 'number')
        || (tuple[8] !== null && typeof tuple[8] !== 'string')
        || typeof tuple[9] !== 'string'
      ) {
        throw invalidDraftError();
      }
      const identity = normalizeIdentity({
        productSku: tuple[0],
        variantSuffix: tuple[1],
        sizeInfo: tuple[2],
        warehouseId: tuple[3],
      });
      assertIdentity(identity);
      const identityKey = inventoryPostingIdentityKey(identity);
      const entry: InventoryCountSessionEntry = {
        ...identity,
        quantityText: tuple[4],
        baselineOnHand: tuple[5],
        state: tuple[6],
        postedQuantity: tuple[7],
        errorMessage: tuple[8],
        updatedAt: tuple[9],
      };
      if (!entriesByIdentity[identityKey]) entryOrder.push(identityKey);
      entriesByIdentity[identityKey] = entry;
    });
  } catch {
    throw invalidDraftError();
  }

  return {
    ...session,
    status: value.s,
    updatedAt: value.u,
    entryOrder,
    entriesByIdentity,
  };
}

export function estimateInventoryCountDraftBytes(
  session: InventoryCountSessionDraft,
): number {
  return new TextEncoder().encode(serializeInventoryCountSessionDraft(session)).byteLength;
}

function validateTargetedBalance(balance: InventoryPostingBalance): void {
  if (
    !Number.isFinite(balance.onHand)
    || !Number.isFinite(balance.reserved)
    || !Number.isFinite(balance.available)
    || balance.onHand < 0
    || balance.reserved < 0
    || balance.reserved > balance.onHand
  ) {
    throw new Error(
      'Η επιβεβαίωση αποθέματος επέστρεψε μη έγκυρο υπόλοιπο. Η τοπική προβολή δεν μεταβλήθηκε.',
    );
  }
}

/**
 * Applies only the balances returned by the posting RPC. Unrelated row object
 * references are preserved, avoiding a full 7,100-row download and rerender.
 */
export function mergeInventoryCountTargetedAvailability(
  currentRows: InventoryAvailability[],
  balances: InventoryPostingBalance[],
  warehouses: InventoryWarehousePatchDescriptor[] = [],
  updatedAt?: string,
): InventoryTargetedAvailabilityMerge {
  const timestamp = nowIso(updatedAt);
  const descriptorById = new Map(warehouses.map((warehouse) => [
    warehouse.warehouseId,
    warehouse,
  ]));
  const patchByKey = new Map<string, InventoryPostingBalance>();

  balances.forEach((rawBalance) => {
    validateTargetedBalance(rawBalance);
    const balance = {
      ...rawBalance,
      ...normalizeIdentity(rawBalance),
    };
    assertIdentity(balance);
    patchByKey.set(inventoryPostingIdentityKey(balance), balance);
  });

  const patchedIdentityKeys: string[] = [];
  const matched = new Set<string>();
  const rows = currentRows.map((row) => {
    const identityKey = inventoryPostingIdentityKey(row);
    const balance = patchByKey.get(identityKey);
    if (!balance) return row;
    matched.add(identityKey);
    patchedIdentityKeys.push(identityKey);
    const available = balance.onHand - balance.reserved;
    return {
      ...row,
      onHand: balance.onHand,
      reserved: balance.reserved,
      available,
      projectedAvailable: available + row.incoming - row.outstandingDemand,
      updatedAt: timestamp,
    };
  });

  const insertedIdentityKeys: string[] = [];
  patchByKey.forEach((balance, identityKey) => {
    if (matched.has(identityKey)) return;
    const descriptor = descriptorById.get(balance.warehouseId);
    insertedIdentityKeys.push(identityKey);
    patchedIdentityKeys.push(identityKey);
    const available = balance.onHand - balance.reserved;
    rows.push({
      productSku: balance.productSku,
      variantSuffix: balance.variantSuffix,
      sizeInfo: balance.sizeInfo,
      warehouseId: balance.warehouseId,
      warehouseName: descriptor?.warehouseName || 'Μη κατονομασμένη αποθήκη',
      warehouseType: descriptor?.warehouseType || 'custom',
      onHand: balance.onHand,
      reserved: balance.reserved,
      available,
      incoming: 0,
      outstandingDemand: 0,
      productionDemand: 0,
      purchaseDemand: 0,
      projectedAvailable: available,
      reorderPoint: 0,
      preferredSupplierId: null,
      updatedAt: timestamp,
    });
  });

  return {
    rows,
    patchedIdentityKeys,
    insertedIdentityKeys,
  };
}
