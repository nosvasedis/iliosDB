
import React, { useState, useRef, useMemo } from 'react';
import { Product, ProductVariant } from '../types';
import { Printer, Loader2, FileText, Check, AlertCircle, Upload, Camera, FileUp, ScanBarcode, Plus, Lightbulb, History, Trash2, ArrowRight, Tag, ShoppingBag, ImageIcon, Search } from 'lucide-react';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractSkusFromImage } from '../lib/gemini';
import { analyzeSku, getVariantComponents, formatCurrency, findProductByScannedCode, expandSkuRange } from '../utils/pricingEngine';
import BarcodeView from './BarcodeView';

// Set workerSrc for pdf.js.
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

interface Props {
    allProducts: Product[];
    setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' | 'retail' }[]) => void;
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
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400'
};

export default function BatchPrintPage({ allProducts, setPrintItems, skusText, setSkusText }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItemsCount, setFoundItemsCount] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    const [labelFormat, setLabelFormat] = useState<'standard' | 'retail'>('standard');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();

    // Smart Entry State
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    
    // Revamped State for Visuals
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{variant: ProductVariant, suffix: string, desc: string}[]>([]);
    const [typedSuffixPart, setTypedSuffixPart] = useState('');

    const inputRef = useRef<HTMLInputElement>(null);

    const handlePrint = () => {
        setIsProcessing(true);
        setFoundItemsCount(0);
        setNotFoundItems([]);

        const lines = skusText.split(/\r?\n/).filter(line => line.trim() !== '');
        const itemsToPrint: { product: Product; variant?: ProductVariant; quantity: number; format: 'standard' | 'simple' | 'retail' }[] = [];
        const notFound: string[] = [];

        for (const line of lines) {
            const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").trim();
            const parts = cleanLine.split(/\s+/);
            if (parts.length === 0) continue;

            const rawToken = parts[0].toUpperCase();
            const quantityStr = parts.length > 1 ? parts[1] : '1';
            const quantity = parseInt(quantityStr.replace(/[^0-9]/g, ''), 10);
            
            if (isNaN(quantity) || quantity <= 0) continue;

            // SMART RANGE EXPANSION
            const expandedSkus = expandSkuRange(rawToken);

            for (const rawSku of expandedSkus) {
                let found = false;
                for (const p of allProducts) {
                    if (p.variants) {
                        for (const v of p.variants) {
                            if (`${p.sku}${v.suffix}` === rawSku) {
                                itemsToPrint.push({ product: p, variant: v, quantity, format: labelFormat });
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
                        itemsToPrint.push({ product, quantity, format: labelFormat });
                        found = true;
                    }
                }

                if (!found) {
                    notFound.push(rawSku);
                }
            }
        }
        
        setTimeout(() => {
            if (itemsToPrint.length > 0) {
                setPrintItems(itemsToPrint);
                showToast(`Στάλθηκαν ${itemsToPrint.reduce((a,b)=>a+b.quantity,0)} ετικέτες για εκτύπωση (${labelFormat === 'retail' ? 'Λιανικής' : 'Χονδρικής'}).`, 'success');
            } else {
                showToast("Δεν βρέθηκαν έγκυροι κωδικοί.", 'error');
            }
            setFoundItemsCount(itemsToPrint.reduce((acc, item) => acc + item.quantity, 0));
            setNotFoundItems(notFound);
            setIsProcessing(false);
        }, 500);
    };

    // --- REVAMPED SMART INPUT LOGIC ---
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setScanInput(val);

        if (val.length < 2) {
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            setTypedSuffixPart('');
            return;
        }

        // 1. Identify Potential Masters & Partial Suffixes
        let bestMaster: Product | null = null;
        let suffixPart = '';
        
        // Strategy A: Exact Master Match (e.g. typing "DA100")
        const exactMaster = allProducts.find(p => p.sku === val);
        
        // Strategy B: Prefix Match (e.g. typing "DA100X" -> Master "DA100")
        // We look for the longest master SKU that matches the start of the input
        const potentialMasters = allProducts.filter(p => val.startsWith(p.sku));
        const longestPrefixMaster = potentialMasters.sort((a,b) => b.sku.length - a.sku.length)[0];

        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            suffixPart = val.replace(longestPrefixMaster.sku, '');
        }

        // 2. Set Visual Candidates (Top 6 matches for what is typed so far)
        // If we found a specific master context, prioritize showing that master + siblings
        // Otherwise show anything starting with the input
        let candidates: Product[] = [];
        if (bestMaster) {
            candidates = [bestMaster]; // Always show the context first
        } else {
            candidates = allProducts.filter(p => p.sku.startsWith(val)).slice(0, 6);
        }
        setCandidateProducts(candidates);

        // 3. Set Variants & Suffix Logic
        if (bestMaster) {
            setActiveMasterProduct(bestMaster);
            setTypedSuffixPart(suffixPart);
            
            if (bestMaster.variants) {
                // Filter variants that START with the typed suffix part
                // e.g. Master: DA100, SuffixPart: "X" -> Matches "X", "XKR", "XP" etc.
                const validVariants = bestMaster.variants
                    .filter(v => v.suffix.startsWith(suffixPart))
                    .map(v => ({ variant: v, suffix: v.suffix, desc: v.description }));
                
                setFilteredVariants(validVariants);
            } else {
                setFilteredVariants([]);
            }
        } else {
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            setTypedSuffixPart('');
        }
    };

    const selectProductCandidate = (product: Product) => {
        // If clicking a candidate, we set it as the context
        setScanInput(product.sku);
        setActiveMasterProduct(product);
        setCandidateProducts([product]);
        setTypedSuffixPart('');
        // Show all variants
        if (product.variants) {
            setFilteredVariants(product.variants.map(v => ({ variant: v, suffix: v.suffix, desc: v.description })));
        } else {
            setFilteredVariants([]);
        }
        inputRef.current?.focus();
    };

    const selectSuffix = (suffix: string) => {
        if (activeMasterProduct) {
            const fullCode = activeMasterProduct.sku + suffix;
            setScanInput(fullCode);
            // Don't clear master, keep context but maybe narrow variants? 
            // For now, assume selection means "I want this one"
            setTypedSuffixPart(suffix);
            setFilteredVariants([]); // Clear suggestions to indicate selection made
            inputRef.current?.focus();
        }
    };

    const executeSmartAdd = () => {
        if (!activeMasterProduct && !scanInput) return;
        
        // If we have a master and a suffix picked (or typed fully)
        let finalCode = scanInput;
        
        // Validate
        const match = findProductByScannedCode(finalCode, allProducts);
        
        if (!match) {
            // Check if it's a valid master with NO variants
            const exactMaster = allProducts.find(p => p.sku === finalCode);
            if (exactMaster && (!exactMaster.variants || exactMaster.variants.length === 0)) {
                // Valid simple product
            } else if (match) {
                // Valid variant or master
            } else {
                showToast("Ο κωδικός δεν βρέθηκε ή είναι ατελής.", "error");
                return;
            }
        }

        const currentLines = skusText.split('\n').filter(l => l.trim());
        const newLine = `${finalCode} ${scanQty}`;
        setSkusText([...currentLines, newLine].join('\n'));

        // Reset
        setScanInput('');
        setScanQty(1);
        setCandidateProducts([]);
        setActiveMasterProduct(null);
        setFilteredVariants([]);
        inputRef.current?.focus();
        showToast(`Προστέθηκε: ${finalCode}`, 'success');
    };

    // --- VISUALIZERS ---
    const SkuVisualizer = () => {
        // FIX: Always return a visualizer so the text is not invisible when no product matches
        if (!activeMasterProduct) {
            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <span className="text-slate-800 font-bold">{scanInput}</span>
                </div>
            );
        }
        
        // Master part is colored black/standard
        // Suffix part is colored based on stone/metal
        
        const masterLen = activeMasterProduct.sku.length;
        const masterStr = scanInput.slice(0, masterLen);
        const suffixStr = scanInput.slice(masterLen);

        const { finish, stone } = getVariantComponents(suffixStr, activeMasterProduct.gender);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_CATEGORIES[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () => {
            return suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                
                // Heuristic coloring for visual feedback while typing
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
                
                return <span key={i} className={colorClass}>{char}</span>
            });
        };

        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <span className="text-slate-900 font-black">{masterStr}</span>
                <span className="font-black flex">{renderSuffixChars()}</span>
            </div>
        );
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        // ... (Same as before)
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
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                     <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-slate-800 text-white rounded-xl"><Printer size={24} /></div>
                        Μαζική Εκτύπωση Ετικετών
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14">Δημιουργήστε ουρά εκτύπωσης χρησιμοποιώντας την έξυπνη είσοδο.</p>
                </div>
                
                <div className="flex flex-wrap gap-2 w-full xl:w-auto">
                    <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" />
                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isProcessing} 
                        className="flex-1 xl:flex-none flex items-center justify-center gap-2 bg-amber-50 text-amber-700 px-5 py-3 rounded-xl font-bold hover:bg-amber-100 transition-all border border-amber-200 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
                        <span className="whitespace-nowrap">PDF</span>
                    </button>
                    
                    <button 
                        onClick={() => setShowScanner(true)} 
                        className="flex-1 xl:flex-none flex items-center justify-center gap-2 bg-blue-50 text-blue-700 px-5 py-3 rounded-xl font-bold hover:bg-blue-100 transition-all border border-blue-200"
                    >
                        <Camera size={20} />
                        <span className="whitespace-nowrap">Scan</span>
                    </button>

                    <button 
                        onClick={() => setSkusText('')} 
                        className="flex-1 xl:flex-none flex items-center justify-center gap-2 bg-slate-50 text-slate-600 px-5 py-3 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200"
                    >
                        <Trash2 size={20}/>
                        <span className="whitespace-nowrap">Καθαρισμός</span>
                    </button>
                </div>
            </div>

            {/* SMART ENTRY AREA */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-visible p-6 sm:p-8 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-[#060b00] text-white rounded-xl shadow-lg">
                        <ScanBarcode size={22} className="animate-pulse" />
                    </div>
                    <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Έξυπνη Ταχεία Προσθήκη</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start overflow-visible">
                    <div className="md:col-span-8 relative overflow-visible space-y-4">
                        
                        <div>
                            <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU / Εύρος (π.χ. DA050-DA063)</label>
                            <div className="relative">
                                <SkuVisualizer />
                                <input 
                                    ref={inputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={handleSmartInput}
                                    onKeyDown={e => {
                                        if(e.key === 'ArrowRight' && filteredVariants.length > 0) { 
                                            // Maybe autocomplete the first variant? For now simple arrow movement.
                                        }
                                        if(e.key === 'Enter') { e.preventDefault(); executeSmartAdd(); }
                                    }}
                                    placeholder="Πληκτρολογήστε..."
                                    className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest transition-all shadow-sm relative z-10"
                                />
                            </div>
                        </div>

                        {/* VISUAL CANDIDATES STRIP */}
                        {candidateProducts.length > 0 && (
                            <div className="animate-in slide-in-from-top-2 fade-in">
                                <label className="text-[9px] text-slate-400 font-bold uppercase mb-1.5 ml-1 block tracking-widest flex items-center gap-1">
                                    <Search size={10}/> {activeMasterProduct ? 'ΕΠΙΛΕΓΜΕΝΟ ΠΡΟΪΟΝ' : 'ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ'}
                                </label>
                                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                                    {candidateProducts.map(p => (
                                        <div 
                                            key={p.sku} 
                                            onClick={() => selectProductCandidate(p)}
                                            className={`
                                                flex items-center gap-3 p-2 rounded-xl border cursor-pointer transition-all min-w-[180px] group
                                                ${activeMasterProduct?.sku === p.sku 
                                                    ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-md' 
                                                    : 'bg-slate-50 border-slate-200 hover:border-emerald-300 hover:bg-white'}
                                            `}
                                        >
                                            <div className="w-10 h-10 bg-white rounded-lg overflow-hidden shrink-0 border border-slate-200">
                                                {p.image_url ? (
                                                    <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku}/>
                                                ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16}/></div>}
                                            </div>
                                            <div>
                                                <div className={`font-black text-sm leading-none ${activeMasterProduct?.sku === p.sku ? 'text-emerald-800' : 'text-slate-700'}`}>{p.sku}</div>
                                                <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[100px]">{p.category}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* VARIANT SUGGESTIONS GRID */}
                        {filteredVariants.length > 0 && (
                            <div className="animate-in slide-in-from-top-2 fade-in bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                                <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest flex items-center gap-1">
                                    <Lightbulb size={10} className="text-amber-500"/> ΔΙΑΘΕΣΙΜΕΣ ΠΑΡΑΛΛΑΓΕΣ
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {filteredVariants.map(s => {
                                        const { finish, stone } = getVariantComponents(s.suffix, activeMasterProduct?.gender);
                                        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
                                        const sColor = STONE_CATEGORIES[stone.code] || 'text-emerald-400';
                                        
                                        return (
                                            <button 
                                                key={s.suffix} 
                                                onClick={() => selectSuffix(s.suffix)}
                                                className="bg-white hover:bg-emerald-50 text-slate-600 px-3 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm border border-slate-200 hover:border-emerald-200 flex items-center gap-1 group active:scale-95"
                                                title={s.desc}
                                            >
                                                <span className={fColor}>{finish.code || 'LUSTRE'}</span>
                                                {stone.code && <span className={sColor}>{stone.code}</span>}
                                                <span className="ml-1.5 text-[9px] text-slate-300 font-normal group-hover:text-emerald-400 normal-case">{s.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="md:col-span-4 flex gap-3 items-start h-full pt-6">
                        <div className="w-24 shrink-0">
                            <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                            <input type="number" min="1" value={scanQty} onChange={e => setScanQty(parseInt(e.target.value)||1)} className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"/>
                        </div>
                        <button 
                            onClick={executeSmartAdd}
                            disabled={!activeMasterProduct && !scanInput}
                            className="flex-1 h-[54px] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
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
                            placeholder={`Προσθέστε κωδικούς παραπάνω ή πληκτρολογήστε εδώ...\nΥποστηρίζονται εύρη:\nDA050-DA063 2\nXR2020 5`}
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Ρυθμίσεις Ετικέτας</h2>
                        <div className="flex gap-2 bg-slate-50 p-1 rounded-xl">
                            <button 
                                onClick={() => setLabelFormat('standard')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${labelFormat === 'standard' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Tag size={14}/> Χονδρική
                            </button>
                            <button 
                                onClick={() => setLabelFormat('retail')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${labelFormat === 'retail' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ShoppingBag size={14}/> Λιανική
                            </button>
                        </div>
                     </div>

                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 min-h-[100px]">
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
                             <div className="text-center text-slate-400 py-6 flex flex-col items-center">
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
