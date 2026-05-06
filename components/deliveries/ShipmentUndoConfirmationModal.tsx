import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw, ShieldAlert, Truck, X } from 'lucide-react';
import { Order, OrderShipment, OrderShipmentItem } from '../../types';
import { formatOrderId } from '../../utils/orderUtils';

export const buildShipmentUndoConfirmationToken = (shipmentNumber: number) => `ΑΝΑΙΡΕΣΗ #${shipmentNumber}`;

export function getShipmentUndoItemCount(items: OrderShipmentItem[] | undefined | null): number {
  return (items || []).reduce((sum, item) => sum + item.quantity, 0);
}

export function getLatestShipmentNumber(shipments: Pick<OrderShipment, 'shipment_number'>[] | undefined | null): number | null {
  if (!shipments || shipments.length === 0) return null;
  return shipments.reduce((max, shipment) => Math.max(max, shipment.shipment_number), shipments[0].shipment_number);
}

interface Props {
  order: Order;
  shipment: OrderShipment;
  shipmentItems?: OrderShipmentItem[];
  isSubmitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ShipmentUndoConfirmationModal({
  order,
  shipment,
  shipmentItems,
  isSubmitting = false,
  onCancel,
  onConfirm,
}: Props) {
  const [confirmationText, setConfirmationText] = useState('');
  const requiredToken = buildShipmentUndoConfirmationToken(shipment.shipment_number);
  const itemCount = useMemo(() => getShipmentUndoItemCount(shipmentItems), [shipmentItems]);
  const canConfirm = confirmationText.trim() === requiredToken && !isSubmitting;
  const shippedAt = new Date(shipment.shipped_at).toLocaleString('el-GR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  useEffect(() => {
    setConfirmationText('');
  }, [shipment.id]);

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 print:hidden">
      <div role="dialog" aria-modal="true" aria-labelledby="shipment-undo-title" className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-red-600 text-white px-5 py-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-white/15 border border-white/20">
              <ShieldAlert size={26} />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-red-100">Έκτακτη Ενέργεια</div>
              <h2 id="shipment-undo-title" className="text-xl font-black mt-0.5">Αναίρεση Αποστολής #{shipment.shipment_number}</h2>
              <p className="text-sm font-bold text-red-50 mt-1">
                Χρήση μόνο σε ακραίες περιπτώσεις λανθασμένων ευρημάτων στην παραγγελία.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-2 rounded-full hover:bg-white/15 transition-colors disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={22} />
            <div className="text-sm text-red-900 font-bold leading-relaxed">
              Η αποστολή θα διαγραφεί από το ιστορικό και τα τεμάχια θα επιστρέψουν στην παραγωγή ως <span className="font-black">Έτοιμα</span>.
              Τα σχετικά πλάνα παράδοσης και οι υπενθυμίσεις μπορεί να ξανανοίξουν ή να ακυρωθούν αυτόματα.
              Αν υπάρχουν παλαιότερες αποστολές, θα μπορούν να αναιρεθούν μόνο μετά από αυτήν, μία-μία προς τα πίσω.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Παραγγελία</div>
              <div className="mt-1 text-sm font-black text-slate-900">#{formatOrderId(order.id)}</div>
              <div className="text-xs font-bold text-slate-600 break-words">{order.customer_name || 'Χωρίς πελάτη'}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Αποστολή</div>
              <div className="mt-1 flex items-center gap-2 text-sm font-black text-slate-900">
                <Truck size={15} className="text-red-600" /> #{shipment.shipment_number}
              </div>
              <div className="text-xs font-bold text-slate-600">{shippedAt}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Τεμάχια</div>
              <div className="mt-1 text-sm font-black text-slate-900">{itemCount} τεμ.</div>
              <div className="text-xs font-bold text-slate-600">Επιστροφή σε στάδιο Έτοιμα</div>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Καταχώρηση</div>
              <div className="mt-1 text-sm font-black text-slate-900">{shipment.shipped_by || 'Άγνωστος χρήστης'}</div>
              <div className="text-xs font-bold text-slate-600">Θα κρατηθεί audit log αναίρεσης</div>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-black text-slate-800">
              Για επιβεβαίωση πληκτρολογήστε <span className="text-red-700">{requiredToken}</span>
            </span>
            <input
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              disabled={isSubmitting}
              className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-red-100 focus:border-red-400 disabled:bg-slate-100"
              placeholder={requiredToken}
              autoFocus
            />
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-5 py-3 rounded-2xl text-slate-700 bg-slate-100 hover:bg-slate-200 font-black transition-colors disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canConfirm}
              className="px-5 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-black shadow-lg shadow-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
              Οριστική Αναίρεση Αποστολής
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
