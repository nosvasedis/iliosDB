import { useRestartDraft } from '../../hooks/useRestartBlocker';
import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Building2,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  ClipboardPlus,
  Download,
  History,
  Loader2,
  LockKeyhole,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Product, Warehouse } from '../../types';
import type {
  InventoryAvailability,
  InventoryEvent,
  InventoryReconciliationIssue,
} from '../../features/inventory';
import {
  calculateInventoryTotals,
  ensureCatalogInventoryAvailability,
  formatInventoryDateTime,
  formatInventoryInteger,
  formatInventoryQuantity,
  groupInventoryAvailability,
  matchesInventoryAvailabilitySearch,
  getInventoryOperationLabel,
  getInventoryEventReversalState,
  getDefaultWarehouseCategory,
  getWarehouseTypeLabel,
  getReconciliationIssueLabel,
  INVENTORY_TERMS,
  inventoryRepository,
} from '../../features/inventory';
import {
  useActiveInventoryCountSessions,
  useInventoryAvailability,
  useInventoryEvents,
  useInventoryReconciliationIssues,
  useInventoryReconciliationStatus,
  applyInventoryPostingBalances,
  inventoryKeys,
  refreshInventoryAvailability,
  refreshInventoryAuditQueries,
} from '../../hooks/api/useInventory';
import { useWarehouses, warehouseKeys } from '../../hooks/api/useWarehouses';
import { SYSTEM_IDS } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { useUI } from '../UIProvider';
import DesktopPageHeader from '../DesktopPageHeader';
import MobileScreenHeader from '../mobile/MobileScreenHeader';
import {
  BELOW_TAB_CONTAINER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD,
  PAGE_CONTAINER,
  belowTabButton,
} from '../ui/designTokens';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import BarcodeScanner from '../BarcodeScanner';
import { findProductByScannedCode } from '../../utils/pricingEngine';
import InventoryStockExplorer, { type InventoryQuickOperation } from './InventoryStockExplorer';
import InventoryGuideDialog from './InventoryGuideDialog';
import InventoryQuickSearch from './InventoryQuickSearch';
import InventoryPostingDialog from './InventoryPostingDialog';
import InventoryCountSessionDialog from './InventoryCountSessionDialog';
import InventoryOverviewPanel from './InventoryOverviewPanel';
import InventoryMovementsPanel from './InventoryMovementsPanel';
import { downloadInventoryCsv } from './inventoryCsv';
import { searchSkuProductOptions, type SkuPickerOption } from '../../utils/skuProductPicker';

type InventoryTab = 'overview' | 'stock' | 'movements' | 'warehouses' | 'reconciliation';
type StockFilter = 'all' | 'in-stock' | 'low' | 'unavailable' | 'negative';
type StockSort = 'sku' | 'available-asc' | 'available-desc' | 'onhand-desc' | 'low-stock';

/** Locations owned by another workflow; manual stock commands never target them. */
const WORKFLOW_OWNED_WAREHOUSE_IDS: ReadonlySet<string> = new Set([SYSTEM_IDS.CONSIGNMENTS]);
const MOVEMENT_PAGE_SIZE = 250;

interface InventoryWorkspaceProps {
  products?: Product[];
  compact?: boolean;
  onProductSelect?: (product: Product) => void;
}

interface OperationDialogState {
  kind: InventoryQuickOperation;
  row: InventoryAvailability;
}

interface WarehouseFormState {
  id?: string;
  name: string;
  type: Warehouse['type'];
  category: string;
  address: string;
  isSystem: boolean;
}

function createEmptyWarehouseForm(): WarehouseFormState {
  return {
    name: '',
    type: 'Showroom',
    category: getDefaultWarehouseCategory('Showroom'),
    address: '',
    isSystem: false,
  };
}

const tabs: Array<{ id: InventoryTab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Επισκόπηση', icon: Activity },
  { id: 'stock', label: 'Υπόλοιπα', icon: Boxes },
  { id: 'movements', label: INVENTORY_TERMS.movementHistory, icon: History },
  { id: 'warehouses', label: 'Αποθήκες', icon: Building2 },
  { id: 'reconciliation', label: 'Συμφωνία', icon: ClipboardList },
];

const warehouseTypeOptions: Array<{ value: Warehouse['type']; label: string }> = [
  { value: 'Showroom', label: 'Δειγματολόγιο' },
  { value: 'Store', label: 'Αποθηκευτικός χώρος' },
  { value: 'Other', label: 'Λοιπή θέση αποθέματος' },
];

const stockFilterOptions: Array<{ value: StockFilter; label: string }> = [
  { value: 'all', label: 'Όλα' },
  { value: 'in-stock', label: 'Με φυσικό απόθεμα' },
  { value: 'low', label: 'Κάτω από Σημείο Αναπαραγγελίας' },
  { value: 'unavailable', label: 'Χωρίς διαθέσιμο' },
  { value: 'negative', label: 'Αρνητική πρόβλεψη' },
];

function parseWholeQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value <= 2_147_483_647 ? value : null;
}

function OperationDialog({
  state,
  warehouses,
  isAdmin,
  onClose,
  onSaved,
}: {
  state: OperationDialogState;
  warehouses: Warehouse[];
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { showToast } = useUI();
  const initialQuantity = state.kind === 'adjustment' ? state.row.onHand : state.kind === 'reorder' ? state.row.reorderPoint : 1;
  const [quantityText, setQuantityText] = useState(String(initialQuantity));
  const destinationOptions = useMemo(
    () => warehouses.filter((warehouse) => warehouse.id !== state.row.warehouseId),
    [state.row.warehouseId, warehouses],
  );
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(destinationOptions[0]?.id || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
    useRestartDraft('Κίνηση αποθέματος', { quantityText, destinationWarehouseId, reason }, { busy: saving });

  useEscapeToClose(onClose, saving);

  const quantity = parseWholeQuantity(quantityText);
  const title = state.kind === 'adjustment'
    ? INVENTORY_TERMS.adjustment
    : state.kind === 'transfer'
      ? INVENTORY_TERMS.transfer
      : INVENTORY_TERMS.reorderPoint;
  const requiresReason = state.kind === 'adjustment' || state.kind === 'transfer';
  const transferInvalid = state.kind === 'transfer'
    && (quantity === null || quantity <= 0 || quantity > state.row.available);
  const adjustmentBelowReserved = state.kind === 'adjustment' && quantity !== null && quantity < state.row.reserved;
  const unchanged = (state.kind === 'adjustment' && quantity === state.row.onHand)
    || (state.kind === 'reorder' && quantity === state.row.reorderPoint);

  const save = async () => {
    if (quantity === null) {
      showToast('Καταχωρίστε ακέραιο, μη αρνητικό αριθμό τεμαχίων. Δεν πραγματοποιήθηκε καμία μεταβολή.', 'error');
      return;
    }
    if (requiresReason && !reason.trim()) {
      showToast('Η αιτιολογία είναι υποχρεωτική για την πλήρη ιχνηλασιμότητα της κίνησης.', 'error');
      return;
    }
    if (transferInvalid) {
      showToast(`Η ποσότητα ενδοδιακίνησης πρέπει να είναι από 1 έως ${formatInventoryQuantity(state.row.available)}. Δεν πραγματοποιήθηκε καμία μεταβολή.`, 'error');
      return;
    }
    if (adjustmentBelowReserved) {
      showToast(`Το Φυσικό Απόθεμα δεν μπορεί να γίνει μικρότερο από το Δεσμευμένο (${formatInventoryQuantity(state.row.reserved)}). Αποδεσμεύστε πρώτα τις αντίστοιχες παραγγελίες. Δεν πραγματοποιήθηκε καμία μεταβολή.`, 'error');
      return;
    }
    setSaving(true);
    try {
      if (state.kind === 'adjustment') {
        await inventoryRepository.adjustStock({
          ...state.row,
          mode: 'set',
          quantity,
          reason: reason.trim(),
        });
      } else if (state.kind === 'transfer') {
        await inventoryRepository.transferStock({
          productSku: state.row.productSku,
          variantSuffix: state.row.variantSuffix,
          sizeInfo: state.row.sizeInfo,
          sourceWarehouseId: state.row.warehouseId,
          destinationWarehouseId,
          quantity,
          reason: reason.trim(),
        });
      } else {
        await inventoryRepository.setReorderPolicy({
          ...state.row,
          reorderPoint: quantity,
        });
      }
      await onSaved();
      showToast(`${title}: η καταχώριση ολοκληρώθηκε επιτυχώς.`, 'success');
      onClose();
    } catch (error: any) {
      showToast(error?.message || 'Η ενέργεια δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const destinationName = destinationOptions.find((warehouse) => warehouse.id === destinationWarehouseId)?.name;

  return (
    <div className="fixed inset-0 z-[500] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-operation-title"
        className="w-full max-w-lg rounded-t-3xl border border-slate-100 bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 id="inventory-operation-title" className="text-lg font-black text-slate-900">{title}</h2>
            <p className="mt-1 truncate font-mono text-sm font-bold text-slate-600">
              {state.row.productSku}{state.row.variantSuffix}{state.row.sizeInfo ? ` · Μέγεθος ${state.row.sizeInfo}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Φυσικό</p>
              <p className="font-black tabular-nums text-slate-800">{formatInventoryInteger(state.row.onHand)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-indigo-400">Δεσμευμένο</p>
              <p className="font-black tabular-nums text-indigo-700">{formatInventoryInteger(state.row.reserved)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wide text-emerald-500">Διαθέσιμο</p>
              <p className="font-black tabular-nums text-emerald-700">{formatInventoryInteger(state.row.available)}</p>
            </div>
            <p className="col-span-3 mt-1 border-t border-slate-200 pt-2 text-xs font-bold text-slate-600">{state.row.warehouseName}</p>
          </div>
          {state.kind === 'transfer' && (
            <label className="block text-sm font-bold text-slate-700">
              {INVENTORY_TERMS.destinationWarehouse}
              {destinationOptions.length === 0 ? (
                <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">Δεν υπάρχει άλλη διαθέσιμη αποθήκη για ενδοδιακίνηση.</p>
              ) : (
                <select
                  autoFocus
                  value={destinationWarehouseId}
                  onChange={(event) => setDestinationWarehouseId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500"
                >
                  {destinationOptions.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                  ))}
                </select>
              )}
            </label>
          )}
          <label className="block text-sm font-bold text-slate-700">
            {state.kind === 'adjustment' ? 'Νέο φυσικό απόθεμα' : state.kind === 'reorder' ? INVENTORY_TERMS.reorderPoint : 'Ποσότητα ενδοδιακίνησης'}
            <input
              autoFocus={state.kind !== 'transfer'}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={quantityText}
              onChange={(event) => setQuantityText(event.target.value.replace(/[^\d]/g, ''))}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void save(); } }}
              className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-lg font-black tabular-nums outline-none ${quantity === null || transferInvalid || adjustmentBelowReserved ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200 focus:border-emerald-500'}`}
            />
            {state.kind === 'transfer' && state.row.available > 0 && (
              <button
                type="button"
                onClick={() => setQuantityText(String(state.row.available))}
                className="mt-2 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                Επιλογή όλου του διαθέσιμου αποθέματος ({formatInventoryQuantity(state.row.available)})
              </button>
            )}
          </label>
          {requiresReason && (
            <label className="block text-sm font-bold text-slate-700">
              Αιτιολογία
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Καταχωρίστε σαφή επιχειρησιακή αιτιολογία..."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-emerald-500"
              />
            </label>
          )}
          {state.kind === 'adjustment' && !isAdmin && (
            <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Η διόρθωση φυσικού αποθέματος επιτρέπεται μόνο σε διαχειριστή.
            </p>
          )}
          {state.kind === 'adjustment' && isAdmin && quantity !== null && (
            <p className={`rounded-xl border p-3 text-sm ${adjustmentBelowReserved ? 'border-rose-100 bg-rose-50 text-rose-900' : 'border-blue-100 bg-blue-50 text-blue-900'}`}>
              {adjustmentBelowReserved
                ? `Δεν επιτρέπεται: ${formatInventoryQuantity(state.row.reserved)} είναι δεσμευμένα σε παραγγελίες.`
                : `Το Φυσικό Απόθεμα θα αλλάξει από ${formatInventoryQuantity(state.row.onHand)} σε ${formatInventoryQuantity(quantity)} (${quantity - state.row.onHand > 0 ? '+' : ''}${formatInventoryInteger(quantity - state.row.onHand)}). Η μεταβολή θα καταγραφεί στο Ιστορικό Κινήσεων.`}
            </p>
          )}
          {state.kind === 'transfer' && quantity !== null && !transferInvalid && destinationName && (
            <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              Θα μετακινηθούν {formatInventoryQuantity(quantity)} από «{state.row.warehouseName}» προς «{destinationName}». Η εξαγωγή και η εισαγωγή θα καταχωριστούν μαζί.
            </p>
          )}
          {state.kind === 'reorder' && (
            <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              Όταν το Διαθέσιμο Απόθεμα της θέσης φτάσει ή πέσει κάτω από το όριο, το είδος εμφανίζεται στο Κέντρο Ελέγχου. Το 0 απενεργοποιεί την ειδοποίηση.
            </p>
          )}
        </div>
        <footer className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} flex-1 justify-center disabled:opacity-50`}>Ακύρωση</button>
          <button
            type="button"
            onClick={save}
            disabled={
              saving
              || quantity === null
              || unchanged
              || (requiresReason && !reason.trim())
              || (state.kind === 'adjustment' && (!isAdmin || adjustmentBelowReserved))
              || (state.kind === 'transfer' && (!destinationWarehouseId || transferInvalid))
            }
            className={`${BTN_PRIMARY} flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />}
            Καταχώριση
          </button>
        </footer>
      </section>
    </div>
  );
}

function MovementReversalDialog({
  event,
  events,
  onClose,
  onSaved,
}: {
  event: InventoryEvent;
  events: InventoryEvent[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { showToast } = useUI();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
    useRestartDraft('Αντιστροφή κίνησης', { reason }, { busy: saving });

  const reversalState = getInventoryEventReversalState(event, events, true);
  useEscapeToClose(onClose, saving);

  const submit = async () => {
    if (!reason.trim()) {
      showToast('Η αιτιολογία ακύρωσης είναι υποχρεωτική για την πλήρη ιχνηλασιμότητα.', 'error');
      return;
    }
    setSaving(true);
    try {
      await inventoryRepository.reverseMovementEvent({
        eventId: event.id,
        reason,
        idempotencyKey: `movement-reversal:${event.id}:${crypto.randomUUID()}`,
      });
      await onSaved();
      showToast(
        reversalState.isTransfer
          ? 'Η Ενδοδιακίνηση ακυρώθηκε ατομικά και ενημερώθηκαν και οι δύο αποθήκες.'
          : 'Η κίνηση ακυρώθηκε και το προηγούμενο υπόλοιπο επανήλθε.',
        'success',
      );
      onClose();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Η ακύρωση κίνησης δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[510] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-reversal-title"
        className="w-full max-w-lg rounded-t-3xl border border-slate-100 bg-white shadow-2xl sm:rounded-2xl"
        onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 id="movement-reversal-title" className="text-lg font-black text-slate-900">Ακύρωση Κίνησης Αποθέματος</h2>
            <p className="mt-1 font-mono text-sm font-bold text-slate-600">
              {event.productSku}{event.variantSuffix}{event.sizeInfo ? ` · Μέγεθος ${event.sizeInfo}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Κλείσιμο ακύρωσης κίνησης" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-black">{getInventoryOperationLabel(event.operationType)}</p>
            <p className="mt-1">{event.reason}</p>
            <p className="mt-2 text-xs text-slate-500">
              Μεταβολή Φυσικού Αποθέματος: {event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)} · {formatInventoryDateTime(event.createdAt)}
            </p>
          </div>
          <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
            <ShieldCheck className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
            <p>
              {reversalState.explanation} Η αρχική εγγραφή δεν διαγράφεται· θα επισημανθεί ως ακυρωμένη και θα δημιουργηθεί πλήρως συσχετισμένη αντιλογιστική κίνηση.
            </p>
          </div>
          <label className="block text-sm font-bold text-slate-700">
            Αιτιολογία ακύρωσης
            <textarea
              autoFocus
              value={reason}
              onChange={(changeEvent) => setReason(changeEvent.target.value)}
              rows={3}
              maxLength={480}
              placeholder="Καταχωρίστε τον επιχειρησιακό λόγο της ακύρωσης..."
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-rose-500"
            />
          </label>
        </div>
        <footer className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} flex-1 justify-center disabled:opacity-50`}>Διατήρηση Κίνησης</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !reason.trim()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Επιβεβαίωση Ακύρωσης
          </button>
        </footer>
      </section>
    </div>
  );
}

function ReconciliationIssueCard({ issue, warehouses, onResolved }: { issue: InventoryReconciliationIssue; warehouses: Warehouse[]; onResolved: () => Promise<unknown> }) {
  const { showToast } = useUI();
  const needsTarget = issue.issueType === 'negative_opening_balance' || issue.issueType === 'duplicate_location_rows';
  const needsWarehouse = issue.issueType === 'unknown_warehouse';
  const [target, setTarget] = useState(needsTarget ? String(Math.max(0, issue.actualQuantity || 0)) : '');
  const [targetWarehouseId, setTargetWarehouseId] = useState(
    warehouses.find((warehouse) => warehouse.type === 'Central')?.id || warehouses[0]?.id || '',
  );
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
    const issueRestart = useRestartDraft('Συμφωνία αποθέματος', { target, targetWarehouseId, note }, { busy: saving });


  const resolve = async () => {
    if (!note.trim()) {
      showToast('Η αιτιολογία συμφωνίας αποθέματος είναι υποχρεωτική.', 'error');
      return;
    }
    if (needsWarehouse && !targetWarehouseId) {
      showToast('Επιλέξτε Αποθήκη Προορισμού για το άγνωστο υπόλοιπο.', 'error');
      return;
    }
    const targetQuantity = needsTarget ? parseWholeQuantity(target) : null;
    if (needsTarget && targetQuantity === null) {
      showToast('Το διορθωμένο Φυσικό Απόθεμα πρέπει να είναι ακέραιος, μη αρνητικός αριθμός.', 'error');
      return;
    }
    setSaving(true);
    try {
      await inventoryRepository.resolveReconciliationIssue({
        issueId: issue.id,
        resolutionNote: note.trim(),
        targetOnHand: targetQuantity,
        targetWarehouseId: needsWarehouse ? targetWarehouseId : null,
      });
      issueRestart.markSaved();
      await onResolved();
      showToast('Η συμφωνία αποθέματος ολοκληρώθηκε και καταγράφηκε στο Ιστορικό Κινήσεων.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η συμφωνία δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className={`${CARD} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${issue.severity === 'blocking' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
              {issue.severity === 'blocking' ? 'Εκκρεμότητα που εμποδίζει την έναρξη' : 'Προειδοποίηση'}
            </span>
            <h3 className="font-black text-slate-900">{getReconciliationIssueLabel(issue.issueType)}</h3>
          </div>
          <p className="mt-2 font-mono text-sm font-bold text-slate-700">{issue.productSku || 'Χωρίς κωδικό προϊόντος'}{issue.variantSuffix}{issue.sizeInfo ? ` · Μέγεθος ${issue.sizeInfo}` : ''}</p>
          <p className="mt-2 text-sm text-slate-600">{String(issue.details.message || 'Απαιτείται έλεγχος και τεκμηριωμένη απόφαση διαχειριστή.')}</p>
          {(issue.expectedQuantity != null || issue.actualQuantity != null) && (
            <p className="mt-2 text-xs font-semibold text-slate-500">Αναμενόμενο: {issue.expectedQuantity ?? '—'} · Καταγεγραμμένο: {issue.actualQuantity ?? '—'}</p>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-end">
        {needsTarget ? (
          <label className="text-xs font-black text-slate-600">Διορθωμένο Φυσικό Απόθεμα
            <input type="text" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value.replace(/[^\d]/g, ''))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-black outline-none focus:border-emerald-500" />
          </label>
        ) : needsWarehouse ? (
          <label className="text-xs font-black text-slate-600">{INVENTORY_TERMS.destinationWarehouse}
            <select value={targetWarehouseId} onChange={(event) => setTargetWarehouseId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500">
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
        ) : <div className="hidden sm:block" />}
        <label className="text-xs font-black text-slate-600">Αιτιολογία απόφασης
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Καταχωρίστε την τεκμηρίωση της συμφωνίας..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
        </label>
        <button type="button" onClick={resolve} disabled={saving || !note.trim()} className={`${BTN_PRIMARY} justify-center disabled:opacity-50`}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />} Ολοκλήρωση Συμφωνίας
        </button>
      </div>
    </article>
  );
}

export default function InventoryWorkspace({ products = [], compact = false, onProductSelect }: InventoryWorkspaceProps) {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { showToast, confirm } = useUI();
  const isAdmin = profile?.role === 'admin';
  const canOperate = profile?.role === 'admin' || profile?.role === 'user';
  const [activeTab, setActiveTab] = useState<InventoryTab>('overview');
  const [listSearch, setListSearch] = useState('');
  const deferredSearch = useDeferredValue(listSearch);
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [stockSort, setStockSort] = useState<StockSort>('sku');
  const [operation, setOperation] = useState<OperationDialogState | null>(null);
  const [warehouseForm, setWarehouseForm] = useState<WarehouseFormState>(
    createEmptyWarehouseForm,
  );
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerPurpose, setScannerPurpose] = useState<'navigation' | 'posting' | 'count-session'>('navigation');
  const [guideOpen, setGuideOpen] = useState(false);
  const [postingOpen, setPostingOpen] = useState(false);
  const [postingSelection, setPostingSelection] = useState<SkuPickerOption | null>(null);
  const [countSessionOpen, setCountSessionOpen] = useState(false);
  const [countSessionScannedSelection, setCountSessionScannedSelection] = useState<SkuPickerOption | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ productSku: string; variantSuffix: string; nonce: number } | null>(null);
  const [reversalEvent, setReversalEvent] = useState<InventoryEvent | null>(null);
  const [movementLimit, setMovementLimit] = useState(MOVEMENT_PAGE_SIZE);
  const [refreshing, setRefreshing] = useState(false);
    useRestartDraft('Στοιχεία αποθήκης', warehouseForm, { enabled: !!warehouseForm, busy: savingWarehouse });


  const availabilityQuery = useInventoryAvailability();
  const eventsQuery = useInventoryEvents(activeTab === 'overview' || activeTab === 'movements', movementLimit);
  const reconciliationQuery = useInventoryReconciliationStatus(isAdmin);
  const reconciliationIssuesQuery = useInventoryReconciliationIssues(isAdmin && activeTab === 'reconciliation');
  const activeSessionsQuery = useActiveInventoryCountSessions(isAdmin);
  const warehousesQuery = useWarehouses();
  const rows = availabilityQuery.data || [];
  const warehouses = warehousesQuery.data || [];
  const manualWarehouses = useMemo(
    () => warehouses.filter((warehouse) => !WORKFLOW_OWNED_WAREHOUSE_IDS.has(warehouse.id)),
    [warehouses],
  );
  const productsBySku = useMemo(() => new Map(products.map((product) => [product.sku, product])), [products]);
  const countableIdentityCount = useMemo(
    () => products.reduce(
      (total, product) => total + Math.max(1, product.variants?.length || 0),
      0,
    ),
    [products],
  );
  const categories = useMemo(() => (
    Array.from(new Set(products.map((product) => product.category).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right, 'el-GR', { sensitivity: 'base' }))
  ), [products]);
  const totals = useMemo(() => calculateInventoryTotals(rows), [rows]);
  const events = eventsQuery.data || [];
  const defaultWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.type === 'Central') || warehouses[0],
    [warehouses],
  );
  const navigationRows = useMemo(
    () => ensureCatalogInventoryAvailability(rows, products, defaultWarehouse),
    [rows, products, defaultWarehouse],
  );
  const warehouseTotals = useMemo(() => {
    const byWarehouse = new Map<string, { onHand: number; reserved: number; available: number; skus: Set<string> }>();
    rows.forEach((row) => {
      const current = byWarehouse.get(row.warehouseId) || { onHand: 0, reserved: 0, available: 0, skus: new Set<string>() };
      current.onHand += row.onHand;
      current.reserved += row.reserved;
      current.available += row.available;
      if (row.onHand > 0) current.skus.add(`${row.productSku}::${row.variantSuffix}`);
      byWarehouse.set(row.warehouseId, current);
    });
    return byWarehouse;
  }, [rows]);

  const filteredRows = useMemo(() => {
    return navigationRows.filter((row) => {
      const product = productsBySku.get(row.productSku);
      if (warehouseFilter !== 'all' && row.warehouseId !== warehouseFilter) return false;
      if (categoryFilter !== 'all' && product?.category !== categoryFilter) return false;
      if (stockFilter === 'in-stock' && row.onHand <= 0) return false;
      if (stockFilter === 'low' && !(row.reorderPoint > 0 && row.available <= row.reorderPoint)) return false;
      if (stockFilter === 'unavailable' && row.available > 0) return false;
      if (stockFilter === 'negative' && row.projectedAvailable >= 0) return false;
      return matchesInventoryAvailabilitySearch(row, deferredSearch, [product?.description, product?.category]);
    });
  }, [navigationRows, productsBySku, warehouseFilter, categoryFilter, stockFilter, deferredSearch]);

  const groupedRows = useMemo(() => {
    const groups = groupInventoryAvailability(filteredRows);
    if (stockSort === 'available-asc') {
      return groups.sort((left, right) => left.totals.available - right.totals.available);
    }
    if (stockSort === 'available-desc') {
      return groups.sort((left, right) => right.totals.available - left.totals.available);
    }
    if (stockSort === 'onhand-desc') {
      return groups.sort((left, right) => right.totals.onHand - left.totals.onHand);
    }
    if (stockSort === 'low-stock') {
      return groups.sort((left, right) => {
        const leftLow = left.rows.some((row) => row.reorderPoint > 0 && row.available <= row.reorderPoint);
        const rightLow = right.rows.some((row) => row.reorderPoint > 0 && row.available <= row.reorderPoint);
        if (leftLow !== rightLow) return leftLow ? -1 : 1;
        return left.totals.available - right.totals.available;
      });
    }
    return groups;
  }, [filteredRows, stockSort]);
  const filteredTotals = useMemo(() => calculateInventoryTotals(filteredRows), [filteredRows]);
  const hasActiveFilters = Boolean(
    listSearch.trim()
    || warehouseFilter !== 'all'
    || categoryFilter !== 'all'
    || stockFilter !== 'all'
    || stockSort !== 'sku',
  );
  const explorerResetKey = [deferredSearch, warehouseFilter, categoryFilter, stockFilter, stockSort].join('\u001f');

  const refreshInventory = async () => {
    return refreshInventoryAvailability(queryClient);
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refreshInventory(),
        queryClient.invalidateQueries({ queryKey: warehouseKeys.all }),
      ]);
      showToast('Τα υπόλοιπα ανανεώθηκαν από τη βάση.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η ανανέωση δεν ολοκληρώθηκε. Ελέγξτε τη σύνδεση.', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const focusInventorySelection = (option: SkuPickerOption) => {
    setListSearch(option.displaySku);
    setActiveTab('stock');
    setFocusRequest({
      productSku: option.sku,
      variantSuffix: option.variant_suffix || '',
      nonce: Date.now(),
    });
    if (option.product) onProductSelect?.(option.product);
  };

  const focusRow = (row: InventoryAvailability) => {
    setListSearch(`${row.productSku}${row.variantSuffix}`);
    setWarehouseFilter('all');
    setStockFilter('all');
    setActiveTab('stock');
    setFocusRequest({ productSku: row.productSku, variantSuffix: row.variantSuffix, nonce: Date.now() });
  };

  const openStock = (filter?: { warehouseId?: string; status?: 'low' | 'unavailable' | 'negative' | 'in-stock' }) => {
    if (filter?.warehouseId) setWarehouseFilter(filter.warehouseId);
    if (filter?.status) setStockFilter(filter.status);
    setActiveTab('stock');
  };

  const openPosting = (option?: SkuPickerOption | null) => {
    setPostingSelection(option || null);
    setPostingOpen(true);
  };

  const handleScan = (code: string) => {
    const match = findProductByScannedCode(code, products);
    if (!match) {
      showToast(`Ο κωδικός «${code}» δεν αντιστοιχεί σε καταχωρισμένο είδος αποθέματος.`, 'warning');
      return;
    }
    const fullSku = `${match.product.sku}${match.variant?.suffix || ''}`;
    const option = searchSkuProductOptions(products, fullSku, 1)[0];
    if (!option) {
      showToast(`Ο κωδικός «${code}» δεν μπορεί να επιλεγεί χωρίς συγκεκριμένη παραλλαγή.`, 'warning');
      return;
    }
    if (scannerPurpose === 'posting') {
      setPostingSelection(option);
      setPostingOpen(true);
    } else if (scannerPurpose === 'count-session') {
      setCountSessionScannedSelection(option);
      setCountSessionOpen(true);
    } else {
      focusInventorySelection(option);
    }
    setScannerOpen(false);
  };

  const exportStockCsv = () => {
    const sorted = groupedRows.flatMap((group) => group.rows);
    downloadInventoryCsv(
      `ypoloipa-apothematos-${new Date().toISOString().slice(0, 10)}.csv`,
      ['SKU', 'Παραλλαγή', 'Πλήρες SKU', 'Περιγραφή', 'Κατηγορία', 'Μέγεθος', 'Αποθήκη', 'Φυσικό', 'Δεσμευμένο', 'Διαθέσιμο', 'Αναμενόμενο', 'Ανεκτέλεστη ζήτηση', 'Προβλεπόμενο', 'Σημείο αναπαραγγελίας'],
      sorted.map((row) => {
        const product = productsBySku.get(row.productSku);
        return [
          row.productSku,
          row.variantSuffix,
          `${row.productSku}${row.variantSuffix}`,
          product?.variants?.find((variant) => variant.suffix === row.variantSuffix)?.description || product?.description || '',
          product?.category || '',
          row.sizeInfo,
          row.warehouseName,
          row.onHand,
          row.reserved,
          row.available,
          row.incoming,
          row.outstandingDemand,
          row.projectedAvailable,
          row.reorderPoint,
        ];
      }),
    );
  };

  const saveWarehouse = async () => {
    if (!warehouseForm.name.trim()) {
      showToast('Η ονομασία αποθήκης είναι υποχρεωτική.', 'error');
      return;
    }
    if (!warehouseForm.category.trim()) {
      showToast('Η κατηγορία ή ο υπεύθυνος της αποθήκης είναι υποχρεωτικός.', 'error');
      return;
    }
    const normalizedName = warehouseForm.name.trim().toLocaleLowerCase('el-GR');
    if (warehouses.some((warehouse) => warehouse.id !== warehouseForm.id && warehouse.name.trim().toLocaleLowerCase('el-GR') === normalizedName)) {
      showToast('Υπάρχει ήδη αποθήκη με την ίδια ονομασία. Επιλέξτε διακριτή ονομασία.', 'error');
      return;
    }
    setSavingWarehouse(true);
    try {
      await inventoryRepository.saveWarehouse({
        id: warehouseForm.id,
        name: warehouseForm.name,
        type: warehouseForm.type,
        category: warehouseForm.category,
        address: warehouseForm.address,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseKeys.all }),
        refreshInventory(),
      ]);
      setWarehouseForm(createEmptyWarehouseForm());
      showToast(
        warehouseForm.id
          ? 'Τα στοιχεία της αποθήκης ενημερώθηκαν σε όλο το ERP.'
          : 'Η νέα αποθήκη δημιουργήθηκε και είναι διαθέσιμη για απευθείας καταχώριση αποθέματος.',
        'success',
      );
    } catch (error: any) {
      showToast(error?.message || 'Η αποθήκη δεν αποθηκεύτηκε. Δεν πραγματοποιήθηκε καμία μεταβολή.', 'error');
    } finally {
      setSavingWarehouse(false);
    }
  };

  const deleteWarehouse = async (warehouse: Warehouse) => {
    const stats = warehouseTotals.get(warehouse.id);
    if (stats && (stats.onHand > 0 || stats.reserved > 0)) {
      showToast(`Η αποθήκη «${warehouse.name}» διαθέτει ${formatInventoryQuantity(stats.onHand)} φυσικό απόθεμα. Μεταφέρετε ή μηδενίστε το απόθεμα πριν από τη διαγραφή.`, 'error');
      return;
    }
    const accepted = await confirm({
      title: 'Διαγραφή αποθήκης',
      message: `Να διαγραφεί η αποθήκη «${warehouse.name}»; Η διαγραφή απορρίπτεται όταν υπάρχουν υπόλοιπα ή κινήσεις.`,
      confirmText: 'Διαγραφή',
      isDestructive: true,
    });
    if (!accepted) return;
    try {
      await inventoryRepository.deleteWarehouse(warehouse.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: warehouseKeys.all }),
        refreshInventory(),
      ]);
      if (warehouseFilter === warehouse.id) setWarehouseFilter('all');
      showToast('Η αποθήκη διαγράφηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η αποθήκη δεν διαγράφηκε. Ελέγξτε αν διαθέτει υπόλοιπα ή ιστορικό κινήσεων.', 'error');
    }
  };

  const lastSyncedAt = availabilityQuery.dataUpdatedAt ? new Date(availabilityQuery.dataUpdatedAt) : null;
  const isRefreshing = refreshing || (availabilityQuery.isFetching && !availabilityQuery.isLoading);

  const headerTabs = (
    <div className={BELOW_TAB_CONTAINER} role="tablist" aria-label="Ενότητες αποθήκης και αποθέματος">
      {tabs.filter((tab) => tab.id !== 'reconciliation' || isAdmin).map((tab) => {
        const Icon = tab.icon;
        const badge = tab.id === 'reconciliation' ? reconciliationQuery.data?.blockingCount || 0 : 0;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={belowTabButton(activeTab === tab.id)}
          >
            <Icon size={16} /> {tab.label}
            {badge > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-black text-white">{formatInventoryInteger(badge)}</span>}
          </button>
        );
      })}
    </div>
  );

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hidden text-right text-[11px] font-semibold leading-4 text-slate-400 xl:block">
        Συγχρονισμός<br />{lastSyncedAt ? formatInventoryDateTime(lastSyncedAt) : '—'}
      </span>
      <button
        type="button"
        onClick={manualRefresh}
        disabled={isRefreshing}
        className={`${BTN_SECONDARY} justify-center disabled:opacity-60`}
        aria-label="Ανανέωση υπολοίπων από τη βάση"
      >
        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} aria-hidden="true" />
        <span className={compact ? 'sr-only' : ''}>Ανανέωση</span>
      </button>
      {isAdmin && (
        <button type="button" onClick={() => setCountSessionOpen(true)} className={`${BTN_SECONDARY} justify-center`}>
          <ClipboardCheck size={16} aria-hidden="true" />
          <span className={compact ? 'sr-only' : ''}>Απογραφή</span>
          {(activeSessionsQuery.data?.length || 0) > 0 && <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Υπάρχει ενεργή συνεδρία" />}
        </button>
      )}
      {isAdmin && (
        <button type="button" onClick={() => openPosting(null)} className={`${BTN_PRIMARY} justify-center`}>
          <ClipboardPlus size={16} aria-hidden="true" /> Καταχώριση
        </button>
      )}
    </div>
  );

  if (availabilityQuery.isLoading) {
    return <div className="flex min-h-[320px] items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Φόρτωση στοιχείων αποθέματος...</div>;
  }

  if (availabilityQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
        <h2 className="font-black">Δεν ήταν δυνατή η φόρτωση του αποθέματος</h2>
        <p className="mt-2 text-sm">
          {availabilityQuery.error instanceof Error ? availabilityQuery.error.message : 'Η προβολή παρέμεινε αμετάβλητη. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.'}
        </p>
        <button type="button" onClick={() => availabilityQuery.refetch()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">Επανάληψη</button>
      </div>
    );
  }

  const gutter = 'px-4 sm:px-0';

  return (
    <div className={PAGE_CONTAINER}>
      {compact ? (
        <MobileScreenHeader
          icon={WarehouseIcon}
          title={INVENTORY_TERMS.pageTitle}
          subtitle="Ενιαία εικόνα φυσικού, δεσμευμένου και διαθέσιμου αποθέματος"
          sticky={false}
        />
      ) : (
        <DesktopPageHeader
          icon={WarehouseIcon}
          title={INVENTORY_TERMS.pageTitle}
          subtitle="Ενιαία, ιχνηλάσιμη διαχείριση υπολοίπων, δεσμεύσεων, απογραφών και κινήσεων."
          tail={headerActions}
          below={headerTabs}
        />
      )}

      {compact && (
        <div className="space-y-3 px-4">
          {headerActions}
          {headerTabs}
        </div>
      )}

      <InventoryQuickSearch
        products={products}
        availability={navigationRows}
        profileId={profile?.id}
        isAdmin={isAdmin}
        focusedSelection={focusRequest}
        onSelect={focusInventorySelection}
        onPost={openPosting}
        onScan={() => {
          setScannerPurpose('navigation');
          setScannerOpen(true);
        }}
        onGuide={() => setGuideOpen(true)}
      />

      {isAdmin && (reconciliationQuery.data?.blockingCount || 0) > 0 && (
        <div className="mx-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:mx-0" role="alert">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <div className="min-w-0 flex-1">
            <p className="font-black">Απαιτείται συμφωνία αποθέματος</p>
            <p className="mt-1 text-sm">Υπάρχουν {formatInventoryInteger(reconciliationQuery.data?.blockingCount || 0)} εκκρεμότητες που εμποδίζουν κινήσεις στα επηρεαζόμενα είδη.</p>
          </div>
          <button type="button" onClick={() => setActiveTab('reconciliation')} className={`${BTN_SECONDARY} shrink-0`}>Άνοιγμα</button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className={gutter}>
          <InventoryOverviewPanel
            rows={rows}
            totals={totals}
            warehouses={warehouses}
            events={events}
            eventsLoading={eventsQuery.isLoading}
            activeSessions={activeSessionsQuery.data || []}
            isAdmin={isAdmin}
            onOpenStock={openStock}
            onFocusRow={focusRow}
            onOpenMovements={() => setActiveTab('movements')}
            onOpenCountSession={() => setCountSessionOpen(true)}
          />
        </div>
      )}

      {activeTab === 'stock' && (
        <>
          <section className={`${CARD} mx-4 overflow-hidden sm:mx-0`} aria-labelledby="inventory-stock-title">
            <div className="flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 id="inventory-stock-title" className="font-black text-slate-900">Αναλυτικά Υπόλοιπα SKU</h2>
                <p className="mt-1 text-sm text-slate-600">Κύριο SKU → παραλλαγή → μέγεθος → αποθήκη, με άμεσες ενέργειες ανά θέση.</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={exportStockCsv} disabled={groupedRows.length === 0} className={`${BTN_SECONDARY} justify-center disabled:opacity-40`}>
                  <Download size={16} aria-hidden="true" /> Εξαγωγή CSV
                </button>
                {isAdmin && (
                  <button type="button" onClick={() => setCountSessionOpen(true)} className={`${BTN_SECONDARY} justify-center`}>
                    <ClipboardCheck size={17} aria-hidden="true" /> Συνεδρία Απογραφής
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/60 p-3 sm:px-5">
              <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Κατάσταση αποθέματος">
                {stockFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStockFilter(option.value)}
                    aria-pressed={stockFilter === option.value}
                    className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-black transition ${stockFilter === option.value ? 'bg-[#060b00] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
                <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} aria-label="Φίλτρο αποθήκης" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="all">Όλες οι αποθήκες</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Φίλτρο κατηγορίας προϊόντος" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="all">Όλες οι κατηγορίες</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select value={stockSort} onChange={(event) => setStockSort(event.target.value as StockSort)} aria-label="Ταξινόμηση κύριων κωδικών" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="sku">SKU, αύξουσα σειρά</option>
                  <option value="onhand-desc">Φυσικό, υψηλότερο πρώτα</option>
                  <option value="available-asc">Διαθέσιμο, χαμηλότερο πρώτα</option>
                  <option value="available-desc">Διαθέσιμο, υψηλότερο πρώτα</option>
                  <option value="low-stock">Χαμηλό απόθεμα πρώτα</option>
                </select>
                {listSearch.trim() && (
                  <span className="col-span-2 inline-flex min-w-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 lg:col-span-1">
                    Αναζήτηση: <span className="truncate font-mono">{listSearch}</span>
                    <button type="button" onClick={() => setListSearch('')} aria-label="Καθαρισμός αναζήτησης" className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button>
                  </span>
                )}
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setListSearch('');
                      setWarehouseFilter('all');
                      setCategoryFilter('all');
                      setStockFilter('all');
                      setStockSort('sku');
                    }}
                    className={`${BTN_SECONDARY} justify-center text-rose-700`}
                    aria-label="Καθαρισμός αναζήτησης, φίλτρων και ταξινόμησης"
                  >
                    <X size={17} aria-hidden="true" /> Καθαρισμός
                  </button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-bold text-slate-500">
                <span>Φυσικό <strong className="tabular-nums text-slate-800">{formatInventoryInteger(filteredTotals.onHand)}</strong></span>
                <span>Δεσμευμένο <strong className="tabular-nums text-indigo-700">{formatInventoryInteger(filteredTotals.reserved)}</strong></span>
                <span>Διαθέσιμο <strong className="tabular-nums text-emerald-700">{formatInventoryInteger(filteredTotals.available)}</strong></span>
                <span>Αναμενόμενο <strong className="tabular-nums text-blue-700">{formatInventoryInteger(filteredTotals.incoming)}</strong></span>
                <span>Ανεκτέλεστη <strong className="tabular-nums text-amber-700">{formatInventoryInteger(filteredTotals.outstandingDemand)}</strong></span>
              </div>
            </div>
          </section>

          <InventoryStockExplorer
            groups={groupedRows}
            productsBySku={productsBySku}
            compact={compact}
            isAdmin={isAdmin}
            canOperate={canOperate}
            searchTerm={deferredSearch}
            resetKey={explorerResetKey}
            focusRequest={focusRequest}
            protectedWarehouseIds={WORKFLOW_OWNED_WAREHOUSE_IDS}
            onOperation={(kind, row) => setOperation({ kind, row })}
            onPost={(row) => {
              const option = searchSkuProductOptions(products, `${row.productSku}${row.variantSuffix}`, 1)[0];
              if (option) openPosting(option);
              else showToast('Δεν ήταν δυνατή η ασφαλής επιλογή της παραλλαγής. Αναζητήστε ξανά το πλήρες SKU.', 'error');
            }}
            onProductSelect={onProductSelect}
          />
        </>
      )}

      {activeTab === 'movements' && (
        <div className={gutter}>
          <InventoryMovementsPanel
            events={events}
            loading={eventsQuery.isLoading}
            fetching={eventsQuery.isFetching}
            limit={movementLimit}
            warehouses={warehouses}
            isAdmin={isAdmin}
            onLoadMore={() => setMovementLimit((current) => current + MOVEMENT_PAGE_SIZE)}
            onReverse={setReversalEvent}
          />
        </div>
      )}

      {activeTab === 'warehouses' && (
        <div className="grid gap-4 px-4 sm:px-0 lg:grid-cols-[1fr_22rem]">
          <div className="grid content-start gap-3 md:grid-cols-2">
            {warehouses.map((warehouse) => {
              const stats = warehouseTotals.get(warehouse.id);
              const workflowOwned = WORKFLOW_OWNED_WAREHOUSE_IDS.has(warehouse.id);
              return (
                <article key={warehouse.id} className={`${CARD} flex flex-col p-4 ${warehouseForm.id === warehouse.id ? 'ring-2 ring-emerald-200' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${warehouse.type === 'Central' ? 'bg-[#060b00] text-white' : 'bg-slate-100 text-slate-600'}`}><Building2 size={18} aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-black text-slate-900">{warehouse.name}</p>
                        {warehouse.is_system && (
                          <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                            Προστατευμένη λειτουργία
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-slate-600">
                        {warehouse.category || getDefaultWarehouseCategory(warehouse.type)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {getWarehouseTypeLabel(warehouse.type)}
                        {warehouse.address ? ` · ${warehouse.address}` : ''}
                      </p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setWarehouseForm({
                            id: warehouse.id,
                            name: warehouse.name,
                            type: warehouse.type,
                            category: warehouse.category || getDefaultWarehouseCategory(warehouse.type),
                            address: warehouse.address || '',
                            isSystem: Boolean(warehouse.is_system),
                          })}
                          aria-label={`Επεξεργασία αποθήκης ${warehouse.name}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                        >
                          <PencilLine size={16} aria-hidden="true" />
                        </button>
                        {!warehouse.is_system && (
                          <button type="button" onClick={() => deleteWarehouse(warehouse)} aria-label={`Διαγραφή αποθήκης ${warehouse.name}`} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16} aria-hidden="true" /></button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Φυσικό</p>
                      <p className="font-black tabular-nums text-slate-800">{formatInventoryInteger(stats?.onHand || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2">
                      <p className="text-[10px] font-black uppercase text-emerald-600">Διαθέσιμο</p>
                      <p className="font-black tabular-nums text-emerald-700">{formatInventoryInteger(stats?.available || 0)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="text-[10px] font-black uppercase text-slate-400">Κωδικοί</p>
                      <p className="font-black tabular-nums text-slate-800">{formatInventoryInteger(stats?.skus.size || 0)}</p>
                    </div>
                  </div>
                  {workflowOwned && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] font-semibold leading-4 text-blue-800">
                      <LockKeyhole size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                      Ενημερώνεται μόνο από τη ροή Παρακαταθηκών· δεν δέχεται χειροκίνητες κινήσεις.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => openStock({ warehouseId: warehouse.id, status: 'in-stock' })}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Boxes size={14} aria-hidden="true" /> Προβολή υπολοίπων
                  </button>
                </article>
              );
            })}
          </div>
          {isAdmin && (
            <section className={`${CARD} h-fit p-5 lg:sticky lg:top-4`} aria-labelledby="warehouse-form-title">
              <h2 id="warehouse-form-title" className="font-black text-slate-900">{warehouseForm.id ? 'Επεξεργασία αποθήκης' : 'Νέα αποθήκη'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Η ονομασία και η κατηγορία εμφανίζονται παντού στο ERP. Η λειτουργία συστήματος της προεπιλεγμένης Κεντρικής και του κύριου Δειγματολογίου παραμένει προστατευμένη.
              </p>
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-bold text-slate-700">
                  Ονομασία
                  <input value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-emerald-500" placeholder="π.χ. Δειγματολόγιο Μαρίας" />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Κατηγορία / υπεύθυνος
                  <input value={warehouseForm.category} onChange={(event) => setWarehouseForm((current) => ({ ...current, category: event.target.value }))} maxLength={80} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-emerald-500" placeholder="π.χ. Δειγματολόγιο κύριου πλασιέ" />
                </label>
                {warehouseForm.isSystem ? (
                  <div>
                    <p className="text-sm font-bold text-slate-700">Λειτουργία αποθέματος</p>
                    <div className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-900">
                      {getWarehouseTypeLabel(warehouseForm.type)}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      Η λειτουργία παραμένει σταθερή ώστε η Κεντρική να είναι πάντα η προεπιλεγμένη αποθήκη και το κύριο Δειγματολόγιο να μην καταναλώνεται αυτόματα.
                    </p>
                  </div>
                ) : (
                  <label className="block text-sm font-bold text-slate-700">
                    Λειτουργία αποθέματος
                    <select
                      value={warehouseForm.type}
                      onChange={(event) => {
                        const nextType = event.target.value as Warehouse['type'];
                        setWarehouseForm((current) => ({
                          ...current,
                          type: nextType,
                          category: (
                            !current.category.trim()
                            || current.category === getDefaultWarehouseCategory(current.type)
                          )
                            ? getDefaultWarehouseCategory(nextType)
                            : current.category,
                        }));
                      }}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-normal"
                    >
                      {warehouseTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                      Επιλέξτε «Δειγματολόγιο» για κάθε ξεχωριστό σετ που διατηρεί ένας πλασιέ.
                    </span>
                  </label>
                )}
                <label className="block text-sm font-bold text-slate-700">
                  Τοποθεσία / σημείωση
                  <input value={warehouseForm.address} onChange={(event) => setWarehouseForm((current) => ({ ...current, address: event.target.value }))} maxLength={250} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-emerald-500" placeholder="π.χ. Πλασιέ Μαρία · Βαλίτσα 1" />
                </label>
                <div className="flex gap-2">
                  {warehouseForm.id && <button type="button" onClick={() => setWarehouseForm(createEmptyWarehouseForm())} className={`${BTN_SECONDARY} flex-1 justify-center`}>Ακύρωση</button>}
                  <button type="button" onClick={saveWarehouse} disabled={savingWarehouse || !warehouseForm.name.trim() || !warehouseForm.category.trim()} className={`${BTN_PRIMARY} flex-1 justify-center disabled:opacity-50`}>{savingWarehouse ? <Loader2 size={16} className="animate-spin" /> : warehouseForm.id ? <PencilLine size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{warehouseForm.id ? 'Αποθήκευση αλλαγών' : 'Προσθήκη αποθήκης'}</button>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      {activeTab === 'reconciliation' && isAdmin && (
        <div className="space-y-4 px-4 sm:px-0">
          <div className={`${CARD} p-5`}>
            <h2 className="font-black text-slate-900">Συμφωνία Αρχικών Υπολοίπων</h2>
            <p className="mt-1 text-sm text-slate-600">Κάθε επίλυση καταγράφεται ως Αρχική Συμφωνία Αποθέματος. Οι εκκρεμότητες που εμποδίζουν την έναρξη πρέπει να κλείσουν πριν ενεργοποιηθούν οι σχετικές κινήσεις.</p>
          </div>
          {reconciliationIssuesQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση εκκρεμοτήτων συμφωνίας…</div>
          ) : (reconciliationIssuesQuery.data || []).length === 0 ? (
            <div className={`${CARD} p-10 text-center text-emerald-700`}><CheckCircle className="mx-auto mb-3" /><p className="font-black">Δεν υπάρχουν εκκρεμότητες συμφωνίας αποθέματος.</p></div>
          ) : (
            (reconciliationIssuesQuery.data || []).map((issue) => (
              <ReconciliationIssueCard key={issue.id} issue={issue} warehouses={manualWarehouses} onResolved={refreshInventory} />
            ))
          )}
        </div>
      )}

      {operation && (
        <OperationDialog
          state={operation}
          warehouses={manualWarehouses}
          isAdmin={isAdmin}
          onClose={() => setOperation(null)}
          onSaved={refreshInventory}
        />
      )}
      {reversalEvent && (
        <MovementReversalDialog
          event={reversalEvent}
          events={events}
          onClose={() => setReversalEvent(null)}
          onSaved={async () => {
            await refreshInventory();
            return eventsQuery.refetch();
          }}
        />
      )}
      {scannerOpen && (
        <BarcodeScanner
          products={products}
          onScan={handleScan}
          onClose={() => {
            setScannerOpen(false);
            if (scannerPurpose === 'posting') setPostingOpen(true);
            if (scannerPurpose === 'count-session') setCountSessionOpen(true);
          }}
        />
      )}
      {guideOpen && <InventoryGuideDialog isAdmin={isAdmin} canOperate={canOperate} onClose={() => setGuideOpen(false)} />}
      {postingOpen && isAdmin && (
        <InventoryPostingDialog
          products={products}
          warehouses={manualWarehouses}
          availability={navigationRows}
          profileId={profile?.id}
          initialSelection={postingSelection}
          onRequestScan={() => {
            setScannerPurpose('posting');
            setPostingOpen(false);
            setScannerOpen(true);
          }}
          onPosted={async (result) => {
            applyInventoryPostingBalances(queryClient, result.balances, warehouses);
            await refreshInventoryAuditQueries(queryClient);
          }}
          onPrepareNext={() => setPostingSelection(null)}
          onClose={() => {
            setPostingOpen(false);
            setPostingSelection(null);
          }}
        />
      )}
      {countSessionOpen && isAdmin && (
        <InventoryCountSessionDialog
          products={products}
          warehouses={manualWarehouses}
          availability={navigationRows}
          profileId={profile?.id}
          expectedIdentityCount={countableIdentityCount}
          scannedSelection={countSessionScannedSelection}
          onRequestScan={() => {
            setScannerPurpose('count-session');
            setCountSessionOpen(false);
            setScannerOpen(true);
          }}
          onConsumeScannedSelection={() => setCountSessionScannedSelection(null)}
          onStart={({ clientSessionId, title, reason, warehouseId }) => (
            inventoryRepository.startInventoryCountSession({
              name: title,
              reason,
              warehouseIds: [warehouseId],
              idempotencyKey: clientSessionId,
            })
          )}
          onPostBatch={(sessionId, batch) => inventoryRepository.postInventoryCountBatch({
            sessionId,
            lines: batch.input.lines,
            idempotencyKey: batch.input.idempotencyKey || `inventory-count:${sessionId}:${crypto.randomUUID()}`,
          })}
          onApplyBalances={async (balances) => {
            applyInventoryPostingBalances(queryClient, balances, warehouses);
            await refreshInventoryAuditQueries(queryClient);
          }}
          onComplete={async (session, allowPartial) => {
            await inventoryRepository.completeInventoryCountSession({
              sessionId: session.sessionId,
              idempotencyKey: `inventory-count-complete:${session.sessionId}:${allowPartial ? 'partial' : 'full'}`,
              allowPartial,
            });
            await refreshInventory();
          }}
          onListActiveSessions={() => queryClient.fetchQuery({
            queryKey: inventoryKeys.countSessions(),
            queryFn: () => inventoryRepository.listCountSessions('active'),
            staleTime: 0,
          })}
          onLoadPostedEntries={(sessionId) => inventoryRepository.getCountSessionPostedEntries(sessionId)}
          onAbandon={async (sessionId, reason) => {
            await inventoryRepository.abandonInventoryCountSession({
              sessionId,
              reason,
              idempotencyKey: `inventory-count-abandon:${sessionId}:${crypto.randomUUID()}`,
            });
            await queryClient.invalidateQueries({ queryKey: inventoryKeys.countSessions() });
          }}
          onClose={() => {
            setCountSessionOpen(false);
            setCountSessionScannedSelection(null);
            void queryClient.invalidateQueries({ queryKey: inventoryKeys.countSessions() });
          }}
        />
      )}
    </div>
  );
}
