import React from 'react';
import { ImageIcon, ChevronDown, ChevronRight } from 'lucide-react';
import type { SupplierOrderGroupedNeed } from '../hooks/useSupplierOrderNeeds';
import {
    aggregateRequirementsByCustomer,
    unattributedQty,
} from '../utils/supplierOrderNeedBreakdown';

type Accent = 'indigo' | 'blue';

const accentAdd: Record<Accent, string> = {
    indigo: 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700',
    blue: 'bg-blue-100 hover:bg-blue-200 text-blue-700',
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
    onAdd: () => void;
    layout: 'desktop' | 'mobile';
}

export default function PurchaseNeedRow({
    need: n,
    accent,
    expanded,
    onToggleBreakdown,
    onAdd,
    layout,
}: Props) {
    const extra = unattributedQty(n.totalQty, n.requirements);
    const byCustomer = aggregateRequirementsByCustomer(n.requirements);
    const hasBreakdown = n.requirements.length > 0 || extra > 0;
    const lineCount = byCustomer.length + (extra > 0 ? 1 : 0);
    const isDesktop = layout === 'desktop';

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
                                Ανάλυση ανά πελάτη{lineCount > 0 ? ` (${lineCount})` : ''}
                            </button>
                            {expanded && (
                                <ul className={`mt-2 space-y-1 border-l-2 pl-2.5 ${accentBar[accent]}`} role="list">
                                    {byCustomer.map(row => (
                                        <li key={row.customer} className="flex justify-between gap-2 text-[11px] text-slate-700">
                                            <span className="font-semibold truncate min-w-0">{row.customer}</span>
                                            <span className="font-black shrink-0 tabular-nums">{row.qty} τμχ</span>
                                        </li>
                                    ))}
                                    {extra > 0 && (
                                        <li className="flex justify-between gap-2 text-[11px] text-amber-900 font-bold">
                                            <span>Λοιπά (αναντίστοιχα)</span>
                                            <span className="tabular-nums">{extra} τμχ</span>
                                        </li>
                                    )}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </div>
            <button
                type="button"
                onClick={onAdd}
                className={`rounded-lg font-black transition-colors shrink-0 ${isDesktop ? 'px-3 py-1.5 text-xs' : 'px-3 py-1.5 text-xs self-end'} ${accentAdd[accent]}`}
            >
                +{n.totalQty}
            </button>
        </div>
    );
}
