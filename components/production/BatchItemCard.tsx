import React, { useState, useMemo } from 'react';
import { Product, ProductionBatch, ProductionStage, Gender, OrderItem, ProductionTimingStatus } from '../../types';
import {
    ImageIcon, Hash, CheckCircle, Minus, Plus,
    RefreshCw, StickyNote, Merge, ChevronDown
} from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { getProductOptionColorLabel } from '../../utils/xrOptions';
import SkuColorizedText from '../SkuColorizedText';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../../utils/specialCreationSku';
import { groupProductionBatchesByStage } from '../../features/production/workflowSelectors';
import { buildOrderItemIdentityKey } from '../../features/orders/printHelpers';
import { BatchRow } from './BatchRow';
import { STAGES } from './stageConstants';

export interface RowItem extends OrderItem {
    shippedQty: number;
    openOrderQty: number;
    readyQty: number;
    inProgressQty: number;
    remainingQty: number;
    toSendQty: number;
    batchDetails: ProductionBatch[];
    gender?: Gender;
    collectionId?: number;
    price: number;
    originalIndex: number;
}

interface BatchItemCardProps {
    row: RowItem;
    product: Product | undefined;
    currentSend: number;
    discountFactor: number;
    isWorking: boolean;
    selectedBatchIds: Set<string>;
    expandedBatches: Set<string>;
    getBatchTiming: (batch: ProductionBatch) => { timingLabel: string; timingStatus: ProductionTimingStatus; stageEnteredAt: string };
    rows: RowItem[];
    onUpdateToSend: (originalIdx: number, val: number) => void;
    onToggleBatchSelect: (batchId: string) => void;
    onToggleBatchExpand: (batchId: string) => void;
    onStageMove: (batch: ProductionBatch, stage: ProductionStage, options?: { pendingDispatch?: boolean }) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote: (batch: ProductionBatch) => void;
    onViewHistory: (batch: ProductionBatch) => void;
    onRevert: (batch: ProductionBatch) => void;
    onSplit: (batch: ProductionBatch) => void;
    onDelete: (batch: ProductionBatch) => void;
    onMergeBatches: (stage: ProductionStage, batches: ProductionBatch[]) => void;
    onZoomImage: (url: string, alt: string) => void;
}

export const BatchItemCard = React.memo(function BatchItemCard({
    row,
    product,
    currentSend,
    discountFactor,
    isWorking,
    selectedBatchIds,
    expandedBatches,
    getBatchTiming,
    rows,
    onUpdateToSend,
    onToggleBatchSelect,
    onToggleBatchExpand,
    onStageMove,
    onToggleHold,
    onEditNote,
    onViewHistory,
    onRevert,
    onSplit,
    onDelete,
    onMergeBatches,
    onZoomImage,
}: BatchItemCardProps) {
    const spStub = isSpecialCreationSku(row.sku) ? getSpecialCreationProductStub() : null;
    const originalIndex = row.originalIndex;
    const isFullySent = row.remainingQty === 0;
    const hasBatches = row.batchDetails.length > 0;

    const [batchSectionOpen, setBatchSectionOpen] = useState(true);

    const batchesByStage = useMemo(() => groupProductionBatchesByStage(row.batchDetails), [row.batchDetails]);
    const sortedStages = useMemo(() =>
        Object.keys(batchesByStage).sort((a, b) => {
            const idxA = STAGES.findIndex(s => s.id === a);
            const idxB = STAGES.findIndex(s => s.id === b);
            return idxA - idxB;
        }),
    [batchesByStage]);

    return (
        <div className={`bg-white rounded-2xl border transition-all shadow-sm ${isFullySent && !hasBatches ? 'border-slate-100 opacity-60' : isFullySent ? 'border-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
            {/* TOP: Item Info & Send Controls */}
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3 p-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                    <button
                        type="button"
                        className={`w-11 h-11 rounded-xl overflow-hidden shrink-0 border ${spStub ? 'bg-violet-50 border-violet-200' : 'bg-slate-50 border-slate-100'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (product?.image_url) onZoomImage(product.image_url, product.sku);
                        }}
                    >
                        {product?.image_url ? (
                            <img src={product.image_url} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon size={18} className={spStub ? 'text-violet-400' : 'text-slate-300'} />
                            </div>
                        )}
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <SkuColorizedText sku={row.sku} suffix={row.variant_suffix} gender={row.gender} className="font-black text-sm" masterClassName={spStub ? 'text-violet-900' : 'text-slate-900'} />
                            {row.size_info && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold flex items-center gap-0.5"><Hash size={8} /> {row.size_info}</span>}
                            {row.cord_color && <span className="text-[9px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 font-bold">Κορδόνι: {getProductOptionColorLabel(row.cord_color)}</span>}
                            {row.enamel_color && <span className="text-[9px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded border border-rose-100 font-bold">Σμάλτο: {getProductOptionColorLabel(row.enamel_color)}</span>}
                        </div>
                        <div className={`text-[10px] font-bold uppercase truncate mt-0.5 ${spStub ? 'text-violet-600' : 'text-slate-400'}`}>
                            {product?.category ?? spStub?.category}
                        </div>

                        {/* Quantity stats row */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                            <span className="bg-slate-50 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                Παρ: {row.quantity}
                            </span>
                            {row.shippedQty > 0 && (
                                <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                                    Αποστ: {row.shippedQty}
                                </span>
                            )}
                            <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-200">
                                Σε εξέλ: {row.inProgressQty + row.readyQty}
                            </span>
                            {row.remainingQty > 0 && (
                                <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                    Υπόλ: {row.remainingQty}
                                </span>
                            )}
                        </div>

                        {/* Unit price */}
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {formatCurrency(row.price)}
                            {discountFactor < 1 && (
                                <span className="text-emerald-600 ml-1">
                                    → {formatCurrency(row.price * discountFactor)}
                                </span>
                            )}
                        </div>

                        {/* Row note */}
                        {row.notes && (
                            <div className="mt-1 flex items-start gap-1 p-1 bg-yellow-50 text-yellow-800 rounded border border-yellow-100 max-w-fit">
                                <StickyNote size={9} className="shrink-0 mt-0.5" />
                                <span className="text-[9px] font-bold italic leading-tight">{row.notes}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Send Controls */}
                {isFullySent ? (
                    <div className="px-2.5 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-100 whitespace-nowrap flex items-center gap-1 self-start">
                        <CheckCircle size={11} /> Δεν απομένουν
                    </div>
                ) : (
                    <div className="flex flex-col items-start xl:items-end gap-0.5 shrink-0">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Προς Αποστ. (Max: {row.remainingQty})</div>
                        <div className="flex items-center gap-0.5 bg-blue-50 p-0.5 rounded-lg border border-blue-100">
                            <button onClick={() => onUpdateToSend(originalIndex, currentSend - 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Minus size={13} /></button>
                            <input
                                type="number"
                                min="0"
                                max={row.remainingQty}
                                value={currentSend}
                                onChange={(e) => onUpdateToSend(originalIndex, parseInt(e.target.value) || 0)}
                                className="w-9 text-center font-black text-base bg-transparent outline-none text-blue-900"
                            />
                            <button onClick={() => onUpdateToSend(originalIndex, currentSend + 1)} className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm text-blue-600 hover:text-blue-900 active:scale-95 transition-transform"><Plus size={13} /></button>
                        </div>
                    </div>
                )}
            </div>

            {/* BOTTOM: Active Batches Management */}
            {hasBatches && (
                <div className="border-t border-slate-100">
                    <button
                        type="button"
                        onClick={() => setBatchSectionOpen(!batchSectionOpen)}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50/50 transition-colors"
                    >
                        <span className="flex items-center gap-1">
                            <RefreshCw size={10} /> Ενεργές Παρτίδες ({row.batchDetails.length})
                        </span>
                        <ChevronDown size={14} className={`transition-transform duration-200 ${batchSectionOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <div className={`grid transition-all duration-300 ease-in-out ${batchSectionOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                        <div className="overflow-hidden">
                            <div className="px-3 pb-3 space-y-2">
                                {sortedStages.map(stageId => {
                                    const stageBatches = batchesByStage[stageId];
                                    const stageLabel = STAGES.find(s => s.id === stageId)?.label || stageId;

                                    return (
                                        <div key={stageId} className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">{stageLabel}</span>
                                                {stageBatches.length > 1 && (
                                                    <button
                                                        onClick={() => onMergeBatches(stageId as ProductionStage, stageBatches)}
                                                        className="flex items-center gap-1 text-[9px] font-black bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100 hover:bg-purple-100 transition-colors"
                                                    >
                                                        <Merge size={9} /> Συγχ. ({stageBatches.length})
                                                    </button>
                                                )}
                                            </div>

                                            {stageBatches.map(batch => {
                                                const batchRow = rows.find(r => buildOrderItemIdentityKey(r) === buildOrderItemIdentityKey(batch));
                                                const unitPrice = batchRow?.price || 0;
                                                const batchVal = unitPrice * batch.quantity * discountFactor;
                                                const isSelected = selectedBatchIds.has(batch.id);
                                                const isExpanded = expandedBatches.has(batch.id);
                                                const timeInfo = getBatchTiming(batch);

                                                return (
                                                    <BatchRow
                                                        key={batch.id}
                                                        batch={batch}
                                                        isSelected={isSelected}
                                                        isExpanded={isExpanded}
                                                        batchValue={batchVal}
                                                        timeInfo={timeInfo}
                                                        isWorking={isWorking}
                                                        onToggleSelect={onToggleBatchSelect}
                                                        onToggleExpand={() => onToggleBatchExpand(batch.id)}
                                                        onStageMove={onStageMove}
                                                        onToggleHold={onToggleHold}
                                                        onEditNote={onEditNote}
                                                        onViewHistory={onViewHistory}
                                                        onRevert={onRevert}
                                                        onSplit={onSplit}
                                                        onDelete={onDelete}
                                                    />
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});
