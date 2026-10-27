import { formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface DetailsTab {
    id: 'overview' | 'production' | 'variants' | 'barcodes';
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
        <nav role="tablist" aria-label="Ενότητες καρτέλας SKU" className="flex w-full gap-1 overflow-x-auto border-b border-slate-200">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onChange(tab.id)}
                        className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${
                            isActive
                                ? 'border-slate-900 text-slate-900'
                                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
                        }`}
                    >
                        <tab.icon size={15} className={isActive ? 'text-sky-600' : 'text-slate-400'} />
                        <span>{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black tabular-nums ${isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {formatNumber(tab.count)}
                            </span>
                        )}
                    </button>
                );
            })}
        </nav>
    );
}
