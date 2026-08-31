import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  Loader2,
  Plus,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import type { Product } from '../../types';
import SkuProductPicker from '../legal/SkuProductPicker';
import ConsignmentBadge from './ConsignmentBadge';
import CustomerSearchSelect from './CustomerSearchSelect';
import { getCatalogSelectionPricing } from '../../utils/skuProductPicker';
import { formatGreekMoney, formatGreekNumber } from '../../features/customerService';
import {
  CONSIGNMENT_BULK_DRAFT_STORAGE_KEY,
  clusterDraftRowsByCustomer,
  createEmptyConsignmentDraftRow,
  groupConsignmentDraftRows,
  parseConsignmentDraft,
  plusDaysIsoDate,
  serializeConsignmentDraft,
  validateConsignmentDraftRows,
  type ConsignmentDraftRow,
} from '../../features/customerService/bulkConsignmentDraft';
import { BTN_PRIMARY, BTN_SECONDARY, CARD } from '../ui/designTokens';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import ViewportPortal from './ViewportPortal';

type CustomerOption = { id: string; full_name: string };
type WarehouseOption = { id: string; name: string };

interface Props {
  customers: CustomerOption[];
  products: Product[];
  orders: any[];
  existingOrderLineIds: Set<string | null>;
  warehouses: WarehouseOption[];
  defaultSellerId?: string;
  canSeeCost: boolean;
  onClose: () => void;
  onSubmit: (groups: ReturnType<typeof groupConsignmentDraftRows>) => Promise<void>;
  saving: boolean;
}

export default function BulkConsignmentWorkbench({
  customers,
  products,
  orders,
  existingOrderLineIds,
  warehouses,
  defaultSellerId,
  canSeeCost,
  onClose,
  onSubmit,
  saving,
}: Props) {
  const defaultWarehouseId = warehouses[0]?.id || '';
  const [reviewDate, setReviewDate] = useState(plusDaysIsoDate(30));
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [sharedNotes, setSharedNotes] = useState('');
  const [rows, setRows] = useState<ConsignmentDraftRow[]>(() => [
    createEmptyConsignmentDraftRow({ warehouseId: defaultWarehouseId, reviewDate: plusDaysIsoDate(30) }),
  ]);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEscapeToClose(onClose, saving);

  useEffect(() => {
    const restored = parseConsignmentDraft(window.localStorage.getItem(CONSIGNMENT_BULK_DRAFT_STORAGE_KEY));
    if (restored && restored.some((row) => row.sku || row.customerId)) {
      setRows(restored);
      setWarehouseId(restored[0]?.warehouseId || defaultWarehouseId);
      setReviewDate(restored[0]?.reviewDate || plusDaysIsoDate(30));
    }
  }, [defaultWarehouseId]);

  useEffect(() => {
    const tagged = orders.flatMap((order) => {
      const customerId = order.customer_id || '';
      return (order.items || [])
        .filter((item: any) => item.fulfillment_mode === 'consignment' && !existingOrderLineIds.has(item.line_id || null))
        .map((item: any) => {
          const pricing = getCatalogSelectionPricing(products, {
            sku: item.sku,
            variant_suffix: item.variant_suffix || null,
          });
          return { order, item, customerId, pricing };
        });
    });
    if (tagged.length > 0) {
      const blockByCustomer = new Map<string, string>();
      const nextRows: ConsignmentDraftRow[] = tagged.map(({ order, item, customerId, pricing }) => {
        let blockId = blockByCustomer.get(customerId);
        if (!blockId) {
          blockId = crypto.randomUUID();
          blockByCustomer.set(customerId, blockId);
        }
        return {
          ...createEmptyConsignmentDraftRow({
            blockId,
            customerId,
            warehouseId: warehouseId || defaultWarehouseId,
            reviewDate,
          }),
          sku: item.sku,
          variantSuffix: item.variant_suffix || '',
          sizeInfo: item.size_info || '',
          quantity: item.quantity,
          unitCost: pricing.unitCost,
          unitPrice: Number(item.price_at_order ?? pricing.unitPrice),
          sourceOrderId: order.id,
          orderLineId: item.line_id || '',
        };
      });
      setRows((current) => (current.length === 1 && !current[0].customerId && !current[0].sku ? nextRows : current));
    }
  }, [orders, products, existingOrderLineIds, warehouseId, defaultWarehouseId, reviewDate]);

  useEffect(() => {
    window.localStorage.setItem(CONSIGNMENT_BULK_DRAFT_STORAGE_KEY, serializeConsignmentDraft(rows));
  }, [rows]);

  const catalogSkus = useMemo(() => new Set(products.map((product) => product.sku)), [products]);
  const issues = useMemo(() => validateConsignmentDraftRows(rows, catalogSkus), [rows, catalogSkus]);
  const clusters = useMemo(() => clusterDraftRowsByCustomer(rows), [rows]);
  const totals = useMemo(() => ({
    pieces: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
    value: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0),
    cost: rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitCost) || 0), 0),
    clients: new Set(rows.map((row) => row.customerId).filter(Boolean)).size,
  }), [rows]);

  const updateRow = (id: string, patch: Partial<ConsignmentDraftRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const selectCatalogSku = (id: string, sku: string, variantSuffix: string | null) => {
    const pricing = getCatalogSelectionPricing(products, { sku, variant_suffix: variantSuffix });
    updateRow(id, {
      sku,
      variantSuffix: variantSuffix || '',
      unitCost: pricing.unitCost,
      unitPrice: pricing.unitPrice,
    });
  };

  const applyDefaultsToAll = () => {
    setRows((current) => current.map((row) => ({
      ...row,
      warehouseId: warehouseId || row.warehouseId,
      reviewDate,
      notes: sharedNotes || row.notes,
    })));
  };

  const addClientBlock = () => {
    setRows((current) => [
      ...current,
      createEmptyConsignmentDraftRow({ warehouseId, reviewDate, notes: sharedNotes }),
    ]);
  };

  const addLineToCluster = (cluster: { blockId: string; customerId: string }) => {
    setRows((current) => [
      ...current,
      createEmptyConsignmentDraftRow({
        blockId: cluster.blockId,
        customerId: cluster.customerId,
        warehouseId,
        reviewDate,
        notes: sharedNotes,
      }),
    ]);
  };

  const duplicateCluster = (clusterRows: ConsignmentDraftRow[]) => {
    const blockId = crypto.randomUUID();
    setRows((current) => [
      ...current,
      ...clusterRows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        blockId,
        orderLineId: '',
        sourceOrderId: '',
      })),
    ]);
  };

  const removeCluster = (clusterRows: ConsignmentDraftRow[]) => {
    const ids = new Set(clusterRows.map((row) => row.id));
    setRows((current) => {
      const next = current.filter((row) => !ids.has(row.id));
      return next.length > 0 ? next : [createEmptyConsignmentDraftRow({ warehouseId, reviewDate })];
    });
  };

  const submit = async () => {
    setSubmitAttempted(true);
    if (issues.length > 0) return;
    await onSubmit(groupConsignmentDraftRows(rows, defaultSellerId || null));
    window.localStorage.removeItem(CONSIGNMENT_BULK_DRAFT_STORAGE_KEY);
  };

  return (
    <ViewportPortal>
    <div className="fixed inset-0 z-[190] flex flex-col bg-slate-50 print:hidden" role="dialog" aria-modal="true" aria-label="Μαζική Δημιουργία Παρακαταθηκών">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#060b00] text-white">
              <Users size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black tracking-tight text-[#060b00]">Μαζική Δημιουργία Παρακαταθηκών</h2>
                <ConsignmentBadge compact />
              </div>
              <p className="mt-0.5 text-sm font-medium text-slate-500">
                Ένα πρόχειρο ανά συνεδρία. Η αποθήκευση γίνεται ατομικά για όλους τους πελάτες ή για κανέναν.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>Ακύρωση</button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={submit}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Δημιουργία όλων
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-[1600px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px] sm:p-6">
          <div className="space-y-4">
            <section className={`${CARD} p-4`}>
              <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Κοινές προεπιλογές</div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="md:col-span-1">
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-bold text-slate-500"><Warehouse size={12} /> Αποθήκη προέλευσης</span>
                  <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">Επανέλεγχος (30 ημέρες)</span>
                  <input type="date" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
                </label>
                <label className="md:col-span-2">
                  <span className="mb-1 block text-[11px] font-bold text-slate-500">Κοινή σημείωση</span>
                  <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none" value={sharedNotes} onChange={(event) => setSharedNotes(event.target.value)} placeholder="Προαιρετική σημείωση για όλες τις νέες γραμμές" />
                </label>
              </div>
              <button type="button" className={`${BTN_SECONDARY} mt-3`} onClick={applyDefaultsToAll}>Εφαρμογή σε όλες τις γραμμές</button>
            </section>

            {clusters.map((cluster) => {
              const pieces = cluster.rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
              const value = cluster.rows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0);
              return (
                <section key={cluster.blockId} className={`${CARD} overflow-hidden`}>
                  <div className="flex flex-col gap-3 border-b border-slate-100 bg-white p-4 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <CustomerSearchSelect
                        customers={customers}
                        value={cluster.customerId}
                        onChange={(customerId) => {
                          const ids = new Set(cluster.rows.map((row) => row.id));
                          setRows((current) => current.map((row) => ids.has(row.id) ? { ...row, customerId } : row));
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-1">{formatGreekNumber(pieces)} τεμ.</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-1 text-indigo-700">{formatGreekMoney(value)}</span>
                      <button type="button" className={BTN_SECONDARY} onClick={() => addLineToCluster(cluster)}><Plus size={14} /> Γραμμή</button>
                      <button type="button" className={BTN_SECONDARY} onClick={() => duplicateCluster(cluster.rows)} aria-label="Αντιγραφή πελάτη"><Copy size={14} /></button>
                      <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeCluster(cluster.rows)} aria-label="Αφαίρεση πελάτη"><X size={16} /></button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {cluster.rows.map((row) => (
                      <div key={row.id} className={`grid gap-3 p-3 md:items-start ${canSeeCost ? 'md:grid-cols-[minmax(0,1.4fr)_70px_88px_88px_110px_36px]' : 'md:grid-cols-[minmax(0,1.4fr)_70px_88px_110px_36px]'}`}>
                        <div>
                          <SkuProductPicker
                            sku={row.sku}
                            variantSuffix={row.variantSuffix}
                            products={products}
                            onSelect={(selection) => selectCatalogSku(row.id, selection.sku, selection.variant_suffix)}
                            placeholder="Πληκτρολογήστε SKU…"
                            inputClassName="min-h-[42px]"
                            compact
                            catalogOnly
                          />
                        </div>
                        <label>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">Ποσ.</span>
                          <input type="number" min={1} className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-black outline-none" value={row.quantity} onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })} />
                        </label>
                        {canSeeCost && (
                          <label>
                            <span className="mb-1 block text-[10px] font-bold text-slate-400">Κόστος</span>
                            <input aria-label="Κόστος ανά τεμάχιο" type="number" min={0} step="0.01" className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold outline-none" value={row.unitCost} onChange={(event) => updateRow(row.id, { unitCost: Number(event.target.value) })} />
                          </label>
                        )}
                        <label>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">Τιμή</span>
                          <input aria-label="Τιμή ανά τεμάχιο" type="number" min={0} step="0.01" className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm font-bold outline-none" value={row.unitPrice} onChange={(event) => updateRow(row.id, { unitPrice: Number(event.target.value) })} />
                        </label>
                        <label>
                          <span className="mb-1 block text-[10px] font-bold text-slate-400">Μέγεθος</span>
                          <input className="w-full rounded-xl border border-slate-200 px-2 py-2 text-sm outline-none" value={row.sizeInfo} onChange={(event) => updateRow(row.id, { sizeInfo: event.target.value })} placeholder="—" />
                        </label>
                        <button type="button" className="mt-6 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Αφαίρεση γραμμής"><X size={16} /></button>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            <button type="button" className={`${BTN_SECONDARY} w-full justify-center py-3`} onClick={addClientBlock}>
              <Plus size={16} /> Προσθήκη πελάτη
            </button>
          </div>

          <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
            <div className={`${CARD} p-4`}>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Σύνοψη συνεδρίας</div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500">Πελάτες</span><span className="font-black">{formatGreekNumber(totals.clients)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Τεμάχια</span><span className="font-black">{formatGreekNumber(totals.pieces)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-500">Αναμενόμενη αξία</span><span className="font-black text-indigo-700">{formatGreekMoney(totals.value)}</span></div>
                {canSeeCost && (
                  <>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Έκθεση κόστους</span><span className="font-black">{formatGreekMoney(totals.cost)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Περιθώριο</span><span className="font-black text-emerald-700">{formatGreekMoney(totals.value - totals.cost)}</span></div>
                  </>
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
            <p className="px-1 text-[11px] leading-relaxed text-slate-500">
              Το τοπικό πρόχειρο διατηρείται μέχρι επιτυχή αποθήκευση. Η κίνηση απαιτεί σύνδεση και ολοκληρώνεται για όλους τους πελάτες μαζί.
            </p>
          </aside>
        </div>
      </div>
    </div>
    </ViewportPortal>
  );
}
