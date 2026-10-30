import React from 'react';
import type { Product } from '../../types';
import { formatCurrency, formatNumber } from '../../utils/numberFormat';
import type { FanItem } from './LinkedProductsFan';

/** Fan card for an admin catalogue product: wholesale price and available stock. */
export function productToFanItem(product: Product): FanItem {
    const available = product.available_qty ?? product.stock_qty ?? 0;
    return {
        sku: product.sku,
        imageUrl: product.image_url,
        gender: product.gender,
        category: product.category,
        meta: (
            <span className="flex items-center gap-2">
                <span className="text-slate-800">{product.selling_price > 0 ? formatCurrency(product.selling_price) : '—'}</span>
                <span className={available > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                    {available > 0 ? `${formatNumber(available)} διαθ.` : 'Χωρίς στοκ'}
                </span>
            </span>
        ),
    };
}

/** Same card without prices (employee views). */
export function productToFanItemWithoutPrice(product: Product): FanItem {
    const available = product.available_qty ?? product.stock_qty ?? 0;
    return {
        sku: product.sku,
        imageUrl: product.image_url,
        gender: product.gender,
        category: product.category,
        meta: <span className={available > 0 ? 'text-emerald-600' : 'text-slate-400'}>{available > 0 ? `${formatNumber(available)} διαθέσιμα` : 'Χωρίς στοκ'}</span>,
    };
}
