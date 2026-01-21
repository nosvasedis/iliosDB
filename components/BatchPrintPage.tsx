
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, ProductVariant } from '../../types';
import { Printer, Loader2, FileText, Check, AlertCircle, Upload, Camera, FileUp, ScanBarcode, Plus, Lightbulb, History, Trash2, ArrowRight, Tag, ShoppingBag, ImageIcon, Search, Save, PackageCheck, MapPin, List, X, Clock, RotateCcw } from 'lucide-react';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractSkusFromImage } from '../lib/gemini';
import { analyzeSku, getVariantComponents, formatCurrency, findProductByScannedCode, expandSkuRange, splitSkuComponents } from '../utils/pricingEngine';
import BarcodeView from './BarcodeView';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, SYSTEM_IDS, recordStockMovement, supabase } from '../lib/supabase';

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

const STONE_TEXT_COLORS: Record<string, string> = {
    'KR': 'text-rose-500', 'QN': 'text-neutral-900', 'LA': 'text-blue-500', 'TY': 'text-teal-400',
    'TG': 'text-orange-600', 'IA': 'text-red-700', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-500', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-teal-500', 'PCO': 'text-emerald-400', 'MCO': 'text-purple-500',
    'PAX': 'text-green-500', 'MAX': 'text-blue-600', 'KAX': 'text-red-600', 'AI': 'text-slate-500',
    'AP': 'text-cyan-500', 'AM': 'text-teal-600', 'LR': 'text-indigo-600', 'BST': 'text-sky-400',
    'MP': 'text-blue-400', 'LE': 'text-slate-300', 'PR': 'text-green-400', 'KO': 'text-red-500',
    'MV': 'text-purple-400', 'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400',
    'TPR': 'text-green-600', 'TKO': 'text-red-600', 'TMP': 'text-blue-600',
};

interface ActionLog {
    id: string;
    type: 'PRINT' | 'COMMIT';
    timestamp: string; // Store as string for JSON serialization
    summary: string;
    details: { sku: string; variant?: string; qty: number }[];
    target?: string;
}

export default function BatchPrintPage({ allProducts, setPrintItems, skusText, setSkusText }: Props) {
    const queryClient = useQueryClient();
    const { data: warehouses } = useQuery({ queryKey: ['warehouses'], queryFn: api.getWarehouses });
    
    const [isProcessing, setIsProcessing] = useState(false);
    const [foundItemsCount, setFoundItemsCount] = useState(0);
    const [notFoundItems, setNotFoundItems] = useState<string[]>([]);
    const [showScanner, setShowScanner] = useState(false);
    
    // Persistent Settings
    const [labelFormat, setLabelFormat] = useState<'standard' | 'retail'>(() => {
        return (localStorage.getItem('batch_print_format') as 'standard' | 'retail') || 'standard';
    });
    const [targetWarehouse, setTargetWarehouse] = useState(() => {
        return localStorage.getItem('batch_print_target_warehouse') || SYSTEM_IDS.SHOWROOM;
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast, confirm } = useUI();

    // Stock Commit State
    const [isCommitting, setIsCommitting] = useState(false);
    
    // Persistent History
    const [actionLogs, setActionLogs] = useState<ActionLog[]>(() => {
        const saved = localStorage.getItem('batch_print_logs');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { return []; }
        }
        return [];
    });
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    // Persist changes
    useEffect(() => { localStorage.setItem('batch_print_format', labelFormat); }, [labelFormat]);
    useEffect(() => { localStorage.setItem('batch_print_target_warehouse', targetWarehouse); }, [targetWarehouse]);
    useEffect(() => { localStorage.setItem('batch_print_logs', JSON.stringify(actionLogs)); }, [actionLogs]);

    // Smart Entry State
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);
    
    // Revamped State for Visuals
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{variant: ProductVariant, suffix: string, desc: string}[]>([]);
    
    const inputRef = useRef<HTMLInputElement>(null);

    const parseItemsFromText = () => {
        const lines = skusText.split(/\r?\n/).filter(line => line.trim() !== '');
        const items: { product: Product; variant?: ProductVariant; quantity: number; rawSku: string }[] = [];
        const notFound: string[] = [];

        for (const line of lines) {
            const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, " ").trim();
            const parts = cleanLine.split(/\s+/);
            if (parts.length === 0) continue;

            const rawToken = parts[0].toUpperCase();
            const quantityStr = parts.length > 1 ? parts[1] : '1';
            const quantity = parseInt(quantityStr.replace(/[^0-9]/g, ''), 10);
            
            if (isNaN(quantity) || quantity <= 0) continue;

            const expandedSkus = expandSkuRange(rawToken);

            for (const rawSku of expandedSkus) {
                let matchFound = false;
                const match = findProductByScannedCode(rawSku, allProducts);
                
                if (match) {
                    // CASE 1: Exact match for a variant or simple product with no variants
                    if (match.variant || (!match.product.variants || match.product.variants.length === 0)) {
                        items.push({ product: match.product, variant: match.variant, quantity, rawSku });
                        matchFound = true;
                    } 
                    // CASE 2: Master SKU entered exactly (no variant suffix matched)
                    else {
                        const variants = match.product.variants || [];
                        const baseVariant = variants.find(v => v.suffix === "");

                        if (baseVariant) {
                            // If the product has a "Master/Lustre" variant (empty suffix),
                            // we assume typing the SKU alone refers specifically to that variant.
                            items.push({ 
                                product: match.product, 
                                variant: baseVariant, 
                                quantity, 
                                rawSku: match.product.sku 
                            });
                            matchFound = true;
                        } 
                        else if (variants.length > 0) {
                            // "Intelligent" expansion: if no empty-suffix variant exists, add ALL available variants
                            variants.forEach(v => {
                                items.push({ product: match.product, variant: v, quantity, rawSku: match.product.sku + v.suffix });
                            });
                            matchFound = true;
                        }
                    }
                }

                if (!matchFound) {
                    notFound.push(rawSku);
                }
            }
        }
        return { items, notFound };
    };

    const handlePrint = () => {
        setIsProcessing(true);
        setFoundItemsCount(0);
        setNotFoundItems([]);

        const { items, notFound } = parseItemsFromText();
        
        const printPayload = items.map(i => ({
            product: i.product,
            variant: i.variant,
            quantity: i.quantity,
            format: labelFormat
        }));

        setTimeout(() => {
            if (printPayload.length > 0) {
                setPrintItems(printPayload);
                showToast(`Στάλθηκαν ${printPayload.reduce((a,b)=>a+b.quantity,0)} ετικέτες για εκτύπωση (${labelFormat === 'retail' ? 'Λιανικής' : 'Χονδρικής'}).`, 'success');
                
                // Add to Log
                const logDetails = printPayload.map(i => ({ sku: i.product.sku, variant: i.variant?.suffix, qty: i.quantity }));
                setActionLogs(prev => [{
                    id: Date.now().toString(),
                    type: 'PRINT' as const,
                    timestamp: new Date().toISOString(),
                    summary: `${logDetails.reduce((a,b)=>a+b.qty,0)} Ετικέτες`,
                    details: logDetails
                }, ...prev].slice(0, 50)); // Keep last 50

            } else {
                showToast("Δεν βρέθηκαν έγκυροι κωδικοί.", 'error');
            }
            setFoundItemsCount(printPayload.reduce((acc, item) => acc + item.quantity, 0));
            setNotFoundItems(notFound);
            setIsProcessing(false);
        }, 500);
    };

    const handleCommitToStock = async () => {
        const { items } = parseItemsFromText();
        if (items.length === 0) {
            showToast("Δεν υπάρχουν έγκυροι κωδικοί για καταχώρηση.", "error");
            return;
        }

        const warehouseName = warehouses?.find(w => w.id === targetWarehouse)?.name || 'Unknown';
        
        const confirmed = await confirm({
            title: `Καταχώρηση στο ${warehouseName}`,
            message: `Θα προστεθούν ${items.reduce((acc, i) => acc + i.quantity, 0)} τεμάχια (${items.length} κωδικοί) στο απόθεμα του ${warehouseName}. Είστε σίγουροι;`,
            confirmText: 'Καταχώρηση',
            cancelText: 'Άκυρο'
        });

        if (!confirmed) return;

        setIsCommitting(true);
        try {
            let successCount = 0;
            
            for (const item of items) {
                const { product, variant, quantity } = item;
                const sku = product.sku;
                const suffix = variant?.suffix || null;

                // Logic differs based on warehouse type and variant existence
                if (variant) {
                    // It's a Variant
                    if (targetWarehouse === SYSTEM_IDS.CENTRAL) {
                        await supabase.from('product_variants')
                            .update({ stock_qty: (variant.stock_qty || 0) + quantity })
                            .match({ product_sku: sku, suffix: suffix });
                    } else {
                        // Showroom or Other Warehouse (Stored in product_stock)
                        const currentQty = variant.location_stock?.[targetWarehouse] || 0;
                        await supabase.from('product_stock').upsert({
                            product_sku: sku,
                            variant_suffix: suffix,
                            warehouse_id: targetWarehouse,
                            quantity: currentQty + quantity
                        }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                    }
                } else {
                    // It's a Master/Simple Product
                    if (targetWarehouse === SYSTEM_IDS.CENTRAL) {
                        await supabase.from('products')
                            .update({ stock_qty: (product.stock_qty || 0) + quantity })
                            .eq('sku', sku);
                    } else if (targetWarehouse === SYSTEM_IDS.SHOWROOM) {
                        // Master showroom stock is stored on product table
                        await supabase.from('products')
                            .update({ sample_qty: (product.sample_qty || 0) + quantity })
                            .eq('sku', sku);
                    } else {
                        // Other warehouse
                        const currentQty = product.location_stock?.[targetWarehouse] || 0;
                        await supabase.from('product_stock').upsert({
                            product_sku: sku,
                            variant_suffix: null,
                            warehouse_id: targetWarehouse,
                            quantity: currentQty + quantity
                        }, { onConflict: 'product_sku, warehouse_id, variant_suffix' });
                    }
                }

                await recordStockMovement(sku, quantity, `Batch Print Import: ${warehouseName}`, suffix || undefined);
                successCount++;
            }

            await queryClient.invalidateQueries({ queryKey: ['products'] });
            
            // Add to Log
            const logDetails = items.map(i => ({ sku: i.product.sku, variant: i.variant?.suffix, qty: i.quantity }));
            setActionLogs(prev => [{
                id: Date.now().toString(),
                type: 'COMMIT' as const,
                timestamp: new Date().toISOString(),
                summary: `Εισαγωγή (${logDetails.reduce((a,b)=>a+b.qty,0)} τμχ)`,
                target: warehouseName,
                details: logDetails
            }, ...prev].slice(0, 50));

            showToast(`Επιτυχής προσθήκη ${successCount} ειδών στο ${warehouseName}!`, "success");

        } catch (e) {
            console.error(e);
            showToast("Σφάλμα κατά την καταχώρηση.", "error");
        } finally {
            setIsCommitting(false);
        }
    };

    // --- REVAMPED SMART INPUT LOGIC ---
    const handleSmartInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.toUpperCase();
        setScanInput(val);

        if (val.length < 2) {
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            return;
        }

        // Logic split: Range vs Single
        if (val.includes('-')) {
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            return;
        }

        let bestMaster: Product | null = null;
        let suffixPart = '';
        
        const exactMaster = allProducts.find(p => p.sku === val);
        const potentialMasters = allProducts.filter(p => val.startsWith(p.sku));
        const longestPrefixMaster = potentialMasters.sort((a,b) => b.sku.length - a.sku.length)[0];

        if (exactMaster) {
            bestMaster = exactMaster;
            suffixPart = '';
        } else if (longestPrefixMaster) {
            bestMaster = longestPrefixMaster;
            suffixPart = val.replace(longestPrefixMaster.sku, '');
        }

        let candidates: Product[] = [];
        if (bestMaster) {
            candidates = [bestMaster]; 
        } else {
            candidates = allProducts.filter(p => p.sku.startsWith(val)).slice(0, 6);
        }
        setCandidateProducts(candidates);

        if (bestMaster) {
            setActiveMasterProduct(bestMaster);
            if (bestMaster.variants) {
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
        }
    };

    const selectProductCandidate = (product: Product) => {
        setScanInput(product.sku);
        setActiveMasterProduct(product);
        setCandidateProducts([product]);
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
            setFilteredVariants([]); 
            inputRef.current?.focus();
        }
    };

    const executeSmartAdd = () => {
        if (!scanInput) return;
        const expandedSkus = expandSkuRange(scanInput);
        let addedCount = 0;
        let notFoundCount = 0;
        const validEntries: string[] = [];

        for (const rawSku of expandedSkus) {
            const match = findProductByScannedCode(rawSku, allProducts);
            if (match) {
                validEntries.push(rawSku);
                addedCount++;
            } else {
                notFoundCount++;
            }
        }

        if (addedCount > 0) {
            const currentLines = skusText.split('\n').filter(l => l.trim());
            const newLines = validEntries.map(sku => `${sku} ${scanQty}`);
            setSkusText([...currentLines, ...newLines].join('\n'));

            setScanInput('');
            setScanQty(1);
            setCandidateProducts([]);
            setActiveMasterProduct(null);
            setFilteredVariants([]);
            inputRef.current?.focus();
            showToast(`Προστέθηκαν ${addedCount} κωδικοί!`, 'success');
        } else {
            showToast("Δεν βρέθηκαν έγκυροι κωδικοί.", "error");
        }
        if (notFoundCount > 0) {
            showToast(`${notFoundCount} κωδικοί δεν βρέθηκαν.`, 'warning');
        }
    };

    // --- HISTORY ACTIONS ---
    const handleReloadLog = (log: ActionLog) => {
        const text = log.details.map(d => `${d.sku}${d.variant || ''} ${d.qty}`).join('\n');
        setSkusText(text);
        setShowHistoryModal(false);
        showToast("Η ουρά φορτώθηκε από το ιστορικό.", "success");
    };

    // --- VISUALIZERS ---
    const SkuPartVisualizer = ({ text, masterContext }: { text: string, masterContext: Product | null }) => {
        let masterStr = text;
        let suffixStr = '';

        if (masterContext) {
            const masterLen = masterContext.sku.length;
            if (text.startsWith(masterContext.sku)) {
                masterStr = text.slice(0, masterLen);
                suffixStr = text.slice(masterLen);
            }
        } else {
            const split = splitSkuComponents(text);
            masterStr = split.master;
            suffixStr = split.suffix;
        }

        const { finish, stone } = getVariantComponents(suffixStr, masterContext?.gender);
        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';

        const renderSuffixChars = () => {
            return suffixStr.split('').map((char, i) => {
                let colorClass = 'text-slate-400';
                if (finish.code && i < finish.code.length) colorClass = fColor;
                else if (stone.code && i >= (suffixStr.length - stone.code.length)) colorClass = sColor;
                return <span key={i} className={colorClass}>{char}</span>
            });
        };

        return (
            <span>
                <span className="text-slate-900 font-black">{masterStr}</span>
                <span className="font-black">{renderSuffixChars()}</span>
            </span>
        );
    }

    const SkuVisualizer = () => {
        if (scanInput.includes('-')) {
            const parts = scanInput.split('-');
            const start = parts[0];
            const end = parts.slice(1).join('-');
            const startMatch = findProductByScannedCode(start, allProducts);
            const endMatch = findProductByScannedCode(end, allProducts) || { product: allProducts.find(p => end.startsWith(p.sku)) || null };

            return (
                <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                    <SkuPartVisualizer text={start} masterContext={startMatch?.product || null} />
                    <span className="text-amber-500 font-bold mx-1">-</span>
                    <SkuPartVisualizer text={end} masterContext={endMatch?.product || null} />
                </div>
            );
        }
        return (
            <div className="absolute inset-y-0 left-0 p-3.5 pointer-events-none font-mono text-xl tracking-wider flex items-center overflow-hidden z-20">
                <SkuPartVisualizer text={scanInput} masterContext={activeMasterProduct} />
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
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
                <div>
                     <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-slate-800 text-white rounded-xl"><Printer size={24} /></div>
                        Μαζική Εκτύπωση Ετικετών
                    </h1>
                    <p className="text-slate-500 mt-1 ml-14">Δημιουργήστε ουρά εκτύπωσης χρησιμοποιώντας την έξυπνη είσοδο.</p>
                </div>
                
                <div className="flex gap-2">
                    <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" />
                    
                    <button 
                        onClick={() => setShowHistoryModal(true)} 
                        title="Ιστορικό"
                        className="p-3 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all border border-slate-200"
                    >
                        <History size={20} />
                    </button>

                    <button 
                        onClick={() => fileInputRef.current?.click()} 
                        disabled={isProcessing}
                        title="Εισαγωγή PDF" 
                        className="p-3 rounded-xl font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all border border-amber-200 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
                    </button>
                    
                    <button 
                        onClick={() => setShowScanner(true)} 
                        title="Σάρωση"
                        className="p-3 rounded-xl font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all border border-blue-200"
                    >
                        <Camera size={20} />
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

                <div className="flex flex-col gap-6">
                    {/* INPUT ROW */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end overflow-visible">
                        <div className="md:col-span-7 relative overflow-visible">
                            <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Κωδικός / SKU / Εύρος (π.χ. DA050-DA063)</label>
                            <div className="relative">
                                <SkuVisualizer />
                                <input 
                                    ref={inputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={handleSmartInput}
                                    onKeyDown={e => {
                                        if(e.key === 'Enter') { e.preventDefault(); executeSmartAdd(); }
                                    }}
                                    placeholder="Πληκτρολογήστε..."
                                    className="w-full p-3.5 bg-white text-transparent caret-slate-800 font-mono text-xl font-black rounded-2xl border border-slate-200 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 uppercase tracking-widest transition-all shadow-sm relative z-10"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="text-[10px] text-slate-400 font-black uppercase mb-1.5 ml-1 block tracking-widest">Ποσ.</label>
                            <input 
                                type="number" 
                                min="1" 
                                value={scanQty} 
                                onChange={e => setScanQty(parseInt(e.target.value)||1)} 
                                className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                            />
                        </div>

                        <div className="md:col-span-3">
                            <button 
                                onClick={executeSmartAdd}
                                disabled={!scanInput}
                                className="w-full h-[58px] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
                            >
                                <Plus size={28}/>
                            </button>
                        </div>
                    </div>

                    {/* FEEDBACK & SUGGESTIONS AREA */}
                    <div className="space-y-4">
                        {/* VISUAL CANDIDATES STRIP */}
                        {candidateProducts.length > 0 && !scanInput.includes('-') && (
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
                        {filteredVariants.length > 0 && !scanInput.includes('-') && (
                            <div className="animate-in slide-in-from-top-2 fade-in bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
                                <label className="text-[9px] text-slate-400 font-bold uppercase mb-2 ml-1 block tracking-widest flex items-center gap-1">
                                    <Lightbulb size={10} className="text-amber-500"/> ΔΙΑΘΕΣΙΜΕΣ ΠΑΡΑΛΛΑΓΕΣ
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar">
                                    {filteredVariants.map(s => {
                                        const { finish, stone } = getVariantComponents(s.suffix, activeMasterProduct?.gender);
                                        const fColor = FINISH_COLORS[finish.code] || 'text-slate-400';
                                        const sColor = STONE_TEXT_COLORS[stone.code] || 'text-emerald-400';
                                        
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
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                <div className="md:col-span-3 space-y-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h2 className="font-bold text-slate-800">Ουρά Εκτύπωσης</h2>
                                <span className="text-[10px] font-black text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 uppercase tracking-widest">{skusText.split('\n').filter(l => l.trim()).length} ΓΡΑΜΜΕΣ</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={handlePrint}
                                    disabled={isProcessing || !skusText.trim()}
                                    className="bg-slate-900 text-white px-4 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                                    Εκτύπωση
                                </button>
                                <button 
                                    onClick={() => setSkusText('')} 
                                    title="Καθαρισμός"
                                    className="p-1.5 rounded-xl font-bold bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all border border-slate-100"
                                >
                                    <Trash2 size={16}/>
                                </button>
                            </div>
                        </div>
                        <textarea
                            value={skusText}
                            onChange={(e) => setSkusText(e.target.value)}
                            rows={12}
                            className="w-full p-4 border border-slate-200 rounded-xl font-mono text-sm bg-white text-slate-900 focus:ring-4 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all placeholder-slate-400 flex-1 custom-scrollbar"
                            placeholder={`Προσθέστε κωδικούς παραπάνω ή πληκτρολογήστε εδώ...\nDA100-DA1063 2\nXR2020 5`}
                        />
                    </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                     <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h2 className="font-bold text-slate-800 mb-4 text-center">Ρυθμίσεις Ετικέτας</h2>
                        <div className="flex gap-2 bg-slate-50 p-1 rounded-xl">
                            <button 
                                onClick={() => setLabelFormat('standard')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${labelFormat === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Tag size={14}/> Χονδρική
                            </button>
                            <button 
                                onClick={() => setLabelFormat('retail')}
                                className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${labelFormat === 'retail' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <ShoppingBag size={14}/> Λιανική
                            </button>
                        </div>
                     </div>

                     {/* Stock Commit Section */}
                     <div className="bg-emerald-50/50 p-6 rounded-3xl shadow-sm border border-emerald-100 space-y-4">
                        <h2 className="font-bold text-emerald-800 text-sm flex items-center gap-2 uppercase tracking-wide">
                            <PackageCheck size={16}/> Ενημέρωση Αποθήκης
                        </h2>
                        
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Χώρος Εισαγωγής</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                <select 
                                    value={targetWarehouse}
                                    onChange={e => setTargetWarehouse(e.target.value)}
                                    className="w-full pl-9 p-2.5 bg-white border border-emerald-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 font-bold text-sm text-slate-800 appearance-none cursor-pointer"
                                >
                                    {warehouses?.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <button 
                            onClick={handleCommitToStock}
                            disabled={isCommitting || !skusText.trim()}
                            className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isCommitting ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>}
                            {isCommitting ? 'Καταχώρηση...' : 'Καταχώρηση στο Απόθεμα'}
                        </button>
                     </div>

                     {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 h-[80vh] flex flex-col animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                             <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><History size={20} className="text-blue-500"/> Ιστορικό Ενεργειών</h3>
                             <div className="flex items-center gap-2">
                                <button onClick={() => { localStorage.removeItem('batch_print_logs'); setActionLogs([]); }} className="text-xs text-red-500 hover:text-red-700 font-bold px-3 py-1.5 bg-red-50 rounded-lg">Καθαρισμός</button>
                                <button onClick={() => setShowHistoryModal(false)} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} className="text-slate-400"/></button>
                             </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                            {actionLogs.length > 0 ? actionLogs.map(log => (
                                <div key={log.id} className="relative pl-4 border-l-2 border-slate-200 pb-2">
                                    <div className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${log.type === 'PRINT' ? 'bg-slate-400' : 'bg-emerald-50'}`}></div>
                                    
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-black uppercase tracking-wider ${log.type === 'PRINT' ? 'text-slate-500' : 'text-emerald-600'}`}>
                                                {log.type === 'PRINT' ? 'ΕΚΤΥΠΩΣΗ' : 'ΚΑΤΑΧΩΡΗΣΗ'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-mono text-slate-400">{new Date(log.timestamp).toLocaleTimeString('el-GR', {hour:'2-digit', minute:'2-digit', day: '2-digit', month: '2-digit'})}</span>
                                                <button 
                                                    onClick={() => handleReloadLog(log)}
                                                    title="Επαναφόρτωση στην Ουρά"
                                                    className="p-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
                                                >
                                                    <RotateCcw size={12}/>
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="font-bold text-slate-800 text-sm mb-2">
                                            {log.summary} {log.target && <span className="text-slate-500 font-normal">στο {log.target}</span>}
                                        </div>

                                        <div className="flex flex-wrap gap-1">
                                            {log.details.map((d, i) => (
                                                <span key={i} className="text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-600 font-bold font-mono">
                                                    {d.sku}{d.variant} <span className="text-slate-400 font-medium">x{d.qty}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-20 text-slate-400 italic">Το ιστορικό είναι άδειο.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
                </div>
            </div>
            {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} continuous={true} />}
        </div>
    );
}
