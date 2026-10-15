import React, { useId } from 'react';
import RetailBadge from './RetailBadge';

interface Props {
    value: string;
    onChange: (value: string) => void;
    onChangeCustomer: () => void;
}

/** Edit the real client directly while preserving the retail account behind the scenes. */
export default function RetailClientField({ value, onChange, onChangeCustomer }: Props) {
    const id = useId();
    return <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
            <label htmlFor={id} className="text-xs font-bold text-slate-600">Ονοματεπώνυμο πελάτη</label>
            <button type="button" onClick={onChangeCustomer} className="text-xs font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-800">Αλλαγή πελάτη</button>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/30 px-3 focus-within:ring-2 focus-within:ring-fuchsia-200">
            <input id={id} value={value} onChange={event => onChange(event.target.value)}
                aria-describedby={`${id}-hint`} autoComplete="name" placeholder="π.χ. Μαρία Παπαδοπούλου"
                className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-slate-900 outline-none placeholder:font-normal" />
            <RetailBadge />
        </div>
        <p id={`${id}-hint`} className="text-[11px] leading-relaxed text-slate-500">Αυτό το όνομα εμφανίζεται στην παραγγελία και στα PDF.</p>
    </div>;
}
