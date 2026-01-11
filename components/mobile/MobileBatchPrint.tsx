
import React, { useState } from 'react';
import { Camera, Copy, Trash2, Check } from 'lucide-react';
import { useUI } from '../UIProvider';
import BarcodeScanner from '../BarcodeScanner';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/supabase';
import { findProductByScannedCode } from '../../utils/pricingEngine';

export default function MobileBatchPrint() {
    const { data: products } = useQuery({ queryKey: ['products'], queryFn: api.getProducts });
    const { showToast } = useUI();
    const [queue, setQueue] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);

    const handleScan = (code: string) => {
        if (!products) return;
        const match = findProductByScannedCode(code, products);
        
        if (match) {
            const sku = match.product.sku + (match.variant?.suffix || '');
            setQueue(prev => [...prev, sku]);
            showToast(`Προστέθηκε: ${sku}`, 'success');
        } else {
            showToast(`Άγνωστος κωδικός: ${code}`, 'error');
        }
    };

    const copyToClipboard = () => {
        const text = queue.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast("Αντιγράφηκε στο πρόχειρο!", "success");
        });
    };

    const clearQueue = () => {
        setQueue([]);
        showToast("Η λίστα καθαρίστηκε.", "info");
    };

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
                <p className="text-sm font-bold text-slate-500">Σάρωση για προσθήκη στη λίστα</p>
            </div>

            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-slate-800">Ουρά ({queue.length})</h3>
                <div className="flex gap-2">
                    <button onClick={copyToClipboard} disabled={queue.length===0} className="p-2 bg-blue-50 text-blue-600 rounded-lg disabled:opacity-50"><Copy size={18}/></button>
                    <button onClick={clearQueue} disabled={queue.length===0} className="p-2 bg-red-50 text-red-600 rounded-lg disabled:opacity-50"><Trash2 size={18}/></button>
                </div>
            </div>

            <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 overflow-y-auto font-mono text-sm text-slate-700 shadow-inner custom-scrollbar">
                {queue.length > 0 ? (
                    queue.map((sku, idx) => (
                        <div key={idx} className="border-b border-slate-50 py-1 last:border-0">{sku} 1</div>
                    ))
                ) : (
                    <div className="text-center text-slate-400 italic mt-10">Η λίστα είναι κενή.</div>
                )}
            </div>
            
            <div className="mt-4 text-xs text-slate-400 text-center">
                Αντιγράψτε τη λίστα και στείλτε την στον υπολογιστή για εκτύπωση.
            </div>

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
