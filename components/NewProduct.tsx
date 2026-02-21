import React from 'react';
import { Product, Material, Mold, ProductionType } from '../types';
import { useUI } from './UIProvider';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useNewProductState } from '../hooks/useNewProductState';
import { StepBasicInfo } from './NewProduct/StepBasicInfo';
import { StepRecipe } from './NewProduct/StepRecipe';
import { StepLaborCosts } from './NewProduct/StepLaborCosts';
import { StepVariants } from './NewProduct/StepVariants';
import { StepReview } from './NewProduct/StepReview';
import { RecipeItemSelectorModal } from './ProductRegistry/RecipeItemSelectorModal';
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from 'lucide-react';

interface Props {
    products: Product[];
    materials: Material[];
    molds?: Mold[];
    onCancel?: () => void;
    duplicateTemplate?: Product;
}

export default function NewProduct({ products, materials, molds = [], onCancel, duplicateTemplate }: Props) {
    const { showToast } = useUI();
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });

    const formState = useNewProductState({
        products,
        materials,
        molds,
        settings,
        suppliers,
        duplicateTemplate,
        showToast,
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
                if (state.productionType === ProductionType.InHouse) return <StepLaborCosts formState={formState} />;
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

    return (
        <div className="h-full flex flex-col bg-white overflow-x-hidden rounded-3xl shadow-xl border border-slate-200/60 relative isolate">
            {/* Header — light gradient */}
            <div className="bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 p-6 shrink-0 relative overflow-hidden flex-none">
                {/* Subtle background blobs */}
                <div className="absolute top-0 right-0 w-56 h-56 bg-emerald-100 rounded-full filter blur-3xl opacity-40 pointer-events-none"></div>
                <div className="absolute -bottom-8 left-24 w-40 h-40 bg-amber-100 rounded-full filter blur-3xl opacity-30 pointer-events-none"></div>

                <div className="flex justify-between items-center relative z-10">
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-slate-900">Νέο Προϊόν</h2>
                        <p className="text-slate-400 font-medium text-sm mt-0.5">Δημιουργία νέου κωδικού στην αποθήκη</p>
                    </div>
                    {onCancel && (
                        <button onClick={onCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-2.5 rounded-xl font-bold transition-all active:scale-95 text-sm border border-slate-200">
                            Ακύρωση
                        </button>
                    )}
                </div>

                {/* Clickable Progress Steps */}
                <div className="flex items-center gap-1 mt-6 overflow-x-auto pb-1 pt-1 pl-1 custom-scrollbar relative z-10 w-full">
                    {state.STEPS.map((step, idx) => {
                        const isPast = state.currentStep > step.id;
                        const isCurrent = state.currentStep === step.id;
                        return (
                            <React.Fragment key={step.id}>
                                <button
                                    onClick={() => setters.setCurrentStep(step.id)}
                                    className={`
                                        flex flex-col gap-1.5 min-w-[110px] transition-all duration-300 rounded-xl px-3 py-2 text-left
                                        ${isCurrent ? 'bg-emerald-50 ring-2 ring-emerald-200' : 'hover:bg-slate-100'}
                                    `}
                                >
                                    <div className={`h-1.5 rounded-full w-full transition-all duration-500 ${isCurrent ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.4)]' :
                                        isPast ? 'bg-emerald-400' : 'bg-slate-200'
                                        }`}></div>
                                    <div className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${isCurrent ? 'text-emerald-700' :
                                        isPast ? 'text-emerald-600' : 'text-slate-400'
                                        }`}>
                                        {isPast
                                            ? <CheckCircle size={12} />
                                            : <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black ${isCurrent ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'}`}>{step.id}</span>
                                        }
                                        {step.title}
                                    </div>
                                </button>
                                {idx < state.STEPS.length - 1 && (
                                    <div className={`h-px w-4 shrink-0 transition-colors ${isPast ? 'bg-emerald-300' : 'bg-slate-200'}`}></div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto p-8 bg-slate-50/50 custom-scrollbar relative min-h-0">
                <div className="pb-32 min-h-full">
                    {renderStepContent()}
                </div>
            </div>

            {/* Footer Navigation */}
            <div className="bg-white border-t border-slate-200 p-6 flex justify-between items-center absolute bottom-0 left-0 right-0 w-full z-20 shadow-[0_-10px_40px_rgba(0,0,0,0.04)]">
                <button
                    onClick={setters.prevStep}
                    disabled={state.currentStep === 1}
                    className="px-6 py-4 rounded-2xl font-black text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all flex items-center gap-3 w-40 justify-center h-[56px]"
                >
                    <ArrowLeft size={18} /> <span className="uppercase tracking-widest text-xs">Πισω</span>
                </button>

                <div className="text-xs font-bold text-slate-400 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    Βήμα {state.currentStep} <span className="text-slate-300 font-normal mx-1">/</span> {state.finalStepId}
                </div>

                {state.currentStep < state.finalStepId ? (
                    <button
                        onClick={setters.nextStep}
                        className="px-6 py-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-2xl font-black transition-all flex items-center gap-3 shadow-lg shadow-emerald-500/20 w-40 justify-center h-[56px]"
                    >
                        <span className="uppercase tracking-widest text-xs">Επομενο</span> <ArrowRight size={18} />
                    </button>
                ) : (
                    <button
                        onClick={actions.handleSubmit}
                        disabled={state.isUploading}
                        className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-2xl font-black transition-all flex items-center gap-3 shadow-xl disabled:opacity-70 h-[56px]"
                    >
                        {state.isUploading ? <Loader2 className="animate-spin" size={22} /> : <><CheckCircle size={22} /> <span className="uppercase tracking-widest text-sm">Αποθηκευση</span></>}
                    </button>
                )}
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