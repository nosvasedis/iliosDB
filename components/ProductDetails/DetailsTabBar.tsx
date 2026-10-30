import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface DetailsTab {
    id: 'overview' | 'production' | 'variants' | 'linked' | 'barcodes';
    label: string;
    icon: LucideIcon;
    count?: number;
}

export default function DetailsTabBar({
    tabs,
    activeTab,
    onChange,
}: {
    tabs: DetailsTab[];
    activeTab: DetailsTab['id'];
    onChange: (id: DetailsTab['id']) => void;
}) {
    return (
        // overflow-y must be hidden explicitly: overflow-x:auto alone makes the browser
        // add a vertical scroll gutter for the 2px active indicator.
        <nav role="tablist" aria-label="Ενότητες καρτέλας SKU" className="sku-no-scrollbar flex w-full items-stretch gap-1 overflow-x-auto overflow-y-hidden">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={`group relative flex h-12 shrink-0 select-none items-center gap-2 px-3.5 text-[13px] font-semibold transition-colors duration-150 ${
                            isActive ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <tab.icon size={15} className={`transition-colors ${isActive ? 'text-sky-600' : 'text-slate-400 group-hover:text-slate-500'}`} />
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className={`min-w-[1.25rem] rounded-full px-1.5 py-px text-center text-[10px] font-bold tabular-nums transition-colors ${isActive ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'}`}>
                                {formatNumber(tab.count)}
                            </span>
                        )}
                        <span
                            aria-hidden="true"
                            className={`absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-all duration-200 ${isActive ? 'bg-sky-600 opacity-100' : 'bg-slate-300 opacity-0 group-hover:opacity-100'}`}
                        />
                    </button>
                );
            })}
        </nav>
    );
}
