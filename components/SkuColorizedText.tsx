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
    // If `suffix` is provided, we already have an explicit master + variant suffix.
    // Re-splitting can misclassify masters that end with a letter (e.g. SK263S + XKO).
    const { master, suffix: variantSuffix } =
        suffix === undefined
            ? splitSkuComponents(sku)
            : { master: sku, suffix };
    const { finish, stone, prefixLength } = getVariantComponents(variantSuffix, gender);

    const finishColor = getSkuFinishTextColor(finish.code);
    const stoneColor = getSkuStoneTextColor(stone.code);

    return (
        <span className={`font-sans tracking-[-0.01em] tabular-nums cursor-default ${className}`.trim()}>
            <span className={`font-extrabold ${masterClassName}`.trim()}>{master}</span>
            <span className="font-bold">
                {variantSuffix.split('').map((char, index) => {
                    let colorClass = 'text-slate-400';
                    if (index < prefixLength) {
                        // Prefix chars sit between the master digits and the finish letter;
                        // they belong to the master SKU visually (e.g. the "S" in DA752S·DLE).
                        colorClass = masterClassName;
                    } else {
                        const suffixIdx = index - prefixLength;
                        if (finish.code && suffixIdx < finish.code.length) {
                            colorClass = finishColor;
                        } else if (stone.code && index >= variantSuffix.length - stone.code.length) {
                            colorClass = stoneColor;
                        }
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
