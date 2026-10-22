import React from 'react';
import type { OrderPriceMode } from '../../utils/orderPricing';

export default function OrderPriceModeToggle({ value, onChange }: {
    value: OrderPriceMode;
    onChange: (mode: OrderPriceMode) => void;
}) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap py-1 text-[10px] font-medium text-slate-500 hover:text-slate-700">
            <input
                type="checkbox"
                role="switch"
                aria-label="Λιανική ×3"
                checked={value === 'retail'}
                onChange={event => onChange(event.target.checked ? 'retail' : 'wholesale')}
                className="h-3 w-3 accent-slate-600"
            />
            Λιανική ×3
        </label>
    );
}
