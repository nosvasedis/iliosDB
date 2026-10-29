import { formatNumber } from '../utils/numberFormat';
import React from 'react';
import { Product, Material, Mold, ProductionType } from '../types';
import { useUI } from './UIProvider';
import { useNewProductState } from '../hooks/useNewProductState';
import { StepBasicInfo } from './NewProduct/StepBasicInfo';
import { StepRecipe } from './NewProduct/StepRecipe';
import { StepLaborCosts } from './NewProduct/StepLaborCosts';
import { StepVariants } from './NewProduct/StepVariants';
import { StepReview } from './NewProduct/StepReview';
import { RecipeItemSelectorModal } from './ProductRegistry/RecipeItemSelectorModal';
import { ArrowLeft, ArrowRight, CheckCircle, Loader2, Tag, Sparkles, Coins, Layers, X, Check, Circle, ClipboardList, FlaskConical, Wrench, CircleDollarSign, Calculator } from 'lucide-react';
import { useSettings } from '../hooks/api/useSettings';
import { useSuppliers } from '../hooks/api/useSuppliers';
import { formatCurrency } from '../utils/pricingEngine';

const STEP_ICONS: Record<string, React.ElementType> = {
    'Στοιχεία': ClipboardList,
    'Συνταγή': FlaskConical,
    'Κοστολόγηση': Calculator,
    'Εργατικά': Wrench,
    'Παραλλαγές': Layers,
    'Τιμολόγηση & Αποθήκευση': CircleDollarSign,
};

interface Props {
    products: Product[];
    materials: Material[];
    molds?: Mold[];
    onCancel?: () => void;
    duplicateTemplate?: Product;
}

export default function NewProduct({ products, materials, molds = [], onCancel, duplicateTemplate }: Props) {
    const { showToast, confirm } = useUI();
    const { data: settings } = useSettings();
    const { data: suppliers } = useSuppliers();

    const formState = useNewProductState({
        products,
        materials,
        molds,
        settings,
        suppliers,
        duplicateTemplate,
        showToast,
        confirm,
        onCancel
    });

    const { state, setters, actions } = formState;

    const renderStepContent = () => {
        switch (state.currentStep) {
            case 1:
                return <StepBasicInfo formState={formState} suppliers={suppliers} />;
            case 2:
                return <StepRecipe formState={formState} materials={materials} products={products} settings={settings} />;
            case 3:
                if (state.productionType === ProductionType.InHouse) return <StepLaborCosts formState={formState} allProducts={products} />;
                return <StepVariants formState={formState} settings={settings} materials={materials} products={products} />;
            case 4:
                if (state.productionType === ProductionType.InHouse) return <StepVariants formState={formState} settings={settings} materials={materials} products={products} />;
                return <StepReview formState={formState} settings={settings} materials={materials} products={products} />;
            case 5:
                return <StepReview formState={formState} settings={settings} materials={materials} products={products} />;
            default:
                return null;
        }
    };

    const progress = state.STEPS.length > 1 ? ((state.currentStep - 1) / (state.STEPS.length - 1)) * 100 : 100;
    const trimmedSku = state.sku.trim();
    const currentStepTitle = state.STEPS.find(s => s.id === state.currentStep)?.title;
    const nextStepTitle = state.STEPS.find(s => s.id === state.currentStep + 1)?.title;

    return (
        <div className="h-full flex flex-col bg-white overflow-x-hidden rounded-3xl shadow-xl border border-slate-200/60 relative isolate">
            {/* Header */}
            <div className="relative shrink-0 overflow-hidden border-b border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40 px-6 pb-4 pt-5">
                <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-emerald-200/40 blur-3xl"></div>
                <div className="pointer-events-none absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-amber-100/50 blur-3xl"></div>

                <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight text-slate-900">Νέο Προϊόν</h2>
                            <p className="text-xs font-medium text-slate-400">Δημιουργία νέου κωδικού στην αποθήκη</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className={`inline-flex min-w-0 max-w-[240px] items-center gap-2 rounded-xl border px-3 py-2 shadow-sm transition-colors ${trimmedSku ? 'border-emerald-200 bg-white text-emerald-600' : 'border-dashed border-slate-300 bg-white/70 text-slate-400'}`}
                            title={trimmedSku ? `Επιλεγμένο SKU: ${trimmedSku}` : 'Πληκτρολογήστε ένα SKU στο πρώτο βήμα'}
                            aria-live="polite"
                        >
                            <Tag size={14} className="shrink-0" />
                            <span className="min-w-0 truncate font-mono text-sm font-black text-slate-900">{trimmedSku || '—'}</span>
                        </div>
                        <div className="hidden items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm sm:flex" title="Βασικό κόστος · Παραλλαγές">
                            <span className="flex items-center gap-1.5 font-bold"><Coins size={13} className="text-emerald-500" /><span className="font-mono text-slate-900">{formatCurrency(state.masterEstimatedCost)}</span></span>
                            <span className="h-4 w-px bg-slate-200"></span>
                            <span className="flex items-center gap-1.5 font-bold"><Layers size={13} className="text-amber-500" /><span className="font-mono text-slate-900">{formatNumber(state.variants.length)}</span></span>
                        </div>
                        {onCancel && (
                            <button onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-900 active:scale-95">
                                <X size={15} /> Ακύρωση
                            </button>
                        )}
                    </div>
                </div>

                {/* Clickable step rail */}
                <nav className="relative z-10 mt-5 flex items-center gap-1 overflow-x-auto pb-1 pl-0.5 pt-0.5 custom-scrollbar" aria-label="Βήματα">
                    {state.STEPS.map((step, idx) => {
                        const isPast = state.currentStep > step.id;
                        const isCurrent = state.currentStep === step.id;
                        const Icon = STEP_ICONS[step.title] || Circle;
                        return (
                            <React.Fragment key={step.id}>
                                <button
                                    type="button"
                                    onClick={() => setters.setCurrentStep(step.id)}
                                    aria-current={isCurrent ? 'step' : undefined}
                                    className={`group flex shrink-0 items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-3.5 text-left transition-all ${isCurrent ? 'bg-white shadow-md shadow-slate-200/70 ring-1 ring-slate-200' : 'hover:bg-white/70'}`}
                                >
                                    <span className={`grid h-8 w-8 place-items-center rounded-lg transition-all ${isCurrent
                                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/30'
                                        : isPast ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                                        }`}>
                                        {isPast ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
                                    </span>
                                    <span className="leading-tight">
                                        <span className={`block text-[9px] font-black uppercase tracking-widest ${isCurrent ? 'text-emerald-600' : 'text-slate-400'}`}>Βήμα {formatNumber(step.id)}</span>
                                        <span className={`block whitespace-nowrap text-xs font-bold ${isCurrent ? 'text-slate-900' : isPast ? 'text-slate-600' : 'text-slate-400'}`}>{step.title}</span>
                                    </span>
                                </button>
                                {idx < state.STEPS.length - 1 && (
                                    <div className={`h-0.5 w-6 shrink-0 rounded-full transition-colors ${isPast ? 'bg-emerald-300' : 'bg-slate-200'}`}></div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/70 p-5 sm:p-8 custom-scrollbar relative min-h-0">
                <div className="mx-auto min-h-full max-w-7xl pb-32">
                    {renderStepContent()}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="absolute bottom-0 left-0 right-0 z-20 w-full border-t border-slate-200 bg-white/90 shadow-[0_-10px_40px_rgba(15,23,42,0.06)] backdrop-blur-md">
                <div className="h-1 w-full bg-slate-100">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                    <button
                        onClick={setters.prevStep}
                        disabled={state.currentStep === 1}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-black text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ArrowLeft size={18} /> Πίσω
                    </button>

                    <div className="hidden text-center sm:block">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Βήμα {formatNumber(state.currentStep)} από {formatNumber(state.finalStepId)}</div>
                        <div className="text-sm font-bold text-slate-700">{currentStepTitle}</div>
                    </div>

                    {state.currentStep < state.finalStepId ? (
                        <button
                            onClick={setters.nextStep}
                            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-black active:scale-95"
                        >
                            Επόμενο
                            {nextStepTitle && <span className="hidden font-medium text-white/50 md:inline">· {nextStepTitle}</span>}
                            <ArrowRight size={18} />
                        </button>
                    ) : (
                        <button
                            onClick={actions.handleSubmit}
                            disabled={state.isUploading}
                            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-7 text-sm font-black text-white shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-700 active:scale-95 disabled:opacity-70"
                        >
                            {state.isUploading ? <Loader2 className="animate-spin" size={20} /> : <><CheckCircle size={20} /> Αποθήκευση</>}
                        </button>
                    )}
                </div>
            </div>

            {/* Modals */}
            {state.isRecipeModalOpen && (
                <RecipeItemSelectorModal
                    type={state.isRecipeModalOpen}
                    productCategory={state.category}
                    allMaterials={materials}
                    allProducts={products}
                    onClose={() => setters.setIsRecipeModalOpen(false)}
                    onSelect={actions.handleSelectRecipeItem}
                />
            )}
        </div>
    );
}
