import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PackageCheck, X } from 'lucide-react';
import { api } from '../lib/supabase';
import { Order, OrderFulfillmentSummary } from '../types';
import { formatCurrency } from '../utils/pricingEngine';
import { useUI } from './UIProvider';

interface Props {
  order: Order;
  fulfillment: OrderFulfillmentSummary;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function OrderShipmentModal({ order, fulfillment, onClose, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const { showToast } = useUI();
  const [isSaving, setIsSaving] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(
    fulfillment.lines
      .filter((line) => line.qty_ready > 0)
      .map((line) => [line.order_item_key, line.qty_ready])
  ));

  const shippableLines = useMemo(
    () => fulfillment.lines.filter((line) => line.qty_ready > 0),
    [fulfillment.lines]
  );

  const totalUnits = shippableLines.reduce((sum, line) => sum + (quantities[line.order_item_key] || 0), 0);
  const estimatedValue = shippableLines.reduce((sum, line) => {
    const orderItem = order.items.find((item) => (item.id || [item.sku, item.variant_suffix || '', item.size_info || ''].join('::')) === line.order_item_key || item.id === line.order_item_key);
    const qty = quantities[line.order_item_key] || 0;
    return sum + ((orderItem?.price_at_order || 0) * qty);
  }, 0);

  const setQuantity = (key: string, next: number, max: number) => {
    const clamped = Math.max(0, Math.min(max, Number.isFinite(next) ? next : 0));
    setQuantities((current) => ({ ...current, [key]: clamped }));
  };

  const handleCreate = async () => {
    const selections = shippableLines
      .map((line) => ({ order_item_key: line.order_item_key, quantity: quantities[line.order_item_key] || 0 }))
      .filter((line) => line.quantity > 0);
    if (selections.length === 0) {
      showToast('???????? ??????????? ??? ?????? ??????? ??? ????????.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const shipment = await api.createOrderShipmentFromReadySelection(order.id, selections);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['order_shipments'] });
      queryClient.invalidateQueries({ queryKey: ['order_shipment_items'] });
      queryClient.invalidateQueries({ queryKey: ['order_delivery_plans'] });
      showToast(shipment ? `? ???????? #${shipment.shipment_no} ?????????????.` : '??? ????????????? ????????.', shipment ? 'success' : 'info');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      showToast(`?????? ??????????? ?????????: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-slate-100 bg-slate-50/60 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">??? ????????</div>
            <h2 className="text-2xl font-black text-slate-900 mt-1">{order.customer_name}</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">?????????? #{order.id.slice(-8)} ? ?????? ???? ????????: {fulfillment.total_ready_qty}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 text-slate-500"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {shippableLines.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm font-medium text-slate-600">
              ??? ???????? ?????? ??????? ??? ????????.
            </div>
          ) : (
            shippableLines.map((line) => {
              const item = order.items.find((candidate) => candidate.id === line.order_item_key)
                || order.items.find((candidate) => candidate.sku === line.sku && (candidate.variant_suffix || '') === (line.variant_suffix || '') && (candidate.size_info || '') === (line.size_info || ''));
              const quantity = quantities[line.order_item_key] || 0;
              return (
                <div key={line.order_item_key} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-black text-slate-900">{line.sku}{line.variant_suffix || ''}</div>
                    <div className="text-sm text-slate-500 font-medium mt-1">
                      ????????????? {line.qty_ordered} ? ?????? {line.qty_ready} ? ??????????? {line.qty_shipped}
                      {line.size_info ? ` ? ??????? ${line.size_info}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => setQuantity(line.order_item_key, quantity - 1, line.qty_ready)} className="w-10 h-10 rounded-xl border border-slate-200 font-black text-slate-700">-</button>
                    <input
                      type="number"
                      min={0}
                      max={line.qty_ready}
                      value={quantity}
                      onChange={(event) => setQuantity(line.order_item_key, Number(event.target.value), line.qty_ready)}
                      className="w-20 p-2 text-center rounded-xl border border-slate-200 font-black text-slate-900"
                    />
                    <button onClick={() => setQuantity(line.order_item_key, quantity + 1, line.qty_ready)} className="w-10 h-10 rounded-xl border border-slate-200 font-black text-slate-700">+</button>
                    <div className="min-w-[88px] text-right">
                      <div className="text-xs text-slate-400 font-bold uppercase">????</div>
                      <div className="font-black text-slate-900">{formatCurrency((item?.price_at_order || 0) * quantity)}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">?????? ?????????</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{totalUnits} ???.</div>
            <div className="text-sm font-medium text-slate-500">?????????? ????? ???? {formatCurrency(estimatedValue)}</div>
          </div>
          <button
            onClick={handleCreate}
            disabled={isSaving || totalUnits === 0}
            className="px-5 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PackageCheck size={18} />
            {isSaving ? '??????????...' : '?????????? ?????????'}
          </button>
        </div>
      </div>
    </div>
  );
}
