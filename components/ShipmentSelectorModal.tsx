import React, { useMemo, useState } from 'react';
import { X, Truck, Calendar, Hash, CheckSquare, Square, Printer } from 'lucide-react';
import type { Order, OrderShipment, OrderShipmentItem } from '../types';
import { formatOrderId } from '../utils/orderUtils';

type Props = {
  order: Order;
  shipments: OrderShipment[];
  shipmentItems: OrderShipmentItem[];
  onClose: () => void;
  onSelect: (payload: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }) => void;
  onSelectMultiple?: (payloads: Array<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }>) => void;
};

function formatDateTime(dateString: string) {
  const d = new Date(dateString);
  return d.toLocaleDateString('el-GR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ShipmentSelectorModal({ order, shipments, shipmentItems, onClose, onSelect, onSelectMultiple }: Props) {
  const sorted = useMemo(() => {
    return [...(shipments || [])].sort((a, b) => {
      const timeDiff = new Date(b.shipped_at).getTime() - new Date(a.shipped_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return (b.shipment_number || 0) - (a.shipment_number || 0);
    });
  }, [shipments]);

  const itemsByShipmentId = useMemo(() => {
    const map = new Map<string, OrderShipmentItem[]>();
    for (const row of shipmentItems || []) {
      const list = map.get(row.shipment_id);
      if (list) list.push(row);
      else map.set(row.shipment_id, [row]);
    }
    return map;
  }, [shipmentItems]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const hasMulti = typeof onSelectMultiple === 'function';

  const toggleSelected = (shipmentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(sorted.map((s) => s.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedPayloads = useMemo(() => {
    const ids = selectedIds;
    return sorted
      .filter((s) => ids.has(s.id))
      .map((s) => ({
        order,
        shipment: s,
        shipmentItems: itemsByShipmentId.get(s.id) || [],
      }));
  }, [selectedIds, sorted, order, itemsByShipmentId]);

  const selectedQty = useMemo(
    () => selectedPayloads.reduce((sum, p) => sum + p.shipmentItems.reduce((s, i) => s + (i.quantity || 0), 0), 0),
    [selectedPayloads]
  );

  return (
    <div className="fixed inset-0 z-[180] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Truck size={18} className="text-amber-600" />
              Επιλογή Αποστολής
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
              <span className="inline-flex items-center gap-1"><Hash size={12} /> {formatOrderId(order.id)}</span>
              <span className="text-slate-300">•</span>
              <span className="truncate max-w-[240px]">{order.customer_name}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500" aria-label="Κλείσιμο">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {hasMulti && sorted.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 text-xs font-black transition-colors"
                  type="button"
                >
                  <CheckSquare size={16} /> Επιλογή Όλων
                </button>
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 text-xs font-black transition-colors"
                  type="button"
                >
                  <Square size={16} /> Καθαρ.
                </button>
              </div>

              <button
                onClick={() => onSelectMultiple?.(selectedPayloads)}
                disabled={selectedPayloads.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 text-xs font-black transition-colors"
                type="button"
                title={selectedPayloads.length === 0 ? 'Επιλέξτε αποστολές για εκτύπωση' : `Εκτύπωση ${selectedPayloads.length} αποστολών`}
              >
                <Printer size={16} />
                Εκτύπωση Επιλεγμένων ({selectedPayloads.length}) • {selectedQty} τεμ.
              </button>
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
              Δεν υπάρχουν καταχωρημένες αποστολές για αυτήν την παραγγελία.
            </div>
          ) : (
            <div className="space-y-3">
              {sorted.map((s) => {
                const rows = itemsByShipmentId.get(s.id) || [];
                const totalQty = rows.reduce((sum, r) => sum + (r.quantity || 0), 0);
                const uniqueSkus = new Set(rows.map((r) => `${r.sku}${r.variant_suffix || ''}`)).size;
                const selected = selectedIds.has(s.id);

                return (
                  <div key={s.id} className="w-full rounded-2xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors">
                    <div className="flex items-start justify-between gap-3 px-4 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {hasMulti && (
                            <button
                              type="button"
                              onClick={() => toggleSelected(s.id)}
                              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors ${
                                selected ? 'bg-amber-200/60 border-amber-300' : 'bg-white border-amber-200'
                              }`}
                              aria-label={selected ? 'Αποεπιλογή αποστολής' : 'Επιλογή αποστολής'}
                              title={selected ? 'Αποεπιλογή' : 'Επιλογή'}
                            >
                              {selected ? <CheckSquare size={16} className="text-amber-800" /> : <Square size={16} className="text-amber-700" />}
                            </button>
                          )}
                          <span className="inline-flex items-center rounded-full bg-white text-amber-800 border border-amber-200 px-2 py-0.5 text-[11px] font-black">
                            Αποστολή #{s.shipment_number}
                          </span>
                          <span className="text-[11px] font-bold text-amber-800 inline-flex items-center gap-1">
                            <Calendar size={12} /> {formatDateTime(s.shipped_at)}
                          </span>
                        </div>
                        {s.shipped_by && <div className="mt-1 text-[11px] text-amber-900/80 font-bold truncate">Από: {s.shipped_by}</div>}
                        {s.notes && <div className="mt-1 text-[11px] text-amber-900/70 truncate">Σημ.: {s.notes}</div>}
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-black text-amber-900">{totalQty} τεμ.</div>
                        <div className="text-[10px] font-bold text-amber-900/70">{uniqueSkus} SKU</div>
                      </div>
                    </div>
                    <div className="px-4 pb-4">
                      <button
                        type="button"
                        onClick={() => onSelect({ order, shipment: s, shipmentItems: rows })}
                        className="w-full rounded-xl bg-white/70 hover:bg-white border border-amber-200 text-amber-900 px-3 py-2 text-xs font-black transition-colors"
                      >
                        Εκτύπωση Μόνο Αυτής
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

