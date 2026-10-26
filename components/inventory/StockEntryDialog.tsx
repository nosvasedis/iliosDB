import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, PackagePlus, Trash2 } from 'lucide-react';
import type { Product, Warehouse } from '../../types';
import type {
  InventoryAvailability,
  InventoryPostingMode,
  InventoryPostingResult,
  ParsedStockEntry,
} from '../../features/inventory';
import {
  buildStockEntryPostingLines,
  countConsolidationWarnings,
  formatInventoryInteger,
  formatSizeLabel,
  inventoryRepository,
  stockSizeOptions,
} from '../../features/inventory';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { useUI } from '../UIProvider';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';
import { InventorySheet, ProductThumb, QtyStepper, SizeChips, SkuLabel, SkuQuickInput } from './ui/StockControls';

interface EntryLine {
  key: string;
  product: Product;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
}

const REASONS: Record<InventoryPostingMode, string[]> = {
  increase: ['Παραλαβή από παραγωγή', 'Παραλαβή από προμηθευτή', 'Επιστροφή στο απόθεμα', 'Διόρθωση'],
  count: ['Απογραφή', 'Διόρθωση'],
};
const OTHER_REASON = 'Άλλο';

function warehouseStorageKey(profileId?: string): string {
  return `ilios:inventory:last-warehouse:${profileId || 'anonymous'}`;
}

function preferredWarehouseId(warehouses: Warehouse[], profileId?: string, initial?: string): string {
  if (initial && warehouses.some((warehouse) => warehouse.id === initial)) return initial;
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(warehouseStorageKey(profileId)); } catch { saved = null; }
  if (saved && warehouses.some((warehouse) => warehouse.id === saved)) return saved;
  return warehouses.find((warehouse) => warehouse.type === 'Central')?.id || warehouses[0]?.id || '';
}

export interface StockEntryDialogProps {
  products: Product[];
  warehouses: Warehouse[];
  availability: InventoryAvailability[];
  profileId?: string;
  initialEntries?: ParsedStockEntry[];
  initialWarehouseId?: string;
  initialMode?: InventoryPostingMode;
  /** A scanned item to append, with a nonce so the same code can be scanned twice. */
  incoming?: { entry: ParsedStockEntry; nonce: number } | null;
  onRequestScan?: () => void;
  onPosted: (result: InventoryPostingResult) => Promise<void> | void;
  onClose: () => void;
}

/**
 * Fast multi-line stock entry: pick the warehouse once, then type or scan
 * `SKU [size] [qty]` lines. Size is optional for every product.
 */
export default function StockEntryDialog({
  products,
  warehouses,
  availability,
  profileId,
  initialEntries = [],
  initialWarehouseId,
  initialMode = 'increase',
  incoming,
  onRequestScan,
  onPosted,
  onClose,
}: StockEntryDialogProps) {
  const { showToast } = useUI();
  const [mode, setMode] = useState<InventoryPostingMode>(initialMode);
  const [warehouseId, setWarehouseId] = useState(() => preferredWarehouseId(warehouses, profileId, initialWarehouseId));
  const [lines, setLines] = useState<EntryLine[]>([]);
  const [reasonChoice, setReasonChoice] = useState(REASONS[initialMode][0]);
  const [customReason, setCustomReason] = useState('');
  const [sizeEditorKey, setSizeEditorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = useRestartDraft('Καταχώριση αποθέματος', { mode, warehouseId, lines: lines.map(({ product, ...rest }) => ({ ...rest, sku: product.sku })) }, { busy: saving });

  const addEntry = (entry: ParsedStockEntry) => {
    setLines((current) => {
      const match = current.find((line) => (
        line.product.sku === entry.product.sku
        && line.variantSuffix === entry.variantSuffix
        && line.sizeInfo === entry.sizeInfo
      ));
      const quantity = entry.quantity ?? 1;
      if (match) return current.map((line) => (line === match ? { ...line, quantity: line.quantity + quantity } : line));
      return [...current, {
        key: crypto.randomUUID(),
        product: entry.product,
        variantSuffix: entry.variantSuffix,
        sizeInfo: entry.sizeInfo,
        quantity,
      }];
    });
  };

  useEffect(() => {
    initialEntries.forEach(addEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (incoming) addEntry(incoming.entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.nonce]);

  const currentOnHand = (line: Pick<EntryLine, 'product' | 'variantSuffix' | 'sizeInfo'>) => availability
    .filter((row) => (
      row.productSku === line.product.sku
      && row.variantSuffix === line.variantSuffix
      && row.warehouseId === warehouseId
      && row.sizeInfo === line.sizeInfo
    ))
    .reduce((sum, row) => sum + row.onHand, 0);

  const sizeCounts = (line: EntryLine) => {
    const counts: Record<string, number> = {};
    availability
      .filter((row) => row.productSku === line.product.sku && row.variantSuffix === line.variantSuffix && row.warehouseId === warehouseId)
      .forEach((row) => { counts[row.sizeInfo] = (counts[row.sizeInfo] || 0) + row.onHand; });
    return counts;
  };

  const drafts = useMemo(() => lines.map((line) => ({
    productSku: line.product.sku,
    variantSuffix: line.variantSuffix,
    sizeInfo: line.sizeInfo,
    quantity: line.quantity,
  })), [lines]);
  const consolidation = mode === 'count' ? countConsolidationWarnings(drafts, warehouseId, availability) : [];
  const totalPieces = lines.reduce((sum, line) => sum + line.quantity, 0);
  const reason = reasonChoice === OTHER_REASON ? customReason.trim() : reasonChoice;
  const invalid = lines.length === 0
    || !warehouseId
    || !reason
    || (mode === 'increase' && lines.some((line) => line.quantity <= 0));

  const switchMode = (next: InventoryPostingMode) => {
    setMode(next);
    setReasonChoice(REASONS[next][0]);
  };

  const submit = async () => {
    if (invalid) return;
    let postingLines;
    try {
      postingLines = buildStockEntryPostingLines(drafts, mode, warehouseId, availability);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Ελέγξτε τις γραμμές.', 'error');
      return;
    }
    setSaving(true);
    try {
      const result = await inventoryRepository.postInventoryEntries({ mode, lines: postingLines, reason });
      try { window.localStorage.setItem(warehouseStorageKey(profileId), warehouseId); } catch { /* optional */ }
      draft.markSaved();
      await onPosted(result);
      const warehouseName = warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || '';
      showToast(
        mode === 'increase'
          ? `Προστέθηκαν ${formatInventoryInteger(totalPieces)} τεμ. στην «${warehouseName}».`
          : `Η απογραφή ${formatInventoryInteger(lines.length)} γραμμών καταχωρίστηκε στην «${warehouseName}».`,
        'success',
      );
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η καταχώριση δεν ολοκληρώθηκε.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <InventorySheet
      title="Καταχώριση αποθέματος"
      onClose={onClose}
      busy={saving}
      width="max-w-2xl"
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className={`${BTN_SECONDARY} justify-center`}>Ακύρωση</button>
          <button type="button" onClick={submit} disabled={saving || invalid} className={`${BTN_PRIMARY} flex-1 justify-center disabled:opacity-50`}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <PackagePlus size={16} />}
            {mode === 'increase'
              ? `Προσθήκη ${lines.length ? `${formatInventoryInteger(totalPieces)} τεμ.` : ''}`
              : `Καταχώριση απογραφής${lines.length ? ` (${lines.length})` : ''}`}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Τρόπος">
            {(['increase', 'count'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => switchMode(option)}
                className={`rounded-lg px-3 py-2 text-sm font-black transition ${mode === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {option === 'increase' ? 'Προσθήκη' : 'Απογραφή'}
              </button>
            ))}
          </div>
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            aria-label="Αποθήκη"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-slate-900"
          >
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-500">
          {mode === 'increase'
            ? 'Οι ποσότητες προστίθενται στο υπάρχον απόθεμα.'
            : 'Οι ποσότητες γίνονται το νέο ακριβές απόθεμα της αποθήκης.'}
        </p>

        <SkuQuickInput products={products} onResolve={addEntry} onScan={onRequestScan} autoFocus />

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            Πληκτρολογήστε ή σαρώστε κωδικό. Το μέγεθος είναι προαιρετικό.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {lines.map((line) => {
              const now = currentOnHand(line);
              const after = mode === 'increase' ? now + line.quantity : line.quantity;
              const editingSize = sizeEditorKey === line.key;
              return (
                <li key={line.key} className="p-3">
                  <div className="flex items-center gap-3">
                    <ProductThumb product={line.product} size="sm" />
                    <div className="min-w-0 flex-1">
                      <SkuLabel product={line.product} sku={line.product.sku} variantSuffix={line.variantSuffix} className="text-sm" />
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <button
                          type="button"
                          onClick={() => setSizeEditorKey(editingSize ? null : line.key)}
                          className={`rounded-md px-1.5 py-0.5 font-bold ${line.sizeInfo ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'} hover:ring-1 hover:ring-slate-400`}
                        >
                          {formatSizeLabel(line.sizeInfo)} ▾
                        </button>
                        <span className="tabular-nums">τώρα {formatInventoryInteger(now)} → <strong className="text-slate-800">{formatInventoryInteger(after)}</strong></span>
                      </div>
                    </div>
                    <QtyStepper
                      value={line.quantity}
                      min={mode === 'increase' ? 1 : 0}
                      size="sm"
                      onChange={(quantity) => setLines((current) => current.map((item) => (item.key === line.key ? { ...item, quantity } : item)))}
                    />
                    <button type="button" aria-label="Αφαίρεση γραμμής" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {editingSize && (
                    <div className="mt-2 pl-12">
                      <SizeChips
                        options={stockSizeOptions(line.product, Object.keys(sizeCounts(line)))}
                        counts={sizeCounts(line)}
                        value={line.sizeInfo}
                        onChange={(sizeInfo) => {
                          setLines((current) => current.map((item) => (item.key === line.key ? { ...item, sizeInfo } : item)));
                          setSizeEditorKey(null);
                        }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {consolidation.length > 0 && (
          <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {consolidation.join(', ')}: έχει απόθεμα ανά μέγεθος. Η απογραφή «Χωρίς μέγεθος» θα ορίσει το σύνολο και θα μηδενίσει τα μεγέθη.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">Αιτία</p>
          <div className="flex flex-wrap gap-1.5">
            {[...REASONS[mode], OTHER_REASON].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setReasonChoice(option)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${reasonChoice === option ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
              >
                {option}
              </button>
            ))}
          </div>
          {reasonChoice === OTHER_REASON && (
            <input
              autoFocus
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
              maxLength={500}
              placeholder="Γράψτε την αιτία"
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
            />
          )}
        </div>
      </div>
    </InventorySheet>
  );
}
