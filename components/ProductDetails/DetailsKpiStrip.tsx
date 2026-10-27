import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { Coins, Layers, LucideIcon, MapPin, Percent, Puzzle, Receipt, TrendingUp, Weight } from 'lucide-react';
import { formatCurrency } from '../../utils/pricingEngine';
import { getMarginTone } from './detailsUi';

function Kpi({
    icon: Icon,
    label,
    value,
    sub,
    valueClass = 'text-slate-900',
    children,
}: {
    icon: LucideIcon;
    label: string;
    value: React.ReactNode;
    sub?: React.ReactNode;
    valueClass?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="min-w-0 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Icon size={11} /> {label}
            </div>
            <div className={`mt-0.5 truncate text-lg font-bold tabular-nums leading-tight ${valueClass}`}>{value}</div>
            {sub ? <div className="truncate text-[11px] font-medium text-slate-500">{sub}</div> : null}
            {children}
        </div>
    );
}

/** At-a-glance commercial figures for the record (or the variant currently in view). */
export default function DetailsKpiStrip({
    isComponent,
    scopeLabel,
    cost,
    price,
    margin,
    totalWeight,
    secondaryWeight,
    variantCount,
    moldCount,
    usageCount,
}: {
    isComponent: boolean;
    scopeLabel: string;
    cost: number;
    price: number;
    margin: number;
    totalWeight: number;
    secondaryWeight: number;
    variantCount: number;
    moldCount: number;
    usageCount: number;
}) {
    const profit = price - cost;
    const tone = getMarginTone(margin);
    const hasPrice = price > 0;

    return (
        <div className={`grid shrink-0 grid-cols-2 divide-x divide-y divide-slate-100 border-b border-slate-200 bg-white sm:grid-cols-3 lg:divide-y-0 ${isComponent ? 'lg:grid-cols-5' : 'lg:grid-cols-6'}`}>
            <Kpi icon={Receipt} label="Κόστος" value={formatCurrency(cost)} sub={scopeLabel} />
            {isComponent ? (
                <>
                    <Kpi icon={Puzzle} label="Χρήση σε συνταγές" value={formatNumber(usageCount)} sub={usageCount === 1 ? 'κωδικός' : 'κωδικοί'} />
                    <Kpi icon={Layers} label="Παραλλαγές" value={formatNumber(variantCount)} />
                </>
            ) : (
                <>
                    <Kpi icon={Coins} label="Χονδρική" value={hasPrice ? formatCurrency(price) : '—'} valueClass={hasPrice ? 'text-emerald-700' : 'text-slate-300'} sub={hasPrice ? 'ανά τεμάχιο' : 'Δεν έχει οριστεί'} />
                    <Kpi
                        icon={TrendingUp}
                        label="Μικτό κέρδος"
                        value={hasPrice ? formatCurrency(profit) : '—'}
                        valueClass={!hasPrice ? 'text-slate-300' : profit >= 0 ? 'text-slate-900' : 'text-rose-600'}
                        sub={hasPrice ? `Markup ×${formatDecimal(cost > 0 ? price / cost : 0, 2)}` : undefined}
                    />
                    <Kpi icon={Percent} label="Περιθώριο" value={hasPrice ? `${formatDecimal(margin, 1)}%` : '—'} valueClass={hasPrice ? tone.text : 'text-slate-300'}>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${hasPrice ? Math.max(0, Math.min(100, margin)) : 0}%` }} />
                        </div>
                    </Kpi>
                </>
            )}
            <Kpi
                icon={Weight}
                label="Βάρος"
                value={`${formatDecimal(totalWeight, 2)} g`}
                sub={secondaryWeight > 0 ? `${formatDecimal(totalWeight - secondaryWeight, 2)} + ${formatDecimal(secondaryWeight, 2)} g` : 'Ασήμι 925'}
            />
            <Kpi
                icon={isComponent ? MapPin : Layers}
                label={isComponent ? 'Λάστιχα' : 'Παραλλαγές / Λάστιχα'}
                value={isComponent ? formatNumber(moldCount) : `${formatNumber(variantCount)} / ${formatNumber(moldCount)}`}
            />
        </div>
    );
}
