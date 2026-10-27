import React from 'react';
import { LucideIcon } from 'lucide-react';

export type DetailsSectionTone =
    | 'identity'
    | 'weight'
    | 'commerce'
    | 'molds'
    | 'supplier'
    | 'costing'
    | 'analysis'
    | 'labor'
    | 'recipe'
    | 'variants'
    | 'barcodes'
    | 'policy';

const SECTION_TONES: Record<DetailsSectionTone, { iconWrap: string; icon: string }> = {
    identity: { iconWrap: 'bg-blue-50 ring-blue-100', icon: 'text-blue-600' },
    weight: { iconWrap: 'bg-teal-50 ring-teal-100', icon: 'text-teal-700' },
    commerce: { iconWrap: 'bg-emerald-50 ring-emerald-100', icon: 'text-emerald-600' },
    molds: { iconWrap: 'bg-amber-50 ring-amber-100', icon: 'text-amber-700' },
    supplier: { iconWrap: 'bg-violet-50 ring-violet-100', icon: 'text-violet-600' },
    costing: { iconWrap: 'bg-indigo-50 ring-indigo-100', icon: 'text-indigo-600' },
    analysis: { iconWrap: 'bg-emerald-50 ring-emerald-100', icon: 'text-emerald-600' },
    labor: { iconWrap: 'bg-orange-50 ring-orange-100', icon: 'text-orange-600' },
    recipe: { iconWrap: 'bg-sky-50 ring-sky-100', icon: 'text-sky-600' },
    variants: { iconWrap: 'bg-violet-50 ring-violet-100', icon: 'text-violet-600' },
    barcodes: { iconWrap: 'bg-slate-100 ring-slate-200', icon: 'text-slate-600' },
    policy: { iconWrap: 'bg-amber-50 ring-amber-100', icon: 'text-amber-600' },
};

export const detailsInputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 shadow-sm shadow-slate-100 outline-none transition-all hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-400';

export const detailsMonoInputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-sm font-bold text-slate-800 shadow-sm shadow-slate-100 outline-none transition-all hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 disabled:bg-slate-100 disabled:text-slate-400';

/** Shared margin thresholds for every SKU-card readout (KPI strip, variants table, policy). */
export function getMarginTone(margin: number) {
    if (margin >= 40) return { text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-500', ring: 'ring-emerald-200' };
    if (margin >= 20) return { text: 'text-amber-700', bg: 'bg-amber-50', bar: 'bg-amber-500', ring: 'ring-amber-200' };
    return { text: 'text-rose-700', bg: 'bg-rose-50', bar: 'bg-rose-500', ring: 'ring-rose-200' };
}

export function DetailsSection({
    tone,
    icon: Icon,
    title,
    subtitle,
    actions,
    className = '',
    children,
}: {
    tone: DetailsSectionTone;
    icon: LucideIcon;
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    const t = SECTION_TONES[tone];
    return (
        <section data-tone={tone} className={`sku-section rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
            <div className="sku-section-heading mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`shrink-0 rounded-lg p-1.5 ring-1 ${t.iconWrap}`}>
                        <Icon size={15} className={t.icon} />
                    </span>
                    <div className="min-w-0">
                        <h4 className="text-[13px] font-bold uppercase tracking-wide">{title}</h4>
                        {subtitle ? <p className="truncate text-[11px] font-medium normal-case text-slate-500">{subtitle}</p> : null}
                    </div>
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}

export function DetailsField({
    label,
    icon: Icon,
    action,
    className = '',
    children,
}: {
    label: React.ReactNode;
    icon?: LucideIcon;
    action?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={className}>
            <label className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span className="flex items-center gap-1.5">
                    {Icon ? <Icon size={11} className="text-slate-400" /> : null}
                    {label}
                </span>
                {action}
            </label>
            {children}
        </div>
    );
}

/** Read-only key/value row used in the sidebar record facts. */
export function DetailsFact({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 py-2 text-xs">
            <dt className="shrink-0 font-medium text-slate-500">{label}</dt>
            <dd className="min-w-0 text-right font-semibold text-slate-800">{children}</dd>
        </div>
    );
}

export function DetailsActionButton({
    title,
    onClick,
    disabled,
    tone = 'neutral',
    label,
    children,
}: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
    tone?: 'neutral' | 'danger' | 'info' | 'violet' | 'success';
    /** Visible text shown next to the icon on wide screens. */
    label?: string;
    children: React.ReactNode;
}) {
    const tones = {
        neutral: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        danger: 'text-rose-600 hover:bg-rose-50',
        info: 'text-blue-600 hover:bg-blue-50',
        violet: 'text-violet-600 hover:bg-violet-50',
        success: 'text-emerald-600 hover:bg-emerald-50',
    };
    return (
        <button
            type="button"
            title={title}
            aria-label={title}
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${tones[tone]}`}
        >
            {children}
            {label ? <span className="hidden xl:inline">{label}</span> : null}
        </button>
    );
}

export function DetailsSubTabs<T extends string>({
    tabs,
    active,
    onChange,
}: {
    tabs: { id: T; label: string; icon?: LucideIcon; hint?: string }[];
    active: T;
    onChange: (id: T) => void;
}) {
    return (
        <div className="inline-flex w-full gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 sm:w-auto">
            {tabs.map((tab) => {
                const isActive = active === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        aria-pressed={isActive}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all sm:flex-none ${
                            isActive ? 'bg-white text-sky-800 shadow-sm ring-1 ring-slate-200/60' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {Icon ? <Icon size={14} className={isActive ? 'text-sky-600' : ''} /> : null}
                        <span className="truncate">{tab.label}</span>
                        {tab.hint ? <span className={`font-mono text-[10px] ${isActive ? 'text-sky-500' : 'text-slate-400'}`}>{tab.hint}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}
