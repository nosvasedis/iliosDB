
import React, { useState } from 'react';
import { Camera, Copy, Trash2, Check, Printer, Tag, ShoppingBag, ArrowLeft } from 'lucide-react';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { findProductByScannedCode } from '../../utils/pricingEngine';
import BarcodeView from '../BarcodeView';
import { Product, ProductVariant } from '../../types';

interface QueueItem {
    skuString: string;
    product: Product;
    variant?: ProductVariant;
    qty: number;
}

export default function MobileBatchPrint() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
    
    const { showToast } = useUI();
    
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'preview'>('list');
    const [printFormat, setPrintFormat] = useState<'standard' | 'retail'>('standard');

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        
        if (match) {
            const skuString = match.product.sku + (match.variant?.suffix || '');
            setQueue(prev => [...prev, {
                skuString,
                product: match.product,
                variant: match.variant,
                qty: 1
            }]);
            showToast(`Προστέθηκε: ${skuString}`, 'success');
        } else {
            showToast(`Άγνωστος κωδικός: ${code}`, 'error');
        }
    };

    const clearQueue = () => {
        setQueue([]);
        showToast("Η λίστα καθαρίστηκε.", "info");
    };

    const handlePrint = () => {
        window.print();
    };

    // If in preview mode, render the print view
    if (viewMode === 'preview' && settings) {
        return (
            <div className="bg-white min-h-screen relative">
                {/* Controls - Hidden during print */}
                <div className="print:hidden fixed top-0 left-0 right-0 bg-white border-b border-slate-200 p-4 z-50 flex justify-between items-center shadow-sm">
                    <button onClick={() => setViewMode('list')} className="flex items-center gap-2 text-slate-600 font-bold">
                        <ArrowLeft size={20}/> Πίσω
                    </button>
                    <button onClick={handlePrint} className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 shadow-lg">
                        <Printer size={18}/> Εκτύπωση
                    </button>
                </div>

                {/* Printable Area */}
                <div className="pt-20 pb-10 px-4 print:p-0 print:m-0">
                    <div className="print-area flex flex-wrap content-start">
                        {queue.map((item, idx) => (
                            <div key={idx} className="mb-4 print:mb-0">
                                <BarcodeView 
                                    product={item.product}
                                    variant={item.variant}
                                    width={printFormat === 'retail' ? (settings.retail_barcode_width_mm || 72) : settings.barcode_width_mm} 
                                    height={printFormat === 'retail' ? (settings.retail_barcode_height_mm || 10) : settings.barcode_height_mm} 
                                    format={printFormat}
                                />
                            </div>
                        ))}
                    </div>
                </div>
                
                <style>{`
                    @media print {
                        @page { size: auto; margin: 0; }
                        body { background: white; }
                        .print-area { display: flex; flex-wrap: wrap; }
                        .print\\:hidden { display: none !important; }
                    }
                `}</style>
            </div>
        );
    }

    // Default List View
    return (
        <div className="p-4 h-full flex flex-col">
            <h1 className="text-2xl font-black text-slate-900 mb-4">Εκτυπώσεις</h1>
            
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 mb-6">
                <button 
                    onClick={() => setShowScanner(true)}
                    className="w-16 h-16 bg-slate-900 text-white rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-transform"
                >
                    <Camera size={32}/>
                </button>
                <p className="text-sm font-bold text-slate-500">Σάρωση για προσθήκη</p>
            </div>

            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setPrintFormat('standard')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${printFormat === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                        <Tag size={14}/> Χονδρ.
                    </button>
                    <button 
                        onClick={() => setPrintFormat('retail')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${printFormat === 'retail' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                    >
                        <ShoppingBag size={14}/> Λιαν.
                    </button>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={clearQueue} disabled={queue.length===0} className="p-2 bg-red-50 text-red-600 rounded-lg disabled:opacity-50"><Trash2 size={18}/></button>
                </div>
            </div>

            <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 overflow-y-auto shadow-inner custom-scrollbar mb-4">
                {queue.length > 0 ? (
                    <div className="space-y-2">
                        {queue.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center border-b border-slate-50 pb-2 last:border-0">
                                <span className="font-mono font-bold text-slate-800">{item.skuString}</span>
                                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded">x{item.qty}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center text-slate-400 italic mt-10">Η λίστα είναι κενή.</div>
                )}
            </div>
            
            <button 
                onClick={() => setViewMode('preview')}
                disabled={queue.length === 0}
                className="w-full bg-[#060b00] text-white py-4 rounded-2xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
                <Printer size={20}/> Προεπισκόπηση & Εκτύπωση
            </button>

            {showScanner && (
                <BarcodeScanner 
                    onScan={handleScan} 
                    onClose={() => setShowScanner(false)} 
                    continuous={true}
                />
            )}
        </div>
    );
}
