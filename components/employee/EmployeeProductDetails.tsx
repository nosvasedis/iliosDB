import { formatNumber } from '../../utils/numberFormat';

import React, { useEffect, useMemo, useState } from 'react';
import { Product, ProductVariant, Warehouse } from '../../types';
import { X, ImageIcon, Tag, Package, ChevronLeft, ShoppingBag, BookMarked, Euro } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import { SuffixBadge } from '../catalog/CatalogProductCard';
import { STORE_RETAIL_MULTIPLIER, sortStoreVariants } from './storeCatalog';

type PrintItem = { product: Product; variant?: ProductVariant; quantity: number; format?: 'standard' | 'simple' | 'retail' };

interface Props {
    product: Product;
    onClose: () => void;
    /** Kept for callers; stock comes from the product itself. */
    warehouses?: Warehouse[];
    setPrintItems?: (items: PrintItem[]) => void;
}

const StatTile = ({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: string }) => (
    <div className={`min-w-0 rounded-2xl border px-3 py-2.5 ${tone}`}>
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide opacity-80"><Icon size={11} /> <span className="truncate">{label}</span></div>
        <div className="mt-0.5 truncate text-lg font-black tabular-nums lg:text-xl">{value}</div>
    </div>
);

export default function EmployeeProductDetails({ product, onClose, setPrintItems }: Props) {
    const [imageFailed, setImageFailed] = useState(false);
    const variants = useMemo(() => sortStoreVariants(product.variants || [], product.gender), [product]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const masterStock = product.available_qty ?? product.stock_qty ?? 0;
    const totalStock = masterStock + variants.reduce((acc, v) => acc + (v.available_qty ?? v.stock_qty ?? 0), 0);
    const retailOf = (v: ProductVariant | null) => ((v ? v.selling_price || product.selling_price : product.selling_price) || 0) * STORE_RETAIL_MULTIPLIER;
    const retailPrices = (variants.length ? variants.map(retailOf) : [retailOf(null)]).filter((p) => p > 0);
    const minRetail = retailPrices.length ? Math.min(...retailPrices) : 0;

    const print = (variant: ProductVariant | null, format: 'standard' | 'retail') => {
        setPrintItems?.([{ product, variant: variant || undefined, quantity: 1, format }]);
    };

    const rows: Array<ProductVariant | null> = variants.length ? variants : [null];

    return (
        <div className="fixed inset-0 z-[100] flex items-stretch justify-center bg-white lg:items-center lg:bg-transparent lg:p-6" role="dialog" aria-modal="true" aria-label={product.sku}>
            <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="absolute inset-0 hidden bg-[#060b00]/50 lg:block" />

            <div className="relative flex h-full w-full flex-col overflow-hidden bg-white lg:h-[min(52rem,90vh)] lg:max-w-3xl lg:rounded-3xl lg:shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:px-6 lg:py-5">
                    <button type="button" onClick={onClose} aria-label="Πίσω" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden">
                        <ChevronLeft size={22} />
                    </button>
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 lg:h-24 lg:w-24">
                        {product.image_url && !imageFailed ? (
                            <img src={product.image_url} alt={product.sku} decoding="async" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-300"><ImageIcon size={26} /></div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <SkuColorizedText sku={product.sku} suffix="" gender={product.gender} className="block truncate text-xl leading-tight lg:text-3xl" />
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{product.category}</span>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{product.gender}</span>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 lg:flex">
                        <X size={20} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50/60 p-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6">
                    <div className="grid grid-cols-3 gap-2">
                        <StatTile icon={Package} label="Απόθεμα" value={formatNumber(totalStock)} tone="border-emerald-100 bg-emerald-50 text-emerald-800" />
                        <StatTile icon={BookMarked} label="Δειγματολόγιο" value={formatNumber(product.sample_qty || 0)} tone="border-violet-100 bg-violet-50 text-violet-800" />
                        <StatTile icon={Euro} label="Λιανική από" value={minRetail > 0 ? formatCurrency(minRetail) : '—'} tone="border-slate-200 bg-white text-slate-800" />
                    </div>

                    <section className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white">
                        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 lg:px-4">
                            <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><Tag size={13} /> Παραλλαγές, τιμές & ετικέτες</h3>
                            <span className="text-[11px] font-bold tabular-nums text-slate-400">{formatNumber(rows.length)}</span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                            {rows.map((v) => {
                                const stock = v ? (v.available_qty ?? v.stock_qty ?? 0) : masterStock;
                                const retail = retailOf(v);
                                return (
                                    <li key={v?.suffix ?? 'master'} className="flex items-center gap-2.5 px-3 py-2.5 lg:gap-4 lg:px-4">
                                        <div className="min-w-0 flex-1">
                                            <SkuColorizedText sku={product.sku} suffix={v?.suffix || ''} gender={product.gender} className="block truncate text-[15px] leading-tight" />
                                            <div className="mt-1 flex min-w-0 items-center gap-1.5">
                                                {v ? <SuffixBadge suffix={v.suffix} gender={product.gender} /> : <span className="text-[11px] font-semibold text-slate-500">Βασικό προϊόν</span>}
                                                {v?.description && <span className="hidden truncate text-[11px] font-medium text-slate-500 sm:inline">{v.description}</span>}
                                            </div>
                                        </div>
                                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold tabular-nums ${stock > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                            {formatNumber(stock)}<span className="hidden sm:inline"> τεμ.</span>
                                        </span>
                                        <span className="w-[4.75rem] shrink-0 text-right text-[15px] font-black tabular-nums text-[#060b00] lg:w-24 lg:text-base">
                                            {retail > 0 ? formatCurrency(retail) : '—'}
                                        </span>
                                        {setPrintItems && (
                                            <div className="flex shrink-0 gap-1">
                                                <button type="button" onClick={() => print(v, 'standard')} title="Ετικέτα χονδρικής" aria-label="Ετικέτα χονδρικής" className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95">
                                                    <Tag size={15} />
                                                </button>
                                                <button type="button" onClick={() => print(v, 'retail')} title="Ετικέτα λιανικής" aria-label="Ετικέτα λιανικής" className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95">
                                                    <ShoppingBag size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    );
}
