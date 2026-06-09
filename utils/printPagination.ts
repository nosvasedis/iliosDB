/** Conservative capacity for 2-column A4 invoice item grids (header + footer reserved). */
export const INVOICE_PRINT_ITEMS_PER_PAGE = 38;

export function chunkPrintPages<T>(
    items: T[],
    itemsPerPage = INVOICE_PRINT_ITEMS_PER_PAGE,
): T[][] {
    if (items.length === 0) return [[]];
    const pages: T[][] = [];
    for (let i = 0; i < items.length; i += itemsPerPage) {
        pages.push(items.slice(i, i + itemsPerPage));
    }
    return pages;
}

export function getPrintPageItemIndex(pageIndex: number, indexInPage: number, itemsPerPage = INVOICE_PRINT_ITEMS_PER_PAGE): number {
    return pageIndex * itemsPerPage + indexInPage;
}
