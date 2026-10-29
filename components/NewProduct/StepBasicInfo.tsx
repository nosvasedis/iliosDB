import React from 'react';
import { Hammer, Globe, Tag, ImageIcon, Lightbulb, Info, Scale, AlertTriangle, RotateCcw, Upload, Palette, ClipboardList, Check } from 'lucide-react';
import { ProductionType, Gender, PlatingType } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { MoldsSection } from './MoldsSection';
import { FINISH_CODES } from '../../constants';
import { ACCEPTED_IMAGE_INPUT_TYPES } from '../../utils/imageHelpers';
import { Panel, StepHeader, Toggle, npInputClass, npLabelClass } from './wizardUi';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    suppliers?: any[];
}

const FINISH_CHIP: Record<string, string> = {
    X: 'bg-amber-100 text-amber-800 border-amber-300',
    H: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    D: 'bg-orange-100 text-orange-800 border-orange-300',
    P: 'bg-stone-100 text-stone-800 border-stone-300',
    '': 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const GENDER_OPTIONS = [
    { value: Gender.Women, label: 'Γυναικεία' },
    { value: Gender.Men, label: 'Ανδρικά' },
    { value: Gender.Unisex, label: 'Unisex' },
];

export const StepBasicInfo: React.FC<Props> = ({ formState, suppliers }) => {
    const { state, setters, actions } = formState;
    const weightSource = state.invoiceTotalWeightResult.source;

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <StepHeader
                step={1}
                icon={ClipboardList}
                title="Βασικά στοιχεία"
                subtitle="Ταυτότητα, βάρη και διαθέσιμα φινιρίσματα."
                aside={
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                        {[
                            { type: ProductionType.InHouse, label: 'Εργαστήριο', icon: Hammer },
                            { type: ProductionType.Imported, label: 'Εισαγωγή', icon: Globe },
                        ].map(({ type, label, icon: Icon }) => (
                            <button
                                key={type}
                                type="button"
                                onClick={() => setters.setProductionType(type)}
                                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-black transition-all ${state.productionType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Icon size={14} /> {label}
                            </button>
                        ))}
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
                {/* Photo */}
                <div>
                    <div className="group relative aspect-square w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-gradient-to-br from-slate-50 to-white shadow-sm transition-all hover:border-emerald-400 hover:shadow-md">
                        {state.imagePreview ? (
                            <>
                                <img src={state.imagePreview} className="h-full w-full object-cover" alt="" />
                                <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/50 via-transparent to-transparent pb-4 opacity-0 transition-opacity group-hover:opacity-100">
                                    <span className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-bold text-slate-700"><Upload size={12} /> Αλλαγή</span>
                                </div>
                            </>
                        ) : (
                            <div className="pointer-events-none flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 transition-colors group-hover:text-emerald-500"><ImageIcon size={26} /></div>
                                <span className="text-xs font-bold">Μεταφόρτωση φωτογραφίας</span>
                                <span className="text-[10px] font-medium text-slate-300">Κλικ ή σύρετε εδώ</span>
                            </div>
                        )}
                        <input type="file" accept={ACCEPTED_IMAGE_INPUT_TYPES} onChange={actions.handleImageSelect} className="absolute inset-0 z-10 cursor-pointer opacity-0" />
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Identity */}
                    <Panel title="Ταυτότητα προϊόντος" icon={Tag} tone="blue" bodyClassName="space-y-5">
                        <div>
                            <label className={npLabelClass}>SKU *</label>
                            <input
                                type="text"
                                value={state.sku}
                                onChange={(e) => setters.setSku(e.target.value.toUpperCase())}
                                placeholder="π.χ. DA752"
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-2xl font-black uppercase tracking-wide text-slate-900 outline-none transition-all placeholder:text-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10"
                            />
                            {state.detectedSuffix && (
                                <div className="mt-2 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 animate-in fade-in slide-in-from-top-1">
                                    <Lightbulb size={13} className="shrink-0" /> Ανιχνεύθηκε ρίζα <strong className="font-mono">{state.detectedMasterSku}{state.bridge}</strong> με φινίρισμα <strong>{state.platingMasterLabel}</strong>.
                                </div>
                            )}
                        </div>

                        {state.productionType === ProductionType.Imported && (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label className={npLabelClass}>Προμηθευτής</label>
                                    <select value={state.supplierId} onChange={(e) => setters.setSupplierId(e.target.value)} className={`${npInputClass} cursor-pointer`}>
                                        <option value="">Επιλογή...</option>
                                        {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={npLabelClass}>Κωδικός προμηθευτή</label>
                                    <input type="text" value={state.supplierSku} onChange={(e) => setters.setSupplierSku(e.target.value)} className={npInputClass} placeholder="π.χ. ITEM-123" />
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={npLabelClass}>Φύλο *</label>
                                <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                                    {GENDER_OPTIONS.map((g) => (
                                        <button
                                            key={g.value}
                                            type="button"
                                            onClick={() => { setters.setGender(g.value); setters.setIsGenderManuallySet(true); }}
                                            className={`rounded-lg py-2 text-xs font-bold transition-all ${state.gender === g.value ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500 hover:text-slate-800'}`}
                                        >
                                            {g.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={npLabelClass}>Κατηγορία *</label>
                                <input type="text" value={state.category} onChange={(e) => { setters.setCategory(e.target.value); setters.setIsCategoryManuallySet(true); }} className={npInputClass} placeholder="π.χ. Δαχτυλίδι" />
                            </div>
                        </div>
                    </Panel>

                    {/* Technical */}
                    <Panel
                        title="Τεχνικά χαρακτηριστικά"
                        icon={Hammer}
                        tone="slate"
                        bodyClassName="space-y-5"
                    >
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Toggle id="assemblyToggle" tone="violet" checked={state.isAssembly} onChange={setters.setIsAssembly} label="Χωρίς χύτευση" description="Συναρμολόγηση από υλικά — βάρος 0" />
                            {state.productionType === ProductionType.InHouse && (
                                <Toggle id="stxToggle" tone="indigo" checked={state.isSTX} onChange={(v) => { setters.setIsSTX(v); setters.setIsSTXManuallySet(true); }} label="Εξάρτημα (STX)" description="Χωρίς τιμή πώλησης" />
                            )}
                        </div>

                        {state.isSTX && (
                            <div className="animate-in fade-in slide-in-from-top-1">
                                <label className={npLabelClass}>Περιγραφή εξαρτήματος</label>
                                <input
                                    type="text"
                                    value={state.stxDescription}
                                    onChange={(e) => setters.setStxDescription(e.target.value)}
                                    className={npInputClass}
                                    placeholder="π.χ. Μοτίφ πεταλούδα, Κρίκος σύνδεσης..."
                                />
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={`${npLabelClass} flex items-center justify-between`}>
                                    <span>Βασικό βάρος (g) {state.isAssembly ? '· 0' : '*'}</span>
                                    {state.productionType === ProductionType.InHouse && state.selectedMolds.length > 0 && !state.isAssembly && (
                                        <button
                                            onClick={actions.calculateWeightFromMolds}
                                            className="flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-amber-700 transition-colors hover:bg-amber-100"
                                            title="Υπολογισμός από Λάστιχα"
                                            type="button"
                                        >
                                            <Scale size={10} /> Από λάστιχα
                                        </button>
                                    )}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={state.weight}
                                        onChange={e => setters.setWeight(parseFloat(e.target.value) || 0)}
                                        disabled={state.isAssembly}
                                        className={`${npInputClass} pr-8 font-mono text-base`}
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">g</span>
                                </div>
                            </div>
                            <div>
                                <label className={npLabelClass}>{state.secondaryWeightLabel}</label>
                                <div className="relative">
                                    <input type="number" step="0.01" value={state.secondaryWeight} onChange={e => setters.setSecondaryWeight(parseFloat(e.target.value) || 0)} className={`${npInputClass} pr-8 font-mono text-base`} />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">g</span>
                                </div>
                            </div>
                        </div>

                        <div className={`rounded-xl border p-4 ${weightSource === 'missing' ? 'border-amber-200 bg-amber-50/70' : 'border-emerald-200 bg-emerald-50/50'}`}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-wide text-slate-700">Συνολικό βάρος (g)</label>
                                    <p className="mt-0.5 text-[11px] text-slate-500">Για παραστατικά — δεν επηρεάζει κόστος, ασήμι ή παραγωγή.</p>
                                </div>
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${weightSource === 'manual' ? 'bg-blue-100 text-blue-700' : weightSource === 'automatic' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {weightSource === 'manual' ? 'Χειροκίνητο' : weightSource === 'automatic' ? 'Αυτόματο' : 'Ελλιπές'}
                                </span>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={state.invoiceTotalWeight ?? ''}
                                    onChange={e => setters.setInvoiceTotalWeight(e.target.value === '' ? null : Number(e.target.value))}
                                    className={`${npInputClass} max-w-xs font-mono`}
                                    placeholder={state.invoiceTotalWeightResult.value === null ? 'Χειροκίνητη τιμή' : state.invoiceTotalWeightResult.value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                />
                                {state.invoiceTotalWeight !== null && (
                                    <button type="button" onClick={() => setters.setInvoiceTotalWeight(null)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                                        <RotateCcw size={13} /> Αυτόματο
                                    </button>
                                )}
                                {state.invoiceTotalWeightResult.value !== null && (
                                    <span className="text-xs font-bold text-slate-600">= {state.invoiceTotalWeightResult.value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}gr</span>
                                )}
                            </div>
                            {state.invoiceTotalWeightResult.missingItems.length > 0 && (
                                <div className="mt-3 flex gap-2 text-xs text-amber-800">
                                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                                    <ul className="list-disc space-y-1 pl-4">
                                        {state.invoiceTotalWeightResult.missingItems.map(item => <li key={item}>{item}</li>)}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </Panel>

                    {/* Finishes */}
                    <Panel title="Διαθέσιμα φινιρίσματα" subtitle="Προεπιλογή για το βήμα των παραλλαγών" icon={Palette} tone="amber">
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(FINISH_CODES).map(([code, label]) => {
                                if (code === 'S' || code === 'E' || code === 'T' || code === 'O') return null; // Only available finishes
                                const isSelected = state.selectedFinishes.includes(code);
                                return (
                                    <button
                                        key={code || 'lustre'}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            actions.toggleFinish(code);
                                            if (state.selectedFinishes.length === 0 || (state.plating === code as any && !state.selectedFinishes.includes(code))) {
                                                setters.setPlating(code as PlatingType);
                                            }
                                        }}
                                        className={`inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-all active:scale-95 ${isSelected
                                            ? `${FINISH_CHIP[code]} shadow-sm`
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                                            }`}
                                    >
                                        {isSelected && <Check size={13} strokeWidth={3} />}
                                        {label}
                                        {code && <span className="font-mono text-[10px] opacity-50">{code}</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
                            <Info size={12} /> Το <strong className="text-slate-600">{state.platingMasterLabel}</strong> θα οριστεί ως Master.
                        </div>
                    </Panel>
                </div>
            </div>

            {state.productionType === ProductionType.InHouse && <MoldsSection formState={formState} />}
        </div>
    );
};
