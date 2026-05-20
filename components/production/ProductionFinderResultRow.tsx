import React, { memo } from 'react';
import {
    Check,
    Clock,
    Hash,
    Image as ImageIcon,
    Loader2,
    PauseCircle,
} from 'lucide-react';
import { EnhancedProductionBatch, ProductionBatch, ProductionStage } from '../../types';
import SkuColorizedText from '../SkuColorizedText';
import { formatOrderId } from '../../utils/orderUtils';
import { getFinderSearchResultSurface } from '../../utils/productionFinderSurfaces';
import { getBatchAgeInfo } from '../../features/production/selectors';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import DesktopFinderBatchStageSelector from './DesktopFinderBatchStageSelector';

const STAGE_COLORS: Record<string, { text: string; border: string }> = {
    indigo: { text: 'text-indigo-700', border: 'border-indigo-200' },
    slate: { text: 'text-slate-700', border: 'border-slate-200' },
    orange: { text: 'text-orange-700', border: 'border-orange-200' },
    purple: { text: 'text-purple-700', border: 'border-purple-200' },
    blue: { text: 'text-blue-700', border: 'border-blue-200' },
    pink: { text: 'text-pink-700', border: 'border-pink-200' },
    yellow: { text: 'text-yellow-700', border: 'border-yellow-200' },
    emerald: { text: 'text-emerald-700', border: 'border-emerald-200' },
};

export type FinderStageMeta = {
    id: ProductionStage;
    label: string;
    color: string;
    icon: React.ReactNode;
};

type Props = {
    batch: EnhancedProductionBatch;
    stageMeta: FinderStageMeta | undefined;
    isSelected: boolean;
    isMoving: boolean;
    showTopBorder: boolean;
    onRowClick: (batch: EnhancedProductionBatch) => void;
    onToggleSelect: (batchId: string) => void;
    onMoveToStage: (
        batch: ProductionBatch,
        targetStage: ProductionStage,
        options?: { pendingDispatch?: boolean },
    ) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote: (batch: ProductionBatch) => void;
};

function ProductionFinderResultRow({
    batch,
    stageMeta,
    isSelected,
    isMoving,
    showTopBorder,
    onRowClick,
    onToggleSelect,
    onMoveToStage,
    onToggleHold,
    onEditNote,
}: Props) {
    const isPendingPolishing =
        batch.current_stage === ProductionStage.Polishing && batch.pending_dispatch;
    const colors = isPendingPolishing
        ? { text: 'text-teal-700', border: 'border-teal-200' }
        : STAGE_COLORS[stageMeta?.color as keyof typeof STAGE_COLORS] || STAGE_COLORS.slate;
    const finderBadgeClass = `bg-white ${colors.text} ${colors.border}`;
    const age = getBatchAgeInfo(batch);
    const isSpecialBatch = isSpecialCreationSku(batch.sku);
    const finderRowSurface = isPendingPolishing
        ? 'bg-teal-50/25 border border-teal-100/80 border-l-4 border-l-teal-400/45 hover:bg-teal-50/40'
        : getFinderSearchResultSurface(stageMeta?.color);

    return (
        <div
            onClick={() => onRowClick(batch)}
            aria-busy={isMoving || undefined}
            className={`relative rounded-xl p-3 transition-colors group cursor-pointer [contain:layout_style_paint] ${finderRowSurface} ${isSpecialBatch ? 'ring-1 ring-violet-200/65' : ''} ${isSelected ? '!ring-2 !ring-blue-400 ring-offset-0 !border-blue-300/80 !bg-blue-50/35' : ''} ${showTopBorder ? 'mt-1 border-t border-t-slate-200/60 pt-3' : ''} ${isMoving ? 'ring-2 ring-emerald-400/70 ring-offset-1 shadow-lg animate-pulse' : ''}`}
        >
            <div className="flex justify-between items-start">
                <div className="flex items-start gap-2">
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onToggleSelect(batch.id);
                        }}
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 touch-manipulation ${
                            isSelected
                                ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                                : 'bg-white border-slate-300 hover:border-blue-400'
                        }`}
                        title={isSelected ? 'Αποεπιλογή' : 'Επιλογή'}
                    >
                        {isSelected && <Check size={11} className="text-white" />}
                    </button>

                    <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shrink-0 relative">
                            {batch.product_image ? (
                                <img
                                    src={batch.product_image}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <ImageIcon size={16} className="m-auto text-slate-300" />
                            )}
                            <div className="absolute bottom-0 right-0 bg-slate-900 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-tl-lg leading-none">
                                x{batch.quantity}
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2">
                                <SkuColorizedText
                                    sku={batch.sku}
                                    suffix={batch.variant_suffix || ''}
                                    gender={batch.product_details?.gender}
                                    className="font-black text-lg"
                                    masterClassName={isSpecialBatch ? 'text-violet-900' : 'text-slate-800'}
                                />
                                <span className="bg-slate-900 text-white px-2 py-0.5 rounded-md text-xs font-bold shadow-sm">
                                    x{batch.quantity}
                                </span>
                                {batch.size_info && (
                                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-black flex items-center gap-1">
                                        <Hash size={10} /> {batch.size_info}
                                    </span>
                                )}
                                {batch.on_hold && (
                                    <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1">
                                        <PauseCircle size={10} /> Σε Αναμονή
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center justify-between mt-1 gap-2 min-w-[200px]">
                                <span className="font-bold text-slate-700 text-xs">
                                    {batch.customer_name || 'Unknown'}
                                </span>
                                {batch.on_hold ? (
                                    <div className="text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200">
                                        <PauseCircle size={10} /> Hold
                                    </div>
                                ) : (
                                    <div
                                        className={`text-[9px] font-black px-1.5 py-0.5 rounded border flex items-center gap-1 ${age.style}`}
                                    >
                                        <Clock size={10} /> {age.label}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                    <div className="text-[10px] font-mono text-slate-400">#{formatOrderId(batch.order_id)}</div>
                    <span
                        className={`text-[10px] uppercase font-bold border px-2 py-0.5 rounded flex items-center gap-1 shadow-sm ${finderBadgeClass}`}
                    >
                        {stageMeta?.icon &&
                            React.cloneElement(stageMeta.icon as React.ReactElement<{ size?: number }>, {
                                size: 10,
                            })}
                        {batch.current_stage === ProductionStage.Polishing
                            ? batch.pending_dispatch
                                ? 'Τεχν. • Αναμονή'
                                : 'Τεχν. • Στον Τεχν.'
                            : stageMeta?.label || batch.current_stage}
                    </span>
                </div>
            </div>
            <DesktopFinderBatchStageSelector
                batch={batch}
                onMoveToStage={onMoveToStage}
                onToggleHold={onToggleHold}
                onEditNote={onEditNote}
                isMoving={isMoving}
            />
            {isMoving && (
                <div
                    className="absolute inset-0 rounded-xl bg-white/55 backdrop-blur-[1.5px] z-20 flex items-start justify-center pt-2 pointer-events-auto cursor-wait"
                    onClick={(e) => {
                        e.stopPropagation();
                    }}
                    aria-hidden="true"
                >
                    <div className="flex items-center gap-1.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-lg ring-2 ring-white">
                        <Loader2 size={11} className="animate-spin" />
                        <span>Μετακινείται…</span>
                    </div>
                </div>
            )}
        </div>
    );
}

function propsAreEqual(prev: Props, next: Props): boolean {
    const pb = prev.batch;
    const nb = next.batch;
    return (
        pb.id === nb.id &&
        prev.isSelected === next.isSelected &&
        prev.isMoving === next.isMoving &&
        prev.showTopBorder === next.showTopBorder &&
        pb.current_stage === nb.current_stage &&
        pb.pending_dispatch === nb.pending_dispatch &&
        pb.on_hold === nb.on_hold &&
        pb.quantity === nb.quantity &&
        pb.sku === nb.sku &&
        pb.variant_suffix === nb.variant_suffix &&
        pb.customer_name === nb.customer_name &&
        pb.notes === nb.notes &&
        pb.on_hold_reason === nb.on_hold_reason &&
        pb.size_info === nb.size_info &&
        pb.product_image === nb.product_image &&
        prev.stageMeta?.id === next.stageMeta?.id
    );
}

export default memo(ProductionFinderResultRow, propsAreEqual);
