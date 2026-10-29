import React from 'react';
import { Gender } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getSkuFinishBadgeSurface } from '../../utils/skuColoring';
import SkuColorizedText from '../SkuColorizedText';

// Shared building blocks for the Νέο Προϊόν wizard so every step reads as one surface.

export const npInputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-300 hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

export const npMonoInputClass = `${npInputClass} font-mono uppercase tracking-wide`;

export const npLabelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500';

type Tone = 'emerald' | 'blue' | 'amber' | 'violet' | 'slate' | 'rose' | 'indigo';

const TONE_ICON: Record<Tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    blue: 'bg-blue-50 text-blue-600 ring-blue-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    slate: 'bg-slate-100 text-slate-600 ring-slate-200',
    rose: 'bg-rose-50 text-rose-600 ring-rose-100',
    indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
};

interface StepHeaderProps {
    step: number;
    title: string;
    subtitle?: string;
    icon: React.ElementType;
    aside?: React.ReactNode;
}

export function StepHeader({ step, title, subtitle, icon: Icon, aside }: StepHeaderProps) {
    return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
                <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
                    <Icon size={22} strokeWidth={2.2} />
                    <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-black text-emerald-700 shadow ring-1 ring-emerald-100">
                        {step}
                    </span>
                </div>
                <div className="min-w-0">
                    <h3 className="text-xl font-black tracking-tight text-slate-900">{title}</h3>
                    {subtitle && <p className="mt-0.5 text-sm font-medium text-slate-500">{subtitle}</p>}
                </div>
            </div>
            {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
        </div>
    );
}

interface PanelProps {
    title?: string;
    subtitle?: string;
    icon?: React.ElementType;
    tone?: Tone;
    actions?: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    children: React.ReactNode;
}

export function Panel({ title, subtitle, icon: Icon, tone = 'slate', actions, className = '', bodyClassName = '', children }: PanelProps) {
    return (
        <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 ${className}`}>
            {title && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                        {Icon && (
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${TONE_ICON[tone]}`}>
                                <Icon size={15} />
                            </span>
                        )}
                        <div className="min-w-0">
                            <h4 className="text-[13px] font-black uppercase tracking-wide text-slate-700">{title}</h4>
                            {subtitle && <p className="truncate text-[11px] font-medium text-slate-400">{subtitle}</p>}
                        </div>
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={`p-5 ${bodyClassName}`}>{children}</div>
        </section>
    );
}

interface ToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    description?: string;
    tone?: 'violet' | 'indigo' | 'emerald';
    id: string;
}

const TOGGLE_ON: Record<NonNullable<ToggleProps['tone']>, string> = {
    violet: 'bg-violet-600',
    indigo: 'bg-indigo-600',
    emerald: 'bg-emerald-500',
};

export function Toggle({ checked, onChange, label, description, tone = 'emerald', id }: ToggleProps) {
    return (
        <label
            htmlFor={id}
            className={`flex cursor-pointer select-none items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${checked ? 'border-slate-300 bg-white shadow-sm' : 'border-slate-200 bg-slate-50/60 hover:bg-white'}`}
        >
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? TOGGLE_ON[tone] : 'bg-slate-300'}`}
            >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
            <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-700">{label}</span>
                {description && <span className="block text-[10px] font-medium text-slate-400">{description}</span>}
            </span>
        </label>
    );
}

export function StatPill({ label, value, tone = 'slate' }: { label: string; value: React.ReactNode; tone?: Tone }) {
    const tones: Record<Tone, string> = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        blue: 'border-blue-200 bg-blue-50 text-blue-800',
        amber: 'border-amber-200 bg-amber-50 text-amber-800',
        violet: 'border-violet-200 bg-violet-50 text-violet-800',
        slate: 'border-slate-200 bg-white text-slate-800',
        rose: 'border-rose-200 bg-rose-50 text-rose-800',
        indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    };
    return (
        <div className={`flex items-baseline gap-2 rounded-xl border px-3 py-1.5 shadow-sm ${tones[tone]}`}>
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-60">{label}</span>
            <span className="font-mono text-sm font-black tabular-nums">{value}</span>
        </div>
    );
}

interface VariantSuffixBadgeProps {
    suffix: string;
    gender?: Gender | '';
    /** Master SKU shown before the suffix; omit for a suffix-only badge. */
    sku?: string;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

const BADGE_SIZE: Record<NonNullable<VariantSuffixBadgeProps['size']>, string> = {
    sm: 'h-7 min-w-[3rem] px-2 text-xs rounded-lg',
    md: 'h-9 min-w-[4rem] px-2.5 text-sm rounded-xl',
    lg: 'h-12 min-w-[5.5rem] px-3 text-lg rounded-2xl',
};

/** Finish-tinted surface with finish/stone coloured letters, matching the registry cards. */
export function VariantSuffixBadge({ suffix, gender, sku, size = 'md', className = '' }: VariantSuffixBadgeProps) {
    const resolvedGender = (gender || Gender.Unisex) as Gender;
    const { finish } = getVariantComponents(suffix, resolvedGender);
    const surface = getSkuFinishBadgeSurface(finish.code);
    return (
        <span className={`inline-flex shrink-0 items-center justify-center border font-mono shadow-sm ${surface} ${BADGE_SIZE[size]} ${className}`}>
            {suffix || sku ? (
                <SkuColorizedText sku={sku || ''} suffix={suffix} gender={resolvedGender} mono />
            ) : (
                <span className="font-bold text-slate-400">BAS</span>
            )}
        </span>
    );
}
