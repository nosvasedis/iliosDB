import React from 'react';
import { Gender } from '../types';
import { getVariantComponents, splitSkuComponents } from '../utils/pricingEngine';
import { FINISH_COLORS, STONE_TEXT_COLORS } from '../hooks/useOrderState';

interface Props {
    sku: string;
    gender?: Gender;
    className?: string;
    masterClassName?: string;
}

export default function SkuColorizedText({
    sku,
    gender,
    className = '',
    masterClassName = 'text-slate-900'
}: Props) {
    const { master, suffix } = splitSkuComponents(sku);
    const { finish, stone } = getVariantComponents(suffix, gender);

    const finishColor = FINISH_COLORS[finish.code] || 'text-slate-400';
    const stoneColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

    return (
        <span className={`font-mono tracking-tight tabular-nums cursor-default ${className}`.trim()}>
            <span className={`font-black ${masterClassName}`.trim()}>{master}</span>
            <span className="font-black">
                {suffix.split('').map((char, index) => {
                    let colorClass = 'text-slate-400';
                    if (finish.code && index < finish.code.length) {
                        colorClass = finishColor;
                    } else if (stone.code && index >= suffix.length - stone.code.length) {
                        colorClass = stoneColor;
                    }

                    return (
                        <span key={`${suffix}-${index}`} className={colorClass}>
                            {char}
                        </span>
                    );
                })}
            </span>
        </span>
    );
}
