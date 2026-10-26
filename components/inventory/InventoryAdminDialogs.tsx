import React, { useState } from 'react';
import { Building2, CheckCircle, Loader2, LockKeyhole, PencilLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Warehouse } from '../../types';
import type { InventoryEvent, InventoryReconciliationIssue } from '../../features/inventory';
import {
  formatInventoryDateTime,
  formatInventoryInteger,
  formatInventoryQuantity,
  formatSizeLabel,
  getDefaultWarehouseCategory,
  getInventoryEventReversalState,
  getInventoryOperationLabel,
  getReconciliationIssueLabel,
  getWarehouseTypeLabel,
  inventoryRepository,
} from '../../features/inventory';
import { useInventoryEvents, useInventoryReconciliationIssues } from '../../hooks/api/useInventory';
import { warehouseKeys } from '../../hooks/api/useWarehouses';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { useUI } from '../UIProvider';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';
import InventoryMovementsPanel from './InventoryMovementsPanel';
import { InventorySheet } from './ui/StockControls';

const INPUT = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-900';

export function MovementReversalDialog({
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
  useRestartDraft('Ακύρωση κίνησης', { reason }, { busy: saving });
  const reversalState = getInventoryEventReversalState(event, events, true);

  const submit = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await inventoryRepository.reverseMovementEvent({
        eventId: event.id,
        reason,
        idempotencyKey: `movement-reversal:${event.id}:${crypto.randomUUID()}`,
      });
      await onSaved();
      showToast('Η κίνηση ακυρώθηκε.', 'success');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η ακύρωση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventorySheet
      title="Ακύρωση κίνησης"
      subtitle={<span className="font-mono font-bold">{event.productSku}{event.variantSuffix} · {formatSizeLabel(event.sizeInfo)}</span>}
      onClose={onClose}
      busy={saving}
      width="max-w-md"
      zIndex="z-[520]"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} flex-1 justify-center`}>Πίσω</button>
          <button type="button" onClick={submit} disabled={saving || !reason.trim()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-black text-white hover:bg-rose-800 disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />} Ακύρωση κίνησης
          </button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-black text-slate-800">{getInventoryOperationLabel(event.operationType)} · {event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)}</p>
          <p className="mt-1 text-slate-600">{event.reason}</p>
          <p className="mt-1 text-xs text-slate-400">{formatInventoryDateTime(event.createdAt)}</p>
        </div>
        <p className="text-xs text-slate-500">{reversalState.explanation}</p>
        <input autoFocus value={reason} onChange={(changeEvent) => setReason(changeEvent.target.value)} maxLength={480} placeholder="Γιατί ακυρώνεται;" className={INPUT} />
      </div>
    </InventorySheet>
  );
}

export function InventoryHistoryDialog({
  warehouses,
  isAdmin,
  onClose,
  onRefresh,
}: {
  warehouses: Warehouse[];
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [limit, setLimit] = useState(250);
  const [reversal, setReversal] = useState<InventoryEvent | null>(null);
  const eventsQuery = useInventoryEvents(true, limit);
  const events = eventsQuery.data || [];
  return (
    <InventorySheet title="Ιστορικό κινήσεων" onClose={onClose} width="max-w-5xl">
      <InventoryMovementsPanel
        events={events}
        loading={eventsQuery.isLoading}
        fetching={eventsQuery.isFetching}
        limit={limit}
        warehouses={warehouses}
        isAdmin={isAdmin}
        onLoadMore={() => setLimit((current) => current + 250)}
        onReverse={setReversal}
      />
      {reversal && (
        <MovementReversalDialog
          event={reversal}
          events={events}
          onClose={() => setReversal(null)}
          onSaved={async () => { await onRefresh(); return eventsQuery.refetch(); }}
        />
      )}
    </InventorySheet>
  );
}

function ReconciliationIssueCard({ issue, warehouses, onResolved }: { issue: InventoryReconciliationIssue; warehouses: Warehouse[]; onResolved: () => Promise<unknown> }) {
  const { showToast } = useUI();
  const needsTarget = issue.issueType === 'negative_opening_balance' || issue.issueType === 'duplicate_location_rows';
  const needsWarehouse = issue.issueType === 'unknown_warehouse';
  const [target, setTarget] = useState(needsTarget ? String(Math.max(0, issue.actualQuantity || 0)) : '');
  const [targetWarehouseId, setTargetWarehouseId] = useState(warehouses.find((warehouse) => warehouse.type === 'Central')?.id || warehouses[0]?.id || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const resolve = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await inventoryRepository.resolveReconciliationIssue({
        issueId: issue.id,
        resolutionNote: note.trim(),
        targetOnHand: needsTarget ? Number(target || 0) : null,
        targetWarehouseId: needsWarehouse ? targetWarehouseId : null,
      });
      await onResolved();
      showToast('Η εκκρεμότητα επιλύθηκε.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η επίλυση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${issue.severity === 'blocking' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
          {issue.severity === 'blocking' ? 'Μπλοκάρει κινήσεις' : 'Προειδοποίηση'}
        </span>
        <h3 className="text-sm font-black text-slate-900">{getReconciliationIssueLabel(issue.issueType)}</h3>
      </div>
      <p className="mt-1 font-mono text-sm font-bold text-slate-700">{issue.productSku || '—'}{issue.variantSuffix} · {formatSizeLabel(issue.sizeInfo)}</p>
      {(issue.expectedQuantity != null || issue.actualQuantity != null) && (
        <p className="mt-1 text-xs text-slate-500">Αναμενόμενο {issue.expectedQuantity ?? '—'} · Καταγεγραμμένο {issue.actualQuantity ?? '—'}</p>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {needsTarget && (
          <input aria-label="Σωστή ποσότητα" inputMode="numeric" value={target} onChange={(event) => setTarget(event.target.value.replace(/[^\d]/g, ''))} className={`${INPUT} sm:w-28`} />
        )}
        {needsWarehouse && (
          <select aria-label="Αποθήκη" value={targetWarehouseId} onChange={(event) => setTargetWarehouseId(event.target.value)} className={`${INPUT} sm:w-48`}>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        )}
        <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Σημείωση επίλυσης" className={INPUT} />
        <button type="button" onClick={resolve} disabled={saving || !note.trim()} className={`${BTN_PRIMARY} shrink-0 justify-center disabled:opacity-50`}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : 'Επίλυση'}
        </button>
      </div>
    </article>
  );
}

export function ReconciliationDialog({ warehouses, onClose, onResolved }: { warehouses: Warehouse[]; onClose: () => void; onResolved: () => Promise<unknown> }) {
  const issuesQuery = useInventoryReconciliationIssues(true);
  const issues = issuesQuery.data || [];
  return (
    <InventorySheet title="Συμφωνία αποθέματος" subtitle="Εκκρεμότητες που χρειάζονται απόφαση διαχειριστή" onClose={onClose} width="max-w-3xl">
      {issuesQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 p-10 text-slate-500"><Loader2 size={18} className="animate-spin" /> Φόρτωση…</div>
      ) : issues.length === 0 ? (
        <div className="p-10 text-center text-emerald-700"><CheckCircle className="mx-auto mb-2" /><p className="font-black">Δεν υπάρχουν εκκρεμότητες.</p></div>
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => <ReconciliationIssueCard key={issue.id} issue={issue} warehouses={warehouses} onResolved={onResolved} />)}
        </div>
      )}
    </InventorySheet>
  );
}

interface WarehouseFormState {
  id?: string;
  name: string;
  type: Warehouse['type'];
  category: string;
  address: string;
  isSystem: boolean;
}

const emptyWarehouseForm = (): WarehouseFormState => ({
  name: '', type: 'Showroom', category: getDefaultWarehouseCategory('Showroom'), address: '', isSystem: false,
});

const warehouseTypeOptions: Array<{ value: Warehouse['type']; label: string }> = [
  { value: 'Showroom', label: 'Δειγματολόγιο' },
  { value: 'Store', label: 'Αποθηκευτικός χώρος' },
  { value: 'Other', label: 'Λοιπή θέση αποθέματος' },
];

export function WarehousesDialog({
  warehouses,
  totals,
  protectedIds,
  isAdmin,
  onClose,
  onRefresh,
  onShowWarehouse,
}: {
  warehouses: Warehouse[];
  totals: Map<string, { onHand: number; reserved: number; skus: number }>;
  protectedIds: ReadonlySet<string>;
  isAdmin: boolean;
  onClose: () => void;
  onRefresh: () => Promise<unknown>;
  onShowWarehouse: (warehouseId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const [form, setForm] = useState<WarehouseFormState | null>(null);
  const [saving, setSaving] = useState(false);
  useRestartDraft('Στοιχεία αποθήκης', form, { enabled: !!form, busy: saving });

  const save = async () => {
    if (!form || !form.name.trim() || !form.category.trim()) return;
    const normalized = form.name.trim().toLocaleLowerCase('el-GR');
    if (warehouses.some((warehouse) => warehouse.id !== form.id && warehouse.name.trim().toLocaleLowerCase('el-GR') === normalized)) {
      showToast('Υπάρχει ήδη αποθήκη με αυτό το όνομα.', 'error');
      return;
    }
    setSaving(true);
    try {
      await inventoryRepository.saveWarehouse({ id: form.id, name: form.name, type: form.type, category: form.category, address: form.address });
      await Promise.all([queryClient.invalidateQueries({ queryKey: warehouseKeys.all }), onRefresh()]);
      showToast(form.id ? 'Η αποθήκη ενημερώθηκε.' : 'Η αποθήκη δημιουργήθηκε.', 'success');
      setForm(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η αποθήκη δεν αποθηκεύτηκε.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (warehouse: Warehouse) => {
    const stats = totals.get(warehouse.id);
    if (stats && (stats.onHand > 0 || stats.reserved > 0)) {
      showToast(`Η «${warehouse.name}» έχει ${formatInventoryQuantity(stats.onHand)}. Μεταφέρετε ή μηδενίστε το απόθεμα πρώτα.`, 'error');
      return;
    }
    const accepted = await confirm({ title: 'Διαγραφή αποθήκης', message: `Να διαγραφεί η «${warehouse.name}»;`, confirmText: 'Διαγραφή', isDestructive: true });
    if (!accepted) return;
    try {
      await inventoryRepository.deleteWarehouse(warehouse.id);
      await Promise.all([queryClient.invalidateQueries({ queryKey: warehouseKeys.all }), onRefresh()]);
      showToast('Η αποθήκη διαγράφηκε.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η αποθήκη δεν διαγράφηκε.', 'error');
    }
  };

  return (
    <InventorySheet
      title="Αποθήκες"
      onClose={onClose}
      busy={saving}
      width="max-w-3xl"
      footer={isAdmin && !form ? (
        <button type="button" onClick={() => setForm(emptyWarehouseForm())} className={`${BTN_PRIMARY} ml-auto justify-center`}><Plus size={16} /> Νέα αποθήκη</button>
      ) : undefined}
    >
      {form ? (
        <div className="space-y-3">
          <label className="block text-xs font-black text-slate-600">Όνομα
            <input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} placeholder="π.χ. Δειγματολόγιο Μαρίας" className={`mt-1 ${INPUT}`} />
          </label>
          <label className="block text-xs font-black text-slate-600">Κατηγορία / υπεύθυνος
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={80} className={`mt-1 ${INPUT}`} />
          </label>
          {!form.isSystem && (
            <label className="block text-xs font-black text-slate-600">Τύπος
              <select
                value={form.type}
                onChange={(event) => {
                  const type = event.target.value as Warehouse['type'];
                  setForm({ ...form, type, category: form.category === getDefaultWarehouseCategory(form.type) ? getDefaultWarehouseCategory(type) : form.category });
                }}
                className={`mt-1 ${INPUT} bg-white`}
              >
                {warehouseTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          <label className="block text-xs font-black text-slate-600">Τοποθεσία / σημείωση
            <input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} maxLength={250} className={`mt-1 ${INPUT}`} />
          </label>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => setForm(null)} disabled={saving} className={`${BTN_SECONDARY} flex-1 justify-center`}>Πίσω</button>
            <button type="button" onClick={save} disabled={saving || !form.name.trim() || !form.category.trim()} className={`${BTN_PRIMARY} flex-1 justify-center disabled:opacity-50`}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : null} Αποθήκευση
            </button>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {warehouses.map((warehouse) => {
            const stats = totals.get(warehouse.id);
            const locked = protectedIds.has(warehouse.id);
            return (
              <li key={warehouse.id} className="flex items-center gap-3 py-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${warehouse.type === 'Central' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {locked ? <LockKeyhole size={16} /> : <Building2 size={16} />}
                </span>
                <button type="button" onClick={() => onShowWarehouse(warehouse.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-black text-slate-900">{warehouse.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {locked ? 'Ενημερώνεται μόνο από τις Παρακαταθήκες' : `${warehouse.category || getWarehouseTypeLabel(warehouse.type)}${warehouse.address ? ` · ${warehouse.address}` : ''}`}
                  </p>
                </button>
                <span className="text-right text-xs text-slate-500">
                  <strong className="block text-base font-black tabular-nums text-slate-900">{formatInventoryInteger(stats?.onHand || 0)}</strong>
                  {formatInventoryInteger(stats?.skus || 0)} κωδ.
                </span>
                {isAdmin && !locked && (
                  <span className="flex">
                    <button
                      type="button"
                      aria-label={`Επεξεργασία ${warehouse.name}`}
                      onClick={() => setForm({ id: warehouse.id, name: warehouse.name, type: warehouse.type, category: warehouse.category || getDefaultWarehouseCategory(warehouse.type), address: warehouse.address || '', isSystem: Boolean(warehouse.is_system) })}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                    >
                      <PencilLine size={15} />
                    </button>
                    {!warehouse.is_system && (
                      <button type="button" aria-label={`Διαγραφή ${warehouse.name}`} onClick={() => remove(warehouse)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </InventorySheet>
  );
}
