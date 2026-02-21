import React from 'react';
import { ScanBarcode, X, Hash, Layers, Plus, ImageIcon, StickyNote } from 'lucide-react';
import { getVariantComponents } from '../../utils/pricingEngine';
import { useOrderState, FINISH_COLORS, STONE_TEXT_COLORS } from '../../hooks/useOrderState';

interface Props {
    orderState: ReturnType<typeof useOrderState>;
}

export const SmartEntryPanel: React.FC<Props> = ({ orderState }) => {
    const { state, setters, actions, refs } = orderState;

    // SKU Visualizer: renders the SKU text overlay with colour-coded suffix
    const SkuVisualizer = () => {
        const { masterStr, suffixStr, finish, stone } = actions.getSkuComponents(state.scanInput, state.activeMaster);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () =>
            suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
                return <span key={i} className={colorClass}>{char}</span>;
            });

        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <span>
                    <span className="text-slate-900 font-black">{masterStr}</span>
                    <span className="font-black">{renderSuffixChars()}</span>
                </span>
            </div>
        );
    };

    return (
        <div className="lg:col-span-5 flex flex-col h-full bg-slate-50/50 rounded-[2.5rem] border border-slate-200 p-6 shadow-inner overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                    <ScanBarcode size={22} className="animate-pulse" />
                </div>
                <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη</h2>
            </div>

            <div className="space-y-6">
                {/* SKU + Qty inputs */}
                <div className="grid grid-cols-12 gap-4 items-end">
                    <div className="col-span-9 relative">
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                        <div className="relative">
                            <SkuVisualizer />
                            <input
                                ref={refs.inputRef}
                                type="text"
                                value={state.scanInput}
                                onChange={actions.handleSmartInput}
                                onKeyDown={e => e.key === 'Enter' && actions.executeAddItem()}
                                placeholder="Πληκτρολογήστε..."
                                className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest shadow-sm relative z-10"
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="col-span-3">
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                        <input
                            type="number" min="1"
                            value={state.scanQty}
                            onChange={e => setters.setScanQty(parseInt(e.target.value) || 1)}
                            onKeyDown={e => e.key === 'Enter' && actions.executeAddItem()}
                            className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                        />
                    </div>
                </div>

                {/* Candidate products carousel */}
                {state.candidateProducts.length > 0 && !state.activeMaster && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest">ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ</label>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {state.candidateProducts.map(p => (
                                <div
                                    key={p.sku}
                                    onClick={() => actions.handleSelectMaster(p)}
                                    className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-emerald-500 min-w-[160px] shadow-sm transition-all group active:scale-95"
                                >
                                    <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                                        {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="m-auto text-slate-300" />}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-black text-sm text-slate-800 leading-none group-hover:text-emerald-700 transition-colors">{p.sku}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{p.category}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Active master card */}
                {state.activeMaster && (
                    <div className="bg-white p-5 rounded-3xl border border-emerald-100 shadow-xl animate-in zoom-in-95 duration-200 space-y-6">
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                                    {state.activeMaster.image_url ? <img src={state.activeMaster.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="m-3 text-slate-300" />}
                                </div>
                                <div>
                                    <h3 className="font-black text-xl text-slate-900 leading-none">{state.activeMaster.sku}</h3>
                                    <p className="text-xs text-slate-500 font-bold mt-1 uppercase">{state.activeMaster.category}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setters.setActiveMaster(null); setters.setScanInput(''); setters.setFilteredVariants([]); setters.setSelectedSize(''); }}
                                className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Size picker */}
                        {state.sizeMode && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                    <Hash size={12} /> Επιλογή {state.sizeMode.type} <span className="font-normal text-slate-300 lowercase">(Προαιρετικό)</span>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {state.sizeMode.sizes.map(s => (
                                        <button
                                            key={s}
                                            onClick={() => setters.setSelectedSize(s === state.selectedSize ? '' : s)}
                                            className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${state.selectedSize === s ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Variant grid */}
                        {state.filteredVariants.length > 0 && (
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1"><Layers size={12} /> ΠΑΡΑΛΛΑΓΕΣ</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {state.filteredVariants.map(v => {
                                        const { finish, stone } = getVariantComponents(v.suffix, state.activeMaster!.gender);
                                        return (
                                            <button
                                                key={v.suffix}
                                                onClick={() => actions.handleAddItem(v.variant)}
                                                className="p-3 rounded-xl border transition-all flex flex-col items-center gap-1 shadow-sm active:scale-95 bg-white border-slate-100 hover:border-emerald-500"
                                            >
                                                <span className="text-sm font-black flex items-center gap-0.5">
                                                    <span className={FINISH_COLORS[finish.code] || 'text-slate-400'}>{finish.code || 'BAS'}</span>
                                                    <span className={STONE_TEXT_COLORS[stone.code] || 'text-emerald-500'}>{stone.code}</span>
                                                </span>
                                                <span className="text-[9px] font-bold text-slate-400 truncate w-full text-center">{v.desc || 'Variant'}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Item notes */}
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 block flex items-center gap-1">
                                <StickyNote size={12} /> ΕΙΔΙΚΕΣ ΠΑΡΑΤΗΡΗΣΕΙΣ ΕΙΔΟΥΣ
                            </label>
                            <input
                                type="text"
                                value={state.itemNotes}
                                onChange={e => setters.setItemNotes(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && actions.executeAddItem()}
                                placeholder="π.χ. Αλλαγή κουμπώματος, Μακρύτερη αλυσίδα..."
                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
                            />
                        </div>

                        {/* Add base button (no variants) */}
                        {(!state.activeMaster.variants || state.activeMaster.variants.length === 0) && (
                            <button
                                onClick={() => actions.handleAddItem(null)}
                                className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-black shadow-lg shadow-emerald-100 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-emerald-700"
                            >
                                <Plus size={24} /> Προσθήκη Βασικού
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
