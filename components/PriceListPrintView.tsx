
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
            <header className="flex justify-between items-center border-b-2 border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-4 max-w-[75%]">
                    <img src={APP_LOGO} alt="ILIOS" className="w-16 object-contain" />
                    <h1 className="text-base font-black text-slate-800 uppercase tracking-tight leading-tight">{data.title}</h1>
                </div>
                <div className="text-right flex-shrink-0 flex gap-6">
                    <div>
                        <p className="text-slate-400 text-[8px] uppercase font-bold tracking-widest">ΗΜΕΡΟΜΗΝΙΑ</p>
                        <p className="text-slate-800 font-bold text-xs">{data.date}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-[8px] uppercase font-bold tracking-widest">ΣΥΝΟΛΟ</p>
                        <p className="text-slate-800 font-bold text-xs">{data.items.length} είδη</p>
                    </div>
                </div>
            </header>

            {/* CONTENT - CSS COLUMNS LAYOUT */}
            <div className="text-xs" style={{ columnCount: 3, columnGap: '20px' }}>
                {data.items.map((item, idx) => {
                    const isSinglePrice = item.priceGroups.length === 1;
                    
                    return (
                        <div 
                            key={idx} 
                            className="flex justify-between items-baseline py-1 px-1 border-b border-slate-100 break-inside-avoid odd:bg-slate-50 min-h-[20px]"
                        >
                            {/* SKU - Shrink to fit but visible */}
                            <div className="text-[11px] font-black text-slate-800 mr-1 shrink-0">
                                {item.skuBase}
                            </div>

                            {/* PRICE GROUPS */}
                            <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-right items-baseline flex-1">
                                {isSinglePrice ? (
                                    // If all variants have the same price, hide suffixes to save space/avoid clutter
                                    <span className="font-mono font-bold text-slate-700 text-[11px] whitespace-nowrap">
                                        {item.priceGroups[0].price.toFixed(2)}€
                                    </span>
                                ) : (
                                    item.priceGroups.map((pg, pgIdx) => {
                                        // Filter suffixes
                                        const hasBase = pg.suffixes.includes('');
                                        const visibleSuffixes = pg.suffixes.filter(s => s !== '');
                                        
                                        return (
                                            <div key={pgIdx} className="inline-flex flex-wrap justify-end items-baseline gap-x-1 gap-y-0 max-w-full">
                                                {(hasBase || visibleSuffixes.length > 0) && (
                                                    <span className="font-semibold text-[8px] text-slate-500 tracking-tight leading-none text-right break-words">
                                                        {hasBase && <span className="mr-0.5">•</span>}
                                                        {visibleSuffixes.map((s, i) => (
                                                            <React.Fragment key={i}>
                                                                {(i > 0 || hasBase) && <span className="text-slate-300 mx-[1px]">/</span>}
                                                                {s}
                                                                {/* Soft break opportunity after slash */}
                                                                <wbr />
                                                            </React.Fragment>
                                                        ))}
                                                    </span>
                                                )}
                                                <span className="font-mono font-bold text-slate-700 text-[11px] whitespace-nowrap">
                                                    {pg.price.toFixed(2)}€
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400 font-medium">Ilios Kosmima ERP • {data.date}</p>
            </footer>
        </div>
    );
}
