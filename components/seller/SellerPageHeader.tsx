import React from 'react';
import { Search, X, type LucideIcon } from 'lucide-react';
import DesktopPageHeader from '../DesktopPageHeader';
import { useSellerViewport } from './sellerViewport';

interface Props {
    icon: LucideIcon;
    title: string;
    subtitle?: string;
    /** Back button or similar, before the icon. */
    leading?: React.ReactNode;
    /** Primary actions (right side). */
    actions?: React.ReactNode;
    /** Second row: search, tabs, chips. */
    below?: React.ReactNode;
}

/**
 * One header for every seller screen: the desktop app's DesktopPageHeader on wide
 * screens, a compact bar with the same brand tile on phones. Rendered outside the
 * page's scroll area so it stays put without sticky positioning.
 */
export default function SellerPageHeader({ icon: Icon, title, subtitle, leading, actions, below }: Props) {
    const { isDesktop } = useSellerViewport();

    if (isDesktop) {
        return (
            <DesktopPageHeader
                icon={Icon}
                title={title}
                subtitle={subtitle}
                leading={leading}
                tail={actions}
                below={below}
                padding="compact"
            />
        );
    }

    return (
        <header className="shrink-0 border-b border-slate-200/80 bg-white px-3 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top,0px))] min-[400px]:px-4">
            <div className="flex min-h-[2.5rem] items-center gap-2.5">
                {leading}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#1c2812] via-[#0b1204] to-[#060b00] text-amber-300 shadow-sm ring-1 ring-inset ring-white/10">
                    <Icon size={17} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[15px] font-bold leading-tight tracking-tight text-[#060b00]">{title}</h1>
                    {subtitle ? <p className="truncate text-[11px] font-semibold text-slate-500">{subtitle}</p> : null}
                </div>
                {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
            </div>
            {below ? <div className="mt-2.5">{below}</div> : null}
        </header>
    );
}

/** Compact search field shared by seller screens (matches the desktop SEARCH tokens). */
export function SellerSearchField({
    value,
    onChange,
    placeholder,
    trailing,
    autoFocus,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    trailing?: React.ReactNode;
    autoFocus?: boolean;
}) {
    return (
        <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 pl-3 transition-colors focus-within:border-slate-300 focus-within:bg-white lg:h-11 lg:bg-white lg:shadow-sm">
            <Search size={16} strokeWidth={2.25} className="shrink-0 text-slate-400" aria-hidden />
            <input
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                autoFocus={autoFocus}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-[16px] font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400 lg:text-sm [&::-webkit-search-cancel-button]:hidden"
            />
            {value ? (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Καθαρισμός αναζήτησης"
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                    <X size={14} strokeWidth={2.5} />
                </button>
            ) : null}
            {trailing}
        </div>
    );
}

/** Square icon button used in seller toolbars. */
export function SellerIconButton({
    onClick,
    label,
    active = false,
    badge,
    children,
}: {
    onClick: () => void;
    label: string;
    active?: boolean;
    badge?: number;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors active:scale-95 lg:h-11 lg:w-11 ${
                active
                    ? 'border-[#060b00] bg-[#060b00] text-amber-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
            {children}
            {badge ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-black text-[#060b00] ring-2 ring-white">
                    {badge}
                </span>
            ) : null}
        </button>
    );
}
