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
    identity: { iconWrap: 'bg-blue-50', icon: 'text-blue-600' },
    weight: { iconWrap: 'bg-teal-50', icon: 'text-teal-700' },
    commerce: { iconWrap: 'bg-emerald-50', icon: 'text-emerald-600' },
    molds: { iconWrap: 'bg-amber-50', icon: 'text-amber-700' },
    supplier: { iconWrap: 'bg-violet-50', icon: 'text-violet-600' },
    costing: { iconWrap: 'bg-indigo-50', icon: 'text-indigo-600' },
    analysis: { iconWrap: 'bg-emerald-50', icon: 'text-emerald-600' },
    labor: { iconWrap: 'bg-orange-50', icon: 'text-orange-600' },
    recipe: { iconWrap: 'bg-sky-50', icon: 'text-sky-600' },
    variants: { iconWrap: 'bg-violet-50', icon: 'text-violet-600' },
    barcodes: { iconWrap: 'bg-slate-100', icon: 'text-slate-600' },
    policy: { iconWrap: 'bg-amber-50', icon: 'text-amber-600' },
};

export const detailsInputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50/60 p-2 text-sm font-medium text-slate-700 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10';

export const detailsMonoInputClass =
    'w-full rounded-lg border border-slate-200 bg-slate-50/60 p-2 font-mono text-sm font-bold text-slate-700 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10';

export function DetailsSection({
    tone,
    icon: Icon,
    title,
    actions,
    children,
}: {
    tone: DetailsSectionTone;
    icon: LucideIcon;
    title: React.ReactNode;
    actions?: React.ReactNode;
    children: React.ReactNode;
}) {
    const t = SECTION_TONES[tone];
    return (
        <section className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5">
                <h4 className="flex items-center gap-2 text-[13px] font-semibold text-slate-800">
                    <span className={`rounded-md p-1 ${t.iconWrap}`}>
                        <Icon size={13} className={t.icon} />
                    </span>
                    {title}
                </h4>
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
            <label className="mb-1 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
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

export function DetailsActionButton({
    title,
    onClick,
    disabled,
    tone = 'neutral',
    children,
}: {
    title: string;
    onClick: () => void;
    disabled?: boolean;
    tone?: 'neutral' | 'danger' | 'info' | 'violet' | 'success';
    children: React.ReactNode;
}) {
    const tones = {
        neutral: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
        danger: 'bg-red-50 text-red-600 hover:bg-red-100',
        info: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
        violet: 'bg-violet-50 text-violet-600 hover:bg-violet-100',
        success: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
    };
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={`relative group p-2.5 rounded-xl transition-colors disabled:opacity-50 ${tones[tone]}`}
        >
            {children}
            <span className="pointer-events-none absolute -bottom-8 right-0 z-20 w-max rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {title}
            </span>
        </button>
    );
}

export function DetailsSubTabs<T extends string>({
    tabs,
    active,
    onChange,
}: {
    tabs: { id: T; label: string; icon?: LucideIcon }[];
    active: T;
    onChange: (id: T) => void;
}) {
    return (
        <div className="flex w-full gap-1 rounded-xl bg-slate-100 p-1">
            {tabs.map((tab) => {
                const isActive = active === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                            isActive ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {Icon ? <Icon size={14} className={isActive ? 'text-amber-500' : ''} /> : null}
                        <span className="truncate">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
