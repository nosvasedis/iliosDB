import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Check, ExternalLink, Handshake, Loader2, PackagePlus, RotateCcw } from 'lucide-react';
import type { Product, Warehouse } from '../../types';
import type { InventoryAvailability, InventoryEvent } from '../../features/inventory';
import {
  formatInventoryDateTime,
  formatInventoryInteger,
  formatSizeLabel,
  getInventoryEventReversalState,
  getInventoryOperationLabel,
  inventoryRepository,
} from '../../features/inventory';
import { useInventoryItemEvents } from '../../hooks/api/useInventory';
import { useUI } from '../UIProvider';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui/designTokens';
import { MovementReversalDialog } from './InventoryAdminDialogs';
import { InventorySheet, ProductThumb, QtyStepper, SkuLabel } from './ui/StockControls';

interface BucketRowProps {
  row: InventoryAvailability;
  destinations: Warehouse[];
  isAdmin: boolean;
  canOperate: boolean;
  onChanged: () => Promise<unknown>;
}

/** One warehouse × size balance with inline correction and transfer. */
function BucketRow({ row, destinations, isAdmin, canOperate, onChanged }: BucketRowProps) {
  const { showToast } = useUI();
  const [target, setTarget] = useState(row.onHand);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferQty, setTransferQty] = useState(Math.min(1, row.available));
  const [destinationId, setDestinationId] = useState(destinations[0]?.id || '');
  const [saving, setSaving] = useState(false);
  const changed = target !== row.onHand;

  const saveCount = async () => {
    if (target < row.reserved) {
      showToast(`Δεν γίνεται κάτω από τα δεσμευμένα (${row.reserved}).`, 'error');
      return;
    }
    setSaving(true);
    try {
      await inventoryRepository.postInventoryEntries({
        mode: 'count',
        reason: 'Γρήγορη διόρθωση',
        lines: [{ productSku: row.productSku, variantSuffix: row.variantSuffix, sizeInfo: row.sizeInfo, warehouseId: row.warehouseId, quantity: target }],
      });
      await onChanged();
      showToast(`${row.warehouseName}: ${row.onHand} → ${target}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η διόρθωση δεν ολοκληρώθηκε.', 'error');
      setTarget(row.onHand);
    } finally {
      setSaving(false);
    }
  };

  const transfer = async () => {
    if (!destinationId || transferQty <= 0) return;
    setSaving(true);
    try {
      await inventoryRepository.transferStock({
        productSku: row.productSku,
        variantSuffix: row.variantSuffix,
        sizeInfo: row.sizeInfo,
        sourceWarehouseId: row.warehouseId,
        destinationWarehouseId: destinationId,
        quantity: transferQty,
        reason: 'Μεταφορά μεταξύ αποθηκών',
      });
      await onChanged();
      setTransferOpen(false);
      showToast(`Μεταφέρθηκαν ${transferQty} τεμ.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Η μεταφορά δεν ολοκληρώθηκε.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0 text-sm font-bold text-slate-700">{formatSizeLabel(row.sizeInfo)}</span>
        <span className="min-w-0 flex-1 text-xs text-slate-500">
          {row.reserved > 0 && <>δεσμ. {formatInventoryInteger(row.reserved)} · </>}
          διαθ. <strong className="text-emerald-700">{formatInventoryInteger(row.available)}</strong>
        </span>
        {isAdmin ? (
          <QtyStepper value={target} onChange={setTarget} min={row.reserved} size="sm" disabled={saving} label={`Απόθεμα ${formatSizeLabel(row.sizeInfo)}`} />
        ) : (
          <span className="w-12 text-right text-base font-black tabular-nums text-slate-900">{formatInventoryInteger(row.onHand)}</span>
        )}
        {changed ? (
          <button type="button" onClick={saveCount} disabled={saving} aria-label="Αποθήκευση" className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
          </button>
        ) : canOperate && destinations.length > 0 && row.available > 0 ? (
          <button type="button" onClick={() => setTransferOpen((open) => !open)} aria-label="Μεταφορά" title="Μεταφορά σε άλλη αποθήκη" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <ArrowLeftRight size={15} />
          </button>
        ) : <span className="w-8" />}
      </div>
      {transferOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2">
          <QtyStepper value={transferQty} onChange={setTransferQty} min={1} max={row.available} size="sm" />
          <span className="text-xs font-bold text-slate-500">προς</span>
          <select value={destinationId} onChange={(event) => setDestinationId(event.target.value)} aria-label="Αποθήκη προορισμού" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold">
            {destinations.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </select>
          <button type="button" onClick={transfer} disabled={saving} className={`${BTN_PRIMARY} justify-center px-3 py-1.5 disabled:opacity-50`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : 'Μεταφορά'}
          </button>
        </div>
      )}
    </li>
  );
}

export interface InventoryItemDrawerProps {
  product?: Product;
  productSku: string;
  variantSuffix: string;
  rows: InventoryAvailability[];
  manualWarehouses: Warehouse[];
  consignmentWarehouseId: string;
  isAdmin: boolean;
  canOperate: boolean;
  onAddStock: (warehouseId?: string) => void;
  onOpenConsignments?: () => void;
  onProductSelect?: (product: Product) => void;
  onChanged: () => Promise<unknown>;
  onClose: () => void;
}

export default function InventoryItemDrawer({
  product,
  productSku,
  variantSuffix,
  rows,
  manualWarehouses,
  consignmentWarehouseId,
  isAdmin,
  canOperate,
  onAddStock,
  onOpenConsignments,
  onProductSelect,
  onChanged,
  onClose,
}: InventoryItemDrawerProps) {
  const [reversal, setReversal] = useState<InventoryEvent | null>(null);
  const eventsQuery = useInventoryItemEvents(productSku, variantSuffix);
  const events = eventsQuery.data || [];
  const warehouseNames = useMemo(() => new Map([
    ...manualWarehouses.map((warehouse) => [warehouse.id, warehouse.name] as const),
    ...rows.map((row) => [row.warehouseId, row.warehouseName] as const),
  ]), [manualWarehouses, rows]);

  const atCustomers = rows
    .filter((row) => row.warehouseId === consignmentWarehouseId)
    .reduce((sum, row) => sum + row.onHand, 0);
  const manualRows = rows.filter((row) => row.warehouseId !== consignmentWarehouseId);
  const byWarehouse = useMemo(() => {
    const groups = new Map<string, InventoryAvailability[]>();
    manualRows
      .filter((row) => row.onHand !== 0 || row.reserved !== 0)
      .forEach((row) => groups.set(row.warehouseId, [...(groups.get(row.warehouseId) || []), row]));
    groups.forEach((list) => list.sort((left, right) => (left.sizeInfo === '' ? -1 : right.sizeInfo === '' ? 1 : left.sizeInfo.localeCompare(right.sizeInfo, 'el-GR', { numeric: true }))));
    return groups;
  }, [manualRows]);
  const onHand = manualRows.reduce((sum, row) => sum + row.onHand, 0);
  const available = manualRows.reduce((sum, row) => sum + row.available, 0);
  const reserved = manualRows.reduce((sum, row) => sum + row.reserved, 0);

  return (
    <InventorySheet
      title={(
        <span className="flex items-center gap-3">
          <ProductThumb product={product} />
          <span className="min-w-0">
            <SkuLabel product={product} sku={productSku} variantSuffix={variantSuffix} className="text-lg" />
            {product?.category && <span className="block truncate text-xs font-semibold text-slate-500">{product.category}</span>}
          </span>
        </span>
      )}
      onClose={onClose}
      width="max-w-xl"
      footer={(
        <>
          {product && onProductSelect && (
            <button type="button" onClick={() => onProductSelect(product)} className={`${BTN_SECONDARY} justify-center`}><ExternalLink size={15} /> Καρτέλα</button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => onAddStock()} className={`${BTN_PRIMARY} flex-1 justify-center`}><PackagePlus size={16} /> Καταχώριση</button>
          )}
        </>
      )}
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10px] font-black uppercase text-slate-400">Στην αποθήκη</p>
            <p className="text-xl font-black tabular-nums text-slate-900">{formatInventoryInteger(onHand)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-2.5">
            <p className="text-[10px] font-black uppercase text-emerald-600">Διαθέσιμα</p>
            <p className="text-xl font-black tabular-nums text-emerald-700">{formatInventoryInteger(available)}</p>
            {reserved > 0 && <p className="text-[10px] font-bold text-indigo-600">{formatInventoryInteger(reserved)} δεσμ.</p>}
          </div>
          <button
            type="button"
            onClick={onOpenConsignments}
            disabled={!onOpenConsignments}
            className="rounded-xl bg-violet-50 p-2.5 enabled:hover:bg-violet-100"
          >
            <p className="flex items-center justify-center gap-1 text-[10px] font-black uppercase text-violet-600"><Handshake size={11} /> Σε πελάτες</p>
            <p className="text-xl font-black tabular-nums text-violet-700">{formatInventoryInteger(atCustomers)}</p>
          </button>
        </div>

        {byWarehouse.size === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Δεν υπάρχει απόθεμα σε καμία αποθήκη.
          </div>
        ) : (
          Array.from(byWarehouse.entries()).map(([warehouseId, list]) => (
            <section key={warehouseId}>
              <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                <h3 className="text-sm font-black text-slate-900">{warehouseNames.get(warehouseId)}</h3>
                <span className="text-sm font-black tabular-nums text-slate-500">{formatInventoryInteger(list.reduce((sum, row) => sum + row.onHand, 0))}</span>
              </div>
              <ul className="divide-y divide-slate-50">
                {list.map((row) => (
                  <BucketRow
                    key={`${row.warehouseId}:${row.sizeInfo}:${row.onHand}`}
                    row={row}
                    destinations={manualWarehouses.filter((warehouse) => warehouse.id !== row.warehouseId)}
                    isAdmin={isAdmin}
                    canOperate={canOperate}
                    onChanged={onChanged}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        <section>
          <h3 className="mb-1 text-xs font-black uppercase tracking-wide text-slate-400">Τελευταίες κινήσεις</h3>
          {eventsQuery.isLoading ? (
            <p className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Φόρτωση…</p>
          ) : events.length === 0 ? (
            <p className="py-3 text-sm text-slate-500">Καμία κίνηση ακόμη.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {events.map((event) => {
                const reversalState = getInventoryEventReversalState(event, events, isAdmin);
                return (
                  <li key={event.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className={`w-12 shrink-0 text-right font-black tabular-nums ${event.onHandDelta > 0 ? 'text-emerald-700' : event.onHandDelta < 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                      {event.onHandDelta > 0 ? '+' : ''}{formatInventoryInteger(event.onHandDelta)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-bold ${reversalState.isReversed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{getInventoryOperationLabel(event.operationType)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {warehouseNames.get(event.warehouseId) || '—'} · {formatSizeLabel(event.sizeInfo)} · {formatInventoryDateTime(event.createdAt)}
                      </span>
                    </span>
                    {reversalState.canReverse && (
                      <button type="button" onClick={() => setReversal(event)} aria-label="Ακύρωση κίνησης" title="Ακύρωση κίνησης" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {reversal && (
        <MovementReversalDialog
          event={reversal}
          events={events}
          onClose={() => setReversal(null)}
          onSaved={async () => { await onChanged(); return eventsQuery.refetch(); }}
        />
      )}
    </InventorySheet>
  );
}
