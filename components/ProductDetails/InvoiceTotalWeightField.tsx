import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { InvoiceTotalWeightResult } from '../../utils/invoiceTotalWeight';

export default function InvoiceTotalWeightField({
    value,
    result,
    onChange,
    onClear,
    focusClass = 'focus:border-blue-400 focus:ring-blue-500/10',
}: {
    value: number | null | undefined;
    result: InvoiceTotalWeightResult;
    onChange: (value: number | null) => void;
    onClear: () => void;
    focusClass?: string;
}) {
    const sourceLabel = result.source === 'manual' ? 'Χειροκίνητο' : result.source === 'automatic' ? 'Αυτόματο' : 'Ελλιπές';
    const sourceClass = result.source === 'manual'
        ? 'bg-blue-100 text-blue-700'
        : result.source === 'automatic'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700';

    return (
        <div className={`rounded-xl border p-4 ${result.source === 'missing' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50/60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600">Συνολικό Βάρος (g)</label>
                    <p className="mt-1 text-[10px] text-slate-500">Ανεξάρτητο από τους υπολογισμούς κόστους και παραγωγής.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${sourceClass}`}>
                    {sourceLabel}
                </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={`w-full max-w-xs rounded-xl border border-slate-200 bg-white p-2.5 font-mono font-bold text-slate-700 outline-none focus:ring-2 ${focusClass}`}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
                    placeholder={result.value === null ? 'Χειροκίνητη τιμή' : result.value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                />
                {value !== null && value !== undefined && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                        <RefreshCw size={13} /> Επιστροφή σε αυτόματο
                    </button>
                )}
            </div>
            {result.value !== null && (
                <p className="mt-2 text-xs font-bold text-slate-700">
                    Τιμή παραστατικού: {result.value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}gr
                </p>
            )}
            {result.missingItems.length > 0 && (
                <div className="mt-3 flex gap-2 text-xs text-amber-800">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                    <ul className="list-disc space-y-1 pl-4">
                        {result.missingItems.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
}
