import React, { useState } from 'react';
import { Check, RefreshCcw } from 'lucide-react';

interface SmartQuantityInputProps {
    value: number;
    onChange: (val: number) => void;
    stonesPerStrand?: number;
}

export const SmartQuantityInput: React.FC<SmartQuantityInputProps> = React.memo(({
    value,
    onChange,
    stonesPerStrand
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
        <div className="flex items-center gap-2 relative">
            <input
                type="number"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-16 p-1 text-center font-bold bg-slate-50 rounded border border-slate-200 outline-none focus:border-blue-400"
            />
            {stonesPerStrand && stonesPerStrand > 1 && (
                <div className="relative">
                    <button
                        onClick={() => setShowStrandInput(!showStrandInput)}
                        className="p-1 bg-blue-50 text-blue-600 rounded border border-blue-100 hover:bg-blue-100 transition-colors"
                        title="Εισαγωγή ως Κορδόνια"
                        type="button"
                    >
                        <RefreshCcw size={14} />
                    </button>
                    {showStrandInput && (
                        <div className="absolute top-full right-0 mt-2 z-50 bg-white p-3 rounded-xl shadow-xl border border-slate-100 w-48 animate-in zoom-in-95">
                            <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Κορδόνια ({stonesPerStrand} πέτρες)</div>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="1.5"
                                    value={strandInput}
                                    onChange={e => setStrandInput(e.target.value)}
                                    className="w-full p-1.5 border border-slate-200 rounded text-sm outline-none focus:border-blue-400"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && applyStrands()}
                                />
                                <button type="button" onClick={applyStrands} className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700">
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
