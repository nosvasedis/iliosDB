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
    // When suffix is explicitly provided (even empty string), trust the caller's split:
    // sku = master part (e.g. "BR004S"), suffix = variant part (e.g. "XKO").
    // Only run splitSkuComponents when no suffix prop was given (single combined string).
    let master: string;
    let variantSuffix: string;
    if (suffix != null) {
        master = sku;
        variantSuffix = suffix;
    } else {
        const split = splitSkuComponents(sku);
        master = split.master;
        variantSuffix = split.suffix;
    }
    const { finish, stone, bridge } = getVariantComponents(variantSuffix, gender);

    const finishColor = getSkuFinishTextColor(finish.code);
    const stoneColor = getSkuStoneTextColor(stone.code);

    const charColorAt = (index: number): string => {
        const fLen = finish.code.length;
        const sLen = stone.code.length;
        const bLen = bridge ? bridge.length : 0;
        if (fLen + sLen + bLen === variantSuffix.length) {
            if (fLen > 0 && index < fLen) return finishColor;
            if (index < fLen + sLen) return stoneColor;
            if (index < fLen + sLen + bLen) return 'text-slate-500';
            return 'text-slate-400';
        }
        // Legacy heuristic when decomposition length does not match raw suffix (e.g. BAS… tails)
        if (finish.code && index < finish.code.length) return finishColor;
        if (stone.code && index >= variantSuffix.length - stone.code.length) return stoneColor;
        return 'text-slate-400';
    };

    return (
        <span className={`font-sans tracking-[-0.01em] tabular-nums cursor-default ${className}`.trim()}>
            <span className={`font-extrabold ${masterClassName}`.trim()}>{master}</span>
            <span className="font-bold">
                {variantSuffix.split('').map((char, index) => (
                    <span key={`${variantSuffix}-${index}`} className={charColorAt(index)}>
                        {char}
                    </span>
                ))}
            </span>
        </span>
    );
}
