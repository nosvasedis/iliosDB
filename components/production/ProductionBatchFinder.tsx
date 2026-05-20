import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
    CheckSquare,
    Flame,
    Gem,
    Globe,
    Hammer,
    CheckCircle,
    Layers,
    Package,
    Search,
    Square,
    Tag,
    X,
} from 'lucide-react';
import { ProductionBatch, ProductionStage } from '../../types';
import { EnhancedProductionBatch } from '../../types';
import { filterAndSortProductionFinderBatches } from '../../features/production/workflowSelectors';
import { PRODUCTION_STAGES } from '../../utils/productionStages';
import ProductionFinderResultRow, { type FinderStageMeta } from './ProductionFinderResultRow';

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
    [ProductionStage.AwaitingDelivery]: <Globe size={20} />,
    [ProductionStage.Waxing]: <Package size={20} />,
    [ProductionStage.Casting]: <Flame size={20} />,
    [ProductionStage.Setting]: <Gem size={20} />,
    [ProductionStage.Polishing]: <Hammer size={20} />,
    [ProductionStage.Assembly]: <Layers size={20} />,
    [ProductionStage.Labeling]: <Tag size={20} />,
    [ProductionStage.Ready]: <CheckCircle size={20} />,
};

const STAGE_META: FinderStageMeta[] = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    color: stage.colorKey,
    icon: STAGE_ICONS[stage.id],
}));

const STAGE_META_BY_ID = new Map(STAGE_META.map((s) => [s.id, s]));

const FINDER_ROW_ESTIMATE_PX = 152;

type Props = {
    batches: EnhancedProductionBatch[];
    multiSelectIds: Set<string>;
    movingBatchIds: Set<string>;
    onToggleSelect: (batchId: string) => void;
    onToggleSelectAll: (batchIds: string[], selectAll: boolean) => void;
    onViewBatch: (batch: EnhancedProductionBatch) => void;
    onMoveToStage: (
        batch: ProductionBatch,
        targetStage: ProductionStage,
        options?: { pendingDispatch?: boolean },
    ) => void;
    onToggleHold: (batch: ProductionBatch) => void;
    onEditNote: (batch: ProductionBatch) => void;
};

export default function ProductionBatchFinder({
    batches,
    multiSelectIds,
    movingBatchIds,
    onToggleSelect,
    onToggleSelectAll,
    onViewBatch,
    onMoveToStage,
    onToggleHold,
    onEditNote,
}: Props) {
    const [finderTerm, setFinderTerm] = useState('');
    const deferredFinderTerm = useDeferredValue(finderTerm);
    const [, startTransition] = useTransition();

    const onToggleSelectRef = useRef(onToggleSelect);
    const onToggleSelectAllRef = useRef(onToggleSelectAll);
    const onViewBatchRef = useRef(onViewBatch);
    const onMoveToStageRef = useRef(onMoveToStage);
    const onToggleHoldRef = useRef(onToggleHold);
    const onEditNoteRef = useRef(onEditNote);
    useEffect(() => {
        onToggleSelectRef.current = onToggleSelect;
        onToggleSelectAllRef.current = onToggleSelectAll;
        onViewBatchRef.current = onViewBatch;
        onMoveToStageRef.current = onMoveToStage;
        onToggleHoldRef.current = onToggleHold;
        onEditNoteRef.current = onEditNote;
    });

    const stableToggleSelect = useCallback((batchId: string) => {
        onToggleSelectRef.current(batchId);
    }, []);
    const stableToggleSelectAll = useCallback((batchIds: string[], selectAll: boolean) => {
        onToggleSelectAllRef.current(batchIds, selectAll);
    }, []);
    const stableViewBatch = useCallback((batch: EnhancedProductionBatch) => {
        onViewBatchRef.current(batch);
    }, []);
    const stableMoveToStage = useCallback(
        (
            batch: ProductionBatch,
            targetStage: ProductionStage,
            options?: { pendingDispatch?: boolean },
        ) => {
            onMoveToStageRef.current(batch, targetStage, options);
        },
        [],
    );
    const stableToggleHold = useCallback((batch: ProductionBatch) => {
        onToggleHoldRef.current(batch);
    }, []);
    const stableEditNote = useCallback((batch: ProductionBatch) => {
        onEditNoteRef.current(batch);
    }, []);

    const foundBatches = useMemo(
        () =>
            filterAndSortProductionFinderBatches(
                batches,
                deferredFinderTerm,
            ) as EnhancedProductionBatch[],
        [batches, deferredFinderTerm],
    );

    const listParentRef = useRef<HTMLDivElement>(null);
    const rowVirtualizer = useVirtualizer({
        count: foundBatches.length,
        getScrollElement: () => listParentRef.current,
        estimateSize: () => FINDER_ROW_ESTIMATE_PX,
        overscan: 5,
    });

    const handleFinderChange = useCallback(
        (value: string) => {
            startTransition(() => setFinderTerm(value));
        },
        [],
    );

    const handleClear = useCallback(() => {
        startTransition(() => setFinderTerm(''));
    }, []);

    const handleToggleSelect = useCallback((batchId: string) => {
        startTransition(() => stableToggleSelect(batchId));
    }, [stableToggleSelect]);

    const handleSelectAllFound = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            const allSelected = foundBatches.every((b) => multiSelectIds.has(b.id));
            const ids = foundBatches.map((b) => b.id);
            startTransition(() => stableToggleSelectAll(ids, !allSelected));
        },
        [foundBatches, multiSelectIds, stableToggleSelectAll],
    );

    const allFoundSelected =
        foundBatches.length > 0 && foundBatches.every((b) => multiSelectIds.has(b.id));

    const showDropdown = finderTerm.length >= 2;

    return (
        <div className="relative group flex-1 min-w-0">
            <input
                type="text"
                value={finderTerm}
                onChange={(e) => handleFinderChange(e.target.value)}
                placeholder="Εύρεση SKU / Εντολής / Πελάτη..."
                className="w-full pl-10 p-3 rounded-2xl bg-slate-100 border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors font-bold text-slate-800 uppercase"
            />
            <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-600"
                size={18}
            />
            {finderTerm && (
                <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                    <X size={16} />
                </button>
            )}

            {showDropdown && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-[70vh] flex flex-col w-[900px] max-w-[calc(100vw-3rem)]">
                    {foundBatches.length > 0 && (
                        <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-slate-100 shrink-0">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {foundBatches.length} αποτελέσματα
                            </span>
                            <button
                                type="button"
                                onClick={handleSelectAllFound}
                                className="text-[10px] font-black text-blue-600 hover:text-blue-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                            >
                                {allFoundSelected ? (
                                    <>
                                        <Square size={11} /> Αποεπιλογή Όλων
                                    </>
                                ) : (
                                    <>
                                        <CheckSquare size={11} /> Επιλογή Όλων
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    <div
                        ref={listParentRef}
                        className="overflow-y-auto custom-scrollbar p-2 flex-1 min-h-0"
                    >
                        {foundBatches.length > 0 ? (
                            <div
                                style={{
                                    height: `${rowVirtualizer.getTotalSize()}px`,
                                    position: 'relative',
                                }}
                            >
                                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                    const b = foundBatches[virtualRow.index];
                                    return (
                                        <div
                                            key={b.id}
                                            data-index={virtualRow.index}
                                            ref={rowVirtualizer.measureElement}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                transform: `translateY(${virtualRow.start}px)`,
                                            }}
                                        >
                                            <ProductionFinderResultRow
                                                batch={b}
                                                stageMeta={STAGE_META_BY_ID.get(b.current_stage)}
                                                isSelected={multiSelectIds.has(b.id)}
                                                isMoving={movingBatchIds.has(b.id)}
                                                showTopBorder={virtualRow.index > 0}
                                                onRowClick={stableViewBatch}
                                                onToggleSelect={handleToggleSelect}
                                                onMoveToStage={stableMoveToStage}
                                                onToggleHold={stableToggleHold}
                                                onEditNote={stableEditNote}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-4 text-center text-slate-400 text-xs italic">
                                Δεν βρέθηκαν ενεργές παρτίδες.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
