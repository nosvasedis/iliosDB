import { useRestartDraft } from '../../hooks/useRestartBlocker';
import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Loader2, PackageCheck, X } from 'lucide-react';
import type { SupplierOrder } from '../../types';
import { SYSTEM_IDS } from '../../lib/supabase';
import { useWarehouses } from '../../hooks/api/useWarehouses';
import { formatInventoryQuantity } from '../../features/inventory';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { useUI } from '../UIProvider';
import { api } from '../../lib/supabase';
import { financeKeys } from '../../features/finance/keys';
import { financeRepository } from '../../features/finance/repository';
import PurchaseBookingSection, { type PurchaseBookingPayload } from '../finance/PurchaseBookingSection';

interface Props {
  order: SupplierOrder;
  onClose: () => void;
  onConfirm: (warehouseId: string) => Promise<void>;
}

export default function SupplierReceiptModal({ order, onClose, onConfirm }: Props) {
  const warehousesQuery = useWarehouses();
  const [warehouseId, setWarehouseId] = useState(order.receipt_warehouse_id || SYSTEM_IDS.CENTRAL);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<PurchaseBookingPayload | null>(null);
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const handleBookingChange = useCallback((payload: PurchaseBookingPayload | null) => setBooking(payload), []);
    useRestartDraft('Παραλαβή προμηθευτή', { warehouseId }, { busy: isSubmitting });

  useEscapeToClose(onClose, isSubmitting);
  const totalQuantity = useMemo(
    () => (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [order.items],
  );

  const submit = async () => {
    if (!warehouseId) {
      setError('Επιλέξτε την αποθήκη παραλαβής. Δεν πραγματοποιήθηκε καμία μεταβολή.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    // The parent closes this modal once stock is received, so capture the booking first.
    const pendingBooking = booking;
    try {
      await onConfirm(warehouseId);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : 'Η παραλαβή αποθέματος δεν ολοκληρώθηκε. Δεν πραγματοποιήθηκε καμία μεταβολή. Δοκιμάστε ξανά.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    if (pendingBooking) await bookPurchase(pendingBooking);
  };

  /** Separate, retry-safe step after the stock receipt (one expense per order and category). */
  const bookPurchase = async (payload: PurchaseBookingPayload) => {
    try {
      await financeRepository.insertExpensesIgnoringDuplicates(payload.expenses);
      if (payload.materialCosts.length) {
        const materials = await api.getMaterials();
        for (const { id, cost } of payload.materialCosts) {
          const material = materials.find((row) => row.id === id);
          if (material) await api.saveMaterial({ ...material, cost_per_unit: cost });
        }
        await queryClient.invalidateQueries({ queryKey: ['materials'] });
      }
      await queryClient.invalidateQueries({ queryKey: financeKeys.all });
      showToast('Το έξοδο της παραλαβής καταχωρίστηκε στον Οικονομικό Έλεγχο.', 'success');
    } catch (cause) {
      showToast(`Η παραλαβή ολοκληρώθηκε, αλλά το έξοδο δεν καταχωρίστηκε: ${cause instanceof Error ? cause.message : ''}`, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-350 flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="presentation">
      <div className="flex max-h-[94vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-3xl" role="dialog" aria-modal="true" aria-labelledby="supplier-receipt-title">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck size={22} aria-hidden="true" /></span>
            <div>
              <h2 id="supplier-receipt-title" className="font-black text-slate-900">Παραλαβή Αποθέματος</h2>
              <p className="text-xs font-semibold text-slate-500">Εντολή προμηθευτή #{order.id.slice(0, 8)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Κλείσιμο παραλαβής αποθέματος"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="space-y-5 overflow-y-auto p-5 custom-scrollbar">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <p className="font-bold">Ποσότητα παραλαβής: {formatInventoryQuantity(totalQuantity)}</p>
            <p className="mt-1 leading-relaxed text-slate-600">Οι ποσότητες που συνδέονται με συγκεκριμένη ζήτηση πελατών θα διατεθούν πρώτα εκεί. Μόνο το πλεόνασμα θα γίνει ελεύθερο διαθέσιμο απόθεμα.</p>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-black text-slate-800"><Building2 size={16} aria-hidden="true" /> Αποθήκη Παραλαβής</span>
            <select autoFocus value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={isSubmitting || warehousesQuery.isLoading} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-hidden focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10" aria-label="Αποθήκη παραλαβής">
              {(warehousesQuery.data || []).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>

          {warehousesQuery.isError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">Οι αποθήκες δεν φορτώθηκαν. Κλείστε το παράθυρο και δοκιμάστε ξανά.</p>}
          <PurchaseBookingSection order={order} onChange={handleBookingChange} />

          {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-5">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Ακύρωση</button>
          <button type="button" onClick={submit} disabled={isSubmitting || warehousesQuery.isLoading || warehousesQuery.isError} className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50">
            {isSubmitting && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
            Ολοκλήρωση Παραλαβής
          </button>
        </div>
      </div>
    </div>
  );
}
