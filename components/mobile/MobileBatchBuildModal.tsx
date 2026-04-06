import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Image as ImageIcon, StickyNote, Box, MapPin, PauseCircle, PlayCircle, User, Edit, History, LayoutList, Layers, Wrench } from 'lucide-react';
import { formatDecimal } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import { buildBatchBuildData } from '../../utils/batchBuildData';
import { Material, Mold, ProductionBatch, ProductionStage, Product, ProductionType } from '../../types';
import { PRODUCTION_STAGES } from '../../utils/productionStages';

// Note: We intentionally keep this modal mobile-first and touch-friendly.
// It is not a drop-in replacement for BatchBuildModal; it uses the same data helper and callbacks.

type Props = {
    batch: ProductionBatch & { customer_name?: string };
    allMaterials: Material[];
    allMolds: Mold[];
    allProducts: Product[];
    onClose: () => void;
    onMove?: (batch: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    onEditNote?: (batch: ProductionBatch) => void;
    onToggleHold?: (batch: ProductionBatch) => void;
    onViewHistory?: (batch: ProductionBatch) => void;
};

const STAGES: { id: ProductionStage; label: string }[] = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
}));

const STAGE_BUTTON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    AwaitingDelivery: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    Waxing: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    Casting: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    Setting: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    Polishing: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    Assembly: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    Labeling: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    Ready: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' }
};

type TabId = 'summary' | 'materials' | 'molds' | 'actions';

const TABS: { id: TabId; label: string; shortLabel: string; icon: typeof LayoutList }[] = [
    { id: 'summary', label: 'Σύνοψη', shortLabel: 'Σύνοψη', icon: LayoutList },
    { id: 'materials', label: 'Υλικά', shortLabel: 'Υλικά', icon: Box },
    { id: 'molds', label: 'Λάστιχα', shortLabel: 'Λάστ.', icon: MapPin },
    { id: 'actions', label: 'Ενέργειες', shortLabel: 'Ενεργ.', icon: Wrench },
];

const colorKeyForStage = (stageId: ProductionStage): keyof typeof STAGE_BUTTON_COLORS => {
    if (stageId === ProductionStage.AwaitingDelivery) return 'AwaitingDelivery';
    if (stageId === ProductionStage.Waxing) return 'Waxing';
    if (stageId === ProductionStage.Casting) return 'Casting';
    if (stageId === ProductionStage.Setting) return 'Setting';
    if (stageId === ProductionStage.Polishing) return 'Polishing';
    if (stageId === ProductionStage.Assembly) return 'Assembly';
    if (stageId === ProductionStage.Labeling) return 'Labeling';
    return 'Ready';
};

export default function MobileBatchBuildModal({
    batch,
    allMaterials,
    allMolds,
    allProducts,
    onClose,
    onMove,
    onEditNote,
    onToggleHold,
    onViewHistory,
}: Props) {
    const product = batch.product_details;
    const [isImageZoomed, setIsImageZoomed] = useState(false);
    const [isMoving, setIsMoving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabId>('summary');

    const buildData = useMemo(() => {
        if (!product) return null;
        return buildBatchBuildData(batch, product, allMaterials, allMolds, allProducts);
    }, [batch, product, allMaterials, allMolds, allProducts]);

    if (!product || !buildData) return null;

    const currentStageIndex = STAGES.findIndex(s => s.id === batch.current_stage);

    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };

    const handleStageSelect = (targetStage: ProductionStage, opts?: { pendingDispatch?: boolean }) => {
        if (!onMove) return;
        if (isStageDisabled(targetStage)) return;
        const isSameStage = targetStage === batch.current_stage;
        const isSameSubstage = isSameStage && targetStage === ProductionStage.Polishing && opts?.pendingDispatch === batch.pending_dispatch;
        if (isSameStage && (targetStage !== ProductionStage.Polishing || isSameSubstage)) return;
        if (batch.on_hold) {
            onMove(batch, targetStage, opts);
            return;
        }
        setIsMoving(true);
        try {
            onMove(batch, targetStage, opts);
        } finally {
            window.setTimeout(() => {
                setIsMoving(false);
                onClose();
            }, 350);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center p-0 sm:p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                className="bg-white w-full sm:w-[min(100%,36rem)] md:w-[min(100%,42rem)] max-w-[100vw] h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] sm:h-[min(86dvh,820px)] sm:max-h-[86dvh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 sm:slide-in-from-bottom-0 duration-200 min-h-0 border border-slate-200/80 sm:border-0"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Compact header — keeps vertical footprint small on phones */}
                <div className="px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-3 border-b border-slate-100 flex justify-between items-start gap-2 bg-slate-50/80 shrink-0">
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                            {product.image_url ? (
                                <button type="button" className="w-full h-full" onClick={() => setIsImageZoomed(true)}>
                                    <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                                </button>
                            ) : (
                                <ImageIcon size={20} className="text-slate-300" />
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <SkuColorizedText sku={batch.sku} suffix={batch.variant_suffix || ''} gender={product.gender} className="text-base sm:text-lg font-black tracking-tight leading-tight" masterClassName="text-slate-800" />
                                <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-black text-emerald-800">
                                    ×{batch.quantity}
                                </span>
                            </div>
                            {product.production_type === ProductionType.Imported && product.supplier_sku && (
                                <div className="mt-0.5">
                                    <span className="text-[10px] font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                        SUP {product.supplier_sku}
                                    </span>
                                </div>
                            )}
                            {batch.customer_name && (
                                <div className="flex items-center gap-1 text-blue-700 font-bold text-xs mt-0.5 truncate">
                                    <User size={12} className="shrink-0" />
                                    <span className="truncate">{batch.customer_name}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors shrink-0 touch-manipulation"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Tabs: horizontal scroll on narrow phones; icon+short label on xs */}
                <div className="shrink-0 border-b border-slate-100 bg-white px-1 pt-1">
                    <div
                        className="flex gap-0.5 overflow-x-auto pb-1 -mx-0.5 px-0.5 custom-scrollbar touch-pan-x"
                        role="tablist"
                        aria-label="Ενότητες παρτίδας"
                    >
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const selected = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] sm:text-xs font-black uppercase tracking-wide transition-colors touch-manipulation min-w-[4.5rem] sm:min-w-0 sm:px-3 ${selected
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300'
                                        }`}
                                >
                                    <Icon size={14} className="shrink-0 opacity-90" aria-hidden />
                                    <span className="max-[380px]:hidden">{tab.label}</span>
                                    <span className="hidden max-[380px]:inline">{tab.shortLabel}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Single scroll region per tab — modal body flexes, never grows past dvh cap */}
                <div className="flex-1 min-h-0 flex flex-col bg-slate-50/40">
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
                        {activeTab === 'summary' && (
                            <div className="space-y-3">
                                {buildData.description && (
                                    <p className="text-xs sm:text-sm text-slate-600 font-medium leading-snug">{buildData.description}</p>
                                )}
                                <div className="flex flex-wrap gap-2 text-[10px] font-black text-slate-500 uppercase">
                                    {buildData.recipe.length > 0 && (
                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">{buildData.recipe.length} είδη υλικών</span>
                                    )}
                                    {buildData.molds.length > 0 && (
                                        <span className="bg-white border border-slate-200 px-2 py-1 rounded-lg">{buildData.molds.length} λάστιχα</span>
                                    )}
                                </div>

                                {batch.on_hold && batch.on_hold_reason && (
                                    <div className="bg-amber-100 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                        <PauseCircle size={14} className="fill-current text-amber-700 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-xs font-black text-amber-800">Σε Αναμονή</div>
                                            <div className="text-xs font-bold text-amber-900 whitespace-pre-wrap">{batch.on_hold_reason}</div>
                                        </div>
                                    </div>
                                )}

                                {batch.notes ? (
                                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex gap-2 items-start shadow-sm relative">
                                        <StickyNote className="text-amber-500 shrink-0" size={18} />
                                        <div className="min-w-0 pr-8">
                                            <h4 className="font-bold text-amber-800 text-[10px] uppercase tracking-wide mb-0.5">Σημείωση</h4>
                                            <p className="text-amber-900 font-medium text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{batch.notes}</p>
                                        </div>
                                        {onEditNote && (
                                            <button
                                                type="button"
                                                onClick={() => onEditNote(batch)}
                                                className="absolute top-2 right-2 p-1.5 text-amber-500 hover:text-amber-800 bg-white/60 rounded-lg"
                                                title="Επεξεργασία σημείωσης"
                                            >
                                                <Edit size={14} />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    onEditNote && (
                                        <button
                                            type="button"
                                            onClick={() => onEditNote(batch)}
                                            className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-bold text-xs hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 flex items-center justify-center gap-2"
                                        >
                                            <StickyNote size={14} className="text-amber-500" />
                                            Προσθήκη Σημείωσης
                                        </button>
                                    )
                                )}
                            </div>
                        )}

                        {activeTab === 'materials' && (
                            <div className="space-y-3">
                                <div className="bg-slate-100 rounded-xl p-3 flex justify-between items-center border border-slate-200">
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Εκτίμηση Μετάλλου</h4>
                                        <p className="text-[10px] text-slate-500">Ασήμι 925 (χωρίς απώλεια)</p>
                                    </div>
                                    <div className="text-2xl font-black text-slate-600 leading-none shrink-0">
                                        {formatDecimal(buildData.totalSilverWeight, 1)}{' '}
                                        <span className="text-xs text-slate-400 font-bold">gr</span>
                                    </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                                        <Box size={16} className="text-blue-500 shrink-0" />
                                        <h3 className="font-bold text-slate-700 text-sm">Υλικά & Εξαρτήματα</h3>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {buildData.recipe.length > 0 ? (
                                            buildData.recipe.map((item, idx) => (
                                                <div key={idx} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className={`font-black text-xs sm:text-sm ${item.type === 'raw' ? 'text-slate-700' : 'text-purple-700'}`}>
                                                                {item.name}
                                                            </div>
                                                            {item.description && (
                                                                <div className="text-[11px] text-slate-500 italic mt-0.5 whitespace-pre-wrap">{item.description}</div>
                                                            )}
                                                        </div>
                                                        <div className="text-right flex flex-col items-end gap-0.5 shrink-0 text-[10px] sm:text-xs">
                                                            <span className="font-black text-slate-400 uppercase">Ανά τμχ</span>
                                                            <span className="font-mono text-slate-700">
                                                                {formatDecimal(item.qtyPerUnit, 2)} {item.unit}
                                                            </span>
                                                            <span className="font-black text-blue-600 uppercase">Σύνολο</span>
                                                            <span className="font-mono text-blue-900 font-bold">
                                                                {formatDecimal(item.totalQtyRequired, 2)} {item.unit}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="p-8 text-center text-slate-400 italic text-sm">Δεν απαιτούνται επιπλέον υλικά.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'molds' && (
                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center gap-2">
                                    <Layers size={16} className="text-orange-500 shrink-0" />
                                    <h3 className="font-bold text-slate-700 text-sm">Απαιτούμενα Λάστιχα</h3>
                                </div>
                                <div className="p-2">
                                    {buildData.molds.length > 0 ? (
                                        <div className="space-y-2">
                                            {buildData.molds.map((m) => (
                                                <div key={m.code} className="flex justify-between items-start gap-2 p-2.5 rounded-xl bg-orange-50/50 border border-orange-100">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="font-black text-slate-800 text-base">{m.code}</span>
                                                            <span className="text-[10px] font-bold bg-white text-orange-600 px-1.5 py-0.5 rounded border border-orange-200">
                                                                ×{m.quantity}
                                                            </span>
                                                        </div>
                                                        {m.description ? (
                                                            <div className="text-[11px] text-slate-600 font-medium">{m.description}</div>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="block text-[9px] font-bold text-slate-400 uppercase">Τοποθ.</span>
                                                        <span className="text-xs font-bold text-orange-700">{m.location}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-6 text-center text-slate-400 text-sm italic">Δεν απαιτούνται λάστιχα.</div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <div className="space-y-3">
                                {onViewHistory && (
                                    <button
                                        type="button"
                                        onClick={() => onViewHistory(batch)}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-[0.99]"
                                    >
                                        <History size={14} />
                                        Ιστορικό κινήσεων
                                    </button>
                                )}

                                {onMove && (
                                    <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        {onToggleHold && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    onToggleHold(batch);
                                                    onClose();
                                                }}
                                                className={`w-full mb-3 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border font-bold text-xs sm:text-sm transition-colors touch-manipulation ${batch.on_hold
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                    }`}
                                                disabled={isMoving}
                                            >
                                                {batch.on_hold ? <PlayCircle size={16} className="fill-current" /> : <PauseCircle size={16} />}
                                                {batch.on_hold ? 'Συνέχιση Παραγωγής' : 'Θέση σε Αναμονή'}
                                            </button>
                                        )}

                                        <label className="text-[10px] font-bold text-slate-500 uppercase mb-2 block">Μετακίνηση σταδίου</label>
                                        <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 gap-1.5">
                                            {STAGES.map((stage, index) => {
                                                const isCurrent = stage.id === batch.current_stage;
                                                const colorKey = colorKeyForStage(stage.id);
                                                const stageColors = STAGE_BUTTON_COLORS[colorKey];
                                                const isPast = index < currentStageIndex;

                                                if (stage.id === ProductionStage.Polishing) {
                                                    const isCurrentPending = isCurrent && batch.pending_dispatch;
                                                    const isCurrentDispatched = isCurrent && !batch.pending_dispatch;
                                                    const isDisabled = isStageDisabled(stage.id);
                                                    return (
                                                        <div key={stage.id} className="col-span-full flex gap-1.5 w-full">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: true })}
                                                                disabled={isMoving || isDisabled}
                                                                className={`flex-1 min-w-0 px-2 py-2 rounded-lg font-bold text-[9px] sm:text-[10px] leading-tight transition-all border text-center flex items-center justify-center gap-1 touch-manipulation whitespace-normal ${
                                                                    isCurrentPending
                                                                        ? 'bg-teal-50 text-teal-700 border-teal-200 ring-2 ring-offset-1 ring-teal-400/25'
                                                                        : isDisabled
                                                                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60'
                                                                        : isPast
                                                                        ? 'bg-teal-50/60 text-teal-700 border-slate-100'
                                                                        : 'bg-teal-50 text-teal-700 border-teal-200 active:scale-[0.98]'
                                                                }`}
                                                            >
                                                                <span className="text-center">Τεχν. • Αναμονή</span>
                                                                {isCurrentPending && <span className="text-[7px] shrink-0">●</span>}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStageSelect(ProductionStage.Polishing, { pendingDispatch: false })}
                                                                disabled={isMoving || isDisabled}
                                                                className={`flex-1 min-w-0 px-2 py-2 rounded-lg font-bold text-[9px] sm:text-[10px] leading-tight transition-all border text-center flex items-center justify-center gap-1 touch-manipulation whitespace-normal ${
                                                                    isCurrentDispatched
                                                                        ? 'bg-blue-50 text-blue-700 border-blue-200 ring-2 ring-offset-1 ring-blue-400/25'
                                                                        : isDisabled
                                                                        ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60'
                                                                        : isPast
                                                                        ? 'bg-blue-50/60 text-blue-700 border-slate-100'
                                                                        : 'bg-blue-50 text-blue-700 border-blue-200 active:scale-[0.98]'
                                                                }`}
                                                            >
                                                                <span className="text-center">Τεχν. • Στον Τεχν.</span>
                                                                {isCurrentDispatched && <span className="text-[7px] shrink-0">●</span>}
                                                            </button>
                                                        </div>
                                                    );
                                                }

                                                const disabled = isMoving || isStageDisabled(stage.id) || isCurrent;
                                                return (
                                                    <button
                                                        key={stage.id}
                                                        type="button"
                                                        onClick={() => handleStageSelect(stage.id)}
                                                        disabled={disabled}
                                                        className={`px-1.5 py-2 rounded-lg font-bold text-[10px] leading-tight transition-all border text-center min-h-[2.5rem] flex flex-col items-center justify-center gap-0.5 touch-manipulation ${isCurrent
                                                            ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} ring-2 ring-offset-1 ring-current/25`
                                                            : disabled
                                                                ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60'
                                                                : isPast
                                                                    ? `${stageColors.bg}/60 ${stageColors.text} border-slate-100`
                                                                    : `${stageColors.bg} ${stageColors.text} ${stageColors.border} active:scale-[0.98]`
                                                            }`}
                                                    >
                                                        <span>{stage.label}</span>
                                                        {isCurrent && <span className="text-[7px]">τρέχον</span>}
                                                        {isStageDisabled(stage.id) && !isCurrent && <span className="text-[7px] opacity-70">—</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="shrink-0 px-3 py-2.5 sm:px-4 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-100 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-black shadow-md active:scale-[0.98] touch-manipulation w-full sm:w-auto"
                    >
                        Κλείσιμο
                    </button>
                </div>
            </div>

            {/* Image zoom overlay */}
            {isImageZoomed && product.image_url && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[600] bg-black/90 flex items-center justify-center" onClick={() => setIsImageZoomed(false)}>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsImageZoomed(false); }}
                        className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transition-colors"
                    >
                        <X size={22} />
                    </button>
                    <img
                        src={product.image_url}
                        alt={product.sku}
                        className="max-w-[95vw] max-h-[95vh] object-contain rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}

