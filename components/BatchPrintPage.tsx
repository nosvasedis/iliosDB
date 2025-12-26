
import React, { useState, useRef, useMemo } from 'react';
import { Product, ProductVariant } from '../types';
import { Printer, Loader2, FileText, Check, AlertCircle, Upload, Camera, FileUp, ScanBarcode, Plus, Lightbulb, History, Trash2, ArrowRight } from 'lucide-react';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractSkusFromImage } from '../lib/gemini';
import { analyzeSku, getVariantComponents, formatCurrency, findProductByScannedCode } from '../utils/pricingEngine';

// Set workerSrc for pdf.js.
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

interface Props {
    allProducts: Product[];
    setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number }[]) => void;
    skusText: string;
    setSkusText: (text: string) => void;
}

// COLORS FOR SEGMENTATION (Synced with Inventory)
const FINISH_COLORS: Record<string, string> = {
    'X': 'text-amber-500', // Gold
    'P': 'text-slate-500',  // Patina
    'D': 'text-orange-500', // Two-tone
    'H': 'text-cyan-400',   // Platinum
    '': 'text-slate-400'    // Lustre
};

const STONE_CATEGORIES: Record<string, string> = {
    'KR': 'text-rose-500', 'QN': 'text-neutral-900', 'LA': 'text-blue-500', 'TY': 'text-teal-400',
    'TG': 'text-orange-600', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-500', 'FI': 'text-slate-400', 'OP': 'text-indigo-400',
    'NF': 'text-green-700', 'CO': 'text-orange-400', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-400',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-400',
    'MV': 'text-purple-400', 'RZ': 'text-pink-400', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

export default function BatchPrintPage({ allProducts, setPrintItems, skusText, setSkusText }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItemsCount, setFoundItemsCount] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();

    // Smart Entry State
    const [scanInput, setScanInput] = useState('');
    const [scanSuggestion, setScanSuggestion] = useState('');
    const [availableSuffixes, setAvailableSuffixes] = useState<{suffix: string, desc: string}[]>([]);
    const [scanQty, setScanQty] = useState(1);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // --- SMART ENTRY LOGIC (SYCED FROM INVENTORY) ---
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setScanInput(val);

        if (val.length === 0) {
            setScanSuggestion('');
            setAvailableSuffixes([]);
            return;
        }

        const match = findProductByScannedCode(val, allProducts);
        if (match) {
            const { product, variant } = match;
            setScanSuggestion(product.sku + (variant?.suffix || ''));
            setAvailableSuffixes(product.variants?.map(v => ({ suffix: v.suffix, desc: v.description })) || []);
        } else {
            const masterMatch = allProducts.find(p => p.sku.startsWith(val));
            setScanSuggestion(masterMatch ? masterMatch.sku : '');
            setAvailableSuffixes([]);
        }
    };

    const selectSuffix = (suffix: string) => {
        const info = getScanProductInfo();
        if (info?.product) {
            const fullCode = info.product.sku + suffix;
            setScanInput(fullCode);
            setScanSuggestion(fullCode);
            setAvailableSuffixes([]);
            inputRef.current?.focus();
        }
    };

    const executeSmartAdd = () => {
        const targetCode = scanSuggestion || scanInput;
        if (!targetCode) return;

        // Check if product exists via bridge
        const match = findProductByScannedCode(targetCode, allProducts);
        if (!match) {
            showToast("Ο κωδικός δεν βρέθηκε.", "error");
            return;
        }

        const finalCode = match.product.sku + (match.variant?.suffix || '');

        // Add to the list
        const currentLines = skusText.split('\n').filter(l => l.trim());
        const newLine = `${finalCode} ${scanQty}`;
        setSkusText([...currentLines, newLine].join('\n'));

        // Reset
        setScanInput('');
        setScanSuggestion('');
        setScanQty(1);
        setAvailableSuffixes([]);
        inputRef.current?.focus();
        showToast(`Προστέθηκε: ${finalCode}`, 'success');
    };

    const getScanProductInfo = () => {
        const t = scanSuggestion || scanInput;
        if (!t) return null;
        const match = findProductByScannedCode(t, allProducts);
        if (!match) return null;
        return { product: match.product, variant: match.variant, variantSuffix: match.variant?.suffix || '' };
    };

    const SkuVisualizer = () => {
        if (!scanSuggestion && !scanInput) return null;
        const textToRender = scanSuggestion || scanInput;
        const match = findProductByScannedCode(textToRender, allProducts);
        const prod = match?.product;
        
        let masterPart = prod ? prod.sku : textToRender;
        let suffixPart = prod ? textToRender.substring(prod.sku.length) : '';

        const { finish, stone } = prod ? getVariantComponents(suffixPart, prod.gender) : { finish: { code: '' }, stone: { code: '' } };
        const finishColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const stoneColor = STONE_CATEGORIES[stone.code] || 'text-emerald-400';

        const renderChars = (fullText: string, typedText: string) => {
            return fullText.split('').map((char, i) => {
                const isGhost = i >= typedText.length;
                const isSuffix = prod && i >= prod.sku.length;
                let colorClass = 'text-slate-800';
                
                if (isSuffix) {
                    const suffixIndex = i - prod!.sku.length;
                    if (finish.code && suffixPart.startsWith(finish.code) && suffixIndex < finish.code.length) {
                        colorClass = finishColor;
                    } else if (stone.code && suffixPart.endsWith(stone.code) && suffixIndex >= (suffixPart.length - stone.code.length)) {
                        colorClass = stoneColor;
                    } else {
                        colorClass = 'text-slate-400';
                    }
                }

                return (
                    <span key={i} className={`${colorClass} ${isGhost ? 'opacity-30 italic font-medium' : 'font-black'}`}>
                        {char}
                    </span>
                );
            });
        };

        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                {renderChars(textToRender, scanInput)}
            </div>
        );
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
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                if (context) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const base64Image = canvas.toDataURL('image/jpeg', 0.9);
                    pagePromises.push(extractSkusFromImage(base64Image));
                }
            }
            
            const pagesText = await Promise.all(pagePromises);
            const allExtractedText = pagesText.filter(Boolean).join('\n').trim();

            if (allExtractedText) {
                const newText = (skusText.trim() ? skusText.trim() + '\n' : '') + allExtractedText;
                setSkusText(newText);
                showToast('Οι κωδικοί από το PDF προστέθηκαν!', 'success');
            } else {
                showToast('Δεν εντοπίστηκαν κωδικοί στο PDF.', 'info');
            }

        } catch (err: any) {
            showToast(`Σφάλμα ανάλυσης PDF: ${err.message}`, 'error');
        } finally {
            setIsProcessing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleBarcodeScan = (code: string) => {
        const match = findProductByScannedCode(code, allProducts);
        if (match) {
            const targetCode = match.product.sku + (match.variant?.suffix || '');
            const currentLines = skusText.split('\n').filter(l => l.trim());
            setSkusText([...currentLines, `${targetCode} 1`].join('\n'));
            showToast(`Προστέθηκε: ${targetCode}`, 'success');
        } else {
            showToast(`Ο κωδικός ${code} δεν βρέθηκε.`, 'error');
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                     <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-slate-800 text-white rounded-xl"><Printer size={24} /></div>
                        Μαζική Εκτύπωση Ετικετών
                    </h1>
                    <p className="text-slate-500 mt-2 ml-14">Δημιουργήστε ουρά εκτύπωσης χρησιμοποιώντας την έξυπνη είσοδο.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setSkusText('')} className="bg-white px-4 py-2 border border-slate-200 rounded-xl text-slate-500 font-bold text-sm hover:bg-red-50 hover:text-red-600 transition-all flex items-center gap-2">
                        <Trash2 size={16}/> Εκκαθάριση Λίστας
                    </button>
                </div>
            </div>

            {/* SMART ENTRY AREA */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-visible p-6 sm:p-8 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                        <ScanBarcode size={22} className="animate-pulse" />
                    </div>
                    <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη στην Ουρά</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end overflow-visible">
                    <div className="md:col-span-8 relative overflow-visible">
                        <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU</label>
                        <div className="relative">
                            <SkuVisualizer />
                            <input 
                                ref={inputRef}
                                type="text"
                                value={scanInput}
                                onChange={handleSmartInput}
                                onKeyDown={e => {
                                    if(e.key === 'ArrowRight' && scanSuggestion) { e.preventDefault(); setScanInput(scanSuggestion); }
                                    if(e.key === 'Enter') { e.preventDefault(); executeSmartAdd(); }
                                }}
                                placeholder="Σκανάρετε ή πληκτρολογήστε..."
                                className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest transition-all shadow-sm relative z-10"
                            />
                            
                            {availableSuffixes.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 flex flex-wrap gap-1.5 z-[100] p-3 bg-white rounded-2xl border border-slate-100 shadow-2xl max-h-48 overflow-y-auto custom-scrollbar ring-4 ring-black/5">
                                    <div className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Lightbulb size={10} className="text-amber-500"/> Προτάσεις Παραλλαγών</div>
                                    {availableSuffixes.map(s => {
                                        const { finish, stone } = getVariantComponents(s.suffix, getScanProductInfo()?.product?.gender);
                                        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
                                        const sColor = STONE_CATEGORIES[stone.code] || 'text-emerald-400';
                                        
                                        return (
                                            <button 
                                                key={s.suffix} 
                                                onClick={() => selectSuffix(s.suffix)}
                                                className="bg-slate-50 hover:bg-emerald-50 text-slate-600 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all shadow-sm border border-slate-200 hover:border-emerald-200 flex items-center gap-1"
                                                title={s.desc}
                                            >
                                                <span className={fColor}>{finish.code || 'LUSTRE'}</span>
                                                {stone.code && <span className={sColor}>{stone.code}</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="md:col-span-4 flex gap-3 items-end h-full">
                        <div className="w-24 shrink-0">
                            <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                            <input type="number" min="1" value={scanQty} onChange={e => setScanQty(parseInt(e.target.value)||1)} className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"/>
                        </div>
                        <button 
                            onClick={executeSmartAdd}
                            className="flex-1 h-[54px] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95"
                        >
                            <Plus size={28}/>
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                <div className="md:col-span-3 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-bold text-slate-800">Ουρά Εκτύπωσης</h2>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{skusText.split('\n').filter(l => l.trim()).length} ΓΡΑΜΜΕΣ</span>
                        </div>
                        <textarea
                            value={skusText}
                            onChange={(e) => setSkusText(e.target.value)}
                            rows={12}
                            className="w-full p-4 border border-slate-200 rounded-xl font-mono text-sm bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400 flex-1 custom-scrollbar"
                            placeholder={`Προσθέστε κωδικούς παραπάνω ή πληκτρολογήστε εδώ...\n\nXR2020PKR 5\nDA1005X 10\nSTX-505 20`}
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Μαζική Είσοδος</h2>
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

                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[200px]">
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
                                            <ul className="list-disc list-inside text-xs font-mono opacity-80 max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                                                {notFoundItems.map(sku => <li key={sku}>{sku}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                             <div className="text-center text-slate-400 py-12 flex flex-col items-center">
                                 <History size={40} className="mb-2 opacity-20"/>
                                 <p className="text-sm font-medium">Τα αποτελέσματα της τελευταίας επεξεργασίας θα εμφανιστούν εδώ.</p>
                             </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex justify-center mt-4">
                <button 
                    onClick={handlePrint}
                    disabled={isProcessing || !skusText.trim()}
                    className="w-full max-w-lg bg-slate-900 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 hover:-translate-y-0.5 active:scale-95"
                >
                    {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Printer size={20} />}
                    {isProcessing ? 'Επεξεργασία...' : 'Εκτύπωση Ετικετών'}
                </button>
            </div>
            {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} continuous={true} />}
        </div>
    );
}
