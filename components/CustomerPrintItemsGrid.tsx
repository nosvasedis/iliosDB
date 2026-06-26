import React, { ReactNode } from 'react';

export type CustomerPrintItemsLayoutMode = 'three-column' | 'legacy-two-column';

export const CUSTOMER_PRINT_ITEMS_LAYOUT_MODE: CustomerPrintItemsLayoutMode = 'three-column';

interface CustomerPrintItemsGridProps<T> {
    items: readonly T[];
    renderItem: (item: T, globalIndex: number) => ReactNode;
    descriptionLabel?: string;
    amountLabel?: string;
    textClassName?: string;
    layoutMode?: CustomerPrintItemsLayoutMode;
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
                    <div className="w-6 text-center text-slate-400">#</div>
                    <div className="w-14 text-center">Εικ.</div>
                    <div className="flex-1 px-1">{descriptionLabel}</div>
                    <div className="w-14 text-right text-[8px] tracking-normal whitespace-nowrap">{amountLabel}</div>
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

    return (
        <>
            <CustomerPrintItemsHeader columnCount={3} descriptionLabel={descriptionLabel} amountLabel={amountLabel} />
            <div
                className={textClassName}
                style={{
                    columnCount: 3,
                    columnGap: '0.75rem',
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
