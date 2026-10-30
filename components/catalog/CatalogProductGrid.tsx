import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import CatalogProductCard, { CatalogCardDensity, CatalogCardProduct } from './CatalogProductCard';

interface Props<T extends CatalogCardProduct> {
    products: readonly T[];
    /** Changes whenever the result set is re-filtered; scrolls back to the top. */
    resetKey?: string;
    empty?: React.ReactNode;
    priceMultiplier?: number;
    onOpen: (product: T, variantIndex: number) => void;
    onAddToOrder?: (product: T, variantSuffix?: string) => void;
    /** Rendered after the grid inside the scroll area (e.g. a lightbox). */
    children?: React.ReactNode;
}

interface GridMetrics {
    columns: number;
    gap: number;
    cardWidth: number;
    density: CatalogCardDensity;
}

/** Column count follows the real container width, so 320px phones get 2 roomy columns, normal phones 3, desktops 5–7. */
function computeMetrics(width: number): GridMetrics {
    const gap = width < 600 ? 8 : width < 1024 ? 12 : 16;
    const minCard = width < 600 ? 106 : width < 1024 ? 150 : 176;
    const columns = Math.max(2, Math.floor((width + gap) / (minCard + gap)));
    const cardWidth = (width - gap * (columns - 1)) / columns;
    return { columns, gap, cardWidth, density: cardWidth < 132 ? 'compact' : 'regular' };
}

/** Image + SKU + badge + price row (+ finish dots); refined by measureElement once rendered. */
const estimateRowHeight = (m: GridMetrics) => m.cardWidth + (m.density === 'compact' ? 70 : 86) + m.gap;

/**
 * Virtualised product grid: only the rows near the viewport exist in the DOM, so a catalogue of
 * thousands of SKUs scrolls as smoothly on a budget phone as a list of twenty.
 */
export default function CatalogProductGrid<T extends CatalogCardProduct>({ products, resetKey, empty, priceMultiplier, onOpen, onAddToOrder, children }: Props<T>) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        setWidth(el.clientWidth);
        const ro = new ResizeObserver((entries) => {
            const next = Math.round(entries[0].contentRect.width);
            if (next > 0) setWidth((prev) => (prev === next ? prev : next));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const metrics = computeMetrics(width || 360);
    const rowCount = Math.ceil(products.length / metrics.columns);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => estimateRowHeight(metrics),
        overscan: 3,
    });

    // Column changes reshape every row; drop cached measurements.
    useEffect(() => { virtualizer.measure(); }, [metrics.columns, metrics.cardWidth, virtualizer]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [resetKey]);

    return (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain custom-scrollbar [-webkit-overflow-scrolling:touch]">
            <div ref={innerRef} className="px-2 pb-6 pt-2 min-[400px]:px-2.5 sm:px-3 lg:px-0 lg:pt-4">
                {products.length === 0 ? empty : (
                    <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                        {virtualizer.getVirtualItems().map((row) => {
                            const start = row.index * metrics.columns;
                            const items = products.slice(start, start + metrics.columns);
                            return (
                                <div
                                    key={row.key}
                                    data-index={row.index}
                                    ref={virtualizer.measureElement}
                                    className="absolute left-0 top-0 grid w-full"
                                    style={{
                                        transform: `translate3d(0,${row.start}px,0)`,
                                        gridTemplateColumns: `repeat(${metrics.columns}, minmax(0, 1fr))`,
                                        columnGap: metrics.gap,
                                        paddingBottom: metrics.gap,
                                    }}
                                >
                                    {items.map((product, i) => (
                                        <CatalogProductCard
                                            key={product.sku}
                                            product={product}
                                            density={metrics.density}
                                            priority={start + i < metrics.columns * 2}
                                            priceMultiplier={priceMultiplier}
                                            onOpen={onOpen}
                                            onAddToOrder={onAddToOrder}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {children}
        </div>
    );
}
