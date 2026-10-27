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

type ButtonVariant = 'primary' | 'success' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
    'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 disabled:pointer-events-none disabled:opacity-50';

const BUTTON_SIZES: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-9 px-3.5 text-[13px]',
    lg: 'h-10 px-5 text-sm',
};

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: 'bg-slate-900 text-white shadow-sm hover:bg-slate-800 active:bg-black',
    success: 'bg-emerald-600 text-white shadow-sm shadow-emerald-700/20 hover:bg-emerald-700 active:bg-emerald-800',
    secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm shadow-slate-200/60 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100',
    subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 active:bg-slate-200',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200/70',
    danger: 'text-rose-600 hover:bg-rose-50 hover:text-rose-700 active:bg-rose-100',
};

/** Selected look for toggle buttons (`pressed`), shared by every variant. */
const BUTTON_PRESSED = 'border border-sky-200 bg-sky-50 text-sky-800 shadow-none hover:border-sky-300 hover:bg-sky-100/70 hover:text-sky-900';

export function DetailsButton({
    variant = 'secondary',
    size = 'sm',
    icon: Icon,
    pressed,
    className = '',
    children,
    type = 'button',
    ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: LucideIcon;
    /** Renders as a toggle (aria-pressed) with the shared selected style when true. */
    pressed?: boolean;
    children?: React.ReactNode;
}) {
    const iconSize = size === 'lg' ? 16 : size === 'md' ? 15 : 14;
    return (
        <button
            type={type}
            {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
            className={`${BUTTON_BASE} ${BUTTON_SIZES[size]} ${pressed ? BUTTON_PRESSED : BUTTON_VARIANTS[variant]} ${className}`}
            {...rest}
        >
            {Icon ? <Icon size={iconSize} className="shrink-0" /> : null}
            {children}
        </button>
    );
}

const ICON_BUTTON_SIZES: Record<'sm' | 'md', string> = { sm: 'h-7 w-7', md: 'h-9 w-9' };

export function DetailsIconButton({
    icon: Icon,
    label,
    variant = 'ghost',
    size = 'sm',
    active,
    className = '',
    ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    icon: LucideIcon;
    /** Accessible name and tooltip. */
    label: string;
    variant?: 'ghost' | 'danger' | 'subtle';
    size?: 'sm' | 'md';
    active?: boolean;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            className={`${BUTTON_BASE} ${ICON_BUTTON_SIZES[size]} ${active ? 'bg-emerald-50 text-emerald-700' : variant === 'danger' ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100' : BUTTON_VARIANTS[variant]} ${className}`}
            {...rest}
        >
            <Icon size={size === 'md' ? 18 : 15} />
        </button>
    );
}

/** On/off switch with a visible label (used for flags such as "Χωρίς χύτευση"). */
export function DetailsSwitch({
    checked,
    onChange,
    label,
    tone = 'violet',
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    tone?: 'violet' | 'emerald';
}) {
    const on = tone === 'violet' ? 'bg-violet-600' : 'bg-emerald-600';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={`inline-flex h-8 select-none items-center gap-2 rounded-lg px-2 text-xs font-semibold normal-case tracking-normal transition-colors ${checked ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'} hover:bg-slate-100/80`}
        >
            <span className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors duration-200 ${checked ? on : 'bg-slate-300'}`}>
                <span className={`h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[15px]' : 'translate-x-0.5'}`} />
            </span>
            {label}
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
        <div role="tablist" className="inline-flex w-full gap-1 rounded-xl bg-slate-200/60 p-1 sm:w-auto">
            {tabs.map((tab) => {
                const isActive = active === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={`flex h-8 min-w-0 flex-1 select-none items-center justify-center gap-1.5 rounded-lg px-4 text-xs font-semibold transition-all duration-150 sm:flex-none ${
                            isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5' : 'text-slate-500 hover:bg-white/50 hover:text-slate-800'
                        }`}
                    >
                        {Icon ? <Icon size={14} className={isActive ? 'text-sky-600' : 'text-slate-400'} /> : null}
                        <span className="truncate">{tab.label}</span>
                        {tab.hint ? <span className={`font-mono text-[10px] ${isActive ? 'text-sky-500' : 'text-slate-400'}`}>{tab.hint}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}
