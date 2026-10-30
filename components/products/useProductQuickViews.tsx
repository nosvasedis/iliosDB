import React, { useCallback, useMemo, useRef, useState } from 'react';
import ImageZoomLightbox, { type ZoomGalleryItem } from './ImageZoomLightbox';
import LinkedProductsFan, { type FanItem, type FanSet } from './LinkedProductsFan';
import { getLinkedSets, type LinkableProduct, type ProductLinkIndex } from '../../features/products/productLinks';

interface Options<P extends LinkableProduct> {
    index: ProductLinkIndex;
    productsBySku: ReadonlyMap<string, P>;
    toFanItem: (product: P) => FanItem;
    onOpenProduct?: (product: P) => void;
}

type ZoomState = { items: ZoomGalleryItem[]; index: number } | null;
type FanState = { sku: string; sets: FanSet[]; anchor: DOMRect | null } | null;

/**
 * One zoom lightbox and one fan (βεντάλια) per page. Cards only receive the stable
 * callbacks, so memoised / virtualised grids do not re-render when either opens.
 */
export function useProductQuickViews<P extends LinkableProduct>({ index, productsBySku, toFanItem, onOpenProduct }: Options<P>) {
    const [zoom, setZoom] = useState<ZoomState>(null);
    const [fan, setFan] = useState<FanState>(null);

    const latest = useRef({ index, productsBySku, toFanItem, onOpenProduct });
    latest.current = { index, productsBySku, toFanItem, onOpenProduct };

    const openZoom = useCallback((items: ZoomGalleryItem[], startIndex = 0) => {
        if (items.length === 0) return;
        setZoom({ items, index: startIndex });
    }, []);

    const zoomProduct = useCallback((sku: string, imageUrl: string | null, label?: string) => {
        if (!imageUrl) return;
        setZoom({ items: [{ sku, imageUrl, label }], index: 0 });
    }, []);

    const buildSets = useCallback((sku: string): FanSet[] => {
        const { index: linkIndex, productsBySku: bySku, toFanItem: toItem } = latest.current;
        return getLinkedSets(sku, linkIndex)
            .map((set) => ({
                groupId: set.groupId,
                items: set.skus
                    .map((member) => bySku.get(member))
                    .filter((product): product is P => !!product)
                    .map(toItem),
            }))
            .filter((set) => set.items.length > 1);
    }, []);

    const openLinks = useCallback((sku: string, anchor?: HTMLElement | DOMRect | null) => {
        const sets = buildSets(sku);
        if (sets.length === 0) return;
        const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : (anchor ?? null);
        setFan({ sku, sets, anchor: rect });
    }, [buildSets]);

    const closeFan = useCallback(() => setFan(null), []);
    const closeZoom = useCallback(() => setZoom(null), []);

    const handleOpenFromFan = useCallback((sku: string) => {
        const { productsBySku: bySku, onOpenProduct: open } = latest.current;
        const product = bySku.get(sku);
        if (!product || !open) return;
        setFan(null);
        open(product);
    }, []);

    const handleFanZoom = useCallback((items: FanItem[], startIndex: number) => {
        setZoom({
            items: items.map((item) => ({ sku: item.sku, imageUrl: item.imageUrl, label: item.category })),
            index: startIndex,
        });
    }, []);

    const element = useMemo(() => (
        <>
            {fan && (
                <LinkedProductsFan
                    key={fan.sku}
                    originSku={fan.sku}
                    sets={fan.sets}
                    anchor={fan.anchor}
                    onClose={closeFan}
                    onOpenProduct={onOpenProduct ? handleOpenFromFan : undefined}
                    onZoom={handleFanZoom}
                />
            )}
            {zoom && (
                <ImageZoomLightbox
                    key={`${zoom.items[zoom.index]?.sku}-${zoom.items.length}`}
                    imageUrl={zoom.items[zoom.index]?.imageUrl || ''}
                    sku={zoom.items[zoom.index]?.sku || ''}
                    gallery={zoom.items}
                    initialIndex={zoom.index}
                    onClose={closeZoom}
                />
            )}
        </>
    ), [fan, zoom, closeFan, closeZoom, handleOpenFromFan, handleFanZoom, onOpenProduct]);

    return { openZoom, zoomProduct, openLinks, buildSets, closeFan, element };
}
