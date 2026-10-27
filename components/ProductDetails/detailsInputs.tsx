import { formatNumber } from '../../utils/numberFormat';
import React, { useState } from 'react';
import { Check, Hammer, Lock, RefreshCcw, Unlock } from 'lucide-react';

export const SmartQuantityInput = React.memo(({
    value,
    onChange,
    stonesPerStrand
}: {
    value: number,
    onChange: (val: number) => void,
    stonesPerStrand?: number
}) => {
    const [strandInput, setStrandInput] = useState<string>('');
    const [showStrandInput, setShowStrandInput] = useState(false);

    const applyStrands = () => {
        const strands = parseFloat(strandInput);
        if (!isNaN(strands) && stonesPerStrand) {
            onChange(Math.round(strands * stonesPerStrand));
        }
        setShowStrandInput(false);
        setStrandInput('');
    };

    return (
        <div className="relative flex items-center gap-1.5">
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-16 rounded-md border border-slate-200 bg-white p-1.5 text-center text-sm font-bold text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10"
            />
            {stonesPerStrand && stonesPerStrand > 1 && (
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setShowStrandInput(!showStrandInput)}
                        className="rounded-md border border-blue-100 bg-blue-50 p-1.5 text-blue-600 transition-colors hover:bg-blue-100"
                        title="Εισαγωγή ως Κορδόνια"
                    >
                        <RefreshCcw size={13} />
                    </button>
                    {showStrandInput && (
                        <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-100 bg-white p-3 shadow-xl animate-in zoom-in-95">
                            <div className="mb-1 text-[10px] font-bold uppercase text-slate-400">Κορδόνια ({formatNumber(stonesPerStrand)} πέτρες)</div>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="1,5"
                                    value={strandInput}
                                    onChange={e => setStrandInput(e.target.value)}
                                    className="w-full rounded border border-slate-200 p-1.5 text-sm outline-none focus:border-blue-400"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && applyStrands()}
                                />
                                <button type="button" onClick={applyStrands} className="rounded bg-blue-600 p-1.5 text-white hover:bg-blue-700">
                                    <Check size={14} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

export const LaborCostInput = React.memo(({ label, value, onChange, override, onToggleOverride, readOnly = false, icon = <Hammer size={14} /> }: { label: string, value: number, onChange: (v: number) => void, override?: boolean, onToggleOverride?: () => void, readOnly?: boolean, icon?: React.ReactNode }) => (
    <div className="group flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2 transition-colors hover:border-slate-200 hover:bg-slate-50">
        <span className="flex items-center gap-2 text-sm text-slate-600">
            <span className="text-slate-400 transition-colors group-hover:text-slate-500">{icon}</span>
            {label}
        </span>
        <div className="flex items-center gap-2">
            <input
                type="number" step="0.01"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
                readOnly={readOnly || (onToggleOverride && !override)}
                className={`w-20 rounded-md border border-slate-200 bg-white p-1.5 text-right font-mono text-sm outline-none transition-all focus:border-amber-400 focus:ring-2 focus:ring-amber-500/10 ${readOnly || (onToggleOverride && !override) ? 'text-slate-400' : 'font-bold text-slate-800'}`}
            />
            {onToggleOverride && (
                <button type="button" onClick={onToggleOverride} className={`rounded-md p-1 transition-all ${override ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-slate-300 hover:bg-amber-50 hover:text-amber-500'}`}>
                    {override ? <Unlock size={14} /> : <Lock size={14} />}
                </button>
            )}
            <span className="text-xs font-medium text-slate-400">€</span>
        </div>
    </div>
));

export const SummaryRow = React.memo(({ label, value, sub, color }: { label: string, value: string, sub?: string, color: string }) => (
    <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${color}`}></div>
            <span className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}</span>
        </div>
        <div className="text-right">
            <div className="font-mono text-sm font-bold text-slate-800">{value}</div>
            {sub && <div className="text-[10px] font-medium text-slate-400">{sub}</div>}
        </div>
    </div>
));
