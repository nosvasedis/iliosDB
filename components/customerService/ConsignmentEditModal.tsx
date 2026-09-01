import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Pencil, Plus, Warehouse, X } from 'lucide-react';
import type { Consignment, ConsignmentLine, Product } from '../../types';
import SkuProductPicker from '../legal/SkuProductPicker';
import ConsignmentBadge from './ConsignmentBadge';
import CustomerSearchSelect from './CustomerSearchSelect';
import ViewportPortal from './ViewportPortal';
import { getCatalogSelectionPricing } from '../../utils/skuProductPicker';
import { formatGreekMoney, formatGreekNumber } from '../../features/customerService';
import {
  validatePendingConsignmentEdit,
} from '../../features/customerService/pendingConsignmentEdit';
import type { UpdatePendingConsignmentInput } from '../../features/customerService/types';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '../ui/designTokens';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';

type CustomerOption = { id: string; full_name: string };
type WarehouseOption = { id: string; name: string };

type EditLine = {
  key: string;
  id?: string;
  sku: string;
  variantSuffix: string;
  sizeInfo: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
};

function toDateInput(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function emptyLine(): EditLine {
  return {
    key: crypto.randomUUID(),
    sku: '',
    variantSuffix: '',
    sizeInfo: '',
    quantity: 1,
    unitCost: 0,
    unitPrice: 0,
  };
}

function linesFromConsignment(lines: ConsignmentLine[]): EditLine[] {
  if (lines.length === 0) return [emptyLine()];
  return lines.map((line) => ({
    key: line.id,
    id: line.id,
    sku: line.product_sku,
    variantSuffix: line.variant_suffix || '',
    sizeInfo: line.size_info || '',
    quantity: line.quantity,
    unitCost: Number(line.locked_unit_cost) || 0,
    unitPrice: Number(line.locked_unit_price) || 0,
  }));
}

interface Props {
  entry: Consignment;
  lines: ConsignmentLine[];
  customers: CustomerOption[];
  products: Product[];
  warehouses: WarehouseOption[];
  canSeeCost: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (input: UpdatePendingConsignmentInput) => Promise<void>;
}

export default function ConsignmentEditModal({
  entry,
  lines,
  customers,
  products,
  warehouses,
  canSeeCost,
  saving,
  onClose,
  onSubmit,
}: Props) {
  const [customerId, setCustomerId] = useState(entry.customer_id);
  const [warehouseId, setWarehouseId] = useState(entry.source_warehouse_id);
  const [reviewDueAt, setReviewDueAt] = useState(toDateInput(entry.review_due_at));
  const [notes, setNotes] = useState(entry.notes || '');
  const [editLines, setEditLines] = useState<EditLine[]>(() => linesFromConsignment(lines));
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEscapeToClose(onClose, saving);

  const catalogSkus = useMemo(() => new Set(products.map((product) => product.sku)), [products]);
  const issues = useMemo(
    () => validatePendingConsignmentEdit({
      customerId,
      sourceWarehouseId: warehouseId,
      reviewDueAt,
      notes,
      lines: editLines.map((line) => ({
        id: line.id,
        product_sku: line.sku,
        variant_suffix: line.variantSuffix,
        size_info: line.sizeInfo,
        quantity: line.quantity,
        locked_unit_cost: line.unitCost,
        locked_unit_price: line.unitPrice,
      })),
    }, catalogSkus),
    [customerId, warehouseId, reviewDueAt, notes, editLines, catalogSkus],
  );

  const totals = useMemo(() => ({
    pieces: editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    value: editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0),
    cost: editLines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0), 0),
  }), [editLines]);

  const updateLine = (key: string, patch: Partial<EditLine>) => {
    setEditLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const selectSku = (key: string, sku: string, variantSuffix: string | null) => {
    const pricing = getCatalogSelectionPricing(products, { sku, variant_suffix: variantSuffix });
    updateLine(key, {
      sku,
      variantSuffix: variantSuffix || '',
      unitCost: pricing.unitCost,
      unitPrice: pricing.unitPrice,
    });
  };

  const submit = async () => {
    setSubmitAttempted(true);
    if (issues.length > 0) return;
    await onSubmit({
      consignmentId: entry.id,
      customerId,
      sourceWarehouseId: warehouseId,
      reviewDueAt,
      notes,
      lines: editLines.map((line) => ({
        id: line.id,
        product_sku: line.sku,
        variant_suffix: line.variantSuffix,
        size_info: line.sizeInfo,
        quantity: line.quantity,
        locked_unit_cost: line.unitCost,
        locked_unit_price: line.unitPrice,
      })),
    });
  };

  return (
    <ViewportPortal>
      <div className="fixed inset-0 z-[190] flex flex-col bg-slate-50 print:hidden" role="dialog" aria-modal="true" aria-label={`Επεξεργασία ${entry.code}`}>
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-700 text-white">
                <Pencil size={18} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-[#060b00]">Επεξεργασία {entry.code}</h2>
                  <ConsignmentBadge compact />
                </div>
                <p className="mt-0.5 text-sm font-medium text-slate-500">
                  Αλλαγές πελάτη, αποθήκης, επανελέγχου και SKU μόνο πριν την Παράδοση.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>Κλείσιμο</button>
              <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={submit}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />}
                Αποθήκευση
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-[1200px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px] sm:p-6">
            <div className="space-y-4">
              <section className={`${CARD} p-4`}>
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Στοιχεία Παρακαταθήκης</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold text-slate-500">Πελάτης</span>
                    <CustomerSearchSelect customers={customers} value={customerId} onChange={setCustomerId} />
                  </div>
                  <label>
                    <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><Warehouse size={12} /> Αποθήκη προέλευσης</span>
                    <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                      {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] font-bold text-slate-500">Επανέλεγχος</span>
                    <input type="date" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none" value={reviewDueAt} onChange={(event) => setReviewDueAt(event.target.value)} />
                  </label>
                  <label className="md:col-span-2">
                    <span className="mb-1 block text-[11px] font-bold text-slate-500">Σημείωση</span>
                    <textarea className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </label>
                </div>
              </section>

              <section className={`${CARD} overflow-hidden`}>
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Γραμμές SKU</div>
                  <button type="button" className={BTN_SECONDARY} onClick={() => setEditLines((current) => [...current, emptyLine()])}>
                    <Plus size={14} /> Γραμμή
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {editLines.map((line) => (
                    <div key={line.key} className={`grid gap-3 p-3 md:items-start ${canSeeCost ? 'md:grid-cols-[minmax(0,1.4fr)_70px_88px_88px_110px_36px]' : 'md:grid-cols-[minmax(0,1.4fr)_70px_88px_110px_36px]'}`}>
                      <SkuProductPicker
                        sku={line.sku}
                        variantSuffix={line.variantSuffix}
                        products={products}
                        onSelect={(selection) => selectSku(line.key, selection.sku, selection.variant_suffix)}
                        placeholder="Πληκτρολογήστε SKU…"
                        inputClassName="min-h-[42px]"
                        compact
                        catalogOnly
                      />
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-slate-400">Ποσ.</span>
                        <input type="number" min={1} className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-black outline-none" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: Number(event.target.value) })} />
                      </label>
                      {canSeeCost && (
                        <label>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">Κόστος</span>
                          <input aria-label="Κόστος ανά τεμάχιο" type="number" min={0} step="0.01" className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold outline-none" value={line.unitCost} onChange={(event) => updateLine(line.key, { unitCost: Number(event.target.value) })} />
                        </label>
                      )}
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-slate-400">Τιμή</span>
                        <input aria-label="Τιμή ανά τεμάχιο" type="number" min={0} step="0.01" className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold outline-none" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: Number(event.target.value) })} />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-bold text-slate-400">Μέγεθος</span>
                        <input className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm outline-none" value={line.sizeInfo} onChange={(event) => updateLine(line.key, { sizeInfo: event.target.value })} placeholder="—" />
                      </label>
                      <button
                        type="button"
                        className="mt-6 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        onClick={() => setEditLines((current) => (current.length <= 1 ? [emptyLine()] : current.filter((item) => item.key !== line.key)))}
                        aria-label="Αφαίρεση γραμμής"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
              <div className={`${CARD} p-4`}>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Σύνοψη</div>
                <div className="mt-3 space-y-2">
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Τεμάχια</span><span className="font-black">{formatGreekNumber(totals.pieces)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">Αναμενόμενη αξία</span><span className="font-black text-indigo-700">{formatGreekMoney(totals.value)}</span></div>
                  {canSeeCost && (
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Έκθεση κόστους</span><span className="font-black">{formatGreekMoney(totals.cost)}</span></div>
                  )}
                </div>
              </div>
              {submitAttempted && issues.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="mb-2 flex items-center gap-2 font-black"><AlertTriangle size={16} /> Έλεγχος πριν την αποθήκευση</div>
                  <ul className="list-disc space-y-1 pl-5 text-xs font-bold">
                    {issues.map((issue) => <li key={issue}>{issue}</li>)}
                  </ul>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </ViewportPortal>
  );
}
