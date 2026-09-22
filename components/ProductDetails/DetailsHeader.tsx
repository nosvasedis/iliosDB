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
import { PRODUCTION_TYPE_LABELS, SKIP_CASTING_LABEL, canConvertToImported } from '../../features/products/productCardPresentation';
import SkuColorizedText from '../SkuColorizedText';
import { DetailsActionButton } from './detailsUi';

export default function DetailsHeader({
    displayedSku,
    displayedLabel,
    gender,
    category,
    displayPlating,
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
    displayPlating: string;
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

    return (
        <div className="z-10 shrink-0 border-b border-slate-100 bg-white px-6 py-5">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
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
                            <h2 className="group flex items-center gap-3 text-2xl font-black tracking-tight">
                                <SkuColorizedText
                                    sku={displayedSku}
                                    gender={gender}
                                    masterClassName="text-slate-900"
                                />
                                {viewMode === 'registry' && (
                                    <button
                                        type="button"
                                        onClick={onStartRename}
                                        className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100"
                                        title="Μετονομασία SKU"
                                    >
                                        <Edit size={16} />
                                    </button>
                                )}
                            </h2>
                        )}

                        {showPager && (
                            <div className="flex items-center gap-1.5">
                                <div ref={variantPickerRef} className="relative z-[120]">
                                    <button
                                        type="button"
                                        onClick={onToggleVariantPicker}
                                        title="Επιλογή παραλλαγής"
                                        className="flex max-w-[13rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition-colors hover:border-slate-300"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-[11px] font-bold text-slate-700">{displayedLabel}</div>
                                        </div>
                                        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${isVariantPickerOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {isVariantPickerOpen && (
                                        <div className="absolute left-0 top-full z-[140] mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                                            <div className="max-h-80 overflow-y-auto p-2">
                                                {sortedVariants.map((variant, index) => {
                                                    const variantSku = `${masterSku}${variant.suffix}`;
                                                    const isActive = index === normalizedViewIndex;
                                                    return (
                                                        <button
                                                            key={variant.suffix || `variant-${index}`}
                                                            type="button"
                                                            onClick={() => onSelectVariant(index)}
                                                            className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isActive ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}
                                                        >
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
                                <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
                                    <button type="button" onClick={onPrevView} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700">
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="w-9 text-center font-mono text-[11px] text-slate-500">
                                        {normalizedViewIndex + 1}/{maxViews}
                                    </span>
                                    <button type="button" onClick={onNextView} className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700">
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium text-slate-500">
                        <span>{category}</span>
                        {displayPlating ? (
                            <>
                                <span>•</span>
                                <span className="font-bold text-slate-600">{displayPlating}</span>
                            </>
                        ) : null}
                        {displayedLabel && displayedLabel !== displayPlating ? (
                            <>
                                <span>•</span>
                                <span className="font-bold text-slate-600">{displayedLabel}</span>
                            </>
                        ) : null}
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${isImported ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            <OriginIcon size={12} />
                            {PRODUCTION_TYPE_LABELS[productionType]}
                        </span>
                        {isComponent && (
                            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold uppercase text-blue-700">Εξάρτημα</span>
                        )}
                        {skipCasting && (
                            <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-bold uppercase text-purple-700">{SKIP_CASTING_LABEL}</span>
                        )}
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                    {showConvertToImported && (
                        <button
                            type="button"
                            onClick={onConvert}
                            title="Σε εισαγωγή"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100"
                        >
                            <Globe size={14} />
                            Σε εισαγωγή
                        </button>
                    )}
                    {isImported && (
                        <button
                            type="button"
                            onClick={onConvert}
                            title="Σε ιδιοπαραγωγή"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                            <Factory size={14} />
                            Σε ιδιοπαραγωγή
                        </button>
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
