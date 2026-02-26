import React from 'react';
import { Hammer, Globe, Tag, ImageIcon, Lightbulb, Info, Scale } from 'lucide-react';
import { ProductionType, Gender, PlatingType } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { MoldsSection } from './MoldsSection';
import { FINISH_CODES } from '../../constants';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    suppliers?: any[];
}

export const StepBasicInfo: React.FC<Props> = ({ formState, suppliers }) => {
    const { state, setters, actions } = formState;

    return (
        <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
            <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                <span>1. Βασικά Στοιχεία</span>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                    <button onClick={() => setters.setProductionType(ProductionType.InHouse)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${state.productionType === ProductionType.InHouse ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><Hammer size={14} /> Εργαστήριο</button>
                    <button onClick={() => setters.setProductionType(ProductionType.Imported)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${state.productionType === ProductionType.Imported ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><Globe size={14} /> Εισαγωγή</button>
                </div>
            </h3>
            <div className="flex flex-col lg:flex-row gap-8">
                <div className="w-full lg:w-1/3">
                    <label className="block text-sm font-bold text-slate-700 mb-2">Φωτογραφία</label>
                    <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden hover:border-amber-400 transition-all cursor-pointer shadow-inner">
                        {state.imagePreview ? <img src={state.imagePreview} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 pointer-events-none"><ImageIcon size={32} className="opacity-50 mb-2" /><span className="text-xs font-bold">Επιλογή</span></div>}
                        <input type="file" accept="image/*" onChange={actions.handleImageSelect} className="absolute inset-0 opacity-0 cursor-pointer z-50" />
                    </div>
                </div>
                <div className="flex-1 space-y-6">
                    <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-4">
                        <div className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-2"><Tag size={14} /> Ταυτότητα Προϊόντος</div>
                        <div className="relative">
                            <label className="block text-sm font-bold text-blue-900 mb-1.5">SKU *</label>
                            <input type="text" value={state.sku} onChange={(e) => setters.setSku(e.target.value.toUpperCase())} className="w-full p-3 border border-blue-200 rounded-xl font-mono uppercase bg-white focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-lg" />
                            {state.detectedSuffix && <div className="mt-2 text-xs bg-white text-blue-700 p-2 rounded flex items-center gap-1 border border-blue-100"><Lightbulb size={12} /> Ανιχνεύθηκε ρίζα <strong>{state.detectedMasterSku}{state.bridge}</strong> με φινίρισμα <strong>{state.platingMasterLabel}</strong>.</div>}
                        </div>
                        {state.productionType === ProductionType.Imported && (
                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-bold text-blue-900 mb-1.5">Προμηθευτής</label>
                                    <select
                                        value={state.supplierId}
                                        onChange={(e) => setters.setSupplierId(e.target.value)}
                                        className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none cursor-pointer"
                                    >
                                        <option value="">Επιλογή...</option>
                                        {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-blue-900 mb-1.5">Κωδικός Προμηθευτή</label>
                                    <input type="text" value={state.supplierSku} onChange={(e) => setters.setSupplierSku(e.target.value)} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none" placeholder="π.χ. ITEM-123" />
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-5">
                            <div>
                                <label className="block text-sm font-bold text-blue-900 mb-1.5">Φύλο *</label>
                                <select value={state.gender} onChange={(e) => { setters.setGender(e.target.value as Gender); setters.setIsGenderManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none">
                                    <option value="" disabled>Επιλέξτε</option>
                                    <option value={Gender.Women}>Γυναικεία</option>
                                    <option value={Gender.Men}>Ανδρικά</option>
                                    <option value={Gender.Unisex}>Unisex</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-blue-900 mb-1.5">Κατηγορία *</label>
                                <input type="text" value={state.category} onChange={(e) => { setters.setCategory(e.target.value); setters.setIsCategoryManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2"><Hammer size={14} /> Τεχνικά Χαρακτηριστικά</div>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className="text-[10px] font-bold text-purple-600 uppercase cursor-pointer" htmlFor="assemblyToggle">Χωρίς Χύτευση</label>
                                    <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
                                        <input
                                            type="checkbox"
                                            id="assemblyToggle"
                                            className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                            checked={state.isAssembly}
                                            onChange={(e) => setters.setIsAssembly(e.target.checked)}
                                            style={{ left: state.isAssembly ? '1rem' : '0', borderColor: state.isAssembly ? '#9333ea' : '#ccc' }}
                                        />
                                        <label htmlFor="assemblyToggle" className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${state.isAssembly ? 'bg-purple-600' : 'bg-slate-300'}`}></label>
                                    </div>
                                </div>
                                {state.productionType === ProductionType.InHouse && (
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] font-bold text-indigo-600 uppercase cursor-pointer" htmlFor="stxToggle">Εξάρτημα</label>
                                        <div className="relative inline-block w-8 h-4 align-middle select-none transition duration-200 ease-in">
                                            <input
                                                type="checkbox"
                                                id="stxToggle"
                                                className="toggle-checkbox absolute block w-4 h-4 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                                checked={state.isSTX}
                                                onChange={(e) => setters.setIsSTX(e.target.checked)}
                                                style={{ left: state.isSTX ? '1rem' : '0', borderColor: state.isSTX ? '#4f46e5' : '#ccc' }}
                                            />
                                            <label htmlFor="stxToggle" className={`toggle-label block overflow-hidden h-4 rounded-full cursor-pointer ${state.isSTX ? 'bg-indigo-600' : 'bg-slate-300'}`}></label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            <div className="relative">
                                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                                    <span>Βασικό Βάρος (g) {state.isAssembly ? '(Συναρμολόγηση: 0)' : '*'}</span>
                                    {state.productionType === ProductionType.InHouse && state.selectedMolds.length > 0 && !state.isAssembly && (
                                        <button
                                            onClick={actions.calculateWeightFromMolds}
                                            className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 hover:bg-amber-200 flex items-center gap-1 transition-colors"
                                            title="Υπολογισμός από Λάστιχα"
                                            type="button"
                                        >
                                            <Scale size={10} /> Auto
                                        </button>
                                    )}
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={state.weight}
                                    onChange={e => setters.setWeight(parseFloat(e.target.value) || 0)}
                                    disabled={state.isAssembly}
                                    className={`w-full p-3 border border-slate-200 rounded-xl font-bold outline-none focus:ring-4 focus:ring-slate-500/20 ${state.isAssembly ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1.5">{state.secondaryWeightLabel}</label>
                                <input type="number" step="0.01" value={state.secondaryWeight} onChange={e => setters.setSecondaryWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-slate-500/20 outline-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Διαθέσιμα Φινιρίσματα (Παραλλαγές)</label>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(FINISH_CODES).map(([code, label]) => {
                                    if (code === 'S' || code === 'E' || code === 'T' || code === 'O') return null; // Only available finishes
                                    const c = code as string;
                                    const l = label as string;
                                    let colorCls = '';
                                    if (c === 'X') colorCls = 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200';
                                    else if (c === 'H') colorCls = 'bg-cyan-100 text-cyan-700 border-cyan-200 hover:bg-cyan-200';
                                    else if (c === 'D') colorCls = 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200';
                                    else if (c === 'P') colorCls = 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
                                    else if (c === '') colorCls = 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200';

                                    return (
                                        <button
                                            key={c}
                                            onClick={() => {
                                                actions.toggleFinish(c);
                                                if (state.selectedFinishes.length === 0 || (state.plating === c as any && !state.selectedFinishes.includes(c))) {
                                                    setters.setPlating(c as PlatingType);
                                                }
                                            }}
                                            className={`
                                                px-3 py-2 rounded-xl text-xs font-bold transition-all border
                                                ${state.selectedFinishes.includes(c)
                                                    ? `${colorCls} shadow-sm ring-2 ring-offset-1 ring-slate-200`
                                                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}
                                            `}
                                        >
                                            {l}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                                <Info size={12} /> Επιλέξτε όλα τα φινιρίσματα που θα διατίθεται το προϊόν. Το <strong>{state.platingMasterLabel}</strong> θα οριστεί ως Master.
                            </div>
                        </div>
                    </div>


                </div>
            </div>
            {state.productionType === ProductionType.InHouse && <MoldsSection formState={formState} />}
        </div>
    );
};
