
import React from 'react';
import { APP_LOGO } from '../constants';

export interface PriceListPrintData {
    title: string;
    subtitle: string;
    collectionNames?: string; // Comma-separated collection names
    filtersInfo?: string;     // New field: e.g. "ΕΚΤΟΣ ΣΥΛΛΟΓΩΝ"
    date: string;
    items: { 
        skuBase: string; 
        category: string;
        collectionTag?: string; // Discreet indicator
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
        <div className="bg-white text-slate-900 font-sans w-[210mm] mx-auto shadow-lg p-8 print:p-0 print:shadow-none print:w-full relative">
            <style>
            {`
              @page {
                size: A4;
                /* Margins define the printable area */
                margin: 10mm 10mm 15mm 10mm; 
                counter-increment: page;
                
                @bottom-right {
                    content: counter(page);
                    font-size: 9pt;
                    color: #64748b;
                }
              }
              
              html, body {
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: visible !important;
              }
            `}
            </style>

            {/* HEADER changed to DIV */}
            <div className="flex justify-between items-center border-b-2 border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-4 max-w-[70%]">
                    <img src={APP_LOGO} alt="ILIOS" className="w-16 object-contain" />
                    <div>
                        <h1 className="text-base font-black text-slate-800 uppercase tracking-tight leading-tight">{data.title}</h1>
                        {/* Secondary Title Line for Collections */}
                        {data.collectionNames && (
                            <p className="text-[9px] text-slate-500 font-medium mt-0.5 leading-tight italic">
                                {data.collectionNames}
                            </p>
                        )}
                    </div>
                </div>
                <div className="text-right flex-shrink-0 flex gap-6 items-center">
                    {/* Tiny Title for Filters/Exclusions */}
                    {data.filtersInfo && (
                        <div className="px-2 py-1 rounded bg-rose-50 border border-rose-100 text-[8px] font-bold text-rose-600 uppercase tracking-wider">
                            {data.filtersInfo}
                        </div>
                    )}
                    <div>
                        <p className="text-slate-400 text-[8px] uppercase font-bold tracking-widest">ΗΜΕΡΟΜΗΝΙΑ</p>
                        <p className="text-slate-800 font-bold text-xs">{data.date}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-[8px] uppercase font-bold tracking-widest">ΣΥΝΟΛΟ</p>
                        <p className="text-slate-800 font-bold text-xs">{data.items.length} είδη</p>
                    </div>
                </div>
            </div>

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
                            <div className="text-[11px] font-black text-slate-800 mr-1 shrink-0 flex items-baseline gap-1">
                                {item.skuBase}
                                {/* Discreet Collection Indicator */}
                                {item.collectionTag && (
                                    <span className="text-[6px] font-bold text-slate-400 border border-slate-200 px-[2px] rounded-[2px] -translate-y-[1px] inline-block leading-none">
                                        {item.collectionTag}
                                    </span>
                                )}
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
        </div>
    );
}
