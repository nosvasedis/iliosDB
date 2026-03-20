
import React, { useState, useMemo } from 'react';
import { X, Truck, Package, Minus, Plus, ImageIcon, StickyNote, CheckCircle2 } from 'lucide-react';
import { Order, ProductionBatch, ProductionStage, Product, OrderShipmentItem } from '../../types';
import { getReadyToShipItems, computeShipmentValue } from '../../utils/shipmentUtils';
import { getVariantComponents, formatCurrency } from '../../utils/pricingEngine';
import { formatOrderId } from '../../utils/orderUtils';
import { buildItemIdentityKey } from '../../utils/itemIdentity';
import { getProductOptionColorLabel } from '../../utils/xrOptions';

interface Props {
  order: Order;
  batches: ProductionBatch[];
  products: Product[];
  deliveryPlanId?: string | null;
  userName: string;
  onConfirm: (items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: OrderShipmentItem['cord_color']; enamel_color?: OrderShipmentItem['enamel_color']; quantity: number; price_at_order: number; line_id?: string | null }>, notes: string | null) => Promise<void>;
  onClose: () => void;
}

export default function ShipmentCreationModal({ order, batches, products, deliveryPlanId, userName, onConfirm, onClose }: Props) {
  const readyItems = useMemo(() => getReadyToShipItems(order.id, batches), [order.id, batches]);
  const getItemIdentityKey = (item: { sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: string | null; enamel_color?: string | null; line_id?: string | null }) =>
    buildItemIdentityKey({
      sku: item.sku,
      variant_suffix: item.variant_suffix,
      size_info: item.size_info,
      cord_color: item.cord_color as OrderShipmentItem['cord_color'],
      enamel_color: item.enamel_color as OrderShipmentItem['enamel_color'],
      line_id: item.line_id || null
    });

  // Per-item shipping quantities (default: ship all ready)
  const [shipQtys, setShipQtys] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const item of readyItems) {
      const key = getItemIdentityKey(item);
      initial[key] = item.quantity;
    }
    return initial;
  });
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const adjustQty = (key: string, delta: number) => {
    setShipQtys(prev => {
      const item = readyItems.find(i => getItemIdentityKey(i) === key);
      if (!item) return prev;
      const newQty = Math.max(0, Math.min(item.quantity, (prev[key] || 0) + delta));
      return { ...prev, [key]: newQty };
    });
  };

  // Find price_at_order for each item from the order
  const getPrice = (
    sku: string,
    variantSuffix?: string | null,
    sizeInfo?: string | null,
    cordColor?: OrderShipmentItem['cord_color'],
    enamelColor?: OrderShipmentItem['enamel_color'],
    lineId?: string | null
  ): number => {
    const targetKey = buildItemIdentityKey({
      sku,
      variant_suffix: variantSuffix,
      size_info: sizeInfo,
      cord_color: cordColor as OrderShipmentItem['cord_color'],
      enamel_color: enamelColor as OrderShipmentItem['enamel_color'],
      line_id: lineId || null
    });
    const match = order.items.find(i => buildItemIdentityKey(i) === targetKey);
    if (match) return match.price_at_order;
    // Fallback: match without size
    const fallback = order.items.find(i => i.sku === sku && (i.variant_suffix || null) === (variantSuffix || null));
    return fallback?.price_at_order || 0;
  };

  // Build shipment items for financial summary
  const shipmentItems: OrderShipmentItem[] = useMemo(() =>
    readyItems
      .map(item => {
        const key = getItemIdentityKey(item);
        const qty = shipQtys[key] || 0;
        if (qty <= 0) return null;
        return {
          id: '',
          shipment_id: '',
          sku: item.sku,
          variant_suffix: item.variant_suffix || null,
          size_info: item.size_info || null,
          cord_color: item.cord_color || null,
          enamel_color: item.enamel_color || null,
          quantity: qty,
          price_at_order: getPrice(item.sku, item.variant_suffix, item.size_info, item.cord_color as OrderShipmentItem['cord_color'], item.enamel_color as OrderShipmentItem['enamel_color'], item.line_id || null),
          line_id: item.line_id || null
        };
      })
      .filter(Boolean) as OrderShipmentItem[],
    [readyItems, shipQtys]
  );

  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
  const discountPercent = order.discount_percent || 0;
  const financials = useMemo(() => computeShipmentValue(shipmentItems, vatRate, discountPercent), [shipmentItems, vatRate, discountPercent]);

  const totalShippingQty = shipmentItems.reduce((acc, i) => acc + i.quantity, 0);

  const handleConfirm = async () => {
    if (totalShippingQty === 0) return;
    setLoading(true);
    try {
      await onConfirm(
        shipmentItems.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, quantity: i.quantity, price_at_order: i.price_at_order, line_id: i.line_id || null })),
        notes.trim() || null
      );
    } finally {
      setLoading(false);
    }
  };

  if (readyItems.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
          <div className="text-center">
            <Package size={48} className="mx-auto text-slate-300 mb-4" />
            <h3 className="text-lg font-black text-slate-900">Κανένα τεμάχιο έτοιμο</h3>
            <p className="text-sm text-slate-500 mt-2">Δεν υπάρχουν τεμάχια στο στάδιο "Έτοιμα" για αυτήν την παραγγελία.</p>
            <button onClick={onClose} className="mt-6 px-6 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm">Κλείσιμο</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <Truck size={22} className="text-amber-600" />
                Αποστολή Ετοίμων
              </h2>
              <p className="text-sm text-slate-500 mt-1">Παραγγελία {formatOrderId(order.id)} — {order.customer_name}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {readyItems.map(item => {
            const key = getItemIdentityKey(item);
            const qty = shipQtys[key] || 0;
            const product = products.find(p => p.sku === item.sku);
            const { finish, stone } = getVariantComponents(item.variant_suffix ?? '', product?.gender);
            const price = getPrice(item.sku, item.variant_suffix, item.size_info, item.cord_color as OrderShipmentItem['cord_color'], item.enamel_color as OrderShipmentItem['enamel_color'], item.line_id || null);

            return (
              <div key={key} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                {/* Image */}
                <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                  {product?.image_url ? (
                    <img src={product.image_url} alt={item.sku} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={24} className="text-slate-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-black text-slate-900 text-sm">{item.sku}{item.variant_suffix ? <span className="text-slate-400 font-bold ml-1">{item.variant_suffix}</span> : null}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    {item.size_info && <span className="font-bold">#{item.size_info}</span>}
                    {item.cord_color && <span className="font-bold text-amber-700">Κορδόνι: {getProductOptionColorLabel(item.cord_color as OrderShipmentItem['cord_color'])}</span>}
                    {item.enamel_color && <span className="font-bold text-rose-700">Σμάλτο: {getProductOptionColorLabel(item.enamel_color as OrderShipmentItem['enamel_color'])}</span>}
                    {finish.name && <span>{finish.name}</span>}
                    {stone.name && <span>{stone.name}</span>}
                  </div>
                  <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Έτοιμα: {item.quantity} τεμ. — {formatCurrency(price)}/τεμ.
                  </div>
                </div>

                {/* Quantity stepper */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => adjustQty(key, -1)}
                    disabled={qty <= 0}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-8 text-center font-black text-slate-900">{qty}</span>
                  <button
                    onClick={() => adjustQty(key, 1)}
                    disabled={qty >= item.quantity}
                    className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-30 transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* Notes */}
          <div className="pt-3">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              <StickyNote size={14} /> Σημειώσεις αποστολής
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Προαιρετικές σημειώσεις για αυτή την αποστολή..."
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
              rows={2}
            />
          </div>
        </div>

        {/* Footer with financials + confirm */}
        <div className="p-6 border-t border-slate-100 shrink-0 space-y-4">
          {/* Financial summary */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">Υποσύνολο αποστολής</span>
            <span className="text-right font-bold text-slate-900">{formatCurrency(financials.subtotal)}</span>
            {discountPercent > 0 && (
              <>
                <span className="text-slate-500">Έκπτωση ({discountPercent}%)</span>
                <span className="text-right font-bold text-red-600">-{formatCurrency(financials.discountAmount)}</span>
              </>
            )}
            {vatRate > 0 && (
              <>
                <span className="text-slate-500">ΦΠΑ ({Math.round(vatRate * 100)}%)</span>
                <span className="text-right font-bold text-slate-700">{formatCurrency(financials.vatAmount)}</span>
              </>
            )}
            <span className="text-slate-900 font-black border-t border-slate-200 pt-1">Σύνολο αποστολής</span>
            <span className="text-right font-black text-slate-900 border-t border-slate-200 pt-1">{formatCurrency(financials.grandTotal)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {totalShippingQty} τεμάχι{totalShippingQty !== 1 ? 'α' : 'ο'} προς αποστολή
            </span>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm">Ακύρωση</button>
              <button
                onClick={handleConfirm}
                disabled={totalShippingQty === 0 || loading}
                className="px-6 py-3 rounded-2xl bg-amber-500 text-white font-black text-sm flex items-center gap-2 disabled:opacity-40 hover:bg-amber-600 transition-colors"
              >
                {loading ? <span className="animate-spin">⏳</span> : <Truck size={16} />}
                Επιβεβαίωση Αποστολής
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
