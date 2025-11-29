import React, { useState, useRef } from 'react';
import { Product, ProductVariant } from '../types';
import { Printer, Loader2, FileText, Check, AlertCircle, Upload, Camera, FileUp } from 'lucide-react';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractSkusFromImage } from '../lib/gemini';

// Set workerSrc for pdf.js. This is crucial for it to work in a web environment.
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;


interface Props {
    allProducts: Product[];
    setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
    skusText: string;
    setSkusText: (text: string) => void;
}

export default function BatchPrintPage({ allProducts, setPrintItems, skusText, setSkusText }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItemsCount, setFoundItemsCount] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();
    
    const handlePrint = () => {
        setIsProcessing(true);
        setFoundItemsCount(0);
        setNotFoundItems([]);

        const lines = skusText.split(/\r?\n/).filter(line => line.trim() !== '');
        const itemsToPrint: { product: Product; variant?: ProductVariant; quantity: number }[] = [];
        const notFound: string[] = [];

        for (const line of lines) {
            const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").trim();
            const parts = cleanLine.split(/\s+/);
            if (parts.length === 0) continue;

            const rawSku = parts[0].toUpperCase();
            const quantityStr = parts.length > 1 ? parts[1] : '1';
            const quantity = parseInt(quantityStr.replace(/[^0-9]/g, ''), 10);
            
            if (isNaN(quantity) || quantity <= 0) continue;

            let found = false;
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
            setFoundItemsCount(itemsToPrint.reduce((acc, item) => acc + item.quantity, 0));
            setNotFoundItems(notFound);
            setIsProcessing(false);
        }, 500);
    };

    const updateSkuListWithScan = (scannedSku: string) => {
        const lines = skusText.split('\n').filter(line => line.trim() !== '');
        const skuMap = new Map<string, number>();

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const sku = parts[0];
            const quantity = parts.length > 1 ? parseInt(parts[1], 10) : 1;
            if (sku && !isNaN(quantity)) {
                skuMap.set(sku, (skuMap.get(sku) || 0) + quantity);
            }
        });

        skuMap.set(scannedSku, (skuMap.get(scannedSku) || 0) + 1);

        const newText = Array.from(skuMap.entries())
            .map(([sku, quantity]) => `${sku} ${quantity}`)
            .join('\n');

        setSkusText(newText);
    };

    const handleScan = (code: string) => {
        updateSkuListWithScan(code.toUpperCase());
        showToast(`Προστέθηκε: ${code}`, 'info');
    };
    
    const processPdfPage = async (pdf: any, pageNum: number): Promise<string> => {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (!context) return '';

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const base64Image = canvas.toDataURL('image/jpeg', 0.9);
        return extractSkusFromImage(base64Image);
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') {
            showToast('Παρακαλώ επιλέξτε αρχείο PDF.', 'error');
            return;
        }
        setIsProcessing(true);
        showToast('Ανάλυση PDF... Μπορεί να διαρκέσει λίγο.', 'info');
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            const typedArray = new Uint8Array(arrayBuffer);
            const pdf = await getDocument(typedArray).promise;
            
            const pagePromises: Promise<string>[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(processPdfPage(pdf, i));
            }
            
            const pagesText = await Promise.all(pagePromises);
            const allExtractedText = pagesText.filter(Boolean).join('\n').trim();

            if (allExtractedText) {
                // FIX: Pass a string to setSkusText instead of a function to match prop type.
                setSkusText((skusText.trim() ? skusText.trim() + '\n' : '') + allExtractedText);
                showToast('Οι κωδικοί από το PDF προστέθηκαν!', 'success');
            } else {
                showToast('Δεν εντοπίστηκαν κωδικοί στο PDF.', 'info');
            }

        } catch (err: any) {
            console.error(err);
            showToast(`Σφάλμα ανάλυσης PDF: ${err.message}`, 'error');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div>
                 <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                    <div className="p-2 bg-slate-800 text-white rounded-xl"><Printer size={24} /></div>
                    Μαζική Εκτύπωση Ετικετών
                </h1>
                <p className="text-slate-500 mt-2 ml-14">Εισάγετε λίστα κωδικών για γρήγορη εκτύπωση.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                <div className="md:col-span-3 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full flex flex-col">
                        <h2 className="font-bold text-slate-800 mb-2">Εισαγωγή Κωδικών</h2>
                        <p className="text-sm text-slate-500 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                            Μορφή: <strong>SKU ΠΟΣΟΤΗΤΑ</strong> (ένα ανά γραμμή)<br/>
                            π.χ. <code>XR2020 5</code> ή <code>DA1005X 10</code>
                        </p>
                        <textarea
                            value={skusText}
                            onChange={(e) => setSkusText(e.target.value)}
                            rows={12}
                            className="w-full p-4 border border-slate-200 rounded-xl font-mono text-sm bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400 flex-1"
                            placeholder={`XR2020PKR 5\nDA1005X 10\nSTX-505 20`}
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Έξυπνες Είσοδοι</h2>
                        <div className="space-y-3">
                            <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" />
                            <button onClick={() => fileInputRef.current?.click()} disabled={isProcessing} className="w-full flex items-center justify-center gap-3 bg-amber-50 text-amber-700 p-4 rounded-xl font-bold border-2 border-amber-200 hover:bg-amber-100 hover:border-amber-300 transition-all disabled:opacity-60">
                                <FileUp size={20} /> Ανάλυση PDF Παραγγελίας
                            </button>
                            <button onClick={() => setShowScanner(true)} disabled={isProcessing} className="w-full flex items-center justify-center gap-3 bg-blue-50 text-blue-700 p-4 rounded-xl font-bold border-2 border-blue-200 hover:bg-blue-100 hover:border-blue-300 transition-all disabled:opacity-60">
                                <Camera size={20} /> Σάρωση Barcode
                            </button>
                        </div>
                     </div>
                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        {(foundItemsCount > 0 || notFoundItems.length > 0) ? (
                            <div className="animate-in fade-in">
                                <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 border-b pb-2"><FileText size={18} /> Αποτέλεσμα</h2>
                                <div className="space-y-4">
                                    {foundItemsCount > 0 && (
                                        <div className="flex items-start gap-3 text-emerald-700 bg-emerald-50 p-4 rounded-2xl">
                                            <div className="bg-emerald-200 p-1 rounded-full mt-0.5"><Check size={14} /></div>
                                            <div><p className="font-bold text-lg">{foundItemsCount}</p><p className="text-xs font-medium opacity-80">ετικέτες προς εκτύπωση</p></div>
                                        </div>
                                    )}
                                    {notFoundItems.length > 0 && (
                                        <div className="text-rose-700 bg-rose-50 p-4 rounded-2xl">
                                            <div className="flex items-center gap-2 mb-2"><AlertCircle size={16}/><span className="font-bold text-sm">Δεν βρέθηκαν ({notFoundItems.length})</span></div>
                                            <ul className="list-disc list-inside text-xs font-mono opacity-80 max-h-24 overflow-y-auto pr-2">
                                                {notFoundItems.map(sku => <li key={sku}>{sku}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                             <div className="text-center text-slate-400 py-8">
                                 <p className="text-sm font-medium">Τα αποτελέσματα θα εμφανιστούν εδώ.</p>
                             </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-center mt-4">
                <button 
                    onClick={handlePrint}
                    disabled={isProcessing || !skusText.trim()}
                    className="w-full max-w-lg bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 hover:-translate-y-0.5"
                >
                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
                    {isProcessing ? 'Επεξεργασία...' : 'Εκτύπωση Ετικετών'}
                </button>
            </div>
            {showScanner && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} continuous={true} />}
        </div>
    );
}