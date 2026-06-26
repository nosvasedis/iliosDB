import React, { ReactNode } from 'react';

export type CustomerPrintItemsLayoutMode = 'three-column' | 'legacy-two-column';

export const CUSTOMER_PRINT_ITEMS_LAYOUT_MODE: CustomerPrintItemsLayoutMode = 'three-column';
export const CUSTOMER_PRINT_COLUMN_COUNT = 3;
export const CUSTOMER_PRINT_ITEMS_PER_COLUMN = 10;
export const CUSTOMER_PRINT_ITEMS_PER_PAGE = CUSTOMER_PRINT_COLUMN_COUNT * CUSTOMER_PRINT_ITEMS_PER_COLUMN;

interface CustomerPrintItemsGridProps<T> {
    items: readonly T[];
    renderItem: (item: T, globalIndex: number) => ReactNode;
    descriptionLabel?: string;
    amountLabel?: string;
    textClassName?: string;
    layoutMode?: CustomerPrintItemsLayoutMode;
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

function getColumnClass(columnIndex: number) {
    if (columnIndex === 0) {
        return 'pr-2';
    }
    return 'pl-2 border-l border-dashed border-slate-200';
}

function CustomerPrintItemsHeader({
    columnCount,
    descriptionLabel,
    amountLabel,
}: {
    columnCount: 2 | 3;
    descriptionLabel: string;
    amountLabel: string;
}) {
    const gridClass = columnCount === 3 ? 'grid-cols-3 gap-x-3' : 'grid-cols-2 gap-x-6';

    return (
        <div className={`grid ${gridClass} border-b-2 border-slate-800 pb-1 mb-1 text-[9px] font-black text-slate-700 uppercase tracking-wider`}>
            {Array.from({ length: columnCount }, (_, columnIndex) => (
                <div key={columnIndex} className={`flex items-center ${getColumnClass(columnIndex)}`}>
                    <div className="w-5 text-center text-slate-400">#</div>
                    <div className="w-9 text-center">Εικ.</div>
                    <div className="flex-1 px-1">{descriptionLabel}</div>
                    <div className="w-[54px] text-right">{amountLabel}</div>
                </div>
            ))}
        </div>
    );
}

export default function CustomerPrintItemsGrid<T>({
    items,
    renderItem,
    descriptionLabel = 'Περιγραφή',
    amountLabel = 'Τεμ. x Τιμή',
    textClassName = 'text-[10px] leading-tight',
    layoutMode = CUSTOMER_PRINT_ITEMS_LAYOUT_MODE,
}: CustomerPrintItemsGridProps<T>) {
    if (layoutMode === 'legacy-two-column') {
        return (
            <>
                <CustomerPrintItemsHeader columnCount={2} descriptionLabel={descriptionLabel} amountLabel={amountLabel} />
                <div
                    className={textClassName}
                    style={{
                        columnCount: 2,
                        columnGap: '1.5rem',
                        columnRuleWidth: '1px',
                        columnRuleStyle: 'dashed',
                        columnRuleColor: '#e2e8f0',
                    }}
                >
                    {items.map((item, index) => renderItem(item, index))}
                </div>
            </>
        );
    }

    const pages = chunkItems(items, CUSTOMER_PRINT_ITEMS_PER_PAGE);

    return (
        <>
            {pages.map((pageItems, pageIndex) => {
                const isLastPage = pageIndex === pages.length - 1;
                const pageBaseIndex = pageIndex * CUSTOMER_PRINT_ITEMS_PER_PAGE;

                return (
                    <section
                        key={pageIndex}
                        className={isLastPage ? undefined : 'page-break-after-always'}
                        style={{
                            breakAfter: isLastPage ? undefined : 'page',
                            pageBreakAfter: isLastPage ? undefined : 'always',
                        }}
                    >
                        <CustomerPrintItemsHeader columnCount={3} descriptionLabel={descriptionLabel} amountLabel={amountLabel} />
                        <div className={`grid grid-cols-3 gap-x-3 ${textClassName}`}>
                            {Array.from({ length: CUSTOMER_PRINT_COLUMN_COUNT }, (_, columnIndex) => {
                                const columnStart = columnIndex * CUSTOMER_PRINT_ITEMS_PER_COLUMN;
                                const columnItems = pageItems.slice(columnStart, columnStart + CUSTOMER_PRINT_ITEMS_PER_COLUMN);

                                return (
                                    <div key={columnIndex} className={getColumnClass(columnIndex)}>
                                        {columnItems.map((item, itemIndex) =>
                                            renderItem(item, pageBaseIndex + columnStart + itemIndex)
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </>
    );
}
