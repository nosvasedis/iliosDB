import { formatNumber } from '../../utils/numberFormat';
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
    ImageIcon,
    Loader2,
    Puzzle,
    Trash2,
    X,
} from 'lucide-react';
import { Gender, ProductVariant, ProductionType } from '../../types';
import { FINISH_CODES } from '../../constants';
import { SKIP_CASTING_LABEL, canConvertToImported } from '../../features/products/productCardPresentation';
import { getVariantComponents } from '../../utils/pricingEngine';
import SkuColorizedText from '../SkuColorizedText';
import { DetailsButton, DetailsIconButton } from './detailsUi';

export const FINISH_DOTS: Record<string, string> = {
    '': 'bg-gradient-to-br from-slate-300 to-slate-500',
    P: 'bg-gradient-to-br from-stone-400 to-stone-600',
    X: 'bg-gradient-to-br from-amber-400 to-yellow-600',
    D: 'bg-gradient-to-br from-orange-400 to-rose-500',
    H: 'bg-gradient-to-br from-cyan-300 to-sky-500',
};

const GENDER_LABELS: Record<Gender, string> = {
    [Gender.Women]: 'Γυναικείο',
    [Gender.Men]: 'Ανδρικό',
    [Gender.Unisex]: 'Ουδέτερο',
};

function Chip({ className, children }: { className: string; children: React.ReactNode }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${className}`}>
            {children}
        </span>
    );
}

export default function DetailsHeader({
    displayedSku,
    displayedLabel,
    gender,
    category,
    imageUrl,
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
    imageUrl?: string | null;
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
    const canStep = maxViews > 1;
    const currentVariant = sortedVariants[normalizedViewIndex];
    const finishCode = currentVariant ? getVariantComponents(currentVariant.suffix, gender).finish.code : '';
    const finishDot = FINISH_DOTS[finishCode] || FINISH_DOTS[''];
    const finishName = FINISH_CODES[finishCode] || FINISH_CODES[''];
    const hasRecordActions = showConvertToImported || isImported || !!onDuplicate || viewMode === 'registry';

    const variantPicker = showPager ? (
        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
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
                    aria-expanded={isVariantPickerOpen}
                    className="flex max-w-[17rem] items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-left shadow-sm ring-1 ring-slate-200/70 transition-colors hover:bg-slate-50"
                >
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${finishDot}`} />
                    <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Παραλλαγή</span>
                        <span className="block truncate text-[12px] font-bold leading-tight text-slate-800">{displayedLabel}</span>
                    </span>
                    {canStep && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-500">
                            {formatNumber(normalizedViewIndex + 1)}/{formatNumber(maxViews)}
                        </span>
                    )}
                    <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${isVariantPickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isVariantPickerOpen && (
                    <div className="absolute right-0 top-full z-[140] mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {formatNumber(sortedVariants.length)} παραλλαγές
                        </div>
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
                                        {isActive ? <Check size={14} className="shrink-0 text-emerald-600" /> : null}
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
        <header className="z-10 shrink-0 border-b border-slate-200 bg-white px-5 py-3.5 md:px-6">
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-contain" /> : <ImageIcon size={20} className="text-slate-300" />}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span>{viewMode === 'registry' ? 'Μητρώο Κωδικών' : 'Αποθήκη'}</span>
                        <ChevronRight size={10} />
                        <span className="text-slate-500">Καρτέλα SKU</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {isEditingSku ? (
                            <div className="flex items-center gap-2">
                                <input
                                    value={tempSku}
                                    onChange={(e) => onTempSkuChange(e.target.value.toUpperCase())}
                                    className="w-48 border-b-2 border-emerald-500 text-2xl font-black uppercase tracking-tight text-slate-900 outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') onRenameSku();
                                        if (e.key === 'Escape') onCancelRename();
                                    }}
                                />
                                <DetailsButton variant="success" icon={isRenaming ? Loader2 : Check} onClick={onRenameSku} disabled={isRenaming} className={isRenaming ? '[&>svg]:animate-spin' : ''}>
                                    Μετονομασία
                                </DetailsButton>
                                <DetailsButton variant="ghost" onClick={onCancelRename}>Ακύρωση</DetailsButton>
                            </div>
                        ) : (
                            <h2 className="group flex items-center gap-1.5 text-2xl font-black leading-tight tracking-tight">
                                <SkuColorizedText sku={displayedSku} gender={gender} masterClassName="text-slate-900" />
                                {viewMode === 'registry' && (
                                    <button
                                        type="button"
                                        onClick={onStartRename}
                                        className="rounded p-1 text-slate-300 opacity-0 transition-opacity hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100 focus-visible:opacity-100"
                                        title="Μετονομασία SKU"
                                    >
                                        <Edit size={15} />
                                    </button>
                                )}
                            </h2>
                        )}

                        <Chip className={isImported ? 'bg-violet-50 text-violet-700 ring-violet-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}>
                            {isImported ? <Globe size={10} /> : <Factory size={10} />}
                            {isImported ? 'Εισαγόμενο' : 'Ιδιοπαραγωγή'}
                        </Chip>
                        {isComponent && (
                            <Chip className="bg-blue-50 text-blue-700 ring-blue-200"><Puzzle size={10} /> Εξάρτημα</Chip>
                        )}
                        {skipCasting && (
                            <Chip className="bg-purple-50 text-purple-700 ring-purple-200">{SKIP_CASTING_LABEL}</Chip>
                        )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-medium text-slate-500">
                        <span>{category || 'Χωρίς κατηγορία'}</span>
                        <span className="text-slate-300">•</span>
                        <span>{GENDER_LABELS[gender] || gender}</span>
                        {showPager && (
                            <>
                                <span className="text-slate-300">•</span>
                                <span>{formatNumber(sortedVariants.length)} παραλλαγές</span>
                            </>
                        )}
                    </div>
                </div>

                {variantPicker && <div className="flex shrink-0 justify-center">{variantPicker}</div>}

                <div className="flex shrink-0 items-center gap-1.5">
                    {hasRecordActions && (
                        <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50/70 p-1">
                            {showConvertToImported && (
                                <DetailsButton variant="ghost" icon={Globe} onClick={onConvert} title="Μετατροπή σε εισαγωγή" aria-label="Μετατροπή σε εισαγωγή">
                                    <span className="hidden xl:inline">Σε εισαγωγή</span>
                                </DetailsButton>
                            )}
                            {isImported && (
                                <DetailsButton variant="ghost" icon={Factory} onClick={onConvert} title="Μετατροπή σε ιδιοπαραγωγή" aria-label="Μετατροπή σε ιδιοπαραγωγή">
                                    <span className="hidden xl:inline">Σε ιδιοπαραγωγή</span>
                                </DetailsButton>
                            )}
                            {onDuplicate && (
                                <DetailsButton variant="ghost" icon={Copy} onClick={onDuplicate} title="Κλωνοποίηση" aria-label="Κλωνοποίηση">
                                    <span className="hidden xl:inline">Κλωνοποίηση</span>
                                </DetailsButton>
                            )}
                            {viewMode === 'registry' && (
                                <>
                                    {(showConvertToImported || isImported || onDuplicate) && <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden="true" />}
                                    <DetailsButton variant="danger" icon={isDeleting ? Loader2 : Trash2} onClick={onDelete} disabled={isDeleting} title="Διαγραφή" aria-label="Διαγραφή" className={isDeleting ? '[&>svg]:animate-spin' : ''}>
                                        <span className="hidden xl:inline">Διαγραφή</span>
                                    </DetailsButton>
                                </>
                            )}
                        </div>
                    )}
                    <DetailsIconButton icon={X} label="Κλείσιμο" size="md" variant="ghost" onClick={onClose} className="text-slate-400" />
                </div>
            </div>
        </header>
    );
}
