import React from 'react';
import { ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';
import type { SupplierOrderGroupedNeed, SupplierOrderNeedRequirement } from '../hooks/useSupplierOrderNeeds';
import { aggregateRequirementsByCustomer, unattributedQty } from '../utils/supplierOrderNeedBreakdown';
import { quantitiesFromSelection, selectedQtyFromMask } from '../utils/supplierOrderCustomerFilter';
import { formatOrderId } from '../utils/orderUtils';

type Accent = 'indigo' | 'blue';

const accentAdd: Record<Accent, string> = {
    indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 disabled:opacity-40 disabled:pointer-events-none',
    blue: 'bg-blue-100 hover:bg-blue-200 text-blue-700 disabled:opacity-40 disabled:pointer-events-none',
};

const accentToggle: Record<Accent, string> = {
    indigo: 'text-indigo-700 hover:bg-indigo-100/80 border-indigo-200',
    blue: 'text-blue-700 hover:bg-blue-100/80 border-blue-200',
};

const accentBorder: Record<Accent, string> = {
    indigo: 'border-indigo-200',
    blue: 'border-blue-200',
};

const accentBar: Record<Accent, string> = {
    indigo: 'border-indigo-300',
    blue: 'border-blue-300',
};

const sizeBadge: Record<Accent, string> = {
    indigo: 'bg-indigo-100 text-indigo-700',
    blue: 'bg-blue-100 text-blue-700',
};

interface Props {
    need: SupplierOrderGroupedNeed;
    accent: Accent;
    expanded: boolean;
    onToggleBreakdown: () => void;
    selectionMask: boolean[];
    onSelectionChange: (next: boolean[]) => void;
    onAddFiltered: (qty: number, requirements: SupplierOrderNeedRequirement[]) => void;
    onNotifyZero?: () => void;
    layout: 'desktop' | 'mobile';
}

export default function PurchaseNeedRow({
    need: n,
    accent,
    expanded,
    onToggleBreakdown,
    selectionMask,
    onSelectionChange,
    onAddFiltered,
    onNotifyZero,
    layout,
}: Props) {
    const extra = unattributedQty(n.totalQty, n.requirements);
    const byCustomer = aggregateRequirementsByCustomer(n.requirements);
    const hasBreakdown = n.requirements.length > 0 || extra > 0;
    const lineCount = byCustomer.length + (extra > 0 ? 1 : 0);
    const isDesktop = layout === 'desktop';

    const selectedQty = selectedQtyFromMask(n, selectionMask, extra);
    const addDisabled = selectedQty <= 0;

    const setAll = (v: boolean) => {
        const len = n.requirements.length + (extra > 0 ? 1 : 0);
        onSelectionChange(new Array(len).fill(v));
    };

    const toggleAt = (index: number) => {
        const next = [...selectionMask];
        if (index < 0 || index >= next.length) return;
        next[index] = !next[index];
        onSelectionChange(next);
    };

    const handleAdd = () => {
        const { totalQty, requirements } = quantitiesFromSelection(n, selectionMask, extra);
        if (totalQty <= 0) {
            onNotifyZero?.();
            return;
        }
        onAddFiltered(totalQty, requirements);
    };

    return (
        <div
            className={`bg-white rounded-xl border flex ${isDesktop ? 'p-3 flex-row items-start justify-between gap-3' : 'p-2.5 flex-col gap-2'} ${accentBorder[accent]}`}
        >
            <div className={`flex gap-3 min-w-0 ${isDesktop ? 'flex-1 items-start' : 'flex-1'}`}>
                <div
                    className={`bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center ${isDesktop ? 'w-10 h-10' : 'w-12 h-12'}`}
                >
                    {n.product?.image_url ? (
                        <img src={n.product.image_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                        <ImageIcon size={isDesktop ? 16 : 20} className="text-slate-300 m-auto" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="font-black text-slate-800 flex flex-wrap items-center gap-2 text-sm">
                        <span>
                            {n.sku}
                            {n.variant}
                        </span>
                        {n.size && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${sizeBadge[accent]}`}>{n.size}</span>
                        )}
                    </div>
                    <p className={`text-slate-700 font-bold mt-1 ${isDesktop ? 'text-[11px]' : 'text-[10px]'}`}>
                        <span className="text-slate-900 font-black tabular-nums">{n.totalQty}</span> τμχ συνολικά
                        {selectedQty !== n.totalQty && (
                            <>
                                {' '}
                                · <span className="text-emerald-800 font-black tabular-nums">{selectedQty}</span> επιλεγμένα
                            </>
                        )}
                    </p>
                    {hasBreakdown && (
                        <>
                            <button
                                type="button"
                                onClick={e => {
                                    e.stopPropagation();
                                    onToggleBreakdown();
                                }}
                                className={`mt-1.5 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${accentToggle[accent]}`}
                                aria-expanded={expanded}
                            >
                                {expanded ? (
                                    <ChevronDown size={14} className="shrink-0" aria-hidden />
                                ) : (
                                    <ChevronRight size={14} className="shrink-0" aria-hidden />
                                )}
                                Ανάλυση &amp; επιλογή{lineCount > 0 ? ` (${lineCount})` : ''}
                            </button>
                            {expanded && (
                                <div className={`mt-2 space-y-2 border-l-2 pl-2.5 ${accentBar[accent]}`}>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAll(true)}
                                            className="text-[10px] font-black uppercase text-slate-600 hover:text-slate-900 underline decoration-slate-300"
                                        >
                                            Όλα
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAll(false)}
                                            className="text-[10px] font-black uppercase text-slate-600 hover:text-slate-900 underline decoration-slate-300"
                                        >
                                            Κανένα
                                        </button>
                                    </div>
                                    <ul className="space-y-1" role="list">
                                        {n.requirements.map((r, i) => (
                                            <li key={`${r.orderId}-${i}-${r.customer}`}>
                                                <label
                                                    className={`flex items-center gap-2 rounded-lg cursor-pointer hover:bg-slate-50/80 -mx-1 px-1 py-1 ${isDesktop ? '' : 'touch-manipulation'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectionMask[i]}
                                                        onChange={() => toggleAt(i)}
                                                        className="rounded border-slate-300 w-4 h-4 shrink-0 accent-slate-800"
                                                    />
                                                    <span className={`font-semibold text-slate-800 truncate flex-1 min-w-0 ${isDesktop ? 'text-[11px]' : 'text-[10px]'}`}>
                                                        {r.customer}
                                                    </span>
                                                    {r.orderId ? (
                                                        <span className="text-[9px] font-mono text-slate-400 shrink-0">#{formatOrderId(r.orderId)}</span>
                                                    ) : null}
                                                    <span className={`font-black tabular-nums text-slate-900 shrink-0 ${isDesktop ? 'text-[11px]' : 'text-[10px]'}`}>
                                                        {r.quantity} τμχ
                                                    </span>
                                                </label>
                                            </li>
                                        ))}
                                        {extra > 0 && (
                                            <li>
                                                <label
                                                    className={`flex items-center gap-2 rounded-lg cursor-pointer hover:bg-amber-50/80 -mx-1 px-1 py-1 ${isDesktop ? '' : 'touch-manipulation'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selectionMask[n.requirements.length]}
                                                        onChange={() => toggleAt(n.requirements.length)}
                                                        className="rounded border-slate-300 w-4 h-4 shrink-0 accent-amber-800"
                                                    />
                                                    <span className={`font-bold text-amber-950 flex-1 min-w-0 ${isDesktop ? 'text-[11px]' : 'text-[10px]'}`}>
                                                        Λοιπά (αναντίστοιχα)
                                                    </span>
                                                    <span className={`font-black tabular-nums text-amber-950 shrink-0 ${isDesktop ? 'text-[11px]' : 'text-[10px]'}`}>
                                                        {extra} τμχ
                                                    </span>
                                                </label>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <button
                type="button"
                onClick={handleAdd}
                disabled={addDisabled}
                className={`rounded-lg font-black transition-colors shrink-0 ${isDesktop ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs self-end'} ${accentAdd[accent]}`}
            >
                +{selectedQty}
            </button>
        </div>
    );
}
