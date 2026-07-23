import React, { useDeferredValue, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  History,
  Loader2,
  LockKeyhole,
  MapPin,
  Package,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TrendingUp,
  UserRound,
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
  useInventoryAvailability,
  useInventoryEvents,
  useInventoryReconciliationIssues,
  useInventoryReconciliationStatus,
  applyInventoryPostingBalances,
  refreshInventoryAvailability,
  refreshInventoryAuditQueries,
} from '../../hooks/api/useInventory';
import { useWarehouses, warehouseKeys } from '../../hooks/api/useWarehouses';
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
import { searchSkuProductOptions, type SkuPickerOption } from '../../utils/skuProductPicker';

type InventoryTab = 'overview' | 'stock' | 'movements' | 'warehouses' | 'reconciliation';
type StockFilter = 'all' | 'low' | 'unavailable';
type StockSort = 'sku' | 'available-asc' | 'available-desc' | 'low-stock';

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

function InventoryMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: React.ElementType; tone: string }) {
  return (
    <div className={`${CARD} p-4 sm:p-5`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{formatInventoryInteger(value)}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`} aria-hidden>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
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
  const [quantity, setQuantity] = useState(state.kind === 'adjustment' ? state.row.onHand : state.kind === 'reorder' ? state.row.reorderPoint : 1);
  const [destinationWarehouseId, setDestinationWarehouseId] = useState(
    warehouses.find((warehouse) => warehouse.id !== state.row.warehouseId)?.id || '',
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeToClose(onClose, saving);

  const title = state.kind === 'adjustment'
    ? INVENTORY_TERMS.adjustment
    : state.kind === 'transfer'
      ? INVENTORY_TERMS.transfer
      : INVENTORY_TERMS.reorderPoint;

  const save = async () => {
    if ((state.kind === 'adjustment' || state.kind === 'transfer') && !reason.trim()) {
      showToast('Η αιτιολογία είναι υποχρεωτική για την πλήρη ιχνηλασιμότητα της κίνησης.', 'error');
      return;
    }
    if (state.kind === 'transfer' && (quantity <= 0 || quantity > state.row.available)) {
      showToast(`Η ποσότητα ενδοδιακίνησης πρέπει να είναι από 1 έως ${formatInventoryQuantity(state.row.available)}. Δεν πραγματοποιήθηκε καμία μεταβολή.`, 'error');
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

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-operation-title"
        className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h2 id="inventory-operation-title" className="text-lg font-black text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {state.row.productSku}{state.row.variantSuffix} {state.row.sizeInfo ? `· Μέγεθος ${state.row.sizeInfo}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>
        <div className="space-y-4 p-5">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600">
            <span className="font-bold">{state.row.warehouseName}</span> · {INVENTORY_TERMS.available}: {formatInventoryQuantity(state.row.available)}
          </div>
          {state.kind === 'transfer' && (
            <label className="block text-sm font-bold text-slate-700">
              {INVENTORY_TERMS.destinationWarehouse}
              <select
                autoFocus
                value={destinationWarehouseId}
                onChange={(event) => setDestinationWarehouseId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-emerald-500"
              >
                {warehouses.filter((warehouse) => warehouse.id !== state.row.warehouseId).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm font-bold text-slate-700">
            {state.kind === 'adjustment' ? 'Νέο φυσικό απόθεμα' : state.kind === 'reorder' ? INVENTORY_TERMS.reorderPoint : 'Ποσότητα ενδοδιακίνησης'}
            <input
              autoFocus={state.kind !== 'transfer'}
              type="number"
              min={state.kind === 'transfer' ? 1 : 0}
              max={state.kind === 'transfer' ? state.row.available : undefined}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(0, Number(event.target.value) || 0))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-lg font-black outline-none focus:border-emerald-500"
            />
            {state.kind === 'transfer' && state.row.available > 0 && (
              <button
                type="button"
                onClick={() => setQuantity(state.row.available)}
                className="mt-2 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                Επιλογή όλου του διαθέσιμου αποθέματος ({formatInventoryQuantity(state.row.available)})
              </button>
            )}
          </label>
          {state.kind !== 'reorder' && (
            <label className="block text-sm font-bold text-slate-700">
              Αιτιολογία
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                placeholder="Καταχωρίστε σαφή επιχειρησιακή αιτιολογία..."
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500"
              />
            </label>
          )}
          {state.kind === 'adjustment' && !isAdmin && (
            <p className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              Η διόρθωση φυσικού αποθέματος επιτρέπεται μόνο σε διαχειριστή.
            </p>
          )}
          {state.kind === 'adjustment' && isAdmin && (
            <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              Το Φυσικό Απόθεμα θα αλλάξει από {formatInventoryQuantity(state.row.onHand)} σε {formatInventoryQuantity(quantity)}. Η μεταβολή θα καταγραφεί στο Ιστορικό Κινήσεων.
            </p>
          )}
          {state.kind === 'transfer' && (
            <p className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
              Θα μετακινηθούν {formatInventoryQuantity(quantity)} από «{state.row.warehouseName}». Η εξαγωγή και η εισαγωγή θα καταχωριστούν μαζί.
            </p>
          )}
        </div>
        <footer className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} flex-1 justify-center disabled:opacity-50`}>Ακύρωση</button>
          <button
            type="button"
            onClick={save}
            disabled={saving || (state.kind === 'adjustment' && !isAdmin) || (state.kind === 'transfer' && !destinationWarehouseId)}
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
    <div className="fixed inset-0 z-[510] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={() => { if (!saving) onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-reversal-title"
        className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white shadow-2xl"
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
              Μεταβολή Φυσικού Αποθέματος: {event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)}
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
              maxLength={500}
              placeholder="Καταχωρίστε τον επιχειρησιακό λόγο της ακύρωσης..."
              className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-rose-500"
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

  const resolve = async () => {
    if (!note.trim()) {
      showToast('Η αιτιολογία συμφωνίας αποθέματος είναι υποχρεωτική.', 'error');
      return;
    }
    if (needsWarehouse && !targetWarehouseId) {
      showToast('Επιλέξτε Αποθήκη Προορισμού για το άγνωστο υπόλοιπο.', 'error');
      return;
    }
    setSaving(true);
    try {
      await inventoryRepository.resolveReconciliationIssue({
        issueId: issue.id,
        resolutionNote: note.trim(),
        targetOnHand: needsTarget ? Math.max(0, Number(target) || 0) : null,
        targetWarehouseId: needsWarehouse ? targetWarehouseId : null,
      });
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
          <div className="flex items-center gap-2">
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
            <input type="number" min={0} value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base font-black outline-none focus:border-emerald-500" />
          </label>
        ) : needsWarehouse ? (
          <label className="text-xs font-black text-slate-600">{INVENTORY_TERMS.destinationWarehouse}
            <select value={targetWarehouseId} onChange={(event) => setTargetWarehouseId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500">
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
        ) : <div className="hidden sm:block" />}
        <label className="text-xs font-black text-slate-600">Αιτιολογία απόφασης
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Καταχωρίστε την τεκμηρίωση της συμφωνίας..." className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
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

  const availabilityQuery = useInventoryAvailability();
  const eventsQuery = useInventoryEvents(activeTab === 'overview' || activeTab === 'movements');
  const reconciliationQuery = useInventoryReconciliationStatus(isAdmin);
  const reconciliationIssuesQuery = useInventoryReconciliationIssues(isAdmin && activeTab === 'reconciliation');
  const warehousesQuery = useWarehouses();
  const rows = availabilityQuery.data || [];
  const warehouses = warehousesQuery.data || [];
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
  const warehouseNames = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name])),
    [warehouses],
  );
  const warehouseSummaries = useMemo(() => {
    const byWarehouse = new Map<string, InventoryAvailability[]>();
    rows.forEach((row) => {
      const current = byWarehouse.get(row.warehouseId);
      if (current) current.push(row);
      else byWarehouse.set(row.warehouseId, [row]);
    });
    return Array.from(byWarehouse.entries())
      .map(([warehouseId, warehouseRows]) => ({
        warehouseId,
        warehouseName: warehouseRows[0]?.warehouseName || warehouseNames.get(warehouseId) || 'Αποθήκη',
        totals: calculateInventoryTotals(warehouseRows),
      }))
      .sort((left, right) => right.totals.onHand - left.totals.onHand);
  }, [rows, warehouseNames]);
  const exceptionRows = useMemo(
    () => rows
      .filter((row) => (
        (row.reorderPoint > 0 && row.available <= row.reorderPoint)
        || row.projectedAvailable < 0
      ))
      .sort((left, right) => left.projectedAvailable - right.projectedAvailable)
      .slice(0, 6),
    [rows],
  );
  const defaultWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.type === 'Central') || warehouses[0],
    [warehouses],
  );
  const navigationRows = useMemo(
    () => ensureCatalogInventoryAvailability(rows, products, defaultWarehouse),
    [rows, products, defaultWarehouse],
  );

  const filteredRows = useMemo(() => {
    return navigationRows.filter((row) => {
      const product = productsBySku.get(row.productSku);
      if (warehouseFilter !== 'all' && row.warehouseId !== warehouseFilter) return false;
      if (categoryFilter !== 'all' && product?.category !== categoryFilter) return false;
      if (stockFilter === 'low' && !(row.reorderPoint > 0 && row.available <= row.reorderPoint)) return false;
      if (stockFilter === 'unavailable' && row.available > 0) return false;
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
  const hasActiveFilters = Boolean(
    listSearch.trim()
    || warehouseFilter !== 'all'
    || categoryFilter !== 'all'
    || stockFilter !== 'all'
    || stockSort !== 'sku',
  );

  const refreshInventory = async () => {
    return refreshInventoryAvailability(queryClient);
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

  const saveWarehouse = async () => {
    if (!warehouseForm.name.trim()) {
      showToast('Η ονομασία αποθήκης είναι υποχρεωτική.', 'error');
      return;
    }
    if (!warehouseForm.category.trim()) {
      showToast('Η κατηγορία ή ο υπεύθυνος της αποθήκης είναι υποχρεωτικός.', 'error');
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
      showToast('Η αποθήκη διαγράφηκε.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Η αποθήκη δεν διαγράφηκε. Ελέγξτε αν διαθέτει υπόλοιπα ή ιστορικό κινήσεων.', 'error');
    }
  };

  const headerTabs = (
    <div className={BELOW_TAB_CONTAINER} role="tablist" aria-label="Ενότητες αποθήκης και αποθέματος">
      {tabs.filter((tab) => tab.id !== 'reconciliation' || isAdmin).map((tab) => {
        const Icon = tab.icon;
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
          </button>
        );
      })}
    </div>
  );

  if (availabilityQuery.isLoading) {
    return <div className="flex min-h-[320px] items-center justify-center gap-3 text-slate-500"><Loader2 className="animate-spin" /> Φόρτωση στοιχείων αποθέματος...</div>;
  }

  if (availabilityQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800" role="alert">
        <h2 className="font-black">Δεν ήταν δυνατή η φόρτωση του αποθέματος</h2>
        <p className="mt-2 text-sm">Η προβολή παρέμεινε αμετάβλητη. Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.</p>
        <button type="button" onClick={() => availabilityQuery.refetch()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">Επανάληψη</button>
      </div>
    );
  }

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
          subtitle="Ενιαία, ιχνηλάσιμη διαχείριση υπολοίπων, δεσμεύσεων και κινήσεων."
          below={headerTabs}
        />
      )}

      {compact && <div className="px-4">{headerTabs}</div>}

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
          <div>
            <p className="font-black">Απαιτείται συμφωνία αποθέματος</p>
            <p className="mt-1 text-sm">Υπάρχουν {formatInventoryInteger(reconciliationQuery.data?.blockingCount || 0)} εκκρεμότητες που εμποδίζουν κινήσεις στα επηρεαζόμενα είδη.</p>
          </div>
        </div>
      )}

      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 lg:grid-cols-6 sm:px-0">
            <InventoryMetric label={INVENTORY_TERMS.onHand} value={totals.onHand} icon={Package} tone="bg-slate-100 text-slate-700" />
            <InventoryMetric label={INVENTORY_TERMS.reserved} value={totals.reserved} icon={ClipboardList} tone="bg-indigo-50 text-indigo-700" />
            <InventoryMetric label={INVENTORY_TERMS.available} value={totals.available} icon={Boxes} tone="bg-emerald-50 text-emerald-700" />
            <InventoryMetric label={INVENTORY_TERMS.incoming} value={totals.incoming} icon={TrendingUp} tone="bg-blue-50 text-blue-700" />
            <InventoryMetric label={INVENTORY_TERMS.outstandingDemand} value={totals.outstandingDemand} icon={Activity} tone="bg-amber-50 text-amber-700" />
            <InventoryMetric label="Κάτω από Σημείο Αναπαραγγελίας" value={totals.lowStockCount} icon={AlertTriangle} tone="bg-rose-50 text-rose-700" />
          </div>

          <div className="grid gap-4 px-4 sm:px-0 xl:grid-cols-[1.1fr_0.9fr]">
            <section className={`${CARD} overflow-hidden`} aria-labelledby="inventory-control-center-title">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <h2 id="inventory-control-center-title" className="font-black text-slate-900">Κέντρο Ελέγχου Αποθέματος</h2>
                  <p className="mt-1 text-sm text-slate-600">Εξαιρέσεις που απαιτούν προτεραιότητα, όχι κατάλογος όλων των SKU.</p>
                </div>
                <button type="button" onClick={() => setActiveTab('stock')} className={`${BTN_SECONDARY} justify-center`}>
                  Αναλυτικά Υπόλοιπα <ArrowRight size={16} aria-hidden="true" />
                </button>
              </header>
              {exceptionRows.length === 0 ? (
                <div className="flex items-start gap-3 p-5 text-emerald-800">
                  <CheckCircle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                  <div>
                    <p className="font-black">Δεν υπάρχουν άμεσες εξαιρέσεις αποθέματος.</p>
                    <p className="mt-1 text-sm text-emerald-700">Δεν εντοπίστηκαν αρνητικές προβλέψεις ή είδη κάτω από ενεργό Σημείο Αναπαραγγελίας.</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {exceptionRows.map((row) => (
                    <button
                      key={`${row.productSku}:${row.variantSuffix}:${row.sizeInfo}:${row.warehouseId}`}
                      type="button"
                      onClick={() => {
                        setListSearch(`${row.productSku}${row.variantSuffix}`);
                        setActiveTab('stock');
                        setFocusRequest({ productSku: row.productSku, variantSuffix: row.variantSuffix, nonce: Date.now() });
                      }}
                      className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
                    >
                      <AlertTriangle size={18} className="shrink-0 text-amber-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-sm font-black text-slate-900">{row.productSku}{row.variantSuffix}{row.sizeInfo ? ` · ${row.sizeInfo}` : ''}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">{row.warehouseName}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-black text-rose-700">{formatInventoryInteger(row.available)} διαθέσιμα</span>
                        <span className="block text-xs text-slate-500">Πρόβλεψη {formatInventoryInteger(row.projectedAvailable)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className={`${CARD} overflow-hidden`} aria-labelledby="warehouse-distribution-title">
              <header className="border-b border-slate-100 p-5">
                <h2 id="warehouse-distribution-title" className="font-black text-slate-900">Κατανομή ανά Αποθήκη</h2>
                <p className="mt-1 text-sm text-slate-600">Συγκεντρωτική εικόνα Φυσικού και Διαθέσιμου Αποθέματος.</p>
              </header>
              <div className="divide-y divide-slate-100">
                {warehouseSummaries.map((summary) => (
                  <button
                    key={summary.warehouseId}
                    type="button"
                    onClick={() => {
                      setWarehouseFilter(summary.warehouseId);
                      setActiveTab('stock');
                    }}
                    className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-slate-50"
                  >
                    <MapPin size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 font-bold text-slate-800">{summary.warehouseName}</span>
                    <span className="text-right text-xs text-slate-500">
                      <strong className="block text-sm text-slate-900">{formatInventoryInteger(summary.totals.onHand)} φυσικά</strong>
                      {formatInventoryInteger(summary.totals.available)} διαθέσιμα
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className={`${CARD} mx-4 overflow-hidden sm:mx-0`} aria-labelledby="recent-inventory-movements-title">
            <header className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 id="recent-inventory-movements-title" className="font-black text-slate-900">Πρόσφατες Κινήσεις</h2>
                <p className="mt-1 text-sm text-slate-600">Οι τελευταίες καταχωρίσεις που επηρέασαν ή δέσμευσαν απόθεμα.</p>
              </div>
              <button type="button" onClick={() => setActiveTab('movements')} className={`${BTN_SECONDARY} justify-center`}>
                Πλήρες Ιστορικό <ArrowRight size={16} aria-hidden="true" />
              </button>
            </header>
            {eventsQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-8 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση πρόσφατων κινήσεων...</div>
            ) : events.length === 0 ? (
              <p className="p-8 text-center text-sm font-semibold text-slate-500">Δεν υπάρχουν ακόμη καταχωρισμένες κινήσεις.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {events.slice(0, 5).map((event) => (
                  <div key={event.id} className="flex items-center gap-3 p-4">
                    <History size={17} className="shrink-0 text-slate-500" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-slate-900">{getInventoryOperationLabel(event.operationType)}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{event.productSku}{event.variantSuffix}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-black ${event.onHandDelta > 0 ? 'text-emerald-700' : event.onHandDelta < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)}</p>
                      <p className="text-xs text-slate-400">{formatInventoryDateTime(event.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'stock' && (
        <>
          <div className={`${CARD} mx-4 flex flex-col gap-3 p-5 sm:mx-0 lg:flex-row lg:items-center lg:justify-between`}>
            <div>
              <h2 className="font-black text-slate-900">Αναλυτικά Υπόλοιπα SKU</h2>
              <p className="mt-1 text-sm text-slate-600">Λειτουργική ανάλυση κύριου SKU → παραλλαγής → μεγέθους → αποθήκης, με άμεσες ενέργειες καταχώρισης και Ενδοδιακίνησης.</p>
            </div>
            {isAdmin && (
              <button type="button" onClick={() => setCountSessionOpen(true)} className={`${BTN_SECONDARY} shrink-0 justify-center`}>
                <ClipboardCheck size={17} aria-hidden="true" /> Συνεδρία Απογραφής
              </button>
            )}
          </div>

          <div className={`${CARD} mx-4 p-3 sm:mx-0`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <select value={warehouseFilter} onChange={(event) => setWarehouseFilter(event.target.value)} aria-label="Φίλτρο αποθήκης" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="all">Όλες οι αποθήκες</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
                <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} aria-label="Φίλτρο κατηγορίας προϊόντος" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="all">Όλες οι κατηγορίες</option>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value as StockFilter)} aria-label="Φίλτρο διαθεσιμότητας" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="all">Όλες οι καταστάσεις</option>
                  <option value="low">Στο ή κάτω από το όριο</option>
                  <option value="unavailable">Χωρίς διαθέσιμο απόθεμα</option>
                </select>
                <select value={stockSort} onChange={(event) => setStockSort(event.target.value as StockSort)} aria-label="Ταξινόμηση κύριων κωδικών" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700">
                  <option value="sku">SKU, αύξουσα σειρά</option>
                  <option value="available-asc">Διαθέσιμο, χαμηλότερο πρώτα</option>
                  <option value="available-desc">Διαθέσιμο, υψηλότερο πρώτα</option>
                  <option value="low-stock">Χαμηλό απόθεμα πρώτα</option>
                </select>
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
            </div>
          </div>

          <InventoryStockExplorer
            groups={groupedRows}
            productsBySku={productsBySku}
            compact={compact}
            isAdmin={isAdmin}
            canOperate={canOperate}
            searchTerm={deferredSearch}
            focusRequest={focusRequest}
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
        <div className={`${CARD} mx-4 overflow-hidden sm:mx-0`}>
          {eventsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση ιστορικού κινήσεων...</div>
          ) : (eventsQuery.data || []).length === 0 ? (
            <div className="p-10 text-center text-slate-500"><History className="mx-auto mb-3 text-slate-300" /><p className="font-bold">Δεν υπάρχουν καταχωρισμένες κινήσεις.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(eventsQuery.data || []).map((event) => {
                const reversalState = getInventoryEventReversalState(event, events, isAdmin);
                return (
                  <article key={event.id} className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-center ${reversalState.isReversed ? 'bg-slate-50/70' : ''}`}>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${reversalState.isReversal ? 'bg-blue-50 text-blue-700' : reversalState.isReversed ? 'bg-slate-200 text-slate-500' : 'bg-slate-100 text-slate-600'}`}>
                      {reversalState.isReversal ? <RotateCcw size={18} aria-hidden="true" /> : <History size={18} aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900">{getInventoryOperationLabel(event.operationType)}</p>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{event.productSku}{event.variantSuffix}</span>
                        {reversalState.isReversed && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">Ακυρωμένη</span>}
                        {reversalState.isReversal && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Αντιλογιστική</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{event.reason}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>{formatInventoryDateTime(event.createdAt)}</span>
                        <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" /> {warehouseNames.get(event.warehouseId) || 'Μη αναγνωρισμένη αποθήκη'}</span>
                        {event.sizeInfo && <span>Μέγεθος {event.sizeInfo}</span>}
                        <span className="inline-flex items-center gap-1"><UserRound size={12} aria-hidden="true" /> {event.actorName || 'Χρήστης συστήματος'}</span>
                        {event.referenceId && <span>Αναφορά {event.referenceId}</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="text-right">
                        <p className={`font-black ${event.onHandDelta > 0 ? 'text-emerald-700' : event.onHandDelta < 0 ? 'text-rose-700' : 'text-slate-600'}`}>{event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)}</p>
                        <p className="text-xs text-slate-400">Υπόλοιπο {formatInventoryInteger(event.onHandAfter)}</p>
                      </div>
                      {reversalState.canReverse ? (
                        <button
                          type="button"
                          onClick={() => setReversalEvent(event)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50"
                          aria-label={`Ακύρωση κίνησης ${event.productSku}${event.variantSuffix}`}
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Ακύρωση
                        </button>
                      ) : !reversalState.isReversal && !reversalState.isReversed ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-500" title={reversalState.explanation}>
                          <LockKeyhole size={13} aria-hidden="true" /> Αναίρεση από το έγγραφο
                        </span>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'warehouses' && (
        <div className="grid gap-4 px-4 sm:px-0 lg:grid-cols-[1fr_22rem]">
          <div className={`${CARD} divide-y divide-slate-100 overflow-hidden`}>
            {warehouses.map((warehouse) => (
              <article key={warehouse.id} className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Building2 size={18} aria-hidden="true" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-900">{warehouse.name}</p>
                    {warehouse.is_system && (
                      <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                        Προστατευμένη λειτουργία
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-700">
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
              </article>
            ))}
          </div>
          {isAdmin && (
            <section className={`${CARD} h-fit p-5`} aria-labelledby="warehouse-form-title">
              <h2 id="warehouse-form-title" className="font-black text-slate-900">{warehouseForm.id ? 'Επεξεργασία αποθήκης' : 'Νέα αποθήκη'}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Η ονομασία και η κατηγορία εμφανίζονται παντού στο ERP. Η λειτουργία συστήματος της προεπιλεγμένης Κεντρικής και του κύριου Δειγματολογίου παραμένει προστατευμένη.
              </p>
              <div className="mt-4 space-y-4">
                <label className="block text-sm font-bold text-slate-700">
                  Ονομασία
                  <input value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" placeholder="π.χ. Δειγματολόγιο Μαρίας" />
                </label>
                <label className="block text-sm font-bold text-slate-700">
                  Κατηγορία / υπεύθυνος
                  <input value={warehouseForm.category} onChange={(event) => setWarehouseForm((current) => ({ ...current, category: event.target.value }))} maxLength={80} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" placeholder="π.χ. Δειγματολόγιο κύριου πλασιέ" />
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
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
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
                  <input value={warehouseForm.address} onChange={(event) => setWarehouseForm((current) => ({ ...current, address: event.target.value }))} maxLength={250} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-emerald-500" placeholder="π.χ. Πλασιέ Μαρία · Βαλίτσα 1" />
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
              <ReconciliationIssueCard key={issue.id} issue={issue} warehouses={warehouses} onResolved={refreshInventory} />
            ))
          )}
        </div>
      )}

      {operation && (
        <OperationDialog
          state={operation}
          warehouses={warehouses}
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
          warehouses={warehouses}
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
          warehouses={warehouses}
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
          onComplete={async (session) => {
            await inventoryRepository.completeInventoryCountSession({
              sessionId: session.sessionId,
              idempotencyKey: `inventory-count-complete:${session.sessionId}`,
            });
            await refreshInventory();
          }}
          onClose={() => {
            setCountSessionOpen(false);
            setCountSessionScannedSelection(null);
          }}
        />
      )}
    </div>
  );
}
