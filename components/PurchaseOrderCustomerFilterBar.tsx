import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Users } from 'lucide-react';
import { normCustomerKey, type PurchaseOrderFilterTab } from '../utils/supplierOrderCustomerFilter';

interface Props {
    uniqueCustomers: string[];
    tab: PurchaseOrderFilterTab;
    onTabChange: (t: PurchaseOrderFilterTab) => void;
    pickedKeys: Set<string>;
    onTogglePicked: (displayName: string) => void;
    expanded: boolean;
    onToggleExpanded: () => void;
    layout: 'desktop' | 'mobile';
}

const TAB_LABELS: Record<PurchaseOrderFilterTab, string> = {
    all: 'Όλοι',
    exclude: 'Εξαίρεση',
    include_only: 'Μόνο…',
};

export default function PurchaseOrderCustomerFilterBar({
    uniqueCustomers,
    tab,
    onTabChange,
    pickedKeys,
    onTogglePicked,
    expanded,
    onToggleExpanded,
    layout,
}: Props) {
    const [q, setQ] = useState('');
    const isDesktop = layout === 'desktop';

    const filteredCustomers = useMemo(() => {
        const t = q.trim().toLowerCase();
        if (!t) return uniqueCustomers;
        return uniqueCustomers.filter(c => c.toLowerCase().includes(t) || normCustomerKey(c).includes(normCustomerKey(q)));
    }, [uniqueCustomers, q]);

    if (uniqueCustomers.length === 0) return null;

    return (
        <div
            className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${isDesktop ? 'p-4' : 'p-3'}`}
        >
            <button
                type="button"
                onClick={onToggleExpanded}
                className="flex w-full items-center gap-2 text-left min-w-0 rounded-xl hover:bg-slate-50 -m-1 p-1 transition-colors"
                aria-expanded={expanded}
            >
                {expanded ? (
                    <ChevronDown size={isDesktop ? 18 : 16} className="shrink-0 text-slate-500" aria-hidden />
                ) : (
                    <ChevronRight size={isDesktop ? 18 : 16} className="shrink-0 text-slate-500" aria-hidden />
                )}
                <Filter size={isDesktop ? 16 : 14} className="shrink-0 text-slate-500" aria-hidden />
                <span className={`font-black text-slate-800 uppercase tracking-wide min-w-0 ${isDesktop ? 'text-xs' : 'text-[10px]'}`}>
                    Φίλτρο πελατών (μαζική «Όλα»)
                </span>
            </button>
            <p className={`text-slate-500 font-bold mt-1 ${isDesktop ? 'text-[11px] pl-7' : 'text-[10px] pl-6'}`}>
                Το κουμπί «Όλα» χρησιμοποιεί μόνο αυτό το φίλτρο. Ανά SKU, χρησιμοποιήστε τα τικ στην ανάλυση.
            </p>

            {expanded && (
                <div className={`mt-3 space-y-3 ${isDesktop ? 'pl-1' : ''}`}>
                    <div className={`flex flex-wrap gap-1.5 ${isDesktop ? '' : 'gap-1'}`}>
                        {(Object.keys(TAB_LABELS) as PurchaseOrderFilterTab[]).map(tk => (
                            <button
                                key={tk}
                                type="button"
                                onClick={() => onTabChange(tk)}
                                className={`rounded-lg font-black uppercase tracking-wide transition-colors touch-manipulation ${
                                    isDesktop ? 'px-3 py-1.5 text-[10px]' : 'px-2 py-1.5 text-[9px] flex-1 min-w-[4.5rem]'
                                } ${
                                    tab === tk
                                        ? 'bg-slate-900 text-white shadow-md'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {TAB_LABELS[tk]}
                            </button>
                        ))}
                    </div>

                    {tab !== 'all' && (
                        <>
                            <div className="relative">
                                <Users
                                    className={`absolute text-slate-400 pointer-events-none ${isDesktop ? 'left-3 top-1/2 -translate-y-1/2' : 'left-2.5 top-1/2 -translate-y-1/2'}`}
                                    size={isDesktop ? 16 : 14}
                                    aria-hidden
                                />
                                <input
                                    type="search"
                                    value={q}
                                    onChange={e => setQ(e.target.value)}
                                    placeholder={tab === 'exclude' ? 'Αναζήτηση για εξαίρεση…' : 'Αναζήτηση πελατών…'}
                                    className={`w-full rounded-xl border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-slate-300/80 ${
                                        isDesktop ? 'pl-10 pr-3 py-2 text-sm' : 'pl-9 pr-2 py-2 text-xs'
                                    }`}
                                />
                            </div>
                            <ul
                                className={`max-h-36 overflow-y-auto custom-scrollbar space-y-1 rounded-xl border border-slate-100 bg-slate-50/80 p-2 ${
                                    isDesktop ? 'max-h-40' : 'max-h-32'
                                }`}
                                role="list"
                            >
                                {filteredCustomers.length === 0 && (
                                    <li className="text-center text-xs text-slate-400 py-2 font-medium">Δεν βρέθηκαν.</li>
                                )}
                                {filteredCustomers.map(display => {
                                    const k = normCustomerKey(display);
                                    const on = pickedKeys.has(k);
                                    return (
                                        <li key={k}>
                                            <label
                                                className={`flex items-center gap-2.5 rounded-lg cursor-pointer transition-colors touch-manipulation ${
                                                    isDesktop ? 'p-2 hover:bg-white' : 'p-2 active:bg-white'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    onChange={() => onTogglePicked(display)}
                                                    className="rounded border-slate-300 w-4 h-4 shrink-0 accent-slate-900"
                                                />
                                                <span className={`font-bold text-slate-800 truncate flex-1 min-w-0 ${isDesktop ? 'text-xs' : 'text-[11px]'}`}>
                                                    {display}
                                                </span>
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>
                            <p className={`text-slate-500 font-bold ${isDesktop ? 'text-[10px]' : 'text-[9px]'}`}>
                                {tab === 'exclude'
                                    ? 'Οι τσεκαρισμένοι πελάτες αποκλείονται από τη μαζική προσθήκη (όχι από χειροκίνητα τικ ανά SKU).'
                                    : 'Μόνο οι τσεκαρισμένοι πελάτες μετράνε στη μαζική προσθήκη. Αν δεν επιλέξετε κανέναν, η «Όλα» δεν προσθέτει γραμμές από εκκρεμείς/παραγωγή.'}
                            </p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
