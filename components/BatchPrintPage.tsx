import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Product, ProductVariant, Collection } from '../types';
import { Printer, Loader2, Check, AlertCircle, Camera, FileUp, Plus, Lightbulb, History, Trash2, Tag, ImageIcon, Search, X, RotateCcw, BookImage, LayoutGrid, FolderKanban, Users2, Zap, Eye } from 'lucide-react';
import { useUI } from './UIProvider';
import BarcodeScanner from './BarcodeScanner';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { extractSkusFromImage } from '../lib/gemini';
import { getVariantComponents, findProductByScannedCode, expandSkuRange, splitSkuComponents } from '../utils/pricingEngine';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import DesktopPageHeader from './DesktopPageHeader';
import { parseBatchLabelInputLine } from '../features/printing/batchLabelInput';
import { buildBatchLabelOverrideKey, buildLabelText, LabelTextOverrides, PrintLabelItem, readLabelPrintSettings } from '../features/printing';
import LabelPrintSettingsPanel from './printing/LabelPrintSettingsPanel';
import LabelPreviewEditModal from './printing/LabelPreviewEditModal';
import { getSizingInfo } from '../utils/sizing';

// Set workerSrc for pdf.js.
GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.mjs`;

interface Props {
    allProducts: Product[];
    allCollections: Collection[];
    setPrintItems: (items: PrintLabelItem[]) => void;
    onPrintPhotoCatalog: (products: Product[]) => void;
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
    'KR': 'text-rose-600', 'QN': 'text-slate-900', 'LA': 'text-blue-600', 'TY': 'text-teal-500',
    'TG': 'text-orange-700', 'IA': 'text-red-800', 'BSU': 'text-slate-800', 'GSU': 'text-emerald-800',
    'RSU': 'text-rose-800', 'MA': 'text-emerald-600', 'FI': 'text-slate-400', 'OP': 'text-indigo-500',
    'NF': 'text-green-700', 'CO': 'text-cyan-600', 'TPR': 'text-emerald-500', 'TKO': 'text-rose-600',
    'TMP': 'text-blue-600', 'PCO': 'text-teal-500', 'MCO': 'text-purple-500', 'PAX': 'text-green-600',
    'MAX': 'text-blue-700', 'KAX': 'text-red-700', 'AI': 'text-slate-500', 'AP': 'text-cyan-500',
    'AM': 'text-teal-700', 'AZM': 'text-teal-600', 'LR': 'text-indigo-700', 'SB': 'text-sky-400', 'MP': 'text-blue-400',
    'LE': 'text-slate-400', 'PR': 'text-green-500', 'KO': 'text-red-500', 'MV': 'text-purple-400',
    'RZ': 'text-pink-500', 'AK': 'text-cyan-300', 'XAL': 'text-stone-400', 'SD': 'text-blue-800',
    'AX': 'text-emerald-700'
};

interface ActionLog {
    id: string;
    timestamp: string;
    summary: string;
    details: { sku: string; variant?: string; qty: number }[];
}

interface ParsedBatchLabelQueueItem {
    key: string;
    lineIndex: number;
    lineText: string;
    rawSku: string;
    product: Product;
    variant?: ProductVariant;
    quantity: number;
    size?: string;
}

function loadPrintHistory(): ActionLog[] {
    const saved = localStorage.getItem('batch_print_logs');
    if (!saved) return [];
    try {
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((log: { type?: string }) => !log.type || log.type === 'PRINT')
            .map((log: ActionLog) => ({
                id: String(log.id),
                timestamp: String(log.timestamp),
                summary: String(log.summary || ''),
                details: Array.isArray(log.details) ? log.details : [],
            }))
            .slice(0, 50);
    } catch {
        return [];
    }
}

export default function BatchPrintPage({ allProducts, allCollections, setPrintItems, skusText, setSkusText, onPrintPhotoCatalog }: Props) {
    const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

    const [isProcessing, setIsProcessing] = useState(false);
    const [showScanner, setShowScanner] = useState(false);

    // Persistent Settings
    const [labelFormat, setLabelFormat] = useState(() => readLabelPrintSettings().format);
    const [showPrice, setShowPrice] = useState(() => readLabelPrintSettings().showPrice);
    const [priceTier, setPriceTier] = useState(() => readLabelPrintSettings().priceTier);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const { showToast } = useUI();

    // ---- TAB STATE ----
    const [activeTab, setActiveTab] = useState<'labels' | 'catalog'>('labels');

    // ---- CATALOG TAB STATE ----
    const [catalogSearch, setCatalogSearch] = useState('');
    const [catalogCollectionId, setCatalogCollectionId] = useState<number | ''>('');
    const [catalogCategory, setCatalogCategory] = useState('');
    const [catalogGender, setCatalogGender] = useState('');
    const [catalogOnlyWithImage, setCatalogOnlyWithImage] = useState(false);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    // Derived: all unique categories
    const allCategories = useMemo(() => {
        return Array.from(new Set(allProducts.filter(p => !p.is_component).map(p => p.category))).sort();
    }, [allProducts]);

    // Derived: filtered products for catalog — sorted A→Z by SKU
    const catalogProducts = useMemo(() => {
        return allProducts.filter(p => {
            if (p.is_component) return false;
            if (catalogOnlyWithImage && !p.image_url) return false;
            if (catalogSearch) {
                const q = catalogSearch.toUpperCase();
                if (!p.sku.toUpperCase().includes(q) && !(p.description || '').toUpperCase().includes(q)) return false;
            }
            if (catalogCollectionId !== '') {
                if (!p.collections?.includes(catalogCollectionId as number)) return false;
            }
            if (catalogCategory && p.category !== catalogCategory) return false;
            if (catalogGender && p.gender !== catalogGender) return false;
            return true;
        }).sort((a, b) => a.sku.localeCompare(b.sku));
    }, [allProducts, catalogSearch, catalogCollectionId, catalogCategory, catalogGender, catalogOnlyWithImage]);

    const handleToggleSelectAll = () => {
        if (selectedSkus.size === catalogProducts.length) {
            setSelectedSkus(new Set());
        } else {
            setSelectedSkus(new Set(catalogProducts.map(p => p.sku)));
        }
    };

    const handleToggleSku = (sku: string) => {
        setSelectedSkus(prev => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const handlePrintCatalog = () => {
        const toPrint = catalogProducts.filter(p => selectedSkus.has(p.sku));
        if (toPrint.length === 0) {
            showToast('Δεν έχετε επιλέξει κωδικούς για εκτύπωση.', 'error');
            return;
        }
        onPrintPhotoCatalog(toPrint);
        showToast(`Φωτο-κατάλογος με ${toPrint.length} κωδικούς εστάλη για εκτύπωση.`, 'success');
    };

    // Persistent History
    const [actionLogs, setActionLogs] = useState<ActionLog[]>(loadPrintHistory);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [labelOverrideDrafts, setLabelOverrideDrafts] = useState<Record<string, LabelTextOverrides>>({});
    const [editingLabelKey, setEditingLabelKey] = useState<string | null>(null);

    // Persist changes
    useEffect(() => { localStorage.setItem('batch_print_format', labelFormat); }, [labelFormat]);
    useEffect(() => { localStorage.setItem('batch_print_show_price', String(showPrice)); }, [showPrice]);
    useEffect(() => { localStorage.setItem('batch_print_price_tier', priceTier); }, [priceTier]);
    useEffect(() => { localStorage.setItem('batch_print_logs', JSON.stringify(actionLogs)); }, [actionLogs]);
    useEffect(() => {
        if (!showHistoryModal) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowHistoryModal(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showHistoryModal]);

    // Smart Entry State
    const [scanInput, setScanInput] = useState('');
    const [scanQty, setScanQty] = useState(1);

    // Revamped State for Visuals
    const [candidateProducts, setCandidateProducts] = useState<Product[]>([]);
    const [activeMasterProduct, setActiveMasterProduct] = useState<Product | null>(null);
    const [filteredVariants, setFilteredVariants] = useState<{ variant: ProductVariant, suffix: string, desc: string }[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);

    const parsedLabelQueue = useMemo(() => {
        const entries: ParsedBatchLabelQueueItem[] = [];
        const notFound: string[] = [];

        skusText.split(/\r?\n/).forEach((line, lineIndex) => {
            if (!line.trim()) return;
            const parsedWithoutSizing = parseBatchLabelInputLine(line);
            if (!parsedWithoutSizing) return;

            const expandedSkus = expandSkuRange(parsedWithoutSizing.rawToken);

            for (const rawSku of expandedSkus) {
                let matchFound = false;
                const match = findProductByScannedCode(rawSku, allProducts);

                if (match) {
                    const parsed = parseBatchLabelInputLine(line, getSizingInfo(match.product));
                    if (!parsed) continue;

                    const pushEntry = (product: Product, variant?: ProductVariant, entryRawSku = rawSku) => {
                        entries.push({
                            key: buildBatchLabelOverrideKey({
                                lineIndex,
                                rawSku: entryRawSku,
                                quantity: parsed.quantity,
                                size: parsed.size,
                            }),
                            lineIndex,
                            lineText: line,
                            rawSku: entryRawSku,
                            product,
                            variant,
                            quantity: parsed.quantity,
                            size: parsed.size,
                        });
                    };

                    if (match.variant || (!match.product.variants || match.product.variants.length === 0)) {
                        pushEntry(match.product, match.variant);
                        matchFound = true;
                    } else {
                        const variants = match.product.variants || [];
                        const baseVariant = variants.find(v => v.suffix === "");

                        if (baseVariant) {
                            pushEntry(match.product, baseVariant, match.product.sku);
                            matchFound = true;
                        } else if (variants.length > 0) {
                            variants.forEach(v => {
                                pushEntry(match.product, v, match.product.sku + v.suffix);
                            });
                            matchFound = true;
                        }
                    }
                }

                if (!matchFound) {
                    notFound.push(rawSku);
                }
            }
        });

        return { entries, notFound };
    }, [allProducts, skusText]);

    useEffect(() => {
        const activeKeys = new Set(parsedLabelQueue.entries.map(item => item.key));
        setLabelOverrideDrafts(prev => {
            const next = Object.fromEntries(Object.entries(prev).filter(([key]) => activeKeys.has(key)));
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
        if (editingLabelKey && !activeKeys.has(editingLabelKey)) {
            setEditingLabelKey(null);
        }
    }, [editingLabelKey, parsedLabelQueue.entries]);

    const parseItemsFromText = () => {
        return { items: parsedLabelQueue.entries, notFound: parsedLabelQueue.notFound };
    };

    const handlePrint = () => {
        const { items, notFound } = parseItemsFromText();
        if (items.length === 0) {
            showToast('Δεν βρέθηκαν έγκυροι κωδικοί.', 'error');
            return;
        }

        setIsProcessing(true);
        const printPayload = items.map(i => ({
            product: i.product,
            variant: i.variant,
            quantity: i.quantity,
            size: i.size,
            format: labelFormat,
            showPrice,
            priceTier,
            labelOverrides: labelOverrideDrafts[i.key],
        }));
        const totalPieces = printPayload.reduce((sum, item) => sum + item.quantity, 0);

        setTimeout(() => {
            setPrintItems(printPayload);
            showToast(`Στάλθηκαν ${totalPieces} τεμάχια για εκτύπωση ετικετών (${labelFormat === 'retail' ? 'Λιανικής' : 'Χονδρικής'}).`, 'success');
            setActionLogs(prev => [{
                id: Date.now().toString(),
                timestamp: new Date().toISOString(),
                summary: `${totalPieces} Ετικέτες`,
                details: printPayload.map(i => ({ sku: i.product.sku, variant: i.variant?.suffix, qty: i.quantity })),
            }, ...prev].slice(0, 50));
            if (notFound.length > 0) {
                showToast(`${notFound.length} κωδικοί δεν βρέθηκαν και παραλείφθηκαν.`, 'warning');
            }
            setIsProcessing(false);
        }, 250);
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
        const longestPrefixMaster = potentialMasters.sort((a, b) => b.sku.length - a.sku.length)[0];

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

    const editingLabelItem = editingLabelKey
        ? parsedLabelQueue.entries.find(item => item.key === editingLabelKey) || null
        : null;
    const editingLabelOverrides = editingLabelKey ? labelOverrideDrafts[editingLabelKey] || {} : {};
    const labelPreviewWidth = labelFormat === 'retail'
        ? (settings?.retail_barcode_width_mm || 72)
        : (settings?.barcode_width_mm || 40);
    const labelPreviewHeight = labelFormat === 'retail'
        ? (settings?.retail_barcode_height_mm || 10)
        : (settings?.barcode_height_mm || 20);
    const hasLabelOverrides = (key: string) => Boolean(labelOverrideDrafts[key] && Object.keys(labelOverrideDrafts[key]).length > 0);
    const updateEditingLabelOverride = (field: keyof LabelTextOverrides, value: string) => {
        if (!editingLabelKey) return;
        setLabelOverrideDrafts(prev => ({
            ...prev,
            [editingLabelKey]: {
                ...(prev[editingLabelKey] || {}),
                [field]: value,
            },
        }));
    };
    const resetEditingLabelOverride = () => {
        if (!editingLabelKey) return;
        setLabelOverrideDrafts(prev => {
            const next = { ...prev };
            delete next[editingLabelKey];
            return next;
        });
    };

    const readyLineCount = parsedLabelQueue.entries.length;
    const readyPieceCount = parsedLabelQueue.entries.reduce((sum, item) => sum + item.quantity, 0);
    const missingCount = parsedLabelQueue.notFound.length;
    const canPrint = readyLineCount > 0 && !isProcessing;
    const lastPrint = actionLogs[0];
    const formatLabel = labelFormat === 'retail' ? 'Λιανικής' : 'Χονδρικής';
    const triggerPrint = () => {
        if (!canPrint) return;
        handlePrint();
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            <DesktopPageHeader
                icon={Printer}
                title="Μαζική Εκτύπωση"
                subtitle="Ετοιμάστε ουρά ετικετών ή φωτο-κατάλογο και στείλτε τα για εκτύπωση."
                tailClassName="flex w-full min-w-0 flex-1 flex-wrap items-center gap-2 lg:ml-auto lg:max-w-none lg:justify-end"
                tail={(
                    <>
                        <input type="file" accept=".pdf" ref={fileInputRef} onChange={handlePdfUpload} className="hidden" />
                        {activeTab === 'labels' && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShowHistoryModal(true)}
                                    title="Ιστορικό εκτυπώσεων"
                                    aria-label="Ιστορικό εκτυπώσεων"
                                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-bold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-100"
                                >
                                    <History size={18} />
                                    <span className="hidden text-sm sm:inline">Ιστορικό</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isProcessing}
                                    title="Εισαγωγή PDF"
                                    aria-label="Εισαγωγή PDF"
                                    className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 font-bold text-amber-700 shadow-sm transition-all hover:bg-amber-100 disabled:opacity-50"
                                >
                                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
                                    <span className="hidden text-sm sm:inline">PDF</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowScanner(true)}
                                    title="Σάρωση barcode"
                                    aria-label="Σάρωση barcode"
                                    className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 font-bold text-blue-700 shadow-sm transition-all hover:bg-blue-100"
                                >
                                    <Camera size={18} />
                                    <span className="hidden text-sm sm:inline">Σάρωση</span>
                                </button>
                            </>
                        )}
                    </>
                )}
                below={(
                    <div className="flex flex-wrap items-center gap-3">
                        {/* TAB SWITCHER — integrated in header */}
                        <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-100 flex gap-1 w-fit">
                            <button
                                onClick={() => setActiveTab('labels')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'labels'
                                    ? 'bg-slate-900 text-white shadow-md'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                    }`}
                            >
                                <Tag size={16} />
                                Ετικέτες
                            </button>
                            <button
                                onClick={() => setActiveTab('catalog')}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'catalog'
                                    ? 'bg-violet-600 text-white shadow-md shadow-violet-200'
                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                                    }`}
                            >
                                <BookImage size={16} />
                                Φωτο-κατάλογος
                            </button>
                        </div>
                    </div>
                )}
            />

            {/* ==================== LABELS TAB ==================== */}
            {activeTab === 'labels' && (<>

                {/* SMART ENTRY AREA — redesigned to match Inventory */}
                <div className="bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 rounded-[2rem] border-2 border-emerald-200/40 shadow-xl overflow-visible p-6 sm:p-8 animate-in slide-in-from-top-4 duration-500 ring-2 ring-emerald-500/5 relative">
                    <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/5 via-amber-500/5 to-emerald-500/5 rounded-[2rem] blur-xl opacity-50 animate-pulse pointer-events-none" />
                    <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2.5 bg-gradient-to-br from-[#060b00] to-slate-800 text-white rounded-xl shadow-lg shadow-emerald-900/10 ring-2 ring-emerald-500/20">
                            <Zap size={22} className="text-amber-500" />
                        </div>
                        <div>
                          <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg bg-gradient-to-r from-[#060b00] to-emerald-700 bg-clip-text text-transparent">Έξυπνη Ταχεία Εισαγωγή</h2>
                          <p className="text-[10px] text-slate-400 font-bold tracking-wide">Γρήγορη προσθήκη κωδικών για εκτύπωση</p>
                        </div>
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
                                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                                e.preventDefault();
                                                triggerPrint();
                                                return;
                                            }
                                            if (e.key === 'Enter') { e.preventDefault(); executeSmartAdd(); }
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
                                    onChange={e => setScanQty(parseInt(e.target.value) || 1)}
                                    className="w-full p-3.5 text-center font-black text-xl rounded-2xl outline-none bg-white text-slate-900 border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 shadow-sm"
                                />
                            </div>

                            <div className="md:col-span-3">
                                <button
                                    onClick={executeSmartAdd}
                                    disabled={!scanInput}
                                    className="w-full h-[58px] bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl flex items-center justify-center transition-all shadow-lg hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:translate-y-0"
                                >
                                    <Plus size={28} />
                                </button>
                            </div>
                        </div>

                        {/* FEEDBACK & SUGGESTIONS AREA */}
                        <div className="space-y-4">
                            {/* VISUAL CANDIDATES STRIP */}
                            {candidateProducts.length > 0 && !scanInput.includes('-') && (
                                <div className="animate-in slide-in-from-top-2 fade-in">
                                    <label className="text-[9px] text-slate-400 font-bold uppercase mb-1.5 ml-1 block tracking-widest flex items-center gap-1">
                                        <Search size={10} /> {activeMasterProduct ? 'ΕΠΙΛΕΓΜΕΝΟ ΠΡΟΪΟΝ' : 'ΠΡΟΤΑΣΕΙΣ ΑΝΑΖΗΤΗΣΗΣ'}
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
                                                        <img src={p.image_url} className="w-full h-full object-cover" alt={p.sku} loading="lazy" decoding="async" />
                                                    ) : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={16} /></div>}
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
                                        <Lightbulb size={10} className="text-amber-500" /> ΔΙΑΘΕΣΙΜΕΣ ΠΑΡΑΛΛΑΓΕΣ
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
                </div>

                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <div className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-3">
                                    <div>
                                        <h2 className="font-bold text-slate-800">Ουρά Εκτύπωσης</h2>
                                        <p className="text-[11px] font-medium text-slate-400">Ένας κωδικός ανά γραμμή. Ctrl+Enter για εκτύπωση.</p>
                                    </div>
                                    <span className="rounded-full border border-slate-100 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {skusText.split('\n').filter(l => l.trim()).length} γραμμές
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSkusText('')}
                                    disabled={!skusText.trim()}
                                    title="Καθαρισμός ουράς"
                                    className="rounded-xl border border-slate-100 bg-slate-50 p-2 font-bold text-slate-400 transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <textarea
                                value={skusText}
                                onChange={(e) => setSkusText(e.target.value)}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        triggerPrint();
                                    }
                                }}
                                rows={12}
                                className="custom-scrollbar min-h-[220px] w-full flex-1 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 font-mono text-sm text-slate-900 outline-none transition-all placeholder-slate-400 focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/20"
                                placeholder={`Προσθέστε κωδικούς παραπάνω ή πληκτρολογήστε εδώ...\nDA050-DA063 2\nXR2020 5`}
                            />
                            {(readyLineCount > 0 || missingCount > 0) ? (
                                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-800">Προεπισκόπηση ετικετών</h3>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                {readyLineCount} έτοιμες · {formatLabel}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {missingCount > 0 && (
                                                <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black text-red-600">
                                                    {missingCount} άγνωστοι
                                                </span>
                                            )}
                                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                                                {readyPieceCount} τεμ.
                                            </span>
                                        </div>
                                    </div>

                                    <div className="max-h-72 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                                        {parsedLabelQueue.entries.map(item => {
                                            const text = buildLabelText({
                                                product: item.product,
                                                variant: item.variant,
                                                format: labelFormat,
                                                size: item.size,
                                                showPrice,
                                                priceTier,
                                                overrides: labelOverrideDrafts[item.key],
                                            });
                                            const edited = hasLabelOverrides(item.key);

                                            return (
                                                <div key={item.key} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${edited ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                            <Tag size={16} />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate font-mono text-sm font-black text-slate-900">{text.displaySku}</span>
                                                                {item.size && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{item.size}</span>}
                                                                {edited && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-600">ΕΠΕΞ.</span>}
                                                            </div>
                                                            <div className="mt-0.5 truncate text-xs font-medium text-slate-500">
                                                                {text.stone || item.variant?.description || item.product.category}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">x{item.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingLabelKey(item.key)}
                                                        title="Προεπισκόπηση / επεξεργασία ετικέτας"
                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-all"
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                        {parsedLabelQueue.notFound.map((rawSku, index) => (
                                            <div key={`missing-${rawSku}-${index}`} className="flex items-center gap-3 px-4 py-3 bg-red-50/60">
                                                <AlertCircle size={16} className="text-red-500" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-mono text-sm font-black text-red-700">{rawSku}</div>
                                                    <div className="text-xs font-medium text-red-500">Δεν βρέθηκε προϊόν για προεπισκόπηση ή εκτύπωση.</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center">
                                    <Tag size={22} className="mx-auto text-slate-300" />
                                    <p className="mt-2 text-sm font-bold text-slate-500">Η ουρά είναι άδεια</p>
                                    <p className="mt-1 text-xs text-slate-400">Προσθέστε κωδικούς από την έξυπνη εισαγωγή, σάρωση ή PDF.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-5 lg:sticky lg:top-4 lg:col-span-4">
                        <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
                            <div className="mb-4">
                                <h2 className="font-bold text-slate-800">Ρυθμίσεις Ετικέτας</h2>
                                <p className="mt-0.5 text-[11px] font-medium text-slate-400">Εφαρμόζονται σε όλες τις ετικέτες της ουράς.</p>
                            </div>
                            <LabelPrintSettingsPanel
                                format={labelFormat}
                                showPrice={showPrice}
                                priceTier={priceTier}
                                onFormatChange={setLabelFormat}
                                onShowPriceChange={setShowPrice}
                                onPriceTierChange={setPriceTier}
                            />
                        </div>

                        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
                            <h2 className="font-bold text-slate-800">Εκτύπωση</h2>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Έτοιμες</div>
                                    <div className="mt-1 text-xl font-black text-slate-900">{readyLineCount}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Τεμάχια</div>
                                    <div className="mt-1 text-xl font-black text-slate-900">{readyPieceCount}</div>
                                </div>
                            </div>
                            {missingCount > 0 && (
                                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
                                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                    {missingCount} κωδικοί δεν βρέθηκαν και θα παραλειφθούν.
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={triggerPrint}
                                disabled={!canPrint}
                                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3.5 text-sm font-black text-white shadow-md transition-all hover:bg-slate-800 active:scale-[0.99] disabled:opacity-40"
                            >
                                {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                                {isProcessing
                                    ? 'Προετοιμασία...'
                                    : readyPieceCount > 0
                                        ? `Εκτύπωση ${readyPieceCount} ετικετών`
                                        : 'Εκτύπωση ετικετών'}
                            </button>
                            {lastPrint && (
                                <button
                                    type="button"
                                    onClick={() => handleReloadLog(lastPrint)}
                                    className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-left transition-colors hover:border-slate-200 hover:bg-white"
                                >
                                    <div className="min-w-0">
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Τελευταία εκτύπωση</div>
                                        <div className="truncate text-sm font-bold text-slate-700">{lastPrint.summary}</div>
                                    </div>
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-500">
                                        <RotateCcw size={12} /> Επαναφορά
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* History Modal */}
                        {showHistoryModal && (
                            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in" onClick={() => setShowHistoryModal(false)}>
                                <div role="dialog" aria-modal="true" aria-labelledby="batch-print-history-title" className="flex h-[80vh] w-full max-w-lg flex-col rounded-3xl bg-white p-6 shadow-2xl animate-in zoom-in-95" onClick={(event) => event.stopPropagation()}>
                                    <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                                        <h3 id="batch-print-history-title" className="flex items-center gap-2 text-lg font-bold text-slate-800">
                                            <History size={20} className="text-blue-500" /> Ιστορικό εκτυπώσεων
                                        </h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { localStorage.removeItem('batch_print_logs'); setActionLogs([]); }}
                                                disabled={actionLogs.length === 0}
                                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-40"
                                            >
                                                Καθαρισμός
                                            </button>
                                            <button type="button" onClick={() => setShowHistoryModal(false)} className="rounded-full p-2 hover:bg-slate-100">
                                                <X size={20} className="text-slate-400" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto pr-1">
                                        {actionLogs.length > 0 ? actionLogs.map(log => (
                                            <div key={log.id} className="relative border-l-2 border-slate-200 pb-2 pl-4">
                                                <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400 shadow-sm" />
                                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                                    <div className="mb-1 flex items-start justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Εκτύπωση</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono text-[9px] text-slate-400">
                                                                {new Date(log.timestamp).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleReloadLog(log)}
                                                                title="Επαναφόρτωση στην ουρά"
                                                                className="rounded bg-blue-50 p-1 text-blue-600 transition-colors hover:bg-blue-100"
                                                            >
                                                                <RotateCcw size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="mb-2 text-sm font-bold text-slate-800">{log.summary}</div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {log.details.map((d, i) => (
                                                            <span key={i} className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600">
                                                                {d.sku}{d.variant} <span className="font-medium text-slate-400">x{d.qty}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )) : (
                                            <div className="py-20 text-center italic text-slate-400">Το ιστορικό είναι άδειο.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} continuous={true} />}
            </>)}

            {/* ==================== PHOTO CATALOG TAB ==================== */}
            {activeTab === 'catalog' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">

                    {/* FILTERS */}
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-violet-600 text-white rounded-xl shadow-md">
                                <Search size={20} />
                            </div>
                            <div>
                                <h2 className="font-black text-slate-800 text-lg">Φίλτρα Επιλογής</h2>
                                <p className="text-slate-400 text-xs">Βρείτε και επιλέξτε προϊόντα για τον κατάλογό σας.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            {/* SKU Search */}
                            <div className="xl:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Αναζήτηση SKU / Περιγραφή</label>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        value={catalogSearch}
                                        onChange={e => setCatalogSearch(e.target.value)}
                                        placeholder="π.χ. DA050 ή βραχιόλι..."
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Collection */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Συλλογή</label>
                                <div className="relative">
                                    <FolderKanban size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select
                                        value={catalogCollectionId}
                                        onChange={e => setCatalogCollectionId(e.target.value === '' ? '' : Number(e.target.value))}
                                        className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer transition-all"
                                    >
                                        <option value="">Όλες</option>
                                        {allCollections.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Category */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Κατηγορία</label>
                                <div className="relative">
                                    <LayoutGrid size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select
                                        value={catalogCategory}
                                        onChange={e => setCatalogCategory(e.target.value)}
                                        className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer transition-all"
                                    >
                                        <option value="">Όλες</option>
                                        {allCategories.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Gender */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Φύλο</label>
                                <div className="relative">
                                    <Users2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <select
                                        value={catalogGender}
                                        onChange={e => setCatalogGender(e.target.value)}
                                        className="w-full pl-10 pr-3 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 appearance-none cursor-pointer transition-all"
                                    >
                                        <option value="">Όλα</option>
                                        <option value="Women">Γυναικεία</option>
                                        <option value="Men">Ανδρικά</option>
                                        <option value="Unisex">Ουδέτερο</option>
                                    </select>
                                </div>
                            </div>

                            {/* Only with image toggle */}
                            <div className="flex items-center">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div
                                        onClick={() => setCatalogOnlyWithImage(v => !v)}
                                        className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${catalogOnlyWithImage ? 'bg-violet-600' : 'bg-slate-200'
                                            }`}
                                    >
                                        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${catalogOnlyWithImage ? 'translate-x-6' : 'translate-x-0.5'
                                            }`} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-slate-700">Μόνο με εικόνα</div>
                                        <div className="text-[10px] text-slate-400">Απόκρυψη χωρίς φωτογραφία</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* SELECTION BAR */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-3">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleToggleSelectAll}
                                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${selectedSkus.size > 0 && selectedSkus.size === catalogProducts.length
                                    ? 'bg-violet-600 border-violet-600 text-white'
                                    : selectedSkus.size > 0
                                        ? 'bg-violet-100 border-violet-400 text-violet-600'
                                        : 'border-slate-300 bg-white hover:border-violet-400'
                                    }`}
                            >
                                {selectedSkus.size > 0 && <Check size={14} />}
                            </button>
                            <span className="text-sm font-bold text-slate-700">
                                <span className="text-violet-600">{selectedSkus.size}</span> επιλεγμένα
                                <span className="text-slate-400 font-normal ml-1">από {catalogProducts.length} αποτελέσματα</span>
                            </span>
                        </div>

                        <button
                            onClick={handlePrintCatalog}
                            disabled={selectedSkus.size === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all shadow-md shadow-violet-200 disabled:opacity-50 disabled:shadow-none active:scale-95 text-sm"
                        >
                            <Printer size={16} />
                            Εκτύπωση Φωτο-καταλόγου ({selectedSkus.size})
                        </button>
                    </div>

                    {/* PRODUCT GRID */}
                    {catalogProducts.length === 0 ? (
                        <div className="text-center py-20 text-slate-400">
                            <ImageIcon size={48} className="mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Δεν βρέθηκαν προϊόντα με τα επιλεγμένα φίλτρα.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                            {catalogProducts.map(product => {
                                const isSelected = selectedSkus.has(product.sku);
                                const variantCount = product.variants?.length || 0;
                                return (
                                    <div
                                        key={product.sku}
                                        onClick={() => handleToggleSku(product.sku)}
                                        className={`relative rounded-2xl overflow-hidden border-2 cursor-pointer transition-all duration-200 group ${isSelected
                                            ? 'border-violet-500 shadow-lg shadow-violet-100 scale-[1.02]'
                                            : 'border-slate-200 hover:border-violet-300 hover:shadow-md hover:scale-[1.01]'
                                            } bg-white`}
                                    >
                                        {/* Selection badge */}
                                        <div className={`absolute top-2 right-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                                            ? 'bg-violet-600 border-violet-600 text-white'
                                            : 'bg-white/80 border-slate-300 group-hover:border-violet-400'
                                            }`}>
                                            {isSelected && <Check size={13} />}
                                        </div>

                                        {/* Image */}
                                        <div className="aspect-square bg-slate-100 overflow-hidden">
                                            {product.image_url ? (
                                                <img
                                                    src={product.image_url}
                                                    alt={product.sku}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
                                                    <ImageIcon size={32} className="text-slate-300" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="p-2.5">
                                            <div className="font-black text-slate-900 font-mono text-sm tracking-wide leading-none">{product.sku}</div>
                                            <div className="text-[10px] text-slate-500 mt-1 font-medium truncate">{product.category}</div>
                                            {variantCount > 0 && (
                                                <div className="text-[10px] text-violet-500 font-bold mt-0.5">{variantCount} παραλλαγές</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {editingLabelItem && (
                <LabelPreviewEditModal
                    product={editingLabelItem.product}
                    variant={editingLabelItem.variant}
                    size={editingLabelItem.size}
                    format={labelFormat}
                    showPrice={showPrice}
                    priceTier={priceTier}
                    width={labelPreviewWidth}
                    height={labelPreviewHeight}
                    overrides={editingLabelOverrides}
                    onChangeField={updateEditingLabelOverride}
                    onReset={resetEditingLabelOverride}
                    onClose={() => setEditingLabelKey(null)}
                />
            )}
        </div>
    );
}
