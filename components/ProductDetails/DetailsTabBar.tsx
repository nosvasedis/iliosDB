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
        <div className="flex w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onChange(tab.id)}
                        aria-pressed={isActive}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition-all ${
                            isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        <tab.icon size={16} className={isActive ? 'text-sky-300' : ''} />
                        <span className="truncate">{tab.label}</span>
                        {typeof tab.count === 'number' && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${isActive ? 'bg-white/15 text-white' : 'bg-white/70 text-slate-500'}`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
