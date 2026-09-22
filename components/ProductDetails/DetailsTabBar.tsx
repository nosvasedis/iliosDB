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
        <div className="flex w-full gap-1 rounded-2xl bg-slate-200/60 p-1.5">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                            isActive ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <tab.icon size={16} className={isActive ? 'text-amber-500' : ''} />
                        <span className="truncate">{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${isActive ? 'bg-amber-50 text-amber-700' : 'bg-white/70 text-slate-500'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
