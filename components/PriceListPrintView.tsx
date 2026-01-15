
import React from 'react';
import { APP_LOGO } from '../constants';

export interface PriceListPrintData {
    title: string;
    subtitle: string;
    collectionNames?: string; // New field for comma-separated collection names
    date: string;
    items: { 
        skuBase: string; 
        category: string;
        collectionTag?: string; // New field for the discreet indicator
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
        <div className="bg-white text-slate-900 font-sans w-[210mm] min-h-[297mm] p-8 mx-auto shadow-lg print:shadow-none print:p-8 page-break-inside-avoid break-inside-avoid relative">
            <style>
            {`
              @page {
                size: A4;
                margin: 10mm;
                counter-increment: page;
                
                @bottom-right {
                    content: counter(page);
                    font-size: 9pt;
                    color: #64748b;
                }
              }
              
              /* Fixed Footer for browsers that support it (like Chrome) */
              .fixed-footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 30px;
                background: white;
                border-top: 1px solid #e2e8f0;
                padding-top: 4px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 9px;
                color: #64748b;
                z-index: 1000;
              }
              
              /* Padding to prevent content overlap with footer */
              body {
                padding-bottom: 30px;
              }
              
              /* Attempt to show page number via CSS counter (Standard) */
              .page-number::after {
                content: "Σελίδα " counter(page);
              }
            `}
            </style>

            {/* HEADER */}
            <header className="flex justify-between items-center border-b-2 border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-4 max-w-[75%]">
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

            {/* FIXED FOOTER WITH PAGE NUMBER */}
            <div className="fixed-footer print:flex hidden">
                <span className="font-bold">Ilios Kosmima ERP</span>
                <span className="page-number"></span>
            </div>
        </div>
    );
}
