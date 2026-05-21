import React, { memo, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, FolderKanban } from 'lucide-react';
import { Gender, ProductionBatch } from '../../types';
import {
    sortProductionDisplayLevel1Keys,
    type ProductionDisplayGroupMode,
    type ProductionDisplaySortOrder,
} from '../../features/production/workflowSelectors';

type DisplayBatch = ProductionBatch & { customer_name?: string };

type GenderConfig = Record<string, { label: string; style: string }>;

type VirtualRow =
    | {
          type: 'level';
          key: string;
          level1Key: string;
          count: number;
          batchIds: string[];
      }
    | {
          type: 'collection';
          key: string;
          level1Key: string;
          collectionName: string;
      }
    | {
          type: 'divider';
          key: string;
      }
    | {
          type: 'batch';
          key: string;
          batch: DisplayBatch;
      };

type Props = {
    groupedData: Record<string, Record<string, DisplayBatch[]>>;
    groupMode: ProductionDisplayGroupMode;
    sortOrder: ProductionDisplaySortOrder;
    genderConfig: GenderConfig;
    multiSelectIds: Set<string>;
    className?: string;
    onToggleGroupSelect: (batchIds: string[], selectAll: boolean) => void;
    renderBatch: (batch: DisplayBatch) => React.ReactNode;
    emptyState?: React.ReactNode;
    mobileTopIndicator?: React.ReactNode;
};

const SORTED_GENDERS = [Gender.Women, Gender.Men, Gender.Unisex, 'Unknown'];
const VIRTUAL_OVERSCAN = 6;

function flattenGroupedRows(
    groupedData: Record<string, Record<string, DisplayBatch[]>>,
    groupMode: ProductionDisplayGroupMode,
    sortOrder: ProductionDisplaySortOrder,
): VirtualRow[] {
    const level1Keys =
        groupMode === 'customer'
            ? sortProductionDisplayLevel1Keys(Object.keys(groupedData), groupedData as any, groupMode, sortOrder)
            : SORTED_GENDERS;

    const rows: VirtualRow[] = [];
    level1Keys.forEach((level1Key) => {
        const l1Batches = groupedData[level1Key];
        if (!l1Batches || Object.keys(l1Batches).length === 0) return;

        const collectionKeys = Object.keys(l1Batches);
        const allBatches = collectionKeys.flatMap((collectionKey) => l1Batches[collectionKey]);
        const batchIds = allBatches.map((batch) => batch.id);
        rows.push({
            type: 'level',
            key: `level:${level1Key}`,
            level1Key,
            count: allBatches.length,
            batchIds,
        });

        collectionKeys.forEach((collectionName) => {
            rows.push({
                type: 'collection',
                key: `collection:${level1Key}:${collectionName}`,
                level1Key,
                collectionName,
            });

            const batches = l1Batches[collectionName];
            batches.forEach((batch, index) => {
                if (index > 0 && batches[index - 1].sku !== batch.sku) {
                    rows.push({ type: 'divider', key: `divider:${level1Key}:${collectionName}:${batch.id}` });
                }
                rows.push({ type: 'batch', key: `batch:${batch.id}`, batch });
            });
        });
    });
    return rows;
}

function estimateRowSize(row: VirtualRow): number {
    if (row.type === 'level') return 38;
    if (row.type === 'collection') return 28;
    if (row.type === 'divider') return 12;
    return 216;
}

function VirtualizedProductionBatchGroups({
    groupedData,
    groupMode,
    sortOrder,
    genderConfig,
    multiSelectIds,
    className = '',
    onToggleGroupSelect,
    renderBatch,
    emptyState,
    mobileTopIndicator,
}: Props) {
    const parentRef = useRef<HTMLDivElement>(null);
    const rows = useMemo(
        () => flattenGroupedRows(groupedData, groupMode, sortOrder),
        [groupedData, groupMode, sortOrder],
    );

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: (index) => estimateRowSize(rows[index]),
        overscan: VIRTUAL_OVERSCAN,
    });

    return (
        <div ref={parentRef} className={`${className} overflow-y-auto custom-scrollbar`}>
            {mobileTopIndicator}
            {rows.length === 0 ? (
                emptyState || null
            ) : (
                <div
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        return (
                            <div
                                key={row.key}
                                data-index={virtualRow.index}
                                ref={virtualizer.measureElement}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualRow.start}px)`,
                                }}
                            >
                                {row.type === 'level' && (
                                    <LevelHeader
                                        row={row}
                                        groupMode={groupMode}
                                        genderConfig={genderConfig}
                                        multiSelectIds={multiSelectIds}
                                        onToggleGroupSelect={onToggleGroupSelect}
                                    />
                                )}
                                {row.type === 'collection' && (
                                    <div className="pl-2 border-l-2 border-slate-200 ml-1 pb-2">
                                        <div className="flex items-center gap-2 px-1">
                                            <FolderKanban size={10} className="text-slate-400" />
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                                {row.collectionName}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {row.type === 'divider' && (
                                    <div className="pl-2 border-l-2 border-slate-200 ml-1">
                                        <div className="border-t border-slate-200 my-1" />
                                    </div>
                                )}
                                {row.type === 'batch' && (
                                    <div className="pl-2 border-l-2 border-slate-200 ml-1 pb-2">
                                        {renderBatch(row.batch)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function LevelHeader({
    row,
    groupMode,
    genderConfig,
    multiSelectIds,
    onToggleGroupSelect,
}: {
    row: Extract<VirtualRow, { type: 'level' }>;
    groupMode: ProductionDisplayGroupMode;
    genderConfig: GenderConfig;
    multiSelectIds: Set<string>;
    onToggleGroupSelect: (batchIds: string[], selectAll: boolean) => void;
}) {
    const allSelected = row.batchIds.length > 0 && row.batchIds.every((id) => multiSelectIds.has(id));
    const someSelected = row.batchIds.some((id) => multiSelectIds.has(id)) && !allSelected;
    const gConfig = groupMode === 'customer' ? null : (genderConfig[row.level1Key] || genderConfig.Unknown);

    if (groupMode === 'customer') {
        return (
            <div className="pb-3">
                <div className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border bg-slate-900 text-white border-slate-900 shadow-sm flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                onToggleGroupSelect(row.batchIds, !allSelected);
                            }}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                allSelected
                                    ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                                    : someSelected
                                      ? 'bg-blue-300 border-blue-300'
                                      : 'bg-transparent border-white/50 hover:border-white'
                            }`}
                            title={allSelected ? 'Αποεπιλογή όλων' : 'Επιλογή όλων'}
                        >
                            {(allSelected || someSelected) && <Check size={12} className="text-white" />}
                        </button>
                        <span className="truncate">{row.level1Key}</span>
                    </div>
                    <span className="opacity-60 text-[9px]">{row.count}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-3">
            <div className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${gConfig?.style} flex justify-between items-center`}>
                <span>{gConfig?.label}</span>
                <span className="opacity-60 text-[9px]">{row.count}</span>
            </div>
        </div>
    );
}

function propsAreEqual(prev: Props, next: Props): boolean {
    return (
        prev.groupedData === next.groupedData &&
        prev.groupMode === next.groupMode &&
        prev.sortOrder === next.sortOrder &&
        prev.genderConfig === next.genderConfig &&
        prev.multiSelectIds === next.multiSelectIds &&
        prev.className === next.className &&
        prev.emptyState === next.emptyState &&
        prev.mobileTopIndicator === next.mobileTopIndicator &&
        prev.renderBatch === next.renderBatch &&
        prev.onToggleGroupSelect === next.onToggleGroupSelect
    );
}

export default memo(VirtualizedProductionBatchGroups, propsAreEqual);
