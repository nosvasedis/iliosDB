import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReceiptText } from 'lucide-react';
import type { SupplierOrder } from '../../types';
import { api } from '../../lib/supabase';
import { useAuth } from '../AuthContext';
import { useFinanceWorkspace } from '../../hooks/api/useFinance';
import { useMaterials } from '../../hooks/api/useMaterials';
import { useSuppliers } from '../../hooks/api/useSuppliers';
import { buildCategoryTree, flattenTree } from '../../features/finance/categoryTree';
import { formatEuro, roundMoney, toIsoDate, addDays } from '../../features/finance/financeMath';
import { buildPurchaseBooking, changedMaterialCosts, purchaseExpenses, type PurchaseBookingLine } from '../../features/finance/purchaseBooking';
import type { FinanceBilling, FinanceExpense } from '../../features/finance/types';
import { BillingToggle, inputClass, parseAmount } from './financeUi';

export interface PurchaseBookingPayload {
  expenses: Array<Partial<FinanceExpense>>;
  /** Material id → new cost_per_unit, when the user asked to refresh catalogue costs. */
  materialCosts: Array<{ id: string; cost: number }>;
}

/**
 * Optional step of Παραλαβή: turn the received lines into expenses (Πέτρες / Υλικά / STX)
 * and keep material costs current. Visible to admins only.
 */
export default function PurchaseBookingSection({ order, onChange }: { order: SupplierOrder; onChange: (payload: PurchaseBookingPayload | null) => void }) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const workspaceQuery = useFinanceWorkspace(isAdmin);
  const materialsQuery = useMaterials({ enabled: isAdmin });
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: api.getProducts, enabled: isAdmin });
  const suppliersQuery = useSuppliers();
  const supplier = (suppliersQuery.data || []).find((row) => row.id === order.supplier_id);
  const categories = workspaceQuery.data?.categories || [];
  const alreadyBooked = (workspaceQuery.data?.expenses || []).some((expense) => expense.source_kind === 'supplier_order' && expense.source_id?.startsWith(`${order.id}:`));

  const [enabled, setEnabled] = useState(true);
  const [lines, setLines] = useState<PurchaseBookingLine[] | null>(null);
  const [billing, setBilling] = useState<FinanceBilling>('T');
  const [vatRate, setVatRate] = useState(0.24);
  const [docRef, setDocRef] = useState('');
  const [updateCosts, setUpdateCosts] = useState(true);

  useEffect(() => {
    if (lines || !workspaceQuery.data || !materialsQuery.data || !productsQuery.data) return;
    setLines(buildPurchaseBooking({ order, supplier, materials: materialsQuery.data, products: productsQuery.data, categories }));
    if (supplier?.default_billing) setBilling(supplier.default_billing);
  }, [lines, workspaceQuery.data, materialsQuery.data, productsQuery.data, order, supplier, categories]);

  const strandIds = useMemo(() => new Set((materialsQuery.data || []).filter((material) => (material.stones_per_strand || 0) > 0).map((material) => material.id)), [materialsQuery.data]);
  const changed = useMemo(() => (lines ? changedMaterialCosts(lines).filter((line) => !strandIds.has(line.itemId)) : []), [lines, strandIds]);
  const flat = useMemo(() => flattenTree(buildCategoryTree(categories)), [categories]);
  const net = roundMoney((lines || []).reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
  const gross = roundMoney(net * (1 + (billing === 'X' ? 0 : vatRate)));

  useEffect(() => {
    if (!isAdmin || !enabled || !lines || alreadyBooked || net <= 0) { onChange(null); return; }
    const today = toIsoDate(new Date());
    onChange({
      expenses: purchaseExpenses({
        order, lines, billing, vatRate, date: today, docRef,
        dueDate: supplier?.payment_terms_days ? addDays(today, supplier.payment_terms_days) : null,
      }),
      materialCosts: updateCosts ? changed.map((line) => ({ id: line.itemId, cost: line.unitCost })) : [],
    });
  }, [isAdmin, enabled, lines, billing, vatRate, docRef, updateCosts, changed, alreadyBooked, net, order, supplier, onChange]);

  if (!isAdmin || !workspaceQuery.data) return null;
  if (alreadyBooked) {
    return <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Η εντολή έχει ήδη καταχωριστεί στα έξοδα.</p>;
  }

  const update = (index: number, patch: Partial<PurchaseBookingLine>) =>
    setLines((previous) => (previous || []).map((line, position) => (position === index ? { ...line, ...patch } : line)));

  return (
    <div className="rounded-2xl border border-slate-200">
      <label className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
        <ReceiptText size={16} className="text-slate-500" />
        <span className="flex-1 text-sm font-black text-slate-800">Καταχώριση εξόδου στον Οικονομικό Έλεγχο</span>
        {enabled && <span className="text-sm font-black tabular-nums text-slate-900">{formatEuro(gross)}</span>}
      </label>
      {enabled && lines && (
        <div className="space-y-3 p-4">
          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {lines.map((line, index) => (
              <div key={`${line.itemId}-${index}`} className="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem] items-center gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-800">{line.label}</span>
                  <span className="text-[11px] font-semibold text-slate-500">{line.quantity} × {formatEuro(line.unitCost)}{line.catalogCost !== null && Math.abs(line.catalogCost - line.unitCost) > 0.0001 ? ` (κατάλογος ${formatEuro(line.catalogCost)})` : ''}</span>
                </span>
                <select value={line.categoryId} onChange={(event) => update(index, { categoryId: event.target.value })} className={`${inputClass} py-1.5 text-[11px]`}>
                  <option value="">— Κατηγορία —</option>
                  {flat.map((node) => <option key={node.category.id} value={node.category.id}>{' '.repeat(node.depth * 2)}{node.category.name}</option>)}
                </select>
                <input inputMode="decimal" defaultValue={line.unitCost ? String(line.unitCost).replace('.', ',') : ''} onChange={(event) => update(index, { unitCost: parseAmount(event.target.value) })} placeholder="€/μον." className={`${inputClass} py-1.5 text-right text-xs`} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BillingToggle value={billing} onChange={setBilling} />
            {billing === 'T' && (
              <select value={vatRate} onChange={(event) => setVatRate(Number(event.target.value))} className={`${inputClass} w-auto py-1.5 text-xs`}>
                {[0.24, 0.13, 0.06, 0].map((rate) => <option key={rate} value={rate}>ΦΠΑ {Math.round(rate * 100)}%</option>)}
              </select>
            )}
            <input value={docRef} onChange={(event) => setDocRef(event.target.value)} placeholder="Αρ. τιμολογίου" className={`${inputClass} w-36 py-1.5 text-xs`} />
          </div>
          {changed.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={updateCosts} onChange={(event) => setUpdateCosts(event.target.checked)} className="accent-amber-600" />
              Ενημέρωση κόστους σε {changed.length} {changed.length === 1 ? 'υλικό' : 'υλικά'} (επηρεάζει την κοστολόγηση)
            </label>
          )}
          {net <= 0 && <p className="text-xs font-bold text-amber-700">Συμπληρώστε τιμές μονάδας για να καταχωριστεί το έξοδο.</p>}
        </div>
      )}
    </div>
  );
}
