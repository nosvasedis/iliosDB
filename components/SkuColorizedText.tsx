import React from 'react';
import { Gender } from '../types';
import { getVariantComponents, splitSkuComponents } from '../utils/pricingEngine';
import { getSkuFinishTextColor, getSkuStoneTextColor } from '../utils/skuColoring';

interface Props {
    sku: string;
    suffix?: string;
    gender?: Gender;
    className?: string;
    masterClassName?: string;
}

export default function SkuColorizedText({
    sku,
    suffix,
    gender,
    className = '',
    masterClassName = 'text-slate-900'
}: Props) {
    // DB / JSON may yield null; only concatenate when a real suffix string is provided
    const skuWithSuffix = suffix == null ? sku : `${sku}${suffix}`;
    const { master, suffix: variantSuffix } = splitSkuComponents(skuWithSuffix);
    const { finish, stone } = getVariantComponents(variantSuffix, gender);

    const finishColor = getSkuFinishTextColor(finish.code);
    const stoneColor = getSkuStoneTextColor(stone.code);

    return (
        <span className={`font-sans tracking-[-0.01em] tabular-nums cursor-default ${className}`.trim()}>
            <span className={`font-extrabold ${masterClassName}`.trim()}>{master}</span>
            <span className="font-bold">
                {variantSuffix.split('').map((char, index) => {
                    let colorClass = 'text-slate-400';
                    if (finish.code && index < finish.code.length) {
                        colorClass = finishColor;
                    } else if (stone.code && index >= variantSuffix.length - stone.code.length) {
                        colorClass = stoneColor;
                    }

                    return (
                        <span key={`${variantSuffix}-${index}`} className={colorClass}>
                            {char}
                        </span>
                    );
                })}
            </span>
        </span>
    );
}
