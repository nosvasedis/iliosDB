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

const SECTION_TONES: Record<DetailsSectionTone, { wrap: string; iconWrap: string; icon: string; accent: string }> = {
    identity: {
        wrap: 'from-slate-50/90 to-blue-50/50 border-blue-200/70',
        iconWrap: 'bg-blue-100',
        icon: 'text-blue-600',
        accent: 'border-blue-200/60',
    },
    weight: {
        wrap: 'from-teal-50/80 to-cyan-50/40 border-teal-200/70',
        iconWrap: 'bg-teal-100',
        icon: 'text-teal-700',
        accent: 'border-teal-200/60',
    },
    commerce: {
        wrap: 'from-emerald-50/50 to-amber-50/30 border-emerald-200/70',
        iconWrap: 'bg-emerald-100',
        icon: 'text-emerald-600',
        accent: 'border-emerald-200/60',
    },
    molds: {
        wrap: 'from-amber-50/80 to-orange-50/30 border-amber-200/70',
        iconWrap: 'bg-amber-100',
        icon: 'text-amber-700',
        accent: 'border-amber-200/60',
    },
    supplier: {
        wrap: 'from-violet-50/80 to-purple-50/40 border-violet-200/70',
        iconWrap: 'bg-violet-100',
        icon: 'text-violet-600',
        accent: 'border-violet-200/60',
    },
    costing: {
        wrap: 'from-indigo-50/70 to-slate-50/40 border-indigo-200/70',
        iconWrap: 'bg-indigo-100',
        icon: 'text-indigo-600',
        accent: 'border-indigo-200/60',
    },
    analysis: {
        wrap: 'from-emerald-50/70 to-slate-50/40 border-emerald-200/70',
        iconWrap: 'bg-emerald-100',
        icon: 'text-emerald-600',
        accent: 'border-emerald-200/60',
    },
    labor: {
        wrap: 'from-orange-50/70 to-slate-50/40 border-orange-200/70',
        iconWrap: 'bg-orange-100',
        icon: 'text-orange-600',
        accent: 'border-orange-200/60',
    },
    recipe: {
        wrap: 'from-sky-50/70 to-slate-50/40 border-sky-200/70',
        iconWrap: 'bg-sky-100',
        icon: 'text-sky-600',
        accent: 'border-sky-200/60',
    },
    variants: {
        wrap: 'from-violet-50/70 to-slate-50/40 border-violet-200/70',
        iconWrap: 'bg-violet-100',
        icon: 'text-violet-600',
        accent: 'border-violet-200/60',
    },
    barcodes: {
        wrap: 'from-slate-50/90 to-slate-50/40 border-slate-200/80',
        iconWrap: 'bg-slate-100',
        icon: 'text-slate-600',
        accent: 'border-slate-200/60',
    },
    policy: {
        wrap: 'from-amber-50/70 to-slate-50/40 border-amber-200/70',
        iconWrap: 'bg-amber-100',
        icon: 'text-amber-600',
        accent: 'border-amber-200/60',
    },
};

export const detailsInputClass =
    'w-full p-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

export const detailsMonoInputClass =
    'w-full p-2.5 bg-white border border-slate-200 rounded-xl font-bold font-mono text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 transition-all';

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
        <section className={`bg-gradient-to-br ${t.wrap} p-5 rounded-2xl border shadow-sm`}>
            <div className={`flex items-center justify-between gap-3 border-b ${t.accent} pb-3 mb-4`}>
                <h4 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-xs tracking-wider">
                    <span className={`p-1.5 rounded-lg ${t.iconWrap}`}>
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
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between gap-2 mb-1.5">
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
    tone?: 'neutral' | 'danger' | 'info';
    children: React.ReactNode;
}) {
    const tones = {
        neutral: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
        danger: 'bg-red-50 text-red-600 hover:bg-red-100',
        info: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
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
