import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { X, Image as ImageIcon, StickyNote, Box, MapPin, PauseCircle, PlayCircle, User, Edit, History } from 'lucide-react';
import { formatDecimal, getVariantComponents } from '../../utils/pricingEngine';
import { buildBatchBuildData } from '../../utils/batchBuildData';
import { Material, Mold, ProductionBatch, ProductionStage, Product, ProductionType } from '../../types';

// Note: We intentionally keep this modal mobile-first and touch-friendly.
// It is not a drop-in replacement for BatchBuildModal; it uses the same data helper and callbacks.

type Props = {
    batch: ProductionBatch & { customer_name?: string };
    allMaterials: Material[];
    allMolds: Mold[];
    allProducts: Product[];
    onClose: () => void;
    onMove?: (batch: ProductionBatch, stage: ProductionStage) => void;
    onEditNote?: (batch: ProductionBatch) => void;
    onToggleHold?: (batch: ProductionBatch) => void;
    onViewHistory?: (batch: ProductionBatch) => void;
};

const STAGES: { id: ProductionStage; label: string }[] = [
    { id: ProductionStage.AwaitingDelivery, label: 'Αναμονή' },
    { id: ProductionStage.Waxing, label: 'Παρασκευή' },
    { id: ProductionStage.Casting, label: 'Χυτήριο' },
    { id: ProductionStage.Setting, label: 'Καρφωτής' },
    { id: ProductionStage.Polishing, label: 'Τεχνίτης' },
    { id: ProductionStage.Assembly, label: 'Συναρμολόγηση' },
    { id: ProductionStage.Labeling, label: 'Συσκευασία' },
    { id: ProductionStage.Ready, label: 'Έτοιμα' }
];

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

    const buildData = useMemo(() => {
        if (!product) return null;
        return buildBatchBuildData(batch, product, allMaterials, allMolds, allProducts);
    }, [batch, product, allMaterials, allMolds, allProducts]);

    const { finish, stone } = useMemo(() => {
        if (!product) return { finish: { code: '', name: '' }, stone: { code: '', name: '' } };
        return getVariantComponents(batch.variant_suffix || '', product.gender);
    }, [batch.variant_suffix, product]);

    if (!product || !buildData) return null;

    const currentStageIndex = STAGES.findIndex(s => s.id === batch.current_stage);

    const isStageDisabled = (stageId: ProductionStage): boolean => {
        if (stageId === ProductionStage.Setting && !batch.requires_setting) return true;
        if (stageId === ProductionStage.Assembly && !batch.requires_assembly) return true;
        return false;
    };

    const handleStageSelect = (targetStage: ProductionStage) => {
        if (!onMove) return;
        if (isStageDisabled(targetStage)) return;
        if (targetStage === batch.current_stage) return;
        if (batch.on_hold) {
            // Parent will show the appropriate toast; keep this modal open.
            onMove(batch, targetStage);
            return;
        }
        setIsMoving(true);
        try {
            onMove(batch, targetStage);
        } finally {
            // Give parent a moment to open the split/move modal, then close this one.
            window.setTimeout(() => {
                setIsMoving(false);
                onClose();
            }, 350);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-2xl max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-16 h-16 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                            {product.image_url ? (
                                <button
                                    type="button"
                                    className="w-full h-full"
                                    onClick={() => setIsImageZoomed(true)}
                                >
                                    <img src={product.image_url} className="w-full h-full object-cover" alt={product.sku} />
                                </button>
                            ) : (
                                <ImageIcon size={24} className="text-slate-300" />
                            )}
                        </div>

                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{batch.sku}</h2>
                                {batch.variant_suffix && (
                                    <span className="flex items-center gap-2 flex-wrap">
                                        {finish.code && (
                                            <span className="px-2 py-0.5 rounded-lg text-base font-mono font-bold border border-slate-200 bg-slate-100 text-slate-700">
                                                {finish.code}
                                            </span>
                                        )}
                                        {stone.code && (
                                            <span className="px-2 py-0.5 rounded-lg text-base font-mono font-bold border border-slate-200 bg-emerald-50 text-emerald-800">
                                                {stone.code}
                                            </span>
                                        )}
                                    </span>
                                )}
                                {product.production_type === ProductionType.Imported && product.supplier_sku && (
                                    <span className="text-xs font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200 flex items-center gap-1">
                                        <span className="text-[9px] font-bold uppercase text-purple-400">SUP:</span>
                                        {product.supplier_sku}
                                    </span>
                                )}
                            </div>

                            {batch.customer_name && (
                                <div className="flex items-center gap-1 text-blue-700 font-bold text-sm mt-1 truncate">
                                    <User size={14} className="shrink-0" />
                                    <span className="truncate">{batch.customer_name}</span>
                                </div>
                            )}

                            <p className="text-sm text-slate-500 font-medium mt-1 truncate">
                                {buildData.description}
                            </p>

                            <div className="mt-2 flex items-center gap-2">
                                <div className="text-3xl sm:text-4xl font-black text-emerald-700 leading-none">
                                    {batch.quantity}
                                </div>
                                {buildData.recipe.length > 0 && (
                                    <div className="text-[10px] font-black text-slate-500 uppercase bg-slate-100 px-2 py-1 rounded-lg">
                                        {buildData.recipe.length} Είδη
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                    {/* Notes */}
                    {batch.notes ? (
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3 items-start shadow-sm relative mb-4">
                            <StickyNote className="text-amber-500 shrink-0" size={22} />
                            <div className="min-w-0">
                                <h4 className="font-bold text-amber-800 text-sm uppercase tracking-wide mb-1">Σημείωση Παραγωγής</h4>
                                <p className="text-amber-900 font-medium text-sm leading-relaxed whitespace-pre-wrap">{batch.notes}</p>
                            </div>
                            {onEditNote && (
                                <button
                                    onClick={() => onEditNote(batch)}
                                    className="absolute top-3 right-3 p-1.5 text-amber-400 hover:text-amber-700 bg-white/50 hover:bg-white rounded-lg transition-all"
                                    title="Επεξεργασία σημείωσης"
                                >
                                    <Edit size={16} />
                                </button>
                            )}
                        </div>
                    ) : (
                        onEditNote && (
                            <button
                                onClick={() => onEditNote(batch)}
                                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-bold text-xs hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all flex items-center justify-center gap-2 mb-4"
                            >
                                <StickyNote size={16} className="text-amber-500" />
                                Προσθήκη Σημείωσης
                            </button>
                        )
                    )}

                    {/* Hold/Move controls */}
                    {onMove && (
                        <div className="mb-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                            {onToggleHold && (
                                <button
                                    onClick={() => {
                                        onToggleHold(batch);
                                        onClose();
                                    }}
                                    className={`w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-colors ${batch.on_hold ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                                    disabled={isMoving}
                                >
                                    {batch.on_hold ? <PlayCircle size={16} className="fill-current" /> : <PauseCircle size={16} />}
                                    {batch.on_hold ? 'Συνέχιση Παραγωγής' : 'Θέση σε Αναμονή'}
                                </button>
                            )}

                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Μετακίνηση Σταδίου</label>

                            <div className="flex flex-wrap gap-2">
                                {STAGES.map((stage, index) => {
                                    const isCurrent = stage.id === batch.current_stage;
                                    const disabled = isMoving || isStageDisabled(stage.id) || isCurrent;
                                    const colorKey = colorKeyForStage(stage.id);
                                    const stageColors = STAGE_BUTTON_COLORS[colorKey];
                                    const isPast = index < currentStageIndex;

                                    return (
                                        <button
                                            key={stage.id}
                                            onClick={() => handleStageSelect(stage.id)}
                                            disabled={disabled}
                                            className={`px-2.5 py-2 rounded-xl font-bold text-[11px] transition-all border flex items-center gap-1 ${isCurrent
                                                ? `${stageColors.bg} ${stageColors.text} ${stageColors.border} ring-2 ring-offset-1 ring-current/30 shadow-sm`
                                                : disabled
                                                    ? 'bg-slate-50/50 text-slate-300/50 border-slate-100/50 cursor-not-allowed opacity-60'
                                                    : isPast
                                                        ? `${stageColors.bg}/50 ${stageColors.text}/70 border border-slate-100 hover:${stageColors.bg}`
                                                        : `${stageColors.bg} ${stageColors.text} ${stageColors.border} border hover:shadow-md active:scale-95`
                                                }`}
                                        >
                                            {stage.label}
                                            {isCurrent && <span className="text-[8px]">●</span>}
                                            {isStageDisabled(stage.id) && !isCurrent && <span className="text-[8px] opacity-60">παράλειψη</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Quick actions (history) */}
                    {onViewHistory && (
                        <div className="mb-4 flex items-center justify-end">
                            <button
                                onClick={() => onViewHistory(batch)}
                                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-black bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-95 transition-all"
                            >
                                <History size={14} />
                                Ιστορικό
                            </button>
                        </div>
                    )}

                    {/* Summary */}
                    {batch.on_hold && batch.on_hold_reason && (
                        <div className="mb-4 bg-amber-100 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                            <PauseCircle size={14} className="fill-current text-amber-700 mt-0.5" />
                            <div className="min-w-0">
                                <div className="text-xs font-black text-amber-800">Σε Αναμονή</div>
                                <div className="text-xs font-bold text-amber-900 whitespace-pre-wrap">{batch.on_hold_reason}</div>
                            </div>
                        </div>
                    )}

                    {/* Molds */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm mb-4">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <MapPin size={18} className="text-orange-500" />
                                Απαιτούμενα Λάστιχα
                            </h3>
                        </div>
                        <div className="p-3">
                            {buildData.molds.length > 0 ? (
                                <div className="space-y-2">
                                    {buildData.molds.map(m => (
                                        <div key={m.code} className="flex justify-between items-start p-3 rounded-xl bg-orange-50/50 border border-orange-100">
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-slate-800 text-lg">{m.code}</span>
                                                    <span className="text-xs font-bold bg-white text-orange-600 px-2 py-0.5 rounded-md border border-orange-200">
                                                        x{m.quantity}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-slate-500">{m.description || ''}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-[10px] font-bold text-slate-400 uppercase">Τοποθεσία</span>
                                                <span className="text-sm font-bold text-orange-700">{m.location}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center text-slate-400 text-sm italic">Δεν απαιτούνται λάστιχα.</div>
                            )}
                        </div>
                    </div>

                    {/* Metal Estimation */}
                    <div className="bg-slate-100 rounded-2xl p-4 flex justify-between items-center border border-slate-200 mb-4">
                        <div>
                            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Εκτίμηση Μετάλλου</h4>
                            <p className="text-xs text-slate-500">Ασήμι 925 (χωρίς απώλεια)</p>
                        </div>
                        <div className="text-3xl font-black text-slate-600 leading-none">
                            {formatDecimal(buildData.totalSilverWeight, 1)} <span className="text-sm text-slate-400 font-bold">gr</span>
                        </div>
                    </div>

                    {/* Recipe */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                <Box size={18} className="text-blue-500" />
                                Υλικά & Εξαρτήματα
                            </h3>
                            <div className="text-xs text-slate-400 font-bold">Λίστα συλλογής</div>
                        </div>
                        <div className="p-3 space-y-2">
                            {buildData.recipe.length > 0 ? (
                                buildData.recipe.map((item, idx) => (
                                    <div key={idx} className="p-4 rounded-2xl bg-slate-50/30 border border-slate-100">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className={`font-black text-sm ${item.type === 'raw' ? 'text-slate-700' : 'text-purple-700'}`}>
                                                    {item.name}
                                                </div>
                                                {item.description && (
                                                    <div className="text-[12px] text-slate-500 italic mt-1 whitespace-pre-wrap">
                                                        {item.description}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right flex flex-col items-end gap-1 shrink-0">
                                                <div className="text-[10px] font-black text-slate-400 uppercase">Ανά τμχ</div>
                                                <div className="font-mono text-slate-700 text-sm">
                                                    {formatDecimal(item.qtyPerUnit, 2)} <span className="text-[10px] text-slate-400 font-bold">{item.unit}</span>
                                                </div>
                                                <div className="text-[10px] font-black text-blue-600 uppercase">Σύνολο</div>
                                                <div className="font-mono text-blue-900 text-sm">
                                                    {formatDecimal(item.totalQtyRequired, 2)} <span className="text-[10px] text-blue-400 font-bold">{item.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-10 text-center text-slate-400 italic text-sm">Δεν απαιτούνται επιπλέον υλικά.</div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-colors shadow-lg active:scale-95"
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

