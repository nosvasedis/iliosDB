
import React from 'react';
import { APP_LOGO } from '../constants';

export interface PriceListPrintData {
    title: string;
    subtitle: string;
    date: string;
    items: { skuBase: string; suffixes: string; price: number; category: string }[];
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
                        className="flex justify-between items-start py-1 px-2 border-b border-slate-100 break-inside-avoid odd:bg-slate-50"
                    >
                        <div className="text-[11px] text-slate-800 leading-tight flex-1 pr-2 min-w-0">
                            <span className="font-black">{item.skuBase}</span>
                            {item.suffixes && (
                                <span className="font-semibold text-[9px] text-slate-500 ml-1 tracking-tight">
                                    {item.suffixes.split('/').map((s, i) => (
                                        <React.Fragment key={i}>
                                            {i > 0 && <span className="text-slate-300 mx-[1px]">/</span>}
                                            {s}
                                            {/* Allow breaking after every suffix item */}
                                            <wbr />
                                        </React.Fragment>
                                    ))}
                                </span>
                            )}
                        </div>
                        <span className="font-mono font-medium text-slate-600 text-xs whitespace-nowrap pt-0.5">{item.price.toFixed(2)}€</span>
                    </div>
                ))}
            </div>

            <footer className="mt-8 pt-4 border-t border-slate-200 text-center">
                <p className="text-[9px] text-slate-400 font-medium">Ilios Kosmima ERP • {data.date}</p>
            </footer>
        </div>
    );
}
