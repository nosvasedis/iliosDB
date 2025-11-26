
import React, { useState } from 'react';
import { Product, ProductVariant } from '../types';
import { Printer, Loader2, FileText, Check } from 'lucide-react';

interface Props {
    allProducts: Product[];
    setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
}

export default function BatchPrintPage({ allProducts, setPrintItems }: Props) {
    const [skusText, setSkusText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItems, setFoundItems] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    
    const handlePrint = () => {
        setIsProcessing(true);
        setFoundItems(0);
        setNotFoundItems([]);

        const lines = skusText.split('\n').filter(line => line.trim() !== '');
        const itemsToPrint: { product: Product; variant?: ProductVariant; quantity: number }[] = [];
        const notFound: string[] = [];

        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const rawSku = parts[0].toUpperCase();
            const quantity = parts.length > 1 ? parseInt(parts[1]) : 1;

            if (isNaN(quantity) || quantity <= 0) continue;

            let found = false;
            // Search for a perfect variant match first
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
        
        // Use a timeout to allow the UI to update before the print dialog potentially blocks it
        setTimeout(() => {
            if (itemsToPrint.length > 0) {
                setPrintItems(itemsToPrint);
            }
            setFoundItems(itemsToPrint.reduce((acc, item) => acc + item.quantity, 0));
            setNotFoundItems(notFound);
            setIsProcessing(false);
        }, 200);
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Printer className="text-amber-500" />
                Μαζική Εκτύπωση Ετικετών
            </h1>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <h2 className="font-bold text-slate-700 mb-2">Εισαγωγή Κωδικών</h2>
                <p className="text-sm text-slate-500 mb-4">
                    Εισάγετε τους κωδικούς (SKU) και τις ποσότητες, ένα ανά γραμμή. <br/>
                    Παράδειγμα: <code className="bg-slate-100 px-1 rounded text-xs">XR2020 5</code> ή απλά <code className="bg-slate-100 px-1 rounded text-xs">DA1005</code> για ποσότητα 1.
                </p>

                <textarea
                    value={skusText}
                    onChange={(e) => setSkusText(e.target.value)}
                    rows={10}
                    className="w-full p-3 border border-slate-300 rounded-md font-mono text-sm bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none"
                    placeholder="XR2020PKR 5&#10;DA1005X 10&#10;STX-505 20"
                />
                
                <button 
                    onClick={handlePrint}
                    disabled={isProcessing || !skusText.trim()}
                    className="mt-4 w-full bg-slate-900 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
                    {isProcessing ? 'Επεξεργασία...' : 'Εκτύπωση Ετικετών'}
                </button>
            </div>

            {(foundItems > 0 || notFoundItems.length > 0) && (
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <h2 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><FileText size={18} />Αποτέλεσμα Επεξεργασίας</h2>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                            <Check size={20} />
                            <p><span className="font-bold">{foundItems}</span> ετικέτες βρέθηκαν και στάλθηκαν για εκτύπωση.</p>
                        </div>
                         {notFoundItems.length > 0 && (
                            <div className="text-red-600 bg-red-50 p-3 rounded-md">
                                <p className="font-bold">Δεν βρέθηκαν οι παρακάτω {notFoundItems.length} κωδικοί:</p>
                                <ul className="list-disc list-inside mt-2 text-sm font-mono">
                                    {notFoundItems.map(sku => <li key={sku}>{sku}</li>)}
                                </ul>
                            </div>
                         )}
                    </div>
                </div>
            )}
        </div>
    );
}
