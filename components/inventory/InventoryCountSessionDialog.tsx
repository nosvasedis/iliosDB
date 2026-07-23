import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Pause,
  Plus,
  ScanBarcode,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import type { Product, Warehouse } from '../../types';
import type {
  InventoryAvailability,
  InventoryCountBatch,
  InventoryCountSessionDraft,
  InventoryCountSessionEntry,
  InventoryPostingBalance,
  InventoryPostingLine,
  InventoryPostingResult,
} from '../../features/inventory';
import {
  applyInventoryCountBatchResult,
  buildInventoryCountBatches,
  calculateInventoryCountProgress,
  createInventoryCountSessionDraft,
  finalizeInventoryCountSession,
  formatInventoryDateTime,
  formatInventoryInteger,
  inventoryPostingIdentityKey,
  markInventoryCountBatchFailed,
  markInventoryCountBatchSubmitting,
  mergeInventoryCountDraftEntries,
  normalizeInventorySizeInfo,
  parseInventoryCountSessionDraft,
  removeInventoryCountDraftEntry,
  serializeInventoryCountSessionDraft,
} from '../../features/inventory';
import type { SkuPickerOption } from '../../utils/skuProductPicker';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useUI } from '../UIProvider';
import SkuColorizedText from '../SkuColorizedText';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';
import InventoryPostingDialog from './InventoryPostingDialog';

type EntryFilter = 'all' | 'pending' | 'posted' | 'failed';
type SubmissionKind = 'next' | 'all' | 'complete' | null;

export interface InventoryCountSessionDialogProps {
  products: Product[];
  warehouses: Warehouse[];
  availability: InventoryAvailability[];
  profileId?: string;
  expectedIdentityCount: number;
  initialSelection?: SkuPickerOption | null;
  scannedSelection?: SkuPickerOption | null;
  onRequestScan: () => void;
  onConsumeScannedSelection: () => void;
  onStart: (input: {
    clientSessionId: string;
    title: string;
    reason: string;
    warehouseId: string;
  }) => Promise<{ sessionId: string; totalTargetCount: number }>;
  onPostBatch: (
    sessionId: string,
    batch: InventoryCountBatch,
  ) => Promise<InventoryPostingResult>;
  onApplyBalances: (balances: InventoryPostingBalance[]) => Promise<void> | void;
  onComplete: (session: InventoryCountSessionDraft) => Promise<void> | void;
  onClose: () => void;
}

interface SessionEntryView {
  identityKey: string;
  entry: InventoryCountSessionEntry;
}

interface SubmissionOutcome {
  session: InventoryCountSessionDraft;
  succeeded: boolean;
  postedLines: number;
  displayRefreshFailed: boolean;
}

const BATCH_SIZE = 200;
const VISIBLE_ENTRY_LIMIT = 100;

function sessionStorageKey(profileId?: string): string {
  return `ilios:inventory:count-session:v1:${profileId || 'anonymous'}`;
}

function preferredWarehouseStorageKey(profileId?: string): string {
  return `ilios:inventory:last-warehouse:${profileId || 'anonymous'}`;
}

function getDefaultWarehouseId(warehouses: Warehouse[], profileId?: string): string {
  let saved: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      saved = window.localStorage.getItem(preferredWarehouseStorageKey(profileId));
    } catch {
      saved = null;
    }
  }
  if (saved && warehouses.some((warehouse) => warehouse.id === saved)) return saved;
  return warehouses.find((warehouse) => warehouse.type === 'Central')?.id
    || warehouses[0]?.id
    || '';
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function defaultSessionReason(): string {
  return `Φυσική απογραφή αποθεμάτων ${new Date().toLocaleDateString('el-GR')}`;
}

function entryStateLabel(state: InventoryCountSessionEntry['state']): string {
  switch (state) {
    case 'draft':
      return 'Σε αναμονή υποβολής';
    case 'submitting':
      return 'Υποβάλλεται';
    case 'posted':
      return 'Καταχωρισμένη';
    case 'failed':
      return 'Χρειάζεται επανάληψη';
    default:
      return 'Άγνωστη κατάσταση';
  }
}

function entryStateClasses(state: InventoryCountSessionEntry['state']): string {
  switch (state) {
    case 'posted':
      return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    case 'failed':
      return 'border-rose-100 bg-rose-50 text-rose-700';
    case 'submitting':
      return 'border-blue-100 bg-blue-50 text-blue-700';
    default:
      return 'border-amber-100 bg-amber-50 text-amber-700';
  }
}

function entryMatchesFilter(entry: InventoryCountSessionEntry, filter: EntryFilter): boolean {
  if (filter === 'posted') return entry.state === 'posted';
  if (filter === 'failed') return entry.state === 'failed';
  if (filter === 'pending') return entry.state !== 'posted';
  return true;
}

function inventorySelectionForEntry(
  entry: InventoryCountSessionEntry,
  productBySku: Map<string, Product>,
): SkuPickerOption | null {
  const product = productBySku.get(entry.productSku.toLocaleUpperCase('el-GR'));
  if (!product) return null;
  const variant = (product.variants || []).find(
    (candidate) => (candidate.suffix || '') === entry.variantSuffix,
  );
  return {
    key: `${product.sku}::${entry.variantSuffix}`,
    sku: product.sku,
    variant_suffix: entry.variantSuffix || null,
    displaySku: `${product.sku}${entry.variantSuffix}`,
    hint: variant?.description || product.description || product.category,
    product,
    variant,
  };
}

export default function InventoryCountSessionDialog({
  products,
  warehouses,
  availability,
  profileId,
  expectedIdentityCount,
  initialSelection,
  scannedSelection,
  onRequestScan,
  onConsumeScannedSelection,
  onStart,
  onPostBatch,
  onApplyBalances,
  onComplete,
  onClose,
}: InventoryCountSessionDialogProps) {
  const { confirm, showToast } = useUI();
  const storageKey = useMemo(() => sessionStorageKey(profileId), [profileId]);
  const [session, setSession] = useState<InventoryCountSessionDraft | null>(null);
  const sessionRef = useRef<InventoryCountSessionDraft | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [setupTitle, setSetupTitle] = useState('Συνεδρία Απογραφής');
  const [setupReason, setSetupReason] = useState(defaultSessionReason);
  const [setupWarehouseId, setSetupWarehouseId] = useState(
    () => getDefaultWarehouseId(warehouses, profileId),
  );
  const [entryOpen, setEntryOpen] = useState(false);
  const [entrySelection, setEntrySelection] = useState<SkuPickerOption | null>(
    initialSelection || null,
  );
  const [entryFilter, setEntryFilter] = useState<EntryFilter>('all');
  const [entryQuery, setEntryQuery] = useState('');
  const [submissionKind, setSubmissionKind] = useState<SubmissionKind>(null);
  const [submissionLabel, setSubmissionLabel] = useState('');
  const [starting, setStarting] = useState(false);
  const autoOpenedInitialRef = useRef(false);

  const submitting = submissionKind !== null;
  useEscapeToClose(onClose, submitting || entryOpen);

  const persistSession = useCallback((nextSession: InventoryCountSessionDraft) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        storageKey,
        serializeInventoryCountSessionDraft(nextSession),
      );
      setStorageError(null);
    } catch {
      setStorageError(
        'Η συνεδρία παραμένει ανοικτή, αλλά δεν αποθηκεύτηκε τοπικά. Μην κλείσετε την εφαρμογή. Ελευθερώστε χώρο στη συσκευή και προσπαθήστε ξανά.',
      );
    }
  }, [storageKey]);

  useEffect(() => {
    setInitialized(false);
    setLoadError(null);
    setStorageError(null);
    sessionRef.current = null;
    setSession(null);

    if (typeof window === 'undefined') {
      setInitialized(true);
      return;
    }

    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      setLoadError(
        'Η τοπική αποθήκευση της συσκευής δεν είναι διαθέσιμη. Η συνεδρία δεν μπορεί να ανακτηθεί με ασφάλεια. Ενεργοποιήστε την τοπική αποθήκευση και ανοίξτε ξανά τη λειτουργία.',
      );
      setInitialized(true);
      return;
    }
    if (stored) {
      try {
        const parsed = parseInventoryCountSessionDraft(stored);
        const resumed = {
          ...parsed,
          expectedIdentityCount: Math.max(
            parsed.expectedIdentityCount,
            Math.max(0, Math.trunc(expectedIdentityCount)),
          ),
        };
        sessionRef.current = resumed;
        setSession(resumed);
        setSetupTitle(resumed.title);
        setSetupReason(resumed.reason);
        setSetupWarehouseId(
          resumed.activeWarehouseId || getDefaultWarehouseId(warehouses, profileId),
        );
      } catch {
        setLoadError(
          'Η προηγούμενη τοπική συνεδρία δεν ήταν δυνατό να ανακτηθεί με ασφάλεια. Η δημιουργία νέας συνεδρίας θα αντικαταστήσει μόνο το μη έγκυρο τοπικό πρόχειρο· δεν θα μεταβάλει κανένα απόθεμα.',
        );
      }
    } else {
      setSetupWarehouseId(getDefaultWarehouseId(warehouses, profileId));
    }
    setInitialized(true);
  }, [expectedIdentityCount, profileId, storageKey, warehouses]);

  useEffect(() => {
    if (!scannedSelection) return;
    setEntrySelection(scannedSelection);
    onConsumeScannedSelection();
    if (sessionRef.current?.status === 'open') setEntryOpen(true);
  }, [onConsumeScannedSelection, scannedSelection]);

  useEffect(() => {
    if (
      !initialized
      || !session
      || session.status !== 'open'
      || !entrySelection
      || autoOpenedInitialRef.current
    ) {
      return;
    }
    autoOpenedInitialRef.current = true;
    setEntryOpen(true);
  }, [entrySelection, initialized, session]);

  const productBySku = useMemo(
    () => new Map(products.map((product) => [
      product.sku.toLocaleUpperCase('el-GR'),
      product,
    ])),
    [products],
  );
  const warehouseById = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );
  const availabilityByIdentity = useMemo(
    () => new Map(availability.map((row) => [
      inventoryPostingIdentityKey(row),
      row,
    ])),
    [availability],
  );

  const progress = useMemo(
    () => session ? calculateInventoryCountProgress(session) : null,
    [session],
  );
  const pendingBatches = useMemo(
    () => session && session.status === 'open'
      ? buildInventoryCountBatches(session, BATCH_SIZE)
      : [],
    [session],
  );
  const explicitZeroCount = useMemo(() => {
    if (!session) return 0;
    return session.entryOrder.reduce((total, identityKey) => {
      const entry = session.entriesByIdentity[identityKey];
      return total + (entry?.quantityText === '0' ? 1 : 0);
    }, 0);
  }, [session]);

  const matchingEntryViews = useMemo<SessionEntryView[]>(() => {
    if (!session) return [];
    const normalizedQuery = entryQuery.trim().toLocaleUpperCase('el-GR');
    return [...session.entryOrder]
      .reverse()
      .flatMap((identityKey) => {
        const entry = session.entriesByIdentity[identityKey];
        if (!entry || !entryMatchesFilter(entry, entryFilter)) return [];
        const warehouseName = warehouseById.get(entry.warehouseId)?.name || '';
        const searchable = [
          entry.productSku,
          entry.variantSuffix,
          entry.sizeInfo,
          warehouseName,
        ].join(' ').toLocaleUpperCase('el-GR');
        if (normalizedQuery && !searchable.includes(normalizedQuery)) return [];
        return [{ identityKey, entry }];
      });
  }, [entryFilter, entryQuery, session, warehouseById]);

  const visibleEntries = matchingEntryViews.slice(0, VISIBLE_ENTRY_LIMIT);

  const seedPreferredWarehouse = useCallback((warehouseId: string | null) => {
    if (!warehouseId || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(preferredWarehouseStorageKey(profileId), warehouseId);
    } catch {
      setStorageError(
        'Η προεπιλεγμένη αποθήκη δεν αποθηκεύτηκε στη συσκευή. Η συνεδρία παραμένει ενεργή και δεν μεταβλήθηκε κανένα απόθεμα.',
      );
    }
  }, [profileId]);

  const openEntryDialog = useCallback((selection?: SkuPickerOption | null) => {
    const current = sessionRef.current;
    if (!current || current.status !== 'open' || submitting) return;
    seedPreferredWarehouse(current.activeWarehouseId);
    setEntrySelection(selection || null);
    setEntryOpen(true);
  }, [seedPreferredWarehouse, submitting]);

  const createSession = async () => {
    const reason = setupReason.trim();
    if (!reason) {
      showToast(
        'Η συνεδρία δεν δημιουργήθηκε. Συμπληρώστε αιτιολογία που εξηγεί την απογραφή και προσπαθήστε ξανά. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        'error',
      );
      return;
    }
    if (!setupWarehouseId || !warehouses.some((warehouse) => warehouse.id === setupWarehouseId)) {
      showToast(
        'Η συνεδρία δεν δημιουργήθηκε. Επιλέξτε έγκυρη προεπιλεγμένη αποθήκη και προσπαθήστε ξανά. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        'error',
      );
      return;
    }

    const title = setupTitle.trim() || 'Συνεδρία Απογραφής';
    const clientSessionId = createSessionId();
    setStarting(true);
    try {
      const started = await onStart({
        clientSessionId,
        title,
        reason,
        warehouseId: setupWarehouseId,
      });
      const next = createInventoryCountSessionDraft({
        sessionId: started.sessionId,
        title,
        reason,
        activeWarehouseId: setupWarehouseId,
        expectedIdentityCount: started.totalTargetCount || expectedIdentityCount,
      });
      seedPreferredWarehouse(setupWarehouseId);
      persistSession(next);
      showToast(
        'Η Συνεδρία Απογραφής δημιουργήθηκε στο ERP και αποθηκεύεται αυτόματα και σε αυτή τη συσκευή.',
        'success',
      );
      if (entrySelection) setEntryOpen(true);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Η Συνεδρία Απογραφής δεν δημιουργήθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.',
        'error',
      );
    } finally {
      setStarting(false);
    }
  };

  const collectLines = useCallback(async (lines: InventoryPostingLine[]) => {
    const current = sessionRef.current;
    if (!current || current.status !== 'open') {
      throw new Error('Η συνεδρία απογραφής δεν είναι ανοικτή για νέες καταμετρήσεις.');
    }
    const postedTargets = new Set(
      current.entryOrder.flatMap((identityKey) => {
        const entry = current.entriesByIdentity[identityKey];
        return entry?.state === 'posted'
          ? [`${entry.productSku}\u001f${entry.variantSuffix}`]
          : [];
      }),
    );
    if (lines.some((line) => postedTargets.has(`${line.productSku}\u001f${line.variantSuffix}`))) {
      throw new Error('Το SKU ή η παραλλαγή έχει ήδη οριστικοποιηθεί σε επιβεβαιωμένη παρτίδα της συνεδρίας. Δεν μεταβλήθηκε κανένα δεδομένο. Για διορθωτική επανακαταμέτρηση ξεκινήστε νέα Συνεδρία Απογραφής.');
    }
    const inputs = lines.map((line) => {
      const normalizedSize = normalizeInventorySizeInfo(line.sizeInfo);
      const identity = { ...line, sizeInfo: normalizedSize };
      const baseline = availabilityByIdentity.get(inventoryPostingIdentityKey(identity));
      return {
        ...identity,
        baselineOnHand: baseline?.onHand ?? 0,
      };
    });
    persistSession(mergeInventoryCountDraftEntries(current, inputs));
  }, [availabilityByIdentity, persistSession]);

  const postOneBatch = useCallback(async (
    baseSession: InventoryCountSessionDraft,
    batch: InventoryCountBatch,
  ): Promise<SubmissionOutcome> => {
    const submittingSession = markInventoryCountBatchSubmitting(baseSession, batch);
    persistSession(submittingSession);

    let result: InventoryPostingResult;
    try {
      result = await onPostBatch(baseSession.sessionId, batch);
    } catch {
      const failedSession = markInventoryCountBatchFailed(submittingSession, batch);
      persistSession(failedSession);
      return {
        session: failedSession,
        succeeded: false,
        postedLines: 0,
        displayRefreshFailed: false,
      };
    }

    let postedSession: InventoryCountSessionDraft;
    try {
      postedSession = applyInventoryCountBatchResult(submittingSession, batch, result);
    } catch {
      const failedSession = markInventoryCountBatchFailed(submittingSession, batch);
      persistSession(failedSession);
      return {
        session: failedSession,
        succeeded: false,
        postedLines: 0,
        displayRefreshFailed: false,
      };
    }

    persistSession(postedSession);
    let displayRefreshFailed = false;
    try {
      await onApplyBalances(result.balances);
    } catch {
      displayRefreshFailed = true;
    }
    return {
      session: postedSession,
      succeeded: true,
      postedLines: result.postedCount,
      displayRefreshFailed,
    };
  }, [onApplyBalances, onPostBatch, persistSession]);

  const submitBatches = useCallback(async (
    baseSession: InventoryCountSessionDraft,
    batches: InventoryCountBatch[],
  ): Promise<SubmissionOutcome> => {
    let working = baseSession;
    let postedLines = 0;
    let displayRefreshFailed = false;

    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setSubmissionLabel(
        `Υποβολή παρτίδας ${(index + 1).toLocaleString('el-GR')} από ${batches.length.toLocaleString('el-GR')}…`,
      );
      const outcome = await postOneBatch(working, batch);
      working = outcome.session;
      postedLines += outcome.postedLines;
      displayRefreshFailed ||= outcome.displayRefreshFailed;
      if (!outcome.succeeded) {
        return {
          session: working,
          succeeded: false,
          postedLines,
          displayRefreshFailed,
        };
      }
    }

    return {
      session: working,
      succeeded: true,
      postedLines,
      displayRefreshFailed,
    };
  }, [postOneBatch]);

  const notifySubmissionOutcome = (
    outcome: SubmissionOutcome,
    completedBatchCount: number,
  ) => {
    if (!outcome.succeeded) {
      showToast(
        'Η παρτίδα δεν επιβεβαιώθηκε. Οι γραμμές παραμένουν στη συνεδρία και μπορούν να υποβληθούν ξανά με το ίδιο ασφαλές αναγνωριστικό. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.',
        'error',
      );
      return;
    }
    if (outcome.displayRefreshFailed) {
      showToast(
        'Η παρτίδα καταχωρίστηκε στη βάση, αλλά η προσωρινή προβολή δεν ανανεώθηκε πλήρως. Μην επαναλάβετε τις καταχωρισμένες γραμμές· η τελική ανανέωση της συνεδρίας θα επαναφέρει την οθόνη.',
        'warning',
      );
      return;
    }
    showToast(
      `${formatInventoryInteger(outcome.postedLines)} ${outcome.postedLines === 1 ? 'γραμμή καταχωρίστηκε' : 'γραμμές καταχωρίστηκαν'} επιτυχώς σε ${formatInventoryInteger(completedBatchCount)} ${completedBatchCount === 1 ? 'ατομική παρτίδα' : 'ατομικές παρτίδες'}.`,
      'success',
    );
  };

  const submitNextBatch = async () => {
    const current = sessionRef.current;
    const nextBatch = current ? buildInventoryCountBatches(current, BATCH_SIZE)[0] : null;
    if (!current || !nextBatch) {
      showToast('Δεν υπάρχουν εκκρεμείς έγκυρες γραμμές για υποβολή.', 'info');
      return;
    }
    setSubmissionKind('next');
    try {
      const outcome = await submitBatches(current, [nextBatch]);
      notifySubmissionOutcome(outcome, 1);
    } finally {
      setSubmissionKind(null);
      setSubmissionLabel('');
    }
  };

  const submitAllBatches = async () => {
    const current = sessionRef.current;
    const batches = current ? buildInventoryCountBatches(current, BATCH_SIZE) : [];
    if (!current || batches.length === 0) {
      showToast('Δεν υπάρχουν εκκρεμείς έγκυρες γραμμές για υποβολή.', 'info');
      return;
    }
    setSubmissionKind('all');
    try {
      const outcome = await submitBatches(current, batches);
      notifySubmissionOutcome(outcome, batches.length);
    } finally {
      setSubmissionKind(null);
      setSubmissionLabel('');
    }
  };

  const completeSession = async () => {
    let working = sessionRef.current;
    if (!working) return;
    setSubmissionKind('complete');
    try {
      if (working.status === 'open') {
        const batches = buildInventoryCountBatches(working, BATCH_SIZE);
        if (batches.length > 0) {
          const outcome = await submitBatches(working, batches);
          working = outcome.session;
          if (!outcome.succeeded) {
            notifySubmissionOutcome(outcome, batches.length);
            return;
          }
          if (outcome.displayRefreshFailed) {
            showToast(
              'Οι παρτίδες καταχωρίστηκαν, αλλά η ενδιάμεση προβολή δεν ανανεώθηκε πλήρως. Εκτελείται η τελική ασφαλής ανανέωση.',
              'warning',
            );
          }
        }

        const currentProgress = calculateInventoryCountProgress(working);
        if (currentProgress.failed > 0 || currentProgress.pending > 0) {
          showToast(
            'Η συνεδρία δεν ολοκληρώθηκε. Υπάρχουν γραμμές χωρίς επιβεβαιωμένη καταχώριση. Διορθώστε ή επαναλάβετε τις αποτυχημένες γραμμές και προσπαθήστε ξανά.',
            'error',
          );
          return;
        }
        if (currentProgress.notCounted > 0) {
          showToast(
            `Η συνεδρία δεν ολοκληρώθηκε. Απομένουν ${formatInventoryInteger(currentProgress.notCounted)} μη καταμετρημένοι στόχοι SKU ή παραλλαγής. Η συνεδρία αποθηκεύτηκε και μπορείτε να συνεχίσετε αργότερα.`,
            'error',
          );
          return;
        }
        working = finalizeInventoryCountSession(working);
        persistSession(working);
      }

      setSubmissionLabel('Τελική συμφωνία και ανανέωση υπολοίπων…');
      try {
        await onComplete(working);
      } catch {
        showToast(
          'Όλες οι παρτίδες έχουν καταχωριστεί, αλλά δεν ολοκληρώθηκε η τελική ανανέωση υπολοίπων. Δεν χάθηκε καμία καταμέτρηση. Πατήστε ξανά «Ολοκλήρωση» όταν αποκατασταθεί η σύνδεση.',
          'error',
        );
        return;
      }

      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          showToast(
            'Η απογραφή ολοκληρώθηκε, αλλά το τοπικό αρχείο ολοκλήρωσης δεν διαγράφηκε από τη συσκευή. Αν η συνεδρία εμφανιστεί ξανά, πατήστε «Ολοκλήρωση» για ασφαλή επανάληψη της τελικής ανανέωσης.',
            'warning',
          );
        }
      }
      showToast(
        'Η Συνεδρία Απογραφής ολοκληρώθηκε. Τα υπόλοιπα συμφωνήθηκαν και ανανεώθηκαν σε όλο το ERP.',
        'success',
      );
      onClose();
    } finally {
      setSubmissionKind(null);
      setSubmissionLabel('');
    }
  };

  const removeEntry = async (identityKey: string, entry: InventoryCountSessionEntry) => {
    const accepted = await confirm({
      title: 'Αφαίρεση από τη συνεδρία',
      message: `Η καταμέτρηση ${entry.productSku}${entry.variantSuffix}${entry.sizeInfo ? ` · ${entry.sizeInfo}` : ''} θα αφαιρεθεί μόνο από το τοπικό πρόχειρο. Δεν θα μεταβληθεί κανένα απόθεμα.`,
      confirmText: 'Αφαίρεση',
      cancelText: 'Διατήρηση',
      isDestructive: true,
    });
    if (!accepted) return;
    const current = sessionRef.current;
    if (!current) return;
    try {
      persistSession(removeInventoryCountDraftEntry(current, identityKey));
    } catch {
      showToast(
        'Η γραμμή δεν αφαιρέθηκε επειδή έχει ήδη καταχωριστεί. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        'error',
      );
    }
  };

  const editEntry = (entry: InventoryCountSessionEntry) => {
    const selection = inventorySelectionForEntry(entry, productBySku);
    if (!selection) {
      showToast(
        'Το SKU δεν βρέθηκε στο ενεργό Μητρώο Κωδικών. Η υπάρχουσα καταμέτρηση παραμένει αμετάβλητη.',
        'error',
      );
      return;
    }
    openEntryDialog(selection);
  };

  const requestScan = () => {
    if (submitting || sessionRef.current?.status !== 'open') return;
    setEntryOpen(false);
    setEntrySelection(null);
    onRequestScan();
  };

  if (!initialized) {
    return (
      <div className="fixed inset-0 z-[450] flex items-center justify-center bg-slate-950/55 p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-2xl" role="status">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          Ανάκτηση Συνεδρίας Απογραφής…
        </div>
      </div>
    );
  }

  const firstPendingBatchSize = pendingBatches[0]?.input.lines.length || 0;
  const statusCompleted = session?.status === 'completed';

  return (
    <>
      <div
        className="fixed inset-0 z-[450] flex items-end bg-slate-950/60 sm:items-center sm:justify-center sm:p-4"
        role="presentation"
        onMouseDown={() => {
          if (!submitting && !entryOpen) onClose();
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-count-session-title"
          className="flex max-h-[98vh] w-full max-w-7xl flex-col overflow-hidden rounded-t-3xl border border-slate-100 bg-slate-50 shadow-2xl sm:max-h-[94vh] sm:rounded-3xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="inventory-count-session-title" className="text-xl font-black text-slate-900">
                  {session?.title || 'Νέα Συνεδρία Απογραφής'}
                </h2>
                {session && (
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                    statusCompleted
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-blue-100 bg-blue-50 text-blue-700'
                  }`}>
                    {statusCompleted ? 'Ολοκληρωμένη καταμέτρηση' : 'Ανοικτή συνεδρία'}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">
                Μαζική, επαναλήψιμη απογραφή με τοπική αυτόματη αποθήκευση και ατομική υποβολή έως {formatInventoryInteger(BATCH_SIZE)} γραμμών ανά παρτίδα.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {session && !submitting && (
                <button
                  type="button"
                  onClick={onClose}
                  className={`${BTN_SECONDARY} hidden sm:inline-flex`}
                  aria-label="Παύση και κλείσιμο της Συνεδρίας Απογραφής"
                >
                  <Pause size={16} aria-hidden="true" />
                  Παύση
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label={session ? 'Παύση και κλείσιμο της Συνεδρίας Απογραφής' : 'Κλείσιμο Συνεδρίας Απογραφής'}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>
          </header>

          {!session ? (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                    <ClipboardList size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Στοιχεία νέας συνεδρίας</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Η συνεδρία καταγράφεται στο ERP και οι μη απεσταλμένες καταμετρήσεις διατηρούνται ως ασφαλές πρόχειρο στη συσκευή. Το απόθεμα μεταβάλλεται μόνο μετά την επιτυχή υποβολή παρτίδας.
                    </p>
                  </div>
                </div>

                {(loadError || storageError) && (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900" role="alert">
                    <AlertTriangle size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <p>{loadError || storageError}</p>
                  </div>
                )}

                <div className="mt-6 grid gap-5">
                  <label className="text-sm font-black text-slate-700">
                    Τίτλος συνεδρίας
                    <input
                      value={setupTitle}
                      onChange={(event) => setSetupTitle(event.target.value)}
                      maxLength={100}
                      placeholder="π.χ. Ετήσια Απογραφή 2026"
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="text-sm font-black text-slate-700">
                    Αιτιολογία απογραφής
                    <textarea
                      value={setupReason}
                      onChange={(event) => setSetupReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="π.χ. Ετήσια φυσική απογραφή αποθεμάτων"
                      className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
                    />
                  </label>
                  <label className="text-sm font-black text-slate-700">
                    Προεπιλεγμένη αποθήκη
                    <select
                      value={setupWarehouseId}
                      onChange={(event) => setSetupWarehouseId(event.target.value)}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
                      aria-label="Επιλογή προεπιλεγμένης αποθήκης για τη Συνεδρία Απογραφής"
                    >
                      <option value="">Επιλέξτε αποθήκη</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                      ))}
                    </select>
                    <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                      Η συνεδρία αφορά απευθείας την επιλεγμένη αποθήκη. Για άλλη αποθήκη ξεκινήστε ξεχωριστή συνεδρία· δεν απαιτείται ενδιάμεση καταχώριση στην Κεντρική Αποθήκη.
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={onClose} className={`${BTN_SECONDARY} justify-center`}>
                    Ακύρωση
                  </button>
                  <button
                    type="button"
                    onClick={createSession}
                    disabled={starting || !setupReason.trim() || !setupWarehouseId}
                    className={`${BTN_PRIMARY} justify-center disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    {starting ? <Loader2 size={17} className="animate-spin" /> : <ClipboardCheck size={17} aria-hidden="true" />}
                    {starting ? 'Δημιουργία Συνεδρίας…' : 'Έναρξη Συνεδρίας'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                {(storageError || statusCompleted) && (
                  <div className={`mb-4 flex items-start gap-3 rounded-2xl border p-4 text-sm leading-6 ${
                    statusCompleted
                      ? 'border-blue-200 bg-blue-50 text-blue-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`} role={storageError ? 'alert' : 'status'}>
                    {statusCompleted
                      ? <CheckCircle2 size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
                      : <AlertTriangle size={19} className="mt-0.5 shrink-0" aria-hidden="true" />}
                    <p>
                      {statusCompleted
                        ? 'Οι καταμετρήσεις έχουν καταχωριστεί. Απομένει η τελική συμφωνία και ανανέωση της οθόνης· πατήστε «Ολοκλήρωση».'
                        : storageError}
                    </p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Καταμετρημένες</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">
                      {formatInventoryInteger(progress?.counted || 0)}
                      <span className="text-sm text-slate-400"> / {formatInventoryInteger(progress?.total || 0)}</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-amber-700/70">Σε αναμονή</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-amber-800">{formatInventoryInteger(progress?.pending || 0)}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700/70">Καταχωρισμένες</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-emerald-800">{formatInventoryInteger(progress?.posted || 0)}</p>
                  </div>
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-violet-700/70">Ρητές μηδενικές</p>
                    <p className="mt-1 text-2xl font-black tabular-nums text-violet-800">{formatInventoryInteger(explicitZeroCount)}</p>
                  </div>
                  <div className={`rounded-2xl border p-4 ${
                    (progress?.failed || 0) > 0
                      ? 'border-rose-100 bg-rose-50'
                      : 'border-slate-200 bg-white'
                  }`}>
                    <p className={`text-[11px] font-black uppercase tracking-wide ${
                      (progress?.failed || 0) > 0 ? 'text-rose-700/70' : 'text-slate-400'
                    }`}>Χρειάζονται έλεγχο</p>
                    <p className={`mt-1 text-2xl font-black tabular-nums ${
                      (progress?.failed || 0) > 0 ? 'text-rose-800' : 'text-slate-700'
                    }`}>{formatInventoryInteger(progress?.failed || 0)}</p>
                  </div>
                </div>

                <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="count-session-progress-title">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id="count-session-progress-title" className="text-sm font-black text-slate-900">Πρόοδος Συνεδρίας</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {progress?.label}. Τελευταία αποθήκευση {formatInventoryDateTime(session.updatedAt)}.
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">
                      {formatInventoryInteger(pendingBatches.length)} {pendingBatches.length === 1 ? 'εκκρεμής παρτίδα' : 'εκκρεμείς παρτίδες'}
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
                      <span>Καταμέτρηση</span>
                      <span>{(progress?.countedPercentage || 0).toLocaleString('el-GR')}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label={`Πρόοδος καταμέτρησης ${(progress?.countedPercentage || 0).toLocaleString('el-GR')}%`}>
                      <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${progress?.countedPercentage || 0}%` }} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-slate-600">
                      <span>Επιβεβαιωμένη καταχώριση</span>
                      <span>{(progress?.postedPercentage || 0).toLocaleString('el-GR')}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" aria-label={`Πρόοδος επιβεβαιωμένης καταχώρισης ${(progress?.postedPercentage || 0).toLocaleString('el-GR')}%`}>
                      <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${progress?.postedPercentage || 0}%` }} />
                    </div>
                  </div>
                </section>

                <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-labelledby="count-session-entries-title">
                  <div className="border-b border-slate-100 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h3 id="count-session-entries-title" className="text-base font-black text-slate-900">Καταμετρήσεις συνεδρίας</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Η επανακαταμέτρηση της ίδιας ταυτότητας SKU, μεγέθους και αποθήκης ενημερώνει το πρόχειρο χωρίς διπλοεγγραφή.
                        </p>
                      </div>
                      {!statusCompleted && (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={requestScan}
                            disabled={submitting}
                            className={`${BTN_SECONDARY} justify-center disabled:opacity-45`}
                          >
                            <ScanBarcode size={16} aria-hidden="true" />
                            Σάρωση SKU
                          </button>
                          <button
                            type="button"
                            onClick={() => openEntryDialog(null)}
                            disabled={submitting}
                            className={`${BTN_PRIMARY} justify-center disabled:opacity-45`}
                          >
                            <Plus size={16} aria-hidden="true" />
                            Καταμέτρηση SKU
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(14rem,1fr)_auto]">
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 shadow-sm">
                        <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="sr-only">Αναζήτηση στις καταμετρήσεις της συνεδρίας</span>
                        <input
                          value={entryQuery}
                          onChange={(event) => setEntryQuery(event.target.value)}
                          placeholder="Αναζήτηση SKU, μεγέθους ή αποθήκης…"
                          className="min-w-0 flex-1 bg-transparent py-2.5 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
                        />
                      </label>
                      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" aria-label="Φίλτρο κατάστασης καταμετρήσεων">
                        {([
                          ['all', 'Όλες'],
                          ['pending', 'Σε αναμονή'],
                          ['posted', 'Καταχωρισμένες'],
                          ['failed', 'Έλεγχος'],
                        ] as Array<[EntryFilter, string]>).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setEntryFilter(value)}
                            aria-pressed={entryFilter === value}
                            className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                              entryFilter === value
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {visibleEntries.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {visibleEntries.map(({ identityKey, entry }) => {
                        const product = productBySku.get(entry.productSku.toLocaleUpperCase('el-GR'));
                        const warehouse = warehouseById.get(entry.warehouseId);
                        const quantity = Number(entry.quantityText);
                        const delta = entry.baselineOnHand == null
                          ? null
                          : quantity - entry.baselineOnHand;
                        const canEdit = entry.state !== 'posted' && entry.state !== 'submitting' && !submitting;
                        return (
                          <article key={identityKey} className="grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4">
                            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                              {product?.image_url ? (
                                <img
                                  src={product.image_url}
                                  alt={`Εικόνα προϊόντος ${entry.productSku}${entry.variantSuffix}`}
                                  loading="lazy"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon size={18} className="text-slate-300" aria-label={`Δεν υπάρχει εικόνα για το προϊόν ${entry.productSku}${entry.variantSuffix}`} />
                              )}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <SkuColorizedText
                                  sku={entry.productSku}
                                  suffix={entry.variantSuffix}
                                  gender={product?.gender}
                                  className="text-sm"
                                  masterClassName="text-slate-900"
                                />
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${entryStateClasses(entry.state)}`}>
                                  {entryStateLabel(entry.state)}
                                </span>
                                {entry.quantityText === '0' && (
                                  <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-700">
                                    Ρητή μηδενική μέτρηση
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 truncate text-xs text-slate-500">
                                {entry.sizeInfo ? `Μέγεθος ${entry.sizeInfo}` : 'Χωρίς διάκριση μεγέθους'}
                                {' · '}
                                {warehouse?.name || 'Μη κατονομασμένη αποθήκη'}
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-3 sm:justify-end">
                              <div className="text-right">
                                <p className="text-lg font-black tabular-nums text-slate-900">
                                  {formatInventoryInteger(Number.isFinite(quantity) ? quantity : 0)}
                                </p>
                                <p className={`text-[11px] font-bold ${
                                  delta == null
                                    ? 'text-slate-400'
                                    : delta > 0
                                      ? 'text-emerald-700'
                                      : delta < 0
                                        ? 'text-rose-700'
                                        : 'text-slate-500'
                                }`}>
                                  {delta == null
                                    ? 'Χωρίς αρχικό υπόλοιπο'
                                    : `Μεταβολή ${delta > 0 ? '+' : ''}${formatInventoryInteger(delta)}`}
                                </p>
                              </div>
                              {canEdit && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => editEntry(entry)}
                                    className="rounded-lg px-2.5 py-2 text-xs font-black text-blue-700 hover:bg-blue-50"
                                    aria-label={`Επανακαταμέτρηση ${entry.productSku}${entry.variantSuffix}`}
                                  >
                                    Επεξεργασία
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeEntry(identityKey, entry)}
                                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                                    aria-label={`Αφαίρεση ${entry.productSku}${entry.variantSuffix} από τη συνεδρία`}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-12 text-center">
                      <ClipboardList size={28} className="mx-auto text-slate-300" aria-hidden="true" />
                      <p className="mt-3 text-sm font-black text-slate-700">
                        {session.entryOrder.length === 0 ? 'Δεν υπάρχουν ακόμη καταμετρήσεις' : 'Δεν βρέθηκαν καταμετρήσεις'}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {session.entryOrder.length === 0
                          ? 'Σαρώστε ή αναζητήστε ένα SKU για να ξεκινήσετε.'
                          : 'Αλλάξτε την αναζήτηση ή το φίλτρο κατάστασης.'}
                      </p>
                    </div>
                  )}

                  {matchingEntryViews.length > VISIBLE_ENTRY_LIMIT && (
                    <p className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-slate-500">
                      Εμφανίζονται οι {formatInventoryInteger(VISIBLE_ENTRY_LIMIT)} πιο πρόσφατες από {formatInventoryInteger(matchingEntryViews.length)} καταμετρήσεις. Χρησιμοποιήστε την αναζήτηση για συγκεκριμένο SKU.
                    </p>
                  )}
                </section>
              </div>

              <footer className="border-t border-slate-200 bg-white p-4 sm:p-5">
                {submitting && (
                  <div className="mb-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800" role="status" aria-live="polite">
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    {submissionLabel || 'Επεξεργασία Συνεδρίας Απογραφής…'}
                  </div>
                )}
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[auto_auto_1fr_auto]">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={submitting}
                    className={`${BTN_SECONDARY} justify-center disabled:opacity-45`}
                  >
                    <Pause size={16} aria-hidden="true" />
                    Παύση
                  </button>
                  {!statusCompleted && (
                    <button
                      type="button"
                      onClick={submitNextBatch}
                      disabled={submitting || firstPendingBatchSize === 0}
                      className={`${BTN_SECONDARY} justify-center disabled:cursor-not-allowed disabled:opacity-45`}
                    >
                      {submissionKind === 'next' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      Επόμενη παρτίδα{firstPendingBatchSize > 0 ? ` (${formatInventoryInteger(firstPendingBatchSize)})` : ''}
                    </button>
                  )}
                  {!statusCompleted && (
                    <button
                      type="button"
                      onClick={submitAllBatches}
                      disabled={submitting || (progress?.pending || 0) === 0}
                      className={`${BTN_SECONDARY} justify-center disabled:cursor-not-allowed disabled:opacity-45 xl:justify-self-start`}
                    >
                      {submissionKind === 'all' ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={16} />}
                      Υποβολή όλων ({formatInventoryInteger(progress?.pending || 0)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={completeSession}
                    disabled={submitting}
                    className={`${BTN_PRIMARY} justify-center disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    {submissionKind === 'complete' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                    Ολοκλήρωση
                  </button>
                </div>
                <div className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
                  <Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <p>
                    Η «Παύση» διατηρεί το πρόχειρο σε αυτή τη συσκευή. Κάθε παρτίδα είναι ατομική και επαναλήψιμη με το ίδιο αναγνωριστικό, ώστε μια διακοπή σύνδεσης να μην δημιουργεί διπλή καταχώριση.
                  </p>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>

      {entryOpen && session?.status === 'open' && (
        <InventoryPostingDialog
          products={products}
          warehouses={warehouses.filter((warehouse) => warehouse.id === session.activeWarehouseId)}
          availability={availability}
          profileId={profileId}
          initialSelection={entrySelection}
          onRequestScan={requestScan}
          countSession={{
            reason: session.reason,
            onCollect: collectLines,
          }}
          onPrepareNext={() => setEntrySelection(null)}
          onClose={() => {
            setEntryOpen(false);
            setEntrySelection(null);
          }}
        />
      )}
    </>
  );
}
