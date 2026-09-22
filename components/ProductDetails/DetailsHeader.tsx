import React from 'react';
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Copy,
    Edit,
    Factory,
    Globe,
    Loader2,
    Trash2,
    X,
} from 'lucide-react';
import { Gender, ProductVariant, ProductionType } from '../../types';
import { FINISH_CODES } from '../../constants';
import { PRODUCTION_TYPE_LABELS, SKIP_CASTING_LABEL, canConvertToImported } from '../../features/products/productCardPresentation';
import { getVariantComponents } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import { DetailsActionButton } from './detailsUi';

const FINISH_DOTS: Record<string, string> = {
    '': 'bg-gradient-to-br from-slate-300 to-slate-500',
    P: 'bg-gradient-to-br from-stone-400 to-stone-600',
    X: 'bg-gradient-to-br from-amber-400 to-yellow-600',
    D: 'bg-gradient-to-br from-orange-400 to-rose-500',
    H: 'bg-gradient-to-br from-cyan-300 to-sky-500',
};

export default function DetailsHeader({
    displayedSku,
    displayedLabel,
    gender,
    category,
    productionType,
    isComponent,
    skipCasting,
    viewMode,
    isEditingSku,
    tempSku,
    isRenaming,
    showPager,
    variantPickerRef,
    isVariantPickerOpen,
    sortedVariants,
    masterSku,
    normalizedViewIndex,
    maxViews,
    onTempSkuChange,
    onRenameSku,
    onCancelRename,
    onStartRename,
    onToggleVariantPicker,
    onSelectVariant,
    onPrevView,
    onNextView,
    onConvert,
    onDuplicate,
    onDelete,
    onClose,
    isDeleting,
}: {
    displayedSku: string;
    displayedLabel: string;
    gender: Gender;
    category: string;
    productionType: ProductionType;
    isComponent: boolean;
    skipCasting: boolean;
    viewMode: 'registry' | 'warehouse';
    isEditingSku: boolean;
    tempSku: string;
    isRenaming: boolean;
    showPager: boolean;
    variantPickerRef: React.RefObject<HTMLDivElement>;
    isVariantPickerOpen: boolean;
    sortedVariants: ProductVariant[];
    masterSku: string;
    normalizedViewIndex: number;
    maxViews: number;
    onTempSkuChange: (value: string) => void;
    onRenameSku: () => void;
    onCancelRename: () => void;
    onStartRename: () => void;
    onToggleVariantPicker: () => void;
    onSelectVariant: (index: number) => void;
    onPrevView: () => void;
    onNextView: () => void;
    onConvert: () => void;
    onDuplicate?: () => void;
    onDelete: () => void;
    onClose: () => void;
    isDeleting: boolean;
}) {
    const isImported = productionType === ProductionType.Imported;
    const showConvertToImported = canConvertToImported({ production_type: productionType, is_component: isComponent });
    const OriginIcon = isImported ? Globe : Factory;
    const canStep = maxViews > 1;
    const currentVariant = sortedVariants[normalizedViewIndex];
    const finishCode = currentVariant ? getVariantComponents(currentVariant.suffix, gender).finish.code : '';
    const finishDot = FINISH_DOTS[finishCode] || FINISH_DOTS[''];
    const finishName = FINISH_CODES[finishCode] || FINISH_CODES[''];

    const variantPicker = showPager ? (
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-sm">
            {canStep && (
                <button
                    type="button"
                    onClick={onPrevView}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                    title="Προηγούμενη παραλλαγή"
                >
                    <ChevronLeft size={16} />
                </button>
            )}

            <div ref={variantPickerRef} className="relative z-[120]">
                <button
                    type="button"
                    onClick={onToggleVariantPicker}
                    title={finishName}
                    className="flex max-w-[16rem] items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-left transition-colors hover:bg-slate-50"
                >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${finishDot}`} />
                    <span className="min-w-0 truncate text-[12px] font-bold text-slate-700">{displayedLabel}</span>
                    {canStep && (
                        <span className="shrink-0 font-mono text-[10px] text-slate-400">
                            {normalizedViewIndex + 1}/{maxViews}
                        </span>
                    )}
                    <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${isVariantPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isVariantPickerOpen && (
                    <div className="absolute left-1/2 top-full z-[140] mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="max-h-80 overflow-y-auto p-2">
                            {sortedVariants.map((variant, index) => {
                                const variantSku = `${masterSku}${variant.suffix}`;
                                const isActive = index === normalizedViewIndex;
                                const variantFinish = getVariantComponents(variant.suffix, gender).finish.code;
                                const variantDot = FINISH_DOTS[variantFinish] || FINISH_DOTS[''];
                                return (
                                    <button
                                        key={variant.suffix || `variant-${index}`}
                                        type="button"
                                        onClick={() => onSelectVariant(index)}
                                        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}
                                    >
                                        <div className="flex min-w-0 items-start gap-2">
                                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${variantDot}`} />
                                            <div className="min-w-0">
                                                <SkuColorizedText
                                                    sku={variantSku}
                                                    gender={gender}
                                                    className="block truncate text-[13px]"
                                                    masterClassName={isActive ? 'text-emerald-900' : 'text-slate-900'}
                                                />
                                                <div className={`truncate text-[11px] font-semibold ${isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                                                    {variant.description || variant.suffix || 'Βασικό'}
                                                </div>
                                            </div>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {index + 1}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {canStep && (
                <button
                    type="button"
                    onClick={onNextView}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                    title="Επόμενη παραλλαγή"
                >
                    <ChevronRight size={16} />
                </button>
            )}
        </div>
    ) : null;

    return (
        <div className="z-10 shrink-0 border-b border-slate-100 bg-white px-6 py-3">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {isEditingSku ? (
                            <div className="flex items-center gap-2">
                                <input
                                    value={tempSku}
                                    onChange={(e) => onTempSkuChange(e.target.value.toUpperCase())}
                                    className="w-48 border-b-2 border-emerald-500 text-2xl font-black uppercase tracking-tight text-slate-900 outline-none"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && onRenameSku()}
                                />
                                <button type="button" onClick={onRenameSku} disabled={isRenaming} className="rounded-lg bg-emerald-100 p-1.5 text-emerald-700 hover:bg-emerald-200">
                                    {isRenaming ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                </button>
                                <button type="button" onClick={onCancelRename} className="rounded-lg bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200">
                                    <X size={18} />
                                </button>
                            </div>
                        ) : (
                            <h2 className="group flex items-center gap-2 text-2xl font-black tracking-tight">
                                <SkuColorizedText
                                    sku={displayedSku}
                                    gender={gender}
                                    masterClassName="text-slate-900"
                                />
                                {viewMode === 'registry' && (
                                    <button
                                        type="button"
                                        onClick={onStartRename}
                                        className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100 focus-visible:opacity-100"
                                        title="Μετονομασία SKU"
                                    >
                                        <Edit size={16} />
                                    </button>
                                )}
                            </h2>
                        )}

                        <span
                            title={PRODUCTION_TYPE_LABELS[productionType]}
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${isImported ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}
                        >
                            <OriginIcon size={12} />
                        </span>

                        <span className="text-sm font-medium text-slate-500">{category}</span>
                        {isComponent && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">Εξάρτημα</span>
                        )}
                        {skipCasting && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold uppercase text-purple-700">{SKIP_CASTING_LABEL}</span>
                        )}
                    </div>
                </div>

                {variantPicker && (
                    <div className="flex shrink-0 justify-center">
                        {variantPicker}
                    </div>
                )}

                <div className="flex shrink-0 items-center gap-2">
                    {showConvertToImported && (
                        <DetailsActionButton title="Σε εισαγωγή" onClick={onConvert} tone="violet">
                            <Globe size={20} />
                        </DetailsActionButton>
                    )}
                    {isImported && (
                        <DetailsActionButton title="Σε ιδιοπαραγωγή" onClick={onConvert} tone="success">
                            <Factory size={20} />
                        </DetailsActionButton>
                    )}
                    {onDuplicate && (
                        <DetailsActionButton title="Κλωνοποίηση" onClick={onDuplicate} tone="info">
                            <Copy size={20} />
                        </DetailsActionButton>
                    )}
                    {viewMode === 'registry' && (
                        <DetailsActionButton title="Διαγραφή" onClick={onDelete} disabled={isDeleting} tone="danger">
                            <Trash2 size={20} />
                        </DetailsActionButton>
                    )}
                    <DetailsActionButton title="Κλείσιμο" onClick={onClose}>
                        <X size={20} />
                    </DetailsActionButton>
                </div>
            </div>
        </div>
    );
}
