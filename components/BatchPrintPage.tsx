import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Printer, Loader2, FileText, Check, AlertCircle } from 'lucide-react';
import { useUI } from './UIProvider';

interface Props {
    allProducts: Product[];
    setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
}

export default function BatchPrintPage({ allProducts, setPrintItems }: Props) {
    const [skusText, setSkusText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItems, setFoundItems] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    const { showToast } = useUI();
    
    const handlePrint = () => {
        setIsProcessing(true);
        setFoundItems(0);
        setNotFoundItems([]);

        // Strict parsing to handle tabs, weird spaces, etc.
        const lines = skusText.split(/\r?\n/).filter(line => line.trim() !== '');
        const itemsToPrint: { product: Product; variant?: ProductVariant; quantity: number }[] = [];
        const notFound: string[] = [];

        for (const line of lines) {
            // Remove any non-standard invisible chars but keep spaces
            const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").trim();
            // Split by one or more whitespace characters
            const parts = cleanLine.split(/\s+/);
            
            if (parts.length === 0) continue;

            const rawSku = parts[0].toUpperCase();
            // Parse quantity safely
            const quantityStr = parts.length > 1 ? parts[1] : '1';
            const quantity = parseInt(quantityStr.replace(/[^0-9]/g, ''), 10);
            
            if (isNaN(quantity) || quantity <= 0) continue;

            let found = false;
            // Search for a perfect variant match first (SKU+Suffix)
            for (const p of allProducts) {
                if (p.variants) {
                    for (const v of p.variants) {
                        if (`${p.sku}${v.suffix}` === rawSku) {
                            itemsToPrint.push({ product: p, variant: v, quantity });
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }

            // If not found as a variant, search for a master SKU match
            if (!found) {
                const product = allProducts.find(p => p.sku === rawSku);
                if (product) {
                    itemsToPrint.push({ product, quantity });
                    found = true;
                }
            }

            if (!found) {
                notFound.push(rawSku);
            }
        }
        
        setTimeout(() => {
            if (itemsToPrint.length > 0) {
                setPrintItems(itemsToPrint);
                showToast(`Στάλθηκαν ${itemsToPrint.reduce((a,b)=>a+b.quantity,0)} ετικέτες για εκτύπωση.`, 'success');
            } else {
                showToast("Δεν βρέθηκαν έγκυροι κωδικοί.", 'error');
            }
            setFoundItems(itemsToPrint.reduce((acc, item) => acc + item.quantity, 0));
            setNotFoundItems(notFound);
            setIsProcessing(false);
        }, 500);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                 <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-slate-200 text-slate-700 rounded-xl"><Printer size={24} /></div>
                    Μαζική Εκτύπωση Ετικετών
                </h1>
                <p className="text-slate-500 mt-2 ml-14">Εισάγετε λίστα κωδικών για γρήγορη εκτύπωση.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="font-bold text-slate-800 mb-2">Εισαγωγή Κωδικών</h2>
                    <p className="text-sm text-slate-500 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                        Μορφή: <strong>SKU ΠΟΣΟΤΗΤΑ</strong> (ένα ανά γραμμή)<br/>
                        π.χ. <code>XR2020 5</code> ή <code>DA1005X 10</code>
                    </p>

                    <textarea
                        value={skusText}
                        onChange={(e) => setSkusText(e.target.value)}
                        rows={12}
                        className="w-full p-4 border border-slate-200 rounded-xl font-mono text-sm bg-slate-50 text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400"
                        placeholder={`XR2020PKR 5\nDA1005X 10\nSTX-505 20`}
                    />
                    
                    <button 
                        onClick={handlePrint}
                        disabled={isProcessing || !skusText.trim()}
                        className="mt-4 w-full bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all hover:shadow-lg disabled:opacity-50 hover:-translate-y-0.5"
                    >
                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
                        {isProcessing ? 'Επεξεργασία...' : 'Εκτύπωση Ετικετών'}
                    </button>
                </div>

                <div className="md:col-span-1 space-y-6">
                     {(foundItems > 0 || notFoundItems.length > 0) ? (
                         <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 animate-in slide-in-from-right duration-300">
                            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2"><FileText size={18} /> Αποτέλεσμα</h2>
                            <div className="space-y-4">
                                {foundItems > 0 && (
                                    <div className="flex items-start gap-3 text-emerald-700 bg-emerald-50 p-4 rounded-2xl">
                                        <div className="bg-emerald-200 p-1 rounded-full"><Check size={14} /></div>
                                        <div>
                                            <p className="font-bold text-lg">{foundItems}</p>
                                            <p className="text-xs font-medium opacity-80">ετικέτες προς εκτύπωση</p>
                                        </div>
                                    </div>
                                )}
                                {notFoundItems.length > 0 && (
                                    <div className="text-rose-700 bg-rose-50 p-4 rounded-2xl">
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertCircle size={16}/>
                                            <span className="font-bold text-sm">Δεν βρέθηκαν ({notFoundItems.length})</span>
                                        </div>
                                        <ul className="list-disc list-inside text-xs font-mono opacity-80 max-h-40 overflow-y-auto">
                                            {notFoundItems.map(sku => <li key={sku}>{sku}</li>)}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        </div>
                     ) : (
                         <div className="bg-slate-50 p-6 rounded-3xl border border-dashed border-slate-200 text-center text-slate-400 flex flex-col items-center justify-center h-full min-h-[200px]">
                             <Printer size={48} className="mb-4 opacity-20" />
                             <p className="text-sm font-medium">Τα αποτελέσματα θα εμφανιστούν εδώ.</p>
                         </div>
                     )}
                </div>
            </div>
        </div>
    );
}