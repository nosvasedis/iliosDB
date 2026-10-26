import { useRestartDraft } from '../../../hooks/useRestartBlocker';
import React, { useMemo, useState } from 'react';
import { ChevronDown, HandHeart, Loader2, PackageCheck, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import SkuProductPicker from '../../legal/SkuProductPicker';
import CustomerSearchSelect from '../CustomerSearchSelect';
import { getCatalogSelectionPricing } from '../../../utils/skuProductPicker';
import { formatOrderId } from '../../../utils/orderUtils';
import {
  createEmptyConsignmentDraftRow,
  findTaggedConsignmentOrderLines,
  formatGreekDateOnly,
  formatGreekMoney,
  formatGreekNumber,
  groupConsignmentDraftRows,
  plusDaysIsoDate,
  validateConsignmentDraftRows,
  type ConsignmentDraftRow,
} from '../../../features/customerService';
import type { ServiceController } from '../useServiceController';
import { ACTION_PRIMARY, ACTION_QUIET, Field, ROW_BUTTON, SERVICE_INPUT, ServiceModal } from '../shared/serviceUi';
import { ConsignmentSizeSelect, ConsignmentStockHint, useConsignmentDrawPlans } from './ConsignmentLineExtras';

const REVIEW_PRESETS = [
  { days: 14, label: '2 εβδ.' },
  { days: 30, label: '1 μήνας' },
  { days: 60, label: '2 μήνες' },
  { days: 90, label: '3 μήνες' },
];

interface Props {
  ctl: ServiceController;
  presetCustomerId?: string;
  /** Κλειδώνει τον πελάτη (π.χ. όταν ανοίγει από την καρτέλα πελάτη). */
  lockCustomer?: boolean;
  onClose: () => void;
  onOpenBulk?: () => void;
}

export default function QuickConsignmentForm({ ctl, presetCustomerId, lockCustomer = false, onClose, onOpenBulk }: Props) {
  const [customerId, setCustomerId] = useState(presetCustomerId || '');
  const [rows, setRows] = useState<ConsignmentDraftRow[]>(() => [createEmptyConsignmentDraftRow()]);
  const [reviewDate, setReviewDate] = useState(plusDaysIsoDate(30));
  const [handoffNow, setHandoffNow] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [warehouseId, setWarehouseId] = useState(ctl.sourceWarehouses[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
    useRestartDraft('Παρακαταθήκη', { customerId, rows, reviewDate, handoffNow, warehouseId, notes }, { busy: saving });


  const catalogSkus = useMemo(() => new Set(ctl.products.map((product) => product.sku)), [ctl.products]);
  const tagged = useMemo(
    () => findTaggedConsignmentOrderLines(customerId, ctl.orders, ctl.existingOrderLineIds)
      .filter((line) => !rows.some((row) => row.orderLineId && row.orderLineId === line.orderLineId)),
    [ctl.existingOrderLineIds, ctl.orders, customerId, rows],
  );
  // Οι κενές γραμμές αγνοούνται — υπάρχουν μόνο για να συνεχίζει ο χρήστης να πληκτρολογεί.
  const finalRows = useMemo(
    () => rows
      .filter((row) => row.sku)
      .map((row) => ({ ...row, customerId, warehouseId: warehouseId || ctl.sourceWarehouses[0]?.id || '', reviewDate, notes })),
    [ctl.sourceWarehouses, customerId, notes, reviewDate, rows, warehouseId],
  );
  const issues = useMemo(() => {
    if (!customerId) return ['Επιλέξτε πελάτη.'];
    if (finalRows.length === 0) return ['Προσθέστε τουλάχιστον ένα τεμάχιο.'];
    return validateConsignmentDraftRows(finalRows, catalogSkus);
  }, [catalogSkus, customerId, finalRows]);
  const productsBySku = useMemo(() => new Map(ctl.products.map((product) => [product.sku, product])), [ctl.products]);
  const sourceWarehouseId = warehouseId || ctl.sourceWarehouses[0]?.id || '';
  const drawLines = useMemo(() => rows.map((row) => ({ sku: row.sku, variantSuffix: row.variantSuffix, sizeInfo: row.sizeInfo, quantity: Number(row.quantity) || 0 })), [rows]);
  const plans = useConsignmentDrawPlans(drawLines, sourceWarehouseId);
  const directPieces = plans.reduce((sum, plan) => sum + (plan?.direct || 0), 0);
  const pieces = finalRows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const value = finalRows.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0), 0);

  const update = (id: string, patch: Partial<ConsignmentDraftRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const selectSku = (id: string, sku: string, variantSuffix: string | null) => {
    const pricing = getCatalogSelectionPricing(ctl.products, { sku, variant_suffix: variantSuffix });
    setRows((current) => {
      const next = current.map((row) => (row.id === id ? { ...row, sku, variantSuffix: variantSuffix || '', unitCost: pricing.unitCost, unitPrice: pricing.unitPrice } : row));
      // Νέα κενή γραμμή αυτόματα, για γρήγορη συνεχόμενη πληκτρολόγηση.
      return next.some((row) => !row.sku) ? next : [...next, createEmptyConsignmentDraftRow()];
    });
  };

  const addTagged = () => {
    const additions = tagged.map((line) => {
      const pricing = getCatalogSelectionPricing(ctl.products, { sku: line.sku, variant_suffix: line.variantSuffix || null });
      return {
        ...createEmptyConsignmentDraftRow(),
        sku: line.sku,
        variantSuffix: line.variantSuffix,
        sizeInfo: line.sizeInfo,
        quantity: line.quantity,
        unitCost: pricing.unitCost,
        unitPrice: line.unitPrice ?? pricing.unitPrice,
        sourceOrderId: line.orderId,
        orderLineId: line.orderLineId,
      };
    });
    setRows((current) => [...current.filter((row) => row.sku), ...additions, createEmptyConsignmentDraftRow()]);
  };

  const submit = async () => {
    if (issues.length > 0) return;
    setSaving(true);
    try {
      const ok = await ctl.createConsignments(groupConsignmentDraftRows(finalRows, ctl.defaultSellerId || null), handoffNow);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ServiceModal
      title="Νέα Παρακαταθήκη"
      subtitle="Τεμάχια που αφήνετε σε πελάτη και πληρώνονται όταν πουληθούν."
      icon={<HandHeart size={18} />}
      onClose={onClose}
      busy={saving}
      size="lg"
      footer={(
        <>
          <div className="mr-auto min-w-0 text-xs">
            {issues.length > 0
              ? <span className="font-bold text-slate-400">{issues[0]}</span>
              : (
                <span className="font-black text-slate-700">
                  {formatGreekNumber(pieces)} τεμ. · {formatGreekMoney(value)}
                  {handoffNow && directPieces > 0 && <span className="ml-1 font-bold text-amber-700">· {formatGreekNumber(directPieces)} νέα</span>}
                </span>
              )}
          </div>
          <button type="button" className={ACTION_QUIET} onClick={onClose} disabled={saving}>Άκυρο</button>
          <button type="button" className={`${ACTION_PRIMARY}`} onClick={submit} disabled={saving || issues.length > 0}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : handoffNow ? <PackageCheck size={15} /> : <Plus size={15} />}
            {handoffNow ? 'Δημιουργία & παράδοση' : 'Δημιουργία'}
          </button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="Πελάτης">
          <CustomerSearchSelect customers={ctl.customers} value={customerId} onChange={setCustomerId} disabled={lockCustomer} placeholder="Αναζήτηση πελάτη…" />
        </Field>

        {tagged.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
            <ShoppingBag size={17} className="shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              <strong>{formatGreekNumber(tagged.length)} γραμμές</strong> από παραγγελίες του πελάτη είναι σημειωμένες ως Παρακαταθήκη
              <span className="text-slate-500"> ({[...new Set(tagged.map((line) => `#${formatOrderId(line.orderId)}`))].slice(0, 3).join(', ')})</span>.
            </div>
            <button type="button" className={ROW_BUTTON} onClick={addTagged}>Προσθήκη όλων</button>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">Τεμάχια</span>
            <span className="text-[10px] text-slate-400">Η τιμή συμπληρώνεται από τον κατάλογο</span>
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-2 sm:grid-cols-[minmax(0,1fr)_64px_92px_80px_auto] sm:items-center">
                <div className="col-span-2 sm:col-span-1">
                  <SkuProductPicker
                    sku={row.sku}
                    variantSuffix={row.variantSuffix}
                    products={ctl.products}
                    onSelect={(selection) => selectSku(row.id, selection.sku, selection.variant_suffix)}
                    placeholder="SKU ή barcode…"
                    inputClassName="min-h-[40px]"
                    compact
                    catalogOnly
                  />
                  <div className="mt-1 flex flex-wrap gap-x-2 px-1">
                    {handoffNow && <ConsignmentStockHint plan={plans[rows.indexOf(row)]} />}
                    {row.orderLineId && <span className="text-[10px] text-slate-400">από παραγγελία #{formatOrderId(row.sourceOrderId)}</span>}
                  </div>
                </div>
                <label className="flex items-center gap-1.5 sm:block">
                  <span className="text-[10px] font-bold text-slate-400 sm:hidden">Ποσ.</span>
                  <input aria-label="Ποσότητα" type="number" min={1} className={`${SERVICE_INPUT} px-2 text-center font-black`} value={row.quantity} onChange={(event) => update(row.id, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label className="flex items-center gap-1.5 sm:block">
                  <span className="text-[10px] font-bold text-slate-400 sm:hidden">€/τεμ.</span>
                  <input aria-label="Τιμή ανά τεμάχιο" type="number" min={0} step="0.01" className={`${SERVICE_INPUT} px-2`} value={row.unitPrice} onChange={(event) => update(row.id, { unitPrice: Number(event.target.value) })} />
                </label>
                <ConsignmentSizeSelect product={productsBySku.get(row.sku)} value={row.sizeInfo} onChange={(sizeInfo) => update(row.id, { sizeInfo })} disabled={!row.sku} />
                <button type="button" className="justify-self-end rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" disabled={rows.length === 1} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} aria-label="Αφαίρεση τεμαχίου"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100" onClick={() => setRows((current) => [...current, createEmptyConsignmentDraftRow()])}><Plus size={14} /> Προσθήκη τεμαχίου</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Επανέλεγχος με τον πελάτη" hint={`Στις ${formatGreekDateOnly(reviewDate)}`}>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_PRESETS.map((preset) => {
                const date = plusDaysIsoDate(preset.days);
                return (
                  <button key={preset.days} type="button" onClick={() => setReviewDate(date)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${reviewDate === date ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{preset.label}</button>
                );
              })}
              <input type="date" aria-label="Ημερομηνία επανελέγχου" className={`${SERVICE_INPUT} w-auto px-2 py-1 text-xs`} value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} />
            </div>
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[#060b00]" checked={handoffNow} onChange={(event) => setHandoffNow(event.target.checked)} />
            <span>
              <span className="block text-sm font-black text-slate-800">Παραδίδονται τώρα στον πελάτη</span>
              <span className="block text-[11px] text-slate-500">{handoffNow ? 'Όσα υπάρχουν φεύγουν από την αποθήκη· όσα λείπουν καταγράφονται απευθείας στον πελάτη.' : 'Μένει «Προς παράδοση» (π.χ. είναι ακόμη στην Παραγωγή).'}</span>
            </span>
          </label>
        </div>

        <div>
          <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800" onClick={() => setShowMore((value) => !value)}>
            <ChevronDown size={14} className={`transition ${showMore ? 'rotate-180' : ''}`} /> Περισσότερες ρυθμίσεις
          </button>
          {showMore && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Από αποθήκη">
                <select className={SERVICE_INPUT} value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  {ctl.sourceWarehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
                </select>
              </Field>
              <Field label="Σημείωση"><input className={SERVICE_INPUT} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Προαιρετικά" /></Field>
              {onOpenBulk && (
                <button type="button" className="text-left text-xs font-bold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline sm:col-span-2" onClick={onOpenBulk}>
                  Πολλοί πελάτες μαζί; Άνοιγμα μαζικής δημιουργίας →
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </ServiceModal>
  );
}
