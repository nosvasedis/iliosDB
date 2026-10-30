import React, { useEffect } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { formatNumber } from '../../utils/numberFormat';

// ─── Category grouping ────────────────────────────────────────────────────────
const CATEGORY_PREFIXES = ['Βραχιόλι', 'Κολιέ', 'Σκουλαρίκι', 'Δαχτυλίδι', 'Τσόκερ', 'Σετ', 'Αλυσίδα', 'Τσάντα', 'Καρφίτσα'];

/** Collapses "Βραχιόλι δερμάτινο", "Βραχιόλι αλυσίδα"… into one "Βραχιόλι" chip. */
export const getCategoryGroup = (category: string): string => {
    for (const prefix of CATEGORY_PREFIXES) {
        if (category.startsWith(prefix)) return prefix;
    }
    return category;
};

export const skuCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Horizontal (phone) / wrapping (desktop) category chips. 'All' is the "Όλα" chip. */
export function CategoryChips({ groups, value, onChange }: { groups: readonly string[]; value: string; onChange: (group: string) => void }) {
    return (
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 ilios-no-scrollbar min-[400px]:-mx-4 min-[400px]:px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {['All', ...groups].map((g) => (
                <button
                    key={g}
                    type="button"
                    onClick={() => onChange(g)}
                    className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12px] font-bold transition-colors ${
                        value === g ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                >
                    {g === 'All' ? 'Όλα' : g}
                </button>
            ))}
        </div>
    );
}

export const optionClass = (active: boolean) =>
    `min-h-[2.25rem] rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-[0.97] ${
        active ? 'border-[#060b00] bg-[#060b00] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`;

export const FilterSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{title}</h3>
        <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
);

export const FilterToggle = ({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (next: boolean) => void }) => (
    <section className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
        <div>
            <p className="text-[13px] font-bold text-slate-800">{title}</p>
            <p className="text-[11px] text-slate-400">{hint}</p>
        </div>
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-200'}`}
        >
            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
    </section>
);

export const ActiveChip = ({ label, onClear }: { label: string; onClear: () => void }) => (
    <button
        type="button"
        onClick={onClear}
        className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#060b00] pl-2.5 pr-1.5 text-[11px] font-bold text-white"
    >
        {label}
        <X size={12} className="opacity-70" />
    </button>
);

/** Row of removable chips for the active filters, with a trailing "Καθαρισμός". */
export function ActiveChipsRow({ children, onClearAll }: { children: React.ReactNode; onClearAll: () => void }) {
    return (
        <div className="-mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3 ilios-no-scrollbar min-[400px]:-mx-4 min-[400px]:px-4 lg:mx-0 lg:flex-wrap lg:px-0">
            {children}
            <button type="button" onClick={onClearAll} className="h-7 shrink-0 px-2 text-[11px] font-bold text-rose-600">Καθαρισμός</button>
        </div>
    );
}

/** Bottom sheet on phones, right-hand drawer on desktop. Filters apply live; the footer just closes. */
export function FilterSheet({ title = 'Φίλτρα', resultCount, activeCount, onClear, onClose, children }: {
    title?: string;
    resultCount: number;
    activeCount: number;
    onClear: () => void;
    onClose: () => void;
    children: React.ReactNode;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-stretch lg:justify-end" role="dialog" aria-modal="true" aria-label={title}>
            <button type="button" aria-label="Κλείσιμο" onClick={onClose} className="absolute inset-0 bg-[#060b00]/40" />
            <div className="relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl lg:max-h-none lg:w-[400px] lg:rounded-none lg:rounded-l-3xl">
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200 lg:hidden" />
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <h2 className="text-base font-bold text-[#060b00]">{title}</h2>
                    <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100">
                        <X size={18} />
                    </button>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
                <div className="flex gap-2 border-t border-slate-100 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                    <button
                        type="button"
                        onClick={onClear}
                        disabled={activeCount === 0}
                        className="flex h-12 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600 disabled:opacity-40"
                    >
                        <RotateCcw size={15} /> Καθαρισμός
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#060b00] text-sm font-bold text-white active:scale-[0.99]"
                    >
                        Προβολή {formatNumber(resultCount)}
                    </button>
                </div>
            </div>
        </div>
    );
}
