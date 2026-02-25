
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

              .price-list-columns {
                column-count: 3;
                column-gap: 18px;
                column-fill: auto;
                /* Thicker divider between the 3 main columns */
                column-rule: 6px solid #000000;
                /* Fixed printable height so columns fill top-to-bottom first */
                height: 248mm;
              }
            `}
            </style>

            {/* HEADER changed to DIV */}
            <div className="flex justify-between items-center border-b-2 border-slate-800 pb-4 mb-5">
                <div className="flex items-center gap-4 max-w-[70%]">
                    <img src={APP_LOGO} alt="ILIOS" className="w-20 object-contain" />
                    <div>
                        <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-tight">{data.title}</h1>
                        {/* Secondary Title Line for Collections */}
                        {data.collectionNames && (
                            <p className="text-xs text-slate-500 font-medium mt-1 leading-tight italic">
                                {data.collectionNames}
                            </p>
                        )}
                    </div>
                </div>
                <div className="text-right flex-shrink-0 flex gap-6 items-center">
                    {/* Tiny Title for Filters/Exclusions */}
                    {data.filtersInfo && (
                        <div className="px-3 py-1.5 rounded bg-rose-50 border border-rose-100 text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                            {data.filtersInfo}
                        </div>
                    )}
                    <div>
                        <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">ΗΜΕΡΟΜΗΝΙΑ</p>
                        <p className="text-slate-800 font-bold text-sm">{data.date}</p>
                    </div>
                    <div>
                        <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">ΣΥΝΟΛΟ</p>
                        <p className="text-slate-800 font-bold text-sm">{data.items.length} είδη</p>
                    </div>
                </div>
            </div>

            {/* CONTENT - CSS COLUMNS LAYOUT */}
            <div className="price-list-columns text-base">
                {data.items.map((item, idx) => {
                    const isSinglePrice = item.priceGroups.length === 1;
                    
                    return (
                        <div 
                            key={idx} 
                            className="flex items-stretch py-1.5 px-1.5 border-b-[3px] border-black break-inside-avoid odd:bg-slate-50 min-h-[28px]"
                            style={{ breakInside: 'avoid-column' }}
                        >
                            {/* SKU - Shrink to fit but visible */}
                            <div className="text-[13px] font-black text-slate-800 flex-1 min-w-0 flex items-baseline gap-1 pr-1 whitespace-nowrap">
                                <span className="truncate">{item.skuBase}</span>
                                {/* Discreet Collection Indicator */}
                                {item.collectionTag && (
                                    <span className="text-[9px] font-bold text-slate-400 border border-slate-200 px-[3px] rounded-[2px] -translate-y-[1px] inline-block leading-none">
                                        {item.collectionTag}
                                    </span>
                                )}
                            </div>

                            {/* Consistent full-height separator */}
                            <div className="w-0 self-stretch border-l border-black mx-1" aria-hidden="true" />

                            {/* PRICE GROUPS */}
                            <div className="w-[60%] min-w-0 pl-1 text-right overflow-hidden">
                                {isSinglePrice ? (
                                    // If all variants have the same price, hide suffixes to save space/avoid clutter
                                    <span className="font-mono font-bold text-slate-700 text-[14px] whitespace-nowrap">
                                        {item.priceGroups[0].price.toFixed(2)}€
                                    </span>
                                ) : (
                                    <div className="flex flex-wrap justify-end items-start gap-x-1.5 gap-y-1 leading-tight w-full">
                                        {item.priceGroups.map((pg, pgIdx) => {
                                            // Filter suffixes
                                            const hasBase = pg.suffixes.includes('');
                                            const visibleSuffixes = pg.suffixes.filter(s => s !== '');
                                            const isLongSuffixGroup =
                                                visibleSuffixes.length >= 5 ||
                                                visibleSuffixes.join('/').length >= 16;
                                            
                                            return (
                                                <div
                                                    key={pgIdx}
                                                    className={`flex flex-col items-end min-w-0 max-w-full ${isLongSuffixGroup ? 'basis-full' : 'basis-[48%]'}`}
                                                >
                                                    {(hasBase || visibleSuffixes.length > 0) && (
                                                        <span className="font-semibold text-[10px] text-slate-500 tracking-tight leading-tight text-right break-normal min-w-0">
                                                            {hasBase && (
                                                                <>
                                                                    <span className="whitespace-nowrap">•</span>
                                                                </>
                                                            )}
                                                            {visibleSuffixes.map((s, i) => (
                                                                <React.Fragment key={i}>
                                                                    {(i > 0 || hasBase) && (
                                                                        <>
                                                                            <span className="text-slate-300 mx-[1px]">/</span>
                                                                            <wbr />
                                                                        </>
                                                                    )}
                                                                    <span className="whitespace-nowrap">{s}</span>
                                                                </React.Fragment>
                                                            ))}
                                                        </span>
                                                    )}
                                                    <span className="font-mono font-bold text-slate-700 text-[14px] whitespace-nowrap mt-0.5">
                                                        {pg.price.toFixed(2)}€
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
