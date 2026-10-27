import { formatDecimal } from '../../utils/numberFormat';
import React from 'react';
import { Lock, LucideIcon, Unlock } from 'lucide-react';
import { getPricingRules, type PricingSettings } from '../../utils/pricingRules';
import { DetailsIconButton } from './detailsUi';

/** Shared column template so every labor line lines up like a spreadsheet. */
export const LABOR_GRID = 'grid grid-cols-[minmax(0,1fr)_5.25rem_0.75rem_5.25rem_0.75rem_6.5rem_2rem] items-center gap-x-2';

const round = (value: number, decimals: number) => (Number.isFinite(value) ? parseFloat(value.toFixed(decimals)) : 0);
const parseNum = (raw: string) => parseFloat(raw.replace(',', '.')) || 0;

const cellInput = 'h-8 w-full rounded-md border px-2 text-right font-mono text-[13px] tabular-nums outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/10';
const inputTone = {
    auto: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
    manual: 'border-amber-300 bg-amber-50 font-bold text-amber-900',
    locked: 'cursor-default border-transparent bg-slate-100/70 text-slate-500',
};

export function LaborSheetHeader() {
    return (
        <div className={`${LABOR_GRID} border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500`}>
            <span>Εργασία</span>
            <span className="text-right">Συντ. €/g</span>
            <span />
            <span className="text-right">Βάση g</span>
            <span />
            <span className="text-right">Ποσό €</span>
            <span />
        </div>
    );
}

interface LaborSheetRowProps {
    icon: LucideIcon;
    label: string;
    hint?: string;
    /** Finish shown when the line follows the variant in view (read-only rule). */
    contextLabel?: string;
    total: number;
    onTotalChange: (total: number) => void;
    /** Formula lines have a rate × basis; fixed lines only an amount. */
    formula?: {
        rate: number;
        weightBasis: number;
        onRateChange: (rate: number) => void;
        onWeightChange?: (weight: number) => void;
    };
    isOverridden?: boolean;
    onToggleOverride?: () => void;
    readOnly?: boolean;
    footer?: React.ReactNode;
}

export function LaborSheetRow({
    icon: Icon,
    label,
    hint,
    contextLabel,
    total,
    onTotalChange,
    formula,
    isOverridden = false,
    onToggleOverride,
    readOnly = false,
    footer,
}: LaborSheetRowProps) {
    const tone = readOnly ? inputTone.locked : isOverridden ? inputTone.manual : inputTone.auto;
    const weightLocked = readOnly || !formula?.onWeightChange;

    return (
        <div className={`px-3 py-2.5 transition-colors ${isOverridden && !readOnly ? 'bg-amber-50/40' : 'hover:bg-slate-50/70'}`}>
            <div className={LABOR_GRID}>
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isOverridden && !readOnly ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon size={15} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-slate-800">{label}</span>
                            {contextLabel && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-px text-[10px] font-semibold text-slate-500">{contextLabel}</span>}
                            {isOverridden && !readOnly && <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">Χειροκίνητο</span>}
                        </div>
                        {hint && <p className="truncate text-[11px] text-slate-400" title={hint}>{hint}</p>}
                    </div>
                </div>

                {formula ? (
                    <>
                        <input
                            type="number"
                            step="0.01"
                            aria-label={`${label}: συντελεστής`}
                            value={round(formula.rate, 4)}
                            disabled={readOnly}
                            onChange={(e) => formula.onRateChange(parseNum(e.target.value))}
                            className={`${cellInput} ${tone}`}
                        />
                        <span className="text-center text-xs font-bold text-slate-300">×</span>
                        <input
                            type="number"
                            step="0.01"
                            aria-label={`${label}: βάση βάρους`}
                            value={round(formula.weightBasis, 3)}
                            readOnly={weightLocked}
                            tabIndex={weightLocked ? -1 : undefined}
                            title={weightLocked ? 'Προκύπτει από τα βάρη / τη συνταγή' : undefined}
                            onChange={weightLocked ? undefined : (e) => formula.onWeightChange?.(parseNum(e.target.value))}
                            className={`${cellInput} ${weightLocked ? inputTone.locked : inputTone.auto}`}
                        />
                        <span className="text-center text-xs font-bold text-slate-300">=</span>
                    </>
                ) : (
                    <span className="col-span-4 pr-1 text-right text-[11px] font-medium italic text-slate-400">Σταθερό ποσό</span>
                )}

                <input
                    type="number"
                    step="0.01"
                    aria-label={`${label}: ποσό`}
                    value={round(total, 2)}
                    disabled={readOnly}
                    onChange={(e) => onTotalChange(parseNum(e.target.value))}
                    className={`${cellInput} font-bold ${formula ? tone : readOnly ? inputTone.locked : inputTone.auto}`}
                />

                {onToggleOverride && !readOnly ? (
                    <DetailsIconButton
                        icon={isOverridden ? Unlock : Lock}
                        label={isOverridden ? 'Επιστροφή σε αυτόματο υπολογισμό' : 'Κλείδωμα για χειροκίνητη τιμή'}
                        onClick={onToggleOverride}
                        className={isOverridden ? '!bg-amber-100 !text-amber-700 hover:!bg-amber-200' : 'text-slate-300'}
                    />
                ) : <span />}
            </div>
            {footer ? <div className="mt-2 pl-[2.625rem]">{footer}</div> : null}
        </div>
    );
}

/** Technician weight tiers as one segmented scale; the active tier(s) are highlighted. */
export function TechnicianTierStrip({
    settings,
    primaryWeightG,
    secondaryWeightG = 0,
}: {
    settings?: PricingSettings;
    primaryWeightG: number;
    secondaryWeightG?: number;
}) {
    const rules = getPricingRules(settings);
    const limits = [rules.technician_threshold_1, rules.technician_threshold_2, rules.technician_threshold_3, Infinity];
    const rates = [rules.technician_rate_1, rules.technician_rate_2, rules.technician_rate_3, rules.technician_rate_4];
    const tierIndex = (weight: number) => (weight <= 0 ? -1 : limits.findIndex((limit) => weight <= limit));
    const primary = tierIndex(primaryWeightG);
    const secondary = secondaryWeightG > 0 ? tierIndex(secondaryWeightG) : -1;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Κλιμάκωση</span>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white">
                {rates.map((rate, index) => {
                    const label = index === 3 ? `>${formatDecimal(limits[2], 1)}g` : `≤${formatDecimal(limits[index], 1)}g`;
                    const isPrimary = index === primary;
                    const isSecondary = index === secondary && !isPrimary;
                    return (
                        <span
                            key={index}
                            title={isPrimary ? `Ισχύει για ${formatDecimal(primaryWeightG, 2)} g` : isSecondary ? `Δευτερεύον ${formatDecimal(secondaryWeightG, 2)} g` : undefined}
                            className={`border-l border-slate-200 px-2 py-1 text-[10px] tabular-nums first:border-l-0 ${
                                isPrimary
                                    ? 'bg-sky-600 font-bold text-white'
                                    : isSecondary
                                        ? 'bg-sky-100 font-bold text-sky-800'
                                        : 'text-slate-500'
                            }`}
                        >
                            {label} · {formatDecimal(rate, 2)}€
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
