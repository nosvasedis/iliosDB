import React from 'react';
import type { OrderPriceMode } from '../../utils/orderPricing';

export default function OrderPriceModeToggle({ value, onChange }: {
    value: OrderPriceMode;
    onChange: (mode: OrderPriceMode) => void;
}) {
    return (
        <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
            <input
                type="checkbox"
                role="switch"
                aria-label="Λιανική ×3"
                checked={value === 'retail'}
                onChange={event => onChange(event.target.checked ? 'retail' : 'wholesale')}
                className="h-4 w-4 accent-fuchsia-600"
            />
            Λιανική ×3
            <span className="text-[10px] font-medium text-slate-500">
                {value === 'retail' ? 'Τιμές λιανικής' : 'Τιμές χονδρικής'}
            </span>
        </label>
    );
}
