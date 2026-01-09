
import React from 'react';
import { APP_LOGO } from '../constants';

export interface PriceListPrintData {
    title: string;
    subtitle: string;
    date: string;
    items: { 
        skuBase: string; 
        category: string;
        priceGroups: {
            suffixes: string[];
            price: number;
        }[];
    }[];
}

interface Props {
    data: PriceListPrintData;
}

export default function PriceListPrintView({ data }: Props) {
    return (
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-inside-avoid break-inside-avoid">
            {/* HEADER */}
            <header className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6">
                <div>
                    <img src={APP_LOGO} alt="ILIOS" className="w-24 object-contain mb-2" />
                    <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight leading-none">{data.title}</h1>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm">{data.subtitle}</p>
                </div>
                <div className="text-right">
                    <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">ΗΜΕΡΟΜΗΝΙΑ</p>
                    <p className="text-slate-800 font-bold text-sm">{data.date}</p>
                    <p className="text-slate-400 text-[10px] mt-2 uppercase font-bold tracking-widest">ΣΥΝΟΛΟ ΕΙΔΩΝ</p>
                    <p className="text-slate-800 font-bold text-sm">{data.items.length}</p>
                </div>
            </header>

            {/* CONTENT - CSS COLUMNS LAYOUT */}
            <div className="text-xs" style={{ columnCount: 3, columnGap: '20px' }}>
                {data.items.map((item, idx) => (
                    <div 
                        key={idx} 
                        className="flex justify-between items-baseline py-1 px-2 border-b border-slate-100 break-inside-avoid odd:bg-slate-50 min-h-[24px]"
                    >
                        {/* SKU */}
                        <div className="text-[11px] font-black text-slate-800 mr-2 shrink-0">
                            {item.skuBase}
                        </div>

                        {/* PRICE GROUPS */}
                        <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5 text-right items-baseline flex-1">
                            {item.priceGroups.map((pg, pgIdx) => {
                                // Filter suffixes: replace empty string with bullet or similar if desired, or handle specially.
                                // If group has ONLY empty string, we just show price.
                                // If group has empty string AND others, we show bullet + others.
                                const hasBase = pg.suffixes.includes('');
                                const visibleSuffixes = pg.suffixes.filter(s => s !== '');
                                
                                return (
                                    <div key={pgIdx} className="flex items-baseline gap-1 whitespace-nowrap">
                                        {(hasBase || visibleSuffixes.length > 0) && (
                                            <span className="font-semibold text-[9px] text-slate-500 tracking-tight">
                                                {hasBase && <span className="mr-0.5">•</span>}
                                                {visibleSuffixes.map((s, i) => (
                                                    <React.Fragment key={i}>
                                                        {(i > 0 || hasBase) && <span className="text-slate-300 mx-[1px]">/</span>}
                                                        {s}
                                                    </React.Fragment>
                                                ))}
                                            </span>
                                        )}
                                        <span className="font-mono font-medium text-slate-600 text-xs">
                                            {pg.price.toFixed(2)}€
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400 font-medium">Ilios Kosmima ERP • {data.date}</p>
            </footer>
        </div>
    );
}
