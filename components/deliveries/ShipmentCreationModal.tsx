
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Truck, Package, Minus, Plus, ImageIcon, StickyNote, CheckCircle2, AlertTriangle, Search, Hash, Sparkles, Loader2 } from 'lucide-react';
import { Order, ProductionBatch, Product, OrderShipmentItem } from '../../types';
import { getReadyToShipItems, computeShipmentValue } from '../../utils/shipmentUtils';
import { formatShipmentIssueLine, hasBlockingShipmentIssues, ShipmentSafetyIssue, validateShipmentRequest } from '../../utils/shipmentSafety';
import { getVariantComponents, formatCurrency } from '../../utils/pricingEngine';
import { formatOrderId } from '../../utils/orderUtils';
import { buildItemIdentityKey } from '../../utils/itemIdentity';
import { getProductOptionColorLabel } from '../../utils/xrOptions';
import { api } from '../../lib/supabase';
import SkuColorizedText from '../SkuColorizedText';

export type ShipmentCreationVariant = 'partial' | 'full';
type SubmissionState = 'idle' | 'submitting' | 'success' | 'exiting';

interface Props {
  order: Order;
  batches: ProductionBatch[];
  products: Product[];
  deliveryPlanId?: string | null;
  userName: string;
  /** partial = user picks ready qty; full = entire remaining order is shipped and completed */
  variant?: ShipmentCreationVariant;
  onConfirm: (items: Array<{ sku: string; variant_suffix?: string | null; size_info?: string | null; cord_color?: OrderShipmentItem['cord_color']; enamel_color?: OrderShipmentItem['enamel_color']; quantity: number; price_at_order: number; line_id?: string | null }>, notes: string | null) => Promise<void>;
  onClose: () => void;
}

export default function ShipmentCreationModal({ order, batches, products, deliveryPlanId, userName, variant = 'partial', onConfirm, onClose }: Props) {
  const isFullOrderShipment = variant === 'full';
  const orderItems = useMemo(() => Array.isArray(order.items) ? order.items : [], [order.items]);
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
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [safetyIssues, setSafetyIssues] = useState<ShipmentSafetyIssue[]>([]);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (submissionState === 'success') {
      const fadeTimer = window.setTimeout(() => setSubmissionState('exiting'), 1600);
      return () => window.clearTimeout(fadeTimer);
    }
    if (submissionState === 'exiting') {
      const closeTimer = window.setTimeout(() => onCloseRef.current(), 300);
      return () => window.clearTimeout(closeTimer);
    }
  }, [submissionState]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(searchInput.trim().toLowerCase()), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredReadyItems = useMemo(() => {
    if (!searchTerm) return readyItems;
    return readyItems.filter(item => {
      const product = products.find(p => p.sku === item.sku);
      const { finish, stone } = getVariantComponents(item.variant_suffix ?? '', product?.gender);
      const haystack = [
        item.sku,
        item.variant_suffix,
        item.size_info,
        finish.name,
        finish.code,
        stone.name,
        stone.code,
        product?.category,
        item.cord_color ? getProductOptionColorLabel(item.cord_color as OrderShipmentItem['cord_color']) : null,
        item.enamel_color ? getProductOptionColorLabel(item.enamel_color as OrderShipmentItem['enamel_color']) : null,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(searchTerm);
    });
  }, [readyItems, searchTerm, products]);

  const totalReadyQty = useMemo(() => readyItems.reduce((acc, i) => acc + i.quantity, 0), [readyItems]);

  const displayReadyItems = useMemo(
    () => (isFullOrderShipment ? readyItems : filteredReadyItems),
    [isFullOrderShipment, readyItems, filteredReadyItems]
  );

  const adjustQty = (key: string, delta: number) => {
    setShipQtys(prev => {
      const item = readyItems.find(i => getItemIdentityKey(i) === key);
      if (!item) return prev;
      const newQty = Math.max(0, Math.min(item.quantity, (prev[key] || 0) + delta));
      return { ...prev, [key]: newQty };
    });
  };

  const shipAllVisible = () => {
    setShipQtys(prev => {
      const next = { ...prev };
      for (const item of filteredReadyItems) {
        const key = getItemIdentityKey(item);
        next[key] = item.quantity;
      }
      return next;
    });
  };

  const clearAllVisible = () => {
    setShipQtys(prev => {
      const next = { ...prev };
      for (const item of filteredReadyItems) {
        const key = getItemIdentityKey(item);
        next[key] = 0;
      }
      return next;
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
    const match = orderItems.find(i => buildItemIdentityKey(i) === targetKey);
    if (match) return match.price_at_order;
    // Fallback: match without size
    const fallback = orderItems.find(i => i.sku === sku && (i.variant_suffix || null) === (variantSuffix || null));
    return fallback?.price_at_order || 0;
  };

  // Build shipment items for financial summary
  const shipmentItems: OrderShipmentItem[] = useMemo(() =>
    readyItems
      .map(item => {
        const key = getItemIdentityKey(item);
        const qty = isFullOrderShipment ? item.quantity : (shipQtys[key] || 0);
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
    [readyItems, shipQtys, orderItems, isFullOrderShipment]
  );

  const vatRate = order.vat_rate !== undefined ? order.vat_rate : 0.24;
  const discountPercent = order.discount_percent || 0;
  const financials = useMemo(() => computeShipmentValue(shipmentItems, vatRate, discountPercent), [shipmentItems, vatRate, discountPercent]);

  const totalShippingQty = shipmentItems.reduce((acc, i) => acc + i.quantity, 0);

  const handleConfirm = async () => {
    if (totalShippingQty === 0) return;
    setSubmissionState('submitting');
    setSafetyIssues([]);
    setSafetyError(null);
    try {
      const snapshot = await api.getShipmentsForOrder(order.id);
      const issues = validateShipmentRequest(order, snapshot.items, batches, shipmentItems);
      if (hasBlockingShipmentIssues(issues)) {
        setSafetyIssues(issues);
        setSubmissionState('idle');
        return;
      }
      await onConfirm(
        shipmentItems.map(i => ({ sku: i.sku, variant_suffix: i.variant_suffix, size_info: i.size_info, cord_color: i.cord_color, enamel_color: i.enamel_color, quantity: i.quantity, price_at_order: i.price_at_order, line_id: i.line_id || null })),
        notes.trim() || null
      );
      setSubmissionState('success');
    } catch (e: any) {
      setSafetyError(e?.message || 'Δεν μπορεί να γίνει αποστολή ακόμα. Ελέγξτε τα Έτοιμα και το ιστορικό αποστολών.');
      setSubmissionState('idle');
    }
  };

  if (submissionState !== 'idle') {
    const isComplete = submissionState === 'success' || submissionState === 'exiting';
    const isExiting = submissionState === 'exiting';

    return (
      <div
        className={`fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm transition-opacity duration-300 ${isExiting ? 'opacity-0' : 'opacity-100'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shipment-progress-title"
        aria-live="polite"
      >
        <div
          className={`relative w-full max-w-md overflow-hidden rounded-[2rem] border bg-white shadow-2xl transition-all duration-300 ${
            isComplete
              ? 'border-emerald-200 shadow-emerald-950/15'
              : 'border-slate-200 shadow-slate-950/15'
          } ${isExiting ? 'scale-95 translate-y-2 opacity-0' : 'scale-100 translate-y-0 opacity-100'}`}
        >
          <div className={`absolute inset-x-0 top-0 h-1 ${isComplete ? 'bg-emerald-500' : 'bg-slate-900'}`} />
          <div className={`absolute inset-0 bg-gradient-to-br ${isComplete ? 'from-emerald-50 via-white to-teal-50/70' : 'from-slate-50 via-white to-emerald-50/40'}`} />

          <div className="relative px-8 py-9 text-center sm:px-10 sm:py-10">
            <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
              <div className={`absolute inset-0 rounded-full ${isComplete ? 'bg-emerald-100 ring-8 ring-emerald-50' : 'bg-slate-100 ring-8 ring-slate-50'}`} />
              {isComplete ? (
                <CheckCircle2 className="relative text-emerald-600 animate-in zoom-in-75 duration-300" size={42} strokeWidth={2.5} />
              ) : (
                <Loader2 className="relative animate-spin text-slate-700" size={36} strokeWidth={2.25} />
              )}
            </div>

            <p className={`mb-2 text-[11px] font-black uppercase tracking-[0.2em] ${isComplete ? 'text-emerald-700' : 'text-slate-500'}`}>
              {isComplete ? 'Επιτυχής καταχώρηση' : 'Ενημέρωση συστήματος'}
            </p>
            <h3 id="shipment-progress-title" className="text-2xl font-black tracking-tight text-slate-900">
              {isComplete
                ? isFullOrderShipment ? 'Παραγγελία ολοκληρώθηκε' : 'Η αποστολή καταχωρήθηκε'
                : isFullOrderShipment ? 'Ολοκληρώνεται η παραγγελία…' : 'Καταχωρίζεται η αποστολή…'}
            </h3>
            <p className="mx-auto mt-3 max-w-sm text-sm font-medium leading-6 text-slate-600">
              {isComplete
                ? isFullOrderShipment
                  ? 'Η αποστολή καταχωρήθηκε επιτυχώς και η παραγγελία μεταφέρθηκε στις ολοκληρωμένες.'
                  : 'Τα απεσταλμένα τεμάχια και το υπόλοιπο της παραγγελίας ενημερώθηκαν επιτυχώς.'
                : 'Καταχωρίζουμε την αποστολή και συγχρονίζουμε τα στοιχεία της παραγγελίας.'}
            </p>

            <div className="mt-6 inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-white/85 px-4 py-2 text-xs font-bold text-slate-600 shadow-sm">
              <span className="truncate">{formatOrderId(order.id)}</span>
              <span className="text-slate-300">·</span>
              <span className="truncate">{order.customer_name}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        <div className={`relative shrink-0 overflow-hidden border-b ${isFullOrderShipment ? 'border-emerald-100/80' : 'border-amber-100/80'}`}>
          <div className={`absolute inset-0 bg-gradient-to-br ${isFullOrderShipment ? 'from-emerald-50 via-white to-emerald-50/60' : 'from-amber-50 via-white to-emerald-50/60'}`} />
          <div className="relative p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <span className={`flex items-center justify-center w-9 h-9 rounded-2xl text-white shadow-md ${isFullOrderShipment ? 'bg-emerald-600 shadow-emerald-200' : 'bg-amber-500 shadow-amber-200'}`}>
                    {isFullOrderShipment ? <CheckCircle2 size={18} /> : <Truck size={18} />}
                  </span>
                  {isFullOrderShipment ? 'Αποστολή Παραγγελίας' : 'Μερική Αποστολή'}
                </h2>
                <p className="text-sm text-slate-600 mt-2 font-medium">
                  Παραγγελία <span className="font-black text-slate-900">{formatOrderId(order.id)}</span>
                  <span className="text-slate-300 mx-1.5">·</span>
                  {order.customer_name}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-1 text-[11px] font-black">
                    <Sparkles size={12} />
                    {readyItems.length} γραμμ{readyItems.length !== 1 ? 'ές' : 'ή'} · {totalReadyQty} τεμ. έτοιμα
                  </span>
                  {isFullOrderShipment && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 text-white px-3 py-1 text-[11px] font-black">
                      Ολοκλήρωση παραγγελίας μετά την επιβεβαίωση
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/80 transition-colors border border-transparent hover:border-slate-200">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Search + quick actions */}
        <div className="px-6 py-4 border-b border-slate-100 shrink-0 space-y-3 bg-slate-50/60">
          {!isFullOrderShipment && (
            <>
              <div className="relative">
                <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Αναζήτηση SKU, πέτρας, φινιρίσματος, μεγέθους..."
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-amber-400/30 text-sm font-medium text-slate-700 placeholder:text-slate-400 shadow-sm"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-slate-500">
                  {searchTerm
                    ? `${filteredReadyItems.length} από ${readyItems.length} γραμμές`
                    : `${readyItems.length} γραμμές προς επιλογή`}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={shipAllVisible}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    Όλα
                  </button>
                  <button
                    type="button"
                    onClick={clearAllVisible}
                    className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors"
                  >
                    Καμία
                  </button>
                </div>
              </div>
            </>
          )}
          {isFullOrderShipment && (
            <p className="text-xs font-bold text-slate-600">
              Όλα τα τεμάχια της παραγγελίας είναι στα Έτοιμα. Ελέγξτε τις γραμμές και τις τιμές πριν την οριστική αποστολή.
            </p>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gradient-to-b from-slate-50/40 to-white">
          {(safetyIssues.length > 0 || safetyError) && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <div className="flex items-center gap-2 font-black">
                <AlertTriangle size={16} />
                Δεν μπορεί να γίνει αποστολή ακόμα
              </div>
              <p className="mt-1 text-xs font-medium text-red-700">
                Η εφαρμογή βρήκε διαφορά ανάμεσα στο υπόλοιπο, στα ήδη απεσταλμένα και στις Έτοιμες παρτίδες. Δεν θα στείλει τίποτα μέχρι να διορθωθεί.
              </p>
              {safetyError && <p className="mt-2 whitespace-pre-wrap text-xs font-bold">{safetyError}</p>}
              {safetyIssues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {safetyIssues.map((issue) => (
                    <div key={`${issue.key}-${issue.title}`} className="rounded-xl bg-white/80 border border-red-100 px-3 py-2">
                      <div className="font-bold">{issue.title}</div>
                      <div className="text-xs font-medium mt-0.5">{formatShipmentIssueLine(issue)}</div>
                      <div className="text-xs mt-1">{issue.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {displayReadyItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
              <Search size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-black text-slate-700">Δεν βρέθηκαν τεμάχια</p>
              <p className="text-xs text-slate-500 mt-1">Δοκιμάστε άλλο SKU, πέτρα ή φινίρισμα.</p>
            </div>
          ) : displayReadyItems.map(item => {
            const key = getItemIdentityKey(item);
            const qty = isFullOrderShipment ? item.quantity : (shipQtys[key] || 0);
            const product = products.find(p => p.sku === item.sku);
            const { finish, stone } = getVariantComponents(item.variant_suffix ?? '', product?.gender);
            const price = getPrice(item.sku, item.variant_suffix, item.size_info, item.cord_color as OrderShipmentItem['cord_color'], item.enamel_color as OrderShipmentItem['enamel_color'], item.line_id || null);
            const isSelected = qty > 0;
            const lineTotal = price * qty;

            return (
              <div
                key={key}
                className={`flex items-center gap-4 rounded-2xl border p-4 transition-all shadow-sm ${
                  isSelected
                    ? isFullOrderShipment
                      ? 'border-emerald-200 bg-white ring-1 ring-emerald-100'
                      : 'border-amber-200 bg-white ring-1 ring-amber-100'
                    : 'border-slate-200 bg-white/80 opacity-75 hover:opacity-100 hover:border-slate-300'
                }`}
              >
                {/* Image */}
                <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-inner">
                  {product?.image_url ? (
                    <img src={product.image_url} alt={item.sku} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={22} className="text-slate-300" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <SkuColorizedText
                      sku={item.sku}
                      suffix={item.variant_suffix ?? undefined}
                      gender={product?.gender}
                      className="font-black text-sm"
                    />
                    {item.size_info && (
                      <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold flex items-center gap-0.5">
                        <Hash size={8} /> {item.size_info}
                      </span>
                    )}
                    {item.cord_color && (
                      <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-bold">
                        Κορδόνι: {getProductOptionColorLabel(item.cord_color as OrderShipmentItem['cord_color'])}
                      </span>
                    )}
                    {item.enamel_color && (
                      <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold">
                        Σμάλτο: {getProductOptionColorLabel(item.enamel_color as OrderShipmentItem['enamel_color'])}
                      </span>
                    )}
                  </div>
                  {product?.category && (
                    <div className="text-[10px] font-bold uppercase text-slate-400 truncate mt-0.5">
                      {product.category}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {finish.name && (
                      <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                        {finish.name}
                      </span>
                    )}
                    {stone.name && (
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100 font-bold">
                        {stone.name}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-black bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                      <CheckCircle2 size={10} /> Έτοιμα: {item.quantity}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      {formatCurrency(price)}/τεμ.
                    </span>
                    {isFullOrderShipment && qty > 0 && (
                      <span className="text-[10px] font-black text-slate-800">
                        Σύνολο γραμμής: {formatCurrency(lineTotal)}
                      </span>
                    )}
                  </div>
                </div>

                {isFullOrderShipment ? (
                  <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                    <div className="text-[9px] font-black uppercase tracking-wide text-emerald-600">Ποσότητα</div>
                    <div className="text-lg font-black text-emerald-800 tabular-nums">{qty}</div>
                  </div>
                ) : (
                  <div className={`flex items-center gap-1.5 shrink-0 rounded-xl border p-1 ${isSelected ? 'border-amber-200 bg-amber-50/50' : 'border-slate-200 bg-slate-50'}`}>
                    <button
                      type="button"
                      onClick={() => adjustQty(key, -1)}
                      disabled={qty <= 0}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span className={`w-8 text-center font-black tabular-nums ${isSelected ? 'text-amber-700' : 'text-slate-500'}`}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => adjustQty(key, 1)}
                      disabled={qty >= item.quantity}
                      className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Notes */}
          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              <StickyNote size={14} /> Σημειώσεις αποστολής
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Προαιρετικές σημειώσεις για αυτή την αποστολή..."
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300/40 resize-none shadow-sm"
              rows={2}
            />
          </div>
        </div>

        {/* Footer with financials + confirm */}
        <div className={`p-6 border-t border-slate-100 shrink-0 space-y-4 bg-gradient-to-t ${isFullOrderShipment ? 'from-emerald-50/40' : 'from-amber-50/40'} to-white`}>
          {/* Financial summary */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <span className="text-slate-500">{isFullOrderShipment ? 'Υποσύνολο παραγγελίας' : 'Υποσύνολο αποστολής'}</span>
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
            <span className="text-slate-900 font-black border-t border-slate-200 pt-1">{isFullOrderShipment ? 'Σύνολο παραγγελίας' : 'Σύνολο αποστολής'}</span>
            <span className="text-right font-black text-slate-900 border-t border-slate-200 pt-1">{formatCurrency(financials.grandTotal)}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              {totalShippingQty} τεμάχι{totalShippingQty !== 1 ? 'α' : 'ο'} {isFullOrderShipment ? 'προς ολοκληρωτική αποστολή' : 'προς αποστολή'}
            </span>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm">Ακύρωση</button>
              <button
                onClick={handleConfirm}
                disabled={totalShippingQty === 0}
                className={`px-6 py-3 rounded-2xl text-white font-black text-sm flex items-center gap-2 disabled:opacity-40 transition-colors shadow-md ${
                  isFullOrderShipment
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200/60'
                    : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200/60'
                }`}
              >
                {isFullOrderShipment ? <CheckCircle2 size={16} /> : <Truck size={16} />}
                {isFullOrderShipment ? 'Ολοκλήρωση & Αποστολή' : 'Επιβεβαίωση Αποστολής'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
