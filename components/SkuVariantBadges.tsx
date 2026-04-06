import React from 'react';
import { Gender, Product } from '../types';
import { FINISH_CODES } from '../constants';
import { getVariantComponents, getVariantSuffixDisplayCodes } from '../utils/pricingEngine';
import { getSkuFinishChipClass, getSkuStoneChipClass } from '../utils/skuColoring';

interface Props {
    suffix: string;
    gender?: Gender;
    product?: Product | null;
    className?: string;
    compact?: boolean;
}

/**
 * Finish + stone chips derived from display codes (BAS / PCO disambiguation, etc.).
 */
export default function SkuVariantBadges({ suffix, gender, product, className = '', compact = false }: Props) {
    const { finishCode, stoneCode } = getVariantSuffixDisplayCodes(suffix, gender, product ?? null);
    const parsed = getVariantComponents(suffix || '', gender);

    const finishLabel =
        finishCode !== ''
            ? FINISH_CODES[finishCode] || finishCode
            : parsed.finish.name || FINISH_CODES[''];

    const stoneLabel = stoneCode ? parsed.stone.name || stoneCode : '';

    const pad = compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';

    return (
        <div className={`flex flex-wrap items-center gap-1 ${className}`.trim()}>
            <span
                className={`inline-flex max-w-full items-center rounded-md font-black uppercase tracking-tight ${pad} border ${getSkuFinishChipClass(finishCode)}`}
                title={finishLabel}
            >
                {finishCode !== '' ? finishCode : 'Λ'}
            </span>
            {stoneCode ? (
                <span
                    className={`inline-flex max-w-full items-center rounded-md font-black uppercase tracking-tight ${pad} border ${getSkuStoneChipClass(stoneCode)}`}
                    title={stoneLabel}
                >
                    {stoneCode}
                </span>
            ) : null}
        </div>
    );
}
