
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection, Mold, ProductionType } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix, estimateVariantCost, getPrevalentVariant, getVariantComponents, roundPrice, SupplierAnalysis, formatCurrency, transliterateForBarcode } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCcw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent, ChevronLeft, ChevronRight, Layers, ScanBarcode, ChevronDown, Edit3, Search, Link, Activity, Puzzle, Minus, Palette, Globe, DollarSign, ThumbsUp, HelpCircle, BookOpen, Scroll } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import JsBarcode from 'jsbarcode';

interface PrintModalProps {
    product: Product;
    onClose: () => void;
    onPrint: (items: { product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple' }[]) => void;
}

const GENDER_MAP: Record<Gender, string> = {
    [Gender.Men]: 'Ανδρικά',
    [Gender.Women]: 'Γυναικεία',
    [Gender.Unisex]: 'Unisex'
};

const PLATING_LABELS: Record<string, string> = {
    'None': 'Λουστρέ',
    'Gold-Plated': 'Επίχρυσο',
    'Two-Tone': 'Δίχρωμο',
    'Platinum': 'Επιπλατινωμένο'
};

const getMaterialIcon = (type?: string) => {
    switch (type) {
        case 'Stone': return <Gem size={16} className="text-emerald-500" />;
        case 'Cord': return <Activity size={16} className="text-amber-600" />;
        case 'Chain': return <Link size={16} className="text-slate-500" />;
        case 'Component': return <Puzzle size={16} className="text-blue-500" />;
        case 'Enamel': return <Palette size={16} className="text-rose-500" />;
        case 'Leather': return <Scroll size={16} className="text-amber-700" />;
        default: return <Box size={16} className="text-slate-400" />;
    }
};

const getSuffixPriority = (suffix: string) => {
    const s = suffix.toUpperCase();
    if (!s) return 0; 
    if (s.includes('P')) return 1; 
    if (s.includes('D')) return 2; 
    if (s.includes('X')) return 2; 
    if (s.includes('H')) return 3; 
    return 4; 
};

const PrintModal: React.FC<PrintModalProps> = ({ product, onClose, onPrint }) => {
    const hasVariants = product.variants && product.variants.length > 0;
    const sortedVariants = hasVariants 
        ? [...product.variants!].sort((a, b) => getSuffixPriority(a.suffix) - getSuffixPriority(b.suffix))
        : [];

    const displayItems = hasVariants 
        ? sortedVariants.map(v => ({ suffix: v.suffix, description: v.description, stock_qty: v.stock_qty }))
        : [{ suffix: '(Master)', description: 'Βασικό Προϊόν', stock_qty: product.stock_qty }];
    
    const [quantities, setQuantities] = useState<Record<string, number>>(
        displayItems.reduce((acc, v) => ({ ...acc, [v.suffix]: 0 }), {})
    );

    const handleQuantityChange = (suffix: string, qty: number) => {
        setQuantities(prev => ({ ...prev, [suffix]: Math.max(0, qty) }));
    };

    const handlePrint = () => {
        const itemsToPrint: { product: Product, variant?: ProductVariant, quantity: number, format?: 'standard' | 'simple' }[] = [];
        for (const suffix in quantities) {
            const qty = quantities[suffix];
            if (qty > 0) {
                const variant = suffix === '(Master)' ? undefined : product.variants?.find(v => v.suffix === suffix);
                itemsToPrint.push({ product, variant, quantity: qty, format: 'standard' });
            }
        }
        
        if (itemsToPrint.length > 0) {
            onPrint(itemsToPrint);
            setTimeout(() => {
                onClose(); 
            }, 500);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg relative animate-in zoom-in-95 duration-200 border border-slate-100">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-full transition-all">
                    <X size={20} />
                </button>
                <h2 className="text-xl font-bold mb-1 text-[#060b00]">Εκτύπωση Ετικετών</h2>
                <p className="text-sm text-slate-500 mb-6 font-medium">{product.sku}</p>
                
                <div className="max-h-72 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {displayItems.map((v) => (
                        <div key={v.suffix} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <div>
                                <span className="font-mono font-bold text-slate-800">{product.sku}{v.suffix !== '(Master)' ? v.suffix : ''}</span>
                                <span className="text-xs text-slate-500 ml-2 font-medium">{v.description}</span>
                            </div>
                            <input
                                type="number"
                                min="0"
                                value={quantities[v.suffix]}
                                onChange={(e) => handleQuantityChange(v.suffix, parseInt(e.target.value) || 0)}
                                className="w-20 p-2 border border-slate-200 rounded-lg text-center bg-white text-slate-900 focus:ring-2 focus:ring-amber-500 outline-none font-bold"
                            />
                        </div>
                    ))}
                </div>
                
                <button onClick={handlePrint} className="mt-6 w-full bg-[#060b00] text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-lg shadow-slate-200">
                    <Printer size={18} /> Εκτύπωση
                </button>
            </div>
      </div>
    );
};

const BarcodeRow: React.FC<{ product: Product, variant?: ProductVariant }> = ({ product, variant }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sku = variant ? `${product.sku}${variant.suffix}` : product.sku;
    
    useEffect(() => {
        if (canvasRef.current) {
            try {
                const encodedSku = transliterateForBarcode(sku);
                JsBarcode(canvasRef.current, encodedSku, {
                    format: 'CODE128',
                    width: 1.5,
                    height: 40,
                    displayValue: false, // Set to false, text is rendered separately
                    margin: 0,
                    background: 'transparent'
                });
            } catch(e) {
                console.error(`JsBarcode failed for SKU "${sku}":`, e);
            }
        }
    }, [sku]);

    return (
        <div className="flex flex-col md:flex-row items-center gap-6 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
            <div className="flex-1">
                <div className="font-black text-lg text-slate-800 tracking-tight">{sku}</div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                    {variant ? variant.description : 'Βασικό Προϊόν (Master)'}
                </div>
            </div>
            
            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-center min-w-[200px]">
                <canvas ref={canvasRef} className="max-w-full h-auto" />
            </div>
        </div>
    );
};

// --- UPDATED SMART AUDIT CARD ---
const SmartAuditCard = ({ analysis }: { analysis: SupplierAnalysis }) => {
    const color = 
        analysis.verdict === 'Excellent' ? 'emerald' : 
        analysis.verdict === 'Fair' ? 'blue' : 
        analysis.verdict === 'Expensive' ? 'orange' : 'rose';

    const Icon = 
        analysis.verdict === 'Excellent' ? ThumbsUp : 
        analysis.verdict === 'Fair' ? CheckCircle : 
        analysis.verdict === 'Expensive' ? Info : AlertTriangle;

    const hasReportedLabor = analysis.breakdown.supplierReportedTotalLabor > 0;

    return (
        <div className="space-y-6">
            <div className={`border-2 border-${color}-100 bg-${color}-50/30 rounded-2xl p-5`}>
                <div className="flex items-center gap-3 border-b border-${color}-200/50 pb-3 mb-4">
                    <div className={`p-2 bg-${color}-100 text-${color}-600 rounded-lg`}>
                        <Icon size={22} />
                    </div>
                    <div>
                        <h4 className={`text-base font-bold uppercase text-${color}-800`}>Έξυπνη Αξιολόγηση</h4>
                        <p className={`text-xs font-medium text-${color}-600`}>Βάσει τιμής μετάλλου & κατασκευής</p>
                    </div>
                    <div className={`ml-auto px-4 py-1.5 bg-${color}-100 text-${color}-700 rounded-full text-xs font-black uppercase tracking-wide shadow-sm border border-${color}-200`}>
                        {analysis.verdict === 'Excellent' && 'Εξαιρετική Τιμή'}
                        {analysis.verdict === 'Fair' && 'Δίκαιη Τιμή'}
                        {analysis.verdict === 'Expensive' && 'Ακριβό'}
                        {analysis.verdict === 'Overpriced' && 'Υπερκοστολογημένο'}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center text-sm bg-white/60 p-2 rounded-lg">
                        <span className="text-slate-500 font-medium">Αξία Υλικών (Melt)</span>
                        <span className="font-bold text-slate-800">{formatCurrency(analysis.intrinsicValue)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm bg-white/60 p-2 rounded-lg">
                        <span className="text-slate-500 font-medium">Θεωρητικό Κόστος</span>
                        <span className="font-bold text-slate-800">{formatCurrency(analysis.theoreticalMakeCost)}</span>
                    </div>

                    {/* NEW FORENSIC SECTION */}
                    {hasReportedLabor && (
                        <div className="bg-white/40 p-2 rounded-lg border border-slate-100 space-y-2 mt-2">
                            <h6 className="text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100 pb-1">Forensics</h6>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Κόστος Εργασίας Προμηθευτή:</span>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold">{formatCurrency(analysis.breakdown.supplierReportedTotalLabor)}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                        analysis.laborEfficiency === 'Cheaper' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                        analysis.laborEfficiency === 'More Expensive' ? 'bg-orange-50 text-orange-600 border-orange-100' : 
                                        'bg-slate-50 text-slate-500 border-slate-100'
                                    }`}>
                                        {analysis.laborEfficiency === 'Cheaper' ? 'Φθηνότερο' : analysis.laborEfficiency === 'More Expensive' ? 'Ακριβότερο' : 'Παρόμοιο'}
                                    </span>
                                </div>
                            </div>
                            {analysis.effectiveSilverPrice > 0 && (
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Effective Silver Price:</span>
                                    <span className={`font-mono font-bold ${analysis.hasHiddenMarkup ? 'text-red-600' : 'text-slate-700'}`}>
                                        {analysis.effectiveSilverPrice.toFixed(2)}€/g
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 border-dashed">
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase">Επιπλέον Χρέωση</span>
                            <span className={`font-black text-lg text-${color}-700`}>{formatCurrency(analysis.supplierPremium)}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full mt-2 overflow-hidden flex">
                            <div className="bg-slate-400 h-full" style={{ width: `${Math.min(100, (analysis.intrinsicValue / analysis.theoreticalMakeCost) * 100)}%` }} />
                            <div className={`bg-${color}-500 h-full`} style={{ width: `${Math.min(100, (Math.max(0, analysis.supplierPremium) / analysis.theoreticalMakeCost) * 100)}%` }} />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 text-right">Περιθώριο: {analysis.premiumPercent}%</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- ANALYSIS EXPLAINER MODAL ---
const AnalysisExplainerModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm text-blue-600">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Πώς λειτουργεί ο Έλεγχος Τιμής;</h2>
                        <p className="text-sm text-slate-500">Οδηγός Ανάλυσης Κόστους Προμηθευτή</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-2 bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 shadow-sm transition-all"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
                <div className="space-y-4">
                    <p className="text-slate-600 leading-relaxed">
                        Το σύστημα χρησιμοποιεί μια μέθοδο <strong>Reverse Engineering</strong> (Αντίστροφης Μηχανικής) για να αναλύσει την τιμή που σας δίνει ο προμηθευτής. Συγκρίνει την τιμή αγοράς με το πραγματικό κόστος των υλικών και της εργασίας.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Coins size={18} className="text-amber-500"/> Melt Value (Αξία Υλικών)</h3>
                        <p className="text-sm text-slate-500">
                            Είναι η "σκληρή" αξία του προϊόντος αν το λιώναμε. Υπολογίζεται από το Βάρος x Τιμή Ασημιού + Κόστος Πετρών. Αυτό είναι το ελάχιστο δυνατό κόστος.
                        </p>
                    </div>
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Hammer size={18} className="text-blue-500"/> Make Cost (Θεωρητικό)</h3>
                        <p className="text-sm text-slate-500">
                            Πόσο θα κόστιζε να το φτιάξουμε εμείς; Υπολογίζεται προσθέτοντας στην Αξία Υλικών τα τυπικά κοστολόγια εργαστηρίου (Χύτευση, Τεχνίτης, Καρφωτής).
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Forensics (Ιατροδικαστική Ανάλυση)</h3>
                    <p className="text-sm text-slate-600">
                        Εδώ γίνεται ο έλεγχος για "κρυφές χρεώσεις". Ζητώντας σας να συμπληρώσετε τα επιμέρους εργατικά που ισχυρίζεται ο προμηθευτής, το σύστημα κάνει τα εξής:
                    </p>
                    <ul className="space-y-3">
                        <li className="flex gap-3 text-sm text-slate-700 bg-red-50 p-3 rounded-xl border border-red-100">
                            <AlertTriangle className="text-red-500 shrink-0" size={20}/>
                            <span>
                                <strong>Effective Silver Price:</strong> Αφαιρώντας τα εργατικά και τις πέτρες από την Τιμή Αγοράς, βρίσκουμε πόσο σας χρεώνει τελικά το γραμμάριο το μέταλλο. Αν βγει π.χ. 1.20€/g ενώ η αγορά είναι 0.85€/g, υπάρχει κρυφό "καπέλο" στο μέταλλο.
                            </span>
                        </li>
                        <li className="flex gap-3 text-sm text-slate-700 bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <Activity className="text-blue-500 shrink-0" size={20}/>
                            <span>
                                <strong>Labor Efficiency:</strong> Συγκρίνει τα εργατικά του προμηθευτή με τα δικά μας. Αν είναι πολύ υψηλότερα, ίσως είναι υπερκοστολογημένα.
                            </span>
                        </li>
                    </ul>
                </div>

                <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 text-center">
                    <h3 className="font-bold text-emerald-800 mb-2">Η Ετυμηγορία (Verdict)</h3>
                    <p className="text-sm text-emerald-700">
                        Το σύστημα χαρακτηρίζει την τιμή ως <strong>Excellent</strong>, <strong>Fair</strong>, ή <strong>Overpriced</strong> βασιζόμενο στο πόσο απέχει η Τιμή Αγοράς από το Θεωρητικό Κόστος Παραγωγής.
                    </p>
                </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 text-center">
                <button onClick={onClose} className="px-8 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition-colors shadow-lg">
                    Κατάλαβα
                </button>
            </div>
        </div>
    </div>
);

interface Props {
  product: Product;
  allProducts: Product[];
  allMaterials: Material[];
  onClose: () => void;
  onSave?: (updatedProduct: Product) => void;
  setPrintItems: (items: { product: Product; variant?: ProductVariant; quantity: number, format?: 'standard' | 'simple' }[]) => void;
  settings: GlobalSettings;
  collections: Collection[];
  allMolds: Mold[];
  viewMode?: 'registry' | 'warehouse';
}

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, allMolds, viewMode = 'registry' }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
  
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants' | 'barcodes'>('overview');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);

  const [editedProduct, setEditedProduct] = useState<Product>(() => {
    const initialLabor: Partial<LaborCost> = product.labor || {};
    return { 
        ...product,
        variants: product.variants || [],
        selling_price: product.selling_price || 0,
        molds: product.molds || [],
        collections: product.collections || [],
        secondary_weight_g: product.secondary_weight_g || 0,
        production_type: product.production_type || ProductionType.InHouse,
        supplier_id: product.supplier_id,
        supplier_cost: product.supplier_cost || 0,
        labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            technician_cost_manual_override: false,
            plating_cost_x_manual_override: false,
            plating_cost_d_manual_override: false,
            ...initialLabor,
        }
    };
  });
  
  const [showRepriceTool, setShowRepriceTool] = useState(false);
  const [targetMargin, setTargetMargin] = useState(50);
  const [calculatedPrice, setCalculatedPrice] = useState(0);

  // Molds Editing State
  const [isEditingMolds, setIsEditingMolds] = useState(false);
  const [moldSearch, setMoldSearch] = useState('');
  
  const [showAnalysisHelp, setShowAnalysisHelp] = useState(false);

  useEffect(() => {
    const initialLabor: Partial<LaborCost> = product.labor || {};
    setEditedProduct({ 
      ...product,
      variants: product.variants || [],
      selling_price: product.selling_price || 0,
      molds: product.molds || [],
      collections: product.collections || [],
      secondary_weight_g: product.secondary_weight_g || 0,
      production_type: product.production_type || ProductionType.InHouse,
      supplier_id: product.supplier_id,
      supplier_cost: product.supplier_cost || 0,
      labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            technician_cost_manual_override: false,
            plating_cost_x_manual_override: false,
            plating_cost_d_manual_override: false,
            ...initialLabor,
        }
    });
    setViewIndex(0);
  }, [product]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [smartAddSuffix, setSmartAddSuffix] = useState(''); 
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [manualSuffixAnalysis, setManualSuffixAnalysis] = useState<string | null>(null);

  useEffect(() => {
    if (editedProduct.production_type === ProductionType.InHouse && !editedProduct.labor.technician_cost_manual_override) {
        const techCost = calculateTechnicianCost(editedProduct.weight_g);
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, technician_cost: techCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.technician_cost_manual_override, editedProduct.production_type]);
  
  useEffect(() => {
    if (editedProduct.production_type === ProductionType.InHouse) {
        const totalWeight = (editedProduct.weight_g || 0) + (editedProduct.secondary_weight_g || 0);
        const castCost = parseFloat((totalWeight * 0.15).toFixed(2));
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, casting_cost: castCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.secondary_weight_g, editedProduct.production_type]);

  useEffect(() => {
    if (!editedProduct.labor.plating_cost_x_manual_override) {
        const costX = parseFloat((editedProduct.weight_g * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_x: costX } }));
    }
  }, [editedProduct.weight_g, editedProduct.labor.plating_cost_x_manual_override]);

  useEffect(() => {
    if (!editedProduct.labor.plating_cost_d_manual_override) {
        const costD = parseFloat(((editedProduct.secondary_weight_g || 0) * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_d: costD } }));
    }
  }, [editedProduct.secondary_weight_g, editedProduct.labor.plating_cost_d_manual_override]);

  useEffect(() => {
      setEditedProduct(prev => {
          if (!prev.variants || prev.variants.length === 0) return prev;

          let hasChanges = false;
          const updatedVariants = prev.variants.map(v => {
              const estimated = estimateVariantCost(
                  editedProduct, 
                  v.suffix,
                  settings,
                  allMaterials,
                  allProducts
              );
              
              if (Math.abs((v.active_price || 0) - estimated) > 0.005) {
                  hasChanges = true;
                  return { ...v, active_price: estimated };
              }
              return v;
          });

          if (hasChanges) {
              return { ...prev, variants: updatedVariants };
          }
          return prev;
      });
  }, [
      editedProduct.weight_g,
      editedProduct.secondary_weight_g,
      editedProduct.labor.casting_cost,
      editedProduct.labor.setter_cost,
      editedProduct.labor.technician_cost,
      editedProduct.labor.stone_setting_cost,
      editedProduct.labor.plating_cost_x,
      editedProduct.labor.plating_cost_d,
      editedProduct.plating_type,
      editedProduct.recipe,
      editedProduct.variants?.length,
      editedProduct.supplier_cost, 
      settings, allMaterials, allProducts
  ]);

  const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
  const masterCost = currentCostCalc.total;
  
  const variants = editedProduct.variants || [];
  const hasVariants = variants.length > 0;
  const sortedVariantsList = useMemo(() => {
      if (!hasVariants) return [];
      return [...variants].sort((a, b) => getSuffixPriority(a.suffix) - getSuffixPriority(b.suffix));
  }, [variants]);

  const maxViews = hasVariants ? sortedVariantsList.length : 1;

  const nextView = () => setViewIndex(prev => (prev + 1) % maxViews);
  const prevView = () => setViewIndex(prev => (prev - 1 + maxViews) % maxViews);
  
  const currentViewVariant = hasVariants ? sortedVariantsList[viewIndex % maxViews] : null;
  
  let displayedSku = editedProduct.sku;
  let displayedLabel = 'Βασικό';
  let displayedCost = masterCost;
  let displayedPrice = editedProduct.selling_price;
  let isVariantView = !!currentViewVariant;

  if (currentViewVariant) {
      displayedSku = `${editedProduct.sku}${currentViewVariant.suffix}`;
      displayedLabel = currentViewVariant.description || currentViewVariant.suffix;
      
      if (currentViewVariant.active_price) displayedCost = currentViewVariant.active_price;
      if (currentViewVariant.selling_price) displayedPrice = currentViewVariant.selling_price;
  }

  const displayedProfit = displayedPrice - displayedCost;
  const displayedMargin = displayedPrice > 0 ? (displayedProfit / displayedPrice) * 100 : 0;

  const { displayPlating, displayStones } = React.useMemo(() => {
      if (!editedProduct.variants || editedProduct.variants.length === 0) {
          return { displayPlating: PLATING_LABELS[editedProduct.plating_type] || editedProduct.plating_type, displayStones: '' };
      }

      const finishCodes = new Set<string>();
      const stones = new Set<string>();
      
      editedProduct.variants.forEach(v => {
          const { finish, stone } = getVariantComponents(v.suffix, editedProduct.gender);
          if (finish.code) finishCodes.add(finish.code);
          else if (v.suffix === '') finishCodes.add(''); 
          
          if (stone.name) stones.add(stone.name);
      });

      if (finishCodes.size === 0 && editedProduct.plating_type) {
          return { displayPlating: PLATING_LABELS[editedProduct.plating_type] || editedProduct.plating_type, displayStones: Array.from(stones).join(', ') };
      }

      const sortedFinishNames = Array.from(finishCodes)
        .sort((a, b) => getSuffixPriority(a) - getSuffixPriority(b))
        .map(code => FINISH_CODES[code] || FINISH_CODES[''] /* Lustre if empty */);

      return {
          displayPlating: sortedFinishNames.join(', '),
          displayStones: Array.from(stones).join(', ')
      };
  }, [editedProduct.variants, editedProduct.plating_type, editedProduct.gender]);

  const updateCalculatedPrice = (marginPercent: number) => {
       const marginDecimal = marginPercent / 100;
       if (marginDecimal >= 1) {
           setCalculatedPrice(0);
           return;
       }
       const price = roundPrice(displayedCost / (1 - marginDecimal));
       setCalculatedPrice(price);
  };

  const applyReprice = async () => {
      if (calculatedPrice <= 0) return;
      const targetName = isVariantView ? `παραλλαγή ${currentViewVariant?.suffix}` : 'βασικό προϊόν';
      const confirmed = await confirm({
          title: 'Ενημέρωση Τιμής',
          message: `Θέλετε να αλλάξετε την τιμή για ${targetName} από ${displayedPrice.toFixed(2)}€ σε ${calculatedPrice.toFixed(2)}€;`,
          confirmText: 'Εφαρμογή'
      });

      if (confirmed) {
          if (isVariantView && currentViewVariant) {
              const variantsCopy = [...editedProduct.variants];
              const originalIdx = variantsCopy.findIndex(v => v.suffix === currentViewVariant!.suffix);
              if (originalIdx >= 0) {
                  variantsCopy[originalIdx] = { ...variantsCopy[originalIdx], selling_price: parseFloat(calculatedPrice.toFixed(2)) };
                  setEditedProduct(prev => ({ ...prev, variants: variantsCopy }));
              }
          } else {
              setEditedProduct(prev => ({...prev, selling_price: parseFloat(calculatedPrice.toFixed(2))}));
          }
          setShowRepriceTool(false);
          showToast('Η νέα τιμή εφαρμόστηκε. Πατήστε Αποθήκευση για οριστικοποίηση.', 'info');
      }
  };

  const addRecipeItem = (type: 'raw' | 'component') => {
    let newItem: RecipeItem;
    if (type === 'raw') {
        if (!allMaterials || allMaterials.length === 0) {
            showToast("Δεν υπάρχουν διαθέσιμα υλικά.", "error");
            return;
        }
        newItem = { type: 'raw', id: allMaterials[0].id, quantity: 1 };
    } else {
        const stxProducts = allProducts.filter(p => p.is_component);
        if (stxProducts.length === 0) {
            showToast("Δεν υπάρχουν διαθέσιμα εξαρτήματα (STX).", "error");
            return;
        }
        newItem = { type: 'component', sku: stxProducts[0].sku, quantity: 1 };
    }
    setEditedProduct(prev => ({
        ...prev,
        recipe: [...prev.recipe, newItem]
    }));
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...editedProduct.recipe];
    const item = { ...newRecipe[index] };
    if (field === 'quantity') {
        item.quantity = parseFloat(value) || 0;
    } else if (field === 'id' && item.type === 'raw') {
        item.id = value;
    } else if (field === 'sku' && item.type === 'component') {
        item.sku = value;
    }
    newRecipe[index] = item;
    setEditedProduct(prev => ({ ...prev, recipe: newRecipe }));
  };

  const removeRecipeItem = (index: number) => {
    setEditedProduct(prev => ({
        ...prev,
        recipe: prev.recipe.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    try {
        const currentCost = calculateProductCost(editedProduct, settings, allMaterials, allProducts).total;

        await supabase.from('products').update({
            gender: editedProduct.gender,
            category: editedProduct.category,
            weight_g: editedProduct.weight_g,
            secondary_weight_g: editedProduct.secondary_weight_g || null,
            selling_price: editedProduct.selling_price,
            labor_casting: editedProduct.labor.casting_cost,
            labor_setter: editedProduct.labor.setter_cost,
            labor_technician: editedProduct.labor.technician_cost,
            labor_plating_x: editedProduct.labor.plating_cost_x,
            labor_plating_d: editedProduct.labor.plating_cost_d,
            labor_technician_manual_override: editedProduct.labor.technician_cost_manual_override,
            labor_plating_x_manual_override: editedProduct.labor.plating_cost_x_manual_override,
            labor_plating_d_manual_override: editedProduct.labor.plating_cost_d_manual_override,
            active_price: currentCost,
            draft_price: currentCost,
            production_type: editedProduct.production_type,
            // Ensure supplier_id is valid UUID or null
            supplier_id: (editedProduct.production_type === ProductionType.Imported && editedProduct.supplier_id) ? editedProduct.supplier_id : null,
            supplier_cost: editedProduct.production_type === ProductionType.Imported ? editedProduct.supplier_cost : null,
            labor_stone_setting: editedProduct.production_type === ProductionType.Imported ? editedProduct.labor.stone_setting_cost : null 
        }).eq('sku', editedProduct.sku);

        await supabase.from('recipes').delete().eq('parent_sku', editedProduct.sku);
        if (editedProduct.recipe.length > 0) {
            const recipeInserts = editedProduct.recipe.map(r => ({
                parent_sku: editedProduct.sku,
                type: r.type,
                material_id: r.type === 'raw' ? r.id : null,
                component_sku: r.type === 'component' ? r.sku : null,
                quantity: r.quantity
            }));
            await supabase.from('recipes').insert(recipeInserts);
        }
        
        await supabase.from('product_molds').delete().eq('product_sku', editedProduct.sku);
        if (editedProduct.molds && editedProduct.molds.length > 0 && editedProduct.production_type === ProductionType.InHouse) {
            const moldInserts = editedProduct.molds.map(m => ({
                product_sku: editedProduct.sku,
                mold_code: m.code,
                quantity: m.quantity
            }));
            const { error: moldError } = await supabase.from('product_molds').insert(moldInserts);
            if (moldError) throw moldError;
        }

        await supabase.from('product_variants').delete().eq('product_sku', editedProduct.sku);
        if (editedProduct.variants && editedProduct.variants.length > 0) {
            const newVariantsForDB = editedProduct.variants.map(v => ({
                product_sku: editedProduct.sku,
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty || 0,
                active_price: v.active_price || null,
                selling_price: (v.selling_price !== null && !isNaN(Number(v.selling_price))) ? Number(v.selling_price) : null
            }));
            await supabase.from('product_variants').insert(newVariantsForDB);
        }
        
        await queryClient.refetchQueries({ queryKey: ['products'] });

        if (onSave) onSave(editedProduct);
        showToast("Οι αλλαγές αποθηκεύτηκαν.", "success");
        onClose();
    } catch (err: any) {
        showToast(`Σφάλμα αποθήκευσης: ${err.message}`, "error");
    }
  };

  const requestDelete = async () => {
      const confirmed = await confirm({
          title: 'Διαγραφή Προϊόντος',
          message: `Διαγραφή οριστικά ${editedProduct.sku}; Αυτή η ενέργεια θα διαγράψει και όλες τις παραλλαγές του.`,
          confirmText: 'Διαγραφή',
          isDestructive: true
      });
      if (!confirmed) return;
      setIsDeleting(true);
      const result = await deleteProduct(editedProduct.sku, editedProduct.image_url);
      
      if (result.success) {
          await queryClient.refetchQueries({ queryKey: ['products'] });
          onClose(); 
          showToast("Το προϊόν διαγράφηκε επιτυχώς.", "success");
      } else {
          showToast(`Σφάλμα: ${result.error}`, "error");
      }
      setIsDeleting(false);
  };

  const handleImageUpdate = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setIsUploadingImage(true);
          try {
              const compressedBlob = await compressImage(file);
              const publicUrl = await uploadProductImage(compressedBlob, editedProduct.sku);
              if (publicUrl) {
                  setEditedProduct(prev => ({ ...prev, image_url: publicUrl }));
                  await supabase.from('products').update({ image_url: publicUrl }).eq('sku', editedProduct.sku);
                  queryClient.invalidateQueries({ queryKey: ['products'] });
                  showToast("Η φωτογραφία ενημερώθηκε.", "success");
              }
          } catch (error) {
              console.error(error);
              showToast("Σφάλμα κατά την ενημέρωση.", "error");
          } finally {
              setIsUploadingImage(false);
          }
      }
  };

  const handleSmartAdd = () => {
    if (!smartAddSuffix.trim()) {
        showToast("Παρακαλώ εισάγετε suffix (π.χ. P, X, BSU).", "error");
        return;
    }

    const fullSku = editedProduct.sku + smartAddSuffix.trim().toUpperCase();
    const analysis = analyzeSku(fullSku, editedProduct.gender);
    
    if (!analysis.isVariant) {
      showToast('Δεν αναγνωρίστηκε έγκυρος συνδυασμός.', 'error');
      return;
    }
    
    if (editedProduct.variants.some(v => v.suffix === analysis.suffix)) {
      showToast('Αυτή η παραλλαγή υπάρχει ήδη.', 'info');
      return;
    }

    const estimatedCost = estimateVariantCost(
        editedProduct, 
        analysis.suffix, 
        settings, 
        allMaterials, 
        allProducts
    );

    const newVariant: ProductVariant = {
      suffix: analysis.suffix,
      description: analysis.variantDescription,
      stock_qty: 0,
      active_price: estimatedCost,
      selling_price: editedProduct.selling_price
    };
    
    setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
    setSmartAddSuffix('');
    showToast(`Παραλλαγή ${analysis.suffix} προστέθηκε!`, 'success');
  };

  const handleManualAdd = () => {
      if (!newVariantSuffix) { showToast("Το Suffix είναι υποχρεωτικό.", 'error'); return; }
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (editedProduct.variants.some(v => v.suffix === upperSuffix)) { showToast('Αυτό το Suffix υπάρχει ήδη.', 'info'); return; }
      
      const estimatedCost = estimateVariantCost(
          editedProduct, 
          upperSuffix, 
          settings, 
          allMaterials, 
          allProducts
      );

      const newVariant: ProductVariant = {
        suffix: upperSuffix,
        description: newVariantDesc || manualSuffixAnalysis || '',
        stock_qty: 0,
        active_price: estimatedCost,
        selling_price: editedProduct.selling_price
      };
      setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
      setNewVariantSuffix('');
      setNewVariantDesc('');
      showToast(`Παραλλαγή ${upperSuffix} προστέθηκε με εκτιμώμενο κόστος ${estimatedCost}€.`, 'success');
  };
  
  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const variantToUpdate = sortedVariantsList[index];
      const realIndex = editedProduct.variants.findIndex(v => v.suffix === variantToUpdate.suffix);
      if (realIndex === -1) return;
      const newVariants = [...editedProduct.variants];
      if ((field === 'selling_price' || field === 'active_price')) {
           if (value === '' || value === null) {
              value = null;
           } else {
              const sanitizedValue = String(value).replace(',', '.');
              value = parseFloat(sanitizedValue);
              if (isNaN(value)) value = null;
           }
      }
      newVariants[realIndex] = { ...newVariants[realIndex], [field]: value };
      setEditedProduct(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index: number) => {
      const variantToDelete = sortedVariantsList[index];
      setEditedProduct(prev => ({ ...prev, variants: prev.variants.filter(v => v.suffix !== variantToDelete.suffix) }));
      setViewIndex(0);
  };
  
  const addMold = (code: string) => {
      const existing = editedProduct.molds.find(m => m.code === code);
      if (existing) return;
      setEditedProduct(prev => ({
          ...prev,
          molds: [...prev.molds, { code, quantity: 1 }]
      }));
  };

  const updateMoldQuantity = (code: string, delta: number) => {
      setEditedProduct(prev => ({
          ...prev,
          molds: prev.molds.map(m => m.code === code ? { ...m, quantity: Math.max(1, m.quantity + delta) } : m)
      }));
  };

  const removeMold = (code: string) => {
      setEditedProduct(prev => ({
          ...prev,
          molds: prev.molds.filter(m => m.code !== code)
      }));
  };

  const availableMolds = useMemo(() => {
      if (!isEditingMolds) return [];
      const selected = new Set(editedProduct.molds.map(m => m.code));
      return allMolds
          .filter(m => !selected.has(m.code))
          .filter(m => 
              m.code.toUpperCase().includes(moldSearch.toUpperCase()) || 
              m.description.toLowerCase().includes(moldSearch.toLowerCase())
          );
  }, [allMolds, editedProduct.molds, moldSearch, isEditingMolds]);

    const secondaryWeightLabel = useMemo(() => {
        const { gender, category } = editedProduct;
        if (gender === Gender.Men && category.includes('Δαχτυλίδι')) {
            return "Βάρος Καπακιού (g)";
        }
        if (gender === Gender.Women && (
            category.includes('Βραχιόλι') || 
            category.includes('Σκουλαρίκια') || 
            category.includes('Δαχτυλίδι') || 
            category.includes('Μενταγιόν')
        )) {
            return "Βάρος Καστονιού (g)";
        }
        return "Β' Βάρος (π.χ. Καστόνι) (g)";
    }, [editedProduct.gender, editedProduct.category]);

  return createPortal(
    <>
      <div className="fixed inset-0 bg-[#060b00]/30 backdrop-blur-sm z-[100] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-full max-w-7xl h-[90vh] bg-slate-50 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        
        {showAnalysisHelp && <AnalysisExplainerModal onClose={() => setShowAnalysisHelp(false)} />}

        {/* Header */}
        <header className="p-6 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-[#060b00]">{editedProduct.sku}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowPrintModal(true)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg flex items-center gap-2 border border-slate-200"><Printer size={16}/> Εκτύπωση</button>
            <button onClick={requestDelete} disabled={isDeleting} className="p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg">{isDeleting ? <Loader2 className="animate-spin"/> : <Trash2 size={16}/>}</button>
            <button onClick={handleSave} className="px-5 py-2 text-sm font-bold bg-[#060b00] text-white rounded-lg flex items-center gap-2 hover:bg-black shadow-sm"><Save size={16}/> Αποθήκευση</button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={20}/></button>
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 flex overflow-hidden">
          {/* LEFT SIDEBAR - Unchanged */}
          <div className={`w-1/3 border-r border-slate-200 p-6 flex flex-col overflow-y-auto transition-colors duration-300 ${isVariantView ? 'bg-emerald-50/30' : 'bg-white'}`}>
             
             <div className="flex items-center justify-between mb-4">
                 <div className="min-w-0">
                     <h3 className={`font-black text-xl truncate ${isVariantView ? 'text-emerald-700' : 'text-[#060b00]'}`}>
                         {displayedSku}
                     </h3>
                     <div className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
                         {isVariantView && <Tag size={10}/>}
                         {displayedLabel}
                     </div>
                 </div>
                 {/* Navigation Arrows */}
                 {hasVariants && maxViews > 1 && (
                     <div className="flex items-center bg-slate-100 rounded-lg p-1 shrink-0 ml-2">
                         <button onClick={prevView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronLeft size={18} />
                         </button>
                         <div className="w-px h-4 bg-slate-200 mx-1"></div>
                         <button onClick={nextView} className="p-1 hover:bg-white hover:text-emerald-600 hover:shadow-sm rounded-md transition-all text-slate-400">
                             <ChevronRight size={18} />
                         </button>
                     </div>
                 )}
             </div>

             {/* ... Image & Price Cards ... */}
             <div className={`w-full aspect-square rounded-2xl relative group overflow-hidden border shadow-sm shrink-0 transition-all duration-300 ${isVariantView ? 'border-emerald-200 shadow-emerald-100' : 'border-slate-200 bg-slate-100'}`}>
                {editedProduct.image_url ? (
                    <img src={editedProduct.image_url} alt={editedProduct.sku} className="w-full h-full object-cover"/>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={40} className="text-slate-300"/>
                    </div>
                )}
                <label className="absolute inset-0 bg-[#060b00]/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white cursor-pointer backdrop-blur-sm">
                    {isUploadingImage ? <Loader2 className="animate-spin"/> : <Camera/>}
                    <span className="text-sm font-bold mt-1">Αλλαγή Φωτογραφίας</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate}/>
                </label>
             </div>

             {viewMode === 'registry' && (
                <div className="w-full mt-6 space-y-4">
                    <div className={`p-4 rounded-xl border text-center transition-colors ${isVariantView ? 'bg-white border-emerald-200' : 'bg-slate-100 border-slate-200'}`}>
                        <span className={`text-xs font-bold uppercase ${isVariantView ? 'text-emerald-400' : 'text-slate-500'}`}>Κόστος</span>
                        <p className={`text-2xl font-black mt-1 ${isVariantView ? 'text-emerald-700' : 'text-slate-800'}`}>
                            {displayedCost.toFixed(2)}€
                        </p>
                    </div>
                    
                    <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                        <div className="text-center relative">
                            <span className="text-xs font-bold text-amber-700 uppercase">Χονδρική</span>
                            <div className="flex items-center justify-center gap-2 mt-1">
                                <p className="text-2xl font-black text-amber-600">{displayedPrice > 0 ? displayedPrice.toFixed(2) + '€' : '-'}</p>
                                <button onClick={() => { setShowRepriceTool(!showRepriceTool); updateCalculatedPrice(targetMargin); }} className="bg-white p-1 rounded-full text-amber-600 hover:bg-amber-100 shadow-sm border border-amber-200"><Calculator size={14}/></button>
                            </div>
                            
                            {displayedPrice > 0 && (
                                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-amber-200/50">
                                    <div className="text-center">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Κερδος</div>
                                        <div className="text-sm font-bold text-emerald-600">{displayedProfit.toFixed(2)}€</div>
                                    </div>
                                    <div className="text-center border-l border-amber-200/50">
                                        <div className="text-[9px] font-bold text-amber-800/60 uppercase">Margin</div>
                                        <div className={`text-sm font-bold ${displayedMargin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>{displayedMargin.toFixed(0)}%</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {showRepriceTool && (
                            <div className="mt-4 pt-4 border-t border-amber-200 animate-in fade-in slide-in-from-top-2">
                                <label className="block text-[10px] font-bold text-amber-800 uppercase mb-1">Νεο Margin: {targetMargin}%</label>
                                <input 
                                    type="range" min="10" max="90" step="5" 
                                    value={targetMargin} 
                                    onChange={e => {
                                        const val = parseInt(e.target.value);
                                        setTargetMargin(val);
                                        updateCalculatedPrice(val);
                                    }}
                                    className="w-full accent-amber-600 mb-2 h-1.5 bg-amber-200 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="bg-white p-2 rounded-lg text-center border border-amber-100 mb-2">
                                    <span className="text-xs font-bold text-slate-500">Πρόταση:</span> 
                                    <span className="font-bold text-emerald-600 ml-1 text-sm">{calculatedPrice.toFixed(2)}€</span>
                                </div>
                                <button onClick={applyReprice} className="w-full bg-amber-600 text-white py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700">Εφαρμογή</button>
                            </div>
                        )}
                    </div>
                </div>
             )}
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex gap-2 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-hide">
                <TabButton name="overview" label="Επισκόπηση" activeTab={activeTab} setActiveTab={setActiveTab} />
                {viewMode === 'registry' && <TabButton name="recipe" label={editedProduct.production_type === ProductionType.Imported ? "Υλικά (Valuation)" : "Συνταγή (BOM)"} activeTab={activeTab} setActiveTab={setActiveTab} />}
                {viewMode === 'registry' && <TabButton name="labor" label={editedProduct.production_type === ProductionType.Imported ? 'Έλεγχος Τιμής' : 'Εργατικά'} activeTab={activeTab} setActiveTab={setActiveTab} />}
                <TabButton name="variants" label="Παραλλαγές & Τιμές" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton name="barcodes" label="Barcodes" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            
            {/* ... Overview Tab content ... (Unchanged) */}
            {activeTab === 'overview' && (
                <div className="space-y-4">
                    {/* ... (Same grid inputs as before) ... */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βάρος</label>
                            <div className="flex items-baseline gap-2 mt-1">
                                <input type="number" step="0.01" value={editedProduct.weight_g} onChange={e => setEditedProduct(prev => ({ ...prev, weight_g: parseFloat(e.target.value) || 0 }))} className="w-full bg-transparent font-bold text-slate-800 text-lg outline-none"/>
                                <span className="text-sm font-medium text-slate-500">g</span>
                            </div>
                        </div>
                        {secondaryWeightLabel && (
                            <div className="bg-white p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{secondaryWeightLabel}</label>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <input type="number" step="0.01" value={editedProduct.secondary_weight_g || ''} onChange={e => setEditedProduct(prev => ({ ...prev, secondary_weight_g: parseFloat(e.target.value) || 0 }))} className="w-full bg-transparent font-bold text-slate-800 text-lg outline-none"/>
                                    <span className="text-sm font-medium text-slate-500">g</span>
                                </div>
                            </div>
                        )}
                        <InfoCard label="Κατηγορία" value={editedProduct.category} />
                        <div className="bg-white p-4 rounded-xl border border-slate-200 relative group">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο</label>
                            <div className="relative mt-1">
                                <select value={editedProduct.gender} onChange={(e) => setEditedProduct(prev => ({ ...prev, gender: e.target.value as Gender }))} className="w-full bg-transparent font-bold text-slate-800 text-lg outline-none appearance-none cursor-pointer pr-6">
                                    <option value={Gender.Women}>Γυναικεία</option>
                                    <option value={Gender.Men}>Ανδρικά</option>
                                    <option value={Gender.Unisex}>Unisex</option>
                                </select>
                                <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none group-hover:text-slate-600" size={16} />
                            </div>
                        </div>
                        
                        {/* Production Type Badge (Read Only) */}
                        <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200 relative">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Τύπος Παραγωγής</label>
                            <div className={`mt-2 p-3 rounded-lg border flex items-center gap-3 ${editedProduct.production_type === ProductionType.InHouse ? 'bg-slate-50 border-slate-200' : 'bg-purple-50 border-purple-200'}`}>
                                {editedProduct.production_type === ProductionType.InHouse ? (
                                    <div className="p-2 bg-white rounded-md shadow-sm text-slate-700"><Hammer size={18}/></div>
                                ) : (
                                    <div className="p-2 bg-white rounded-md shadow-sm text-purple-600"><Globe size={18}/></div>
                                )}
                                <div>
                                    <div className={`font-bold ${editedProduct.production_type === ProductionType.InHouse ? 'text-slate-800' : 'text-purple-800'}`}>
                                        {editedProduct.production_type === ProductionType.InHouse ? 'Εργαστήριο (In-House)' : 'Εισαγωγή (Imported)'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-medium">Η μέθοδος παραγωγής είναι κλειδωμένη.</div>
                                </div>
                            </div>
                        </div>

                        <InfoCard label="Επιμετάλλωση" value={displayPlating} />
                        {displayStones && (
                            <div className="col-span-2 bg-white p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2"><Gem size={14}/> Πέτρες</label>
                                <div className="mt-1 font-bold text-slate-800 text-lg leading-snug">
                                    {displayStones}
                                </div>
                            </div>
                        )}
                        {editedProduct.production_type === ProductionType.Imported && (
                            <div className="col-span-2 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                                <label className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-2"><DollarSign size={14}/> Κόστος Αγοράς (Purchase Price)</label>
                                <div className="mt-1 font-black text-emerald-700 text-2xl leading-snug">
                                    {editedProduct.supplier_cost ? editedProduct.supplier_cost.toFixed(2) + '€' : '-'}
                                </div>
                            </div>
                        )}
                    </div>
                    {/* ... Molds or Supplier info logic ... */}
                    {editedProduct.production_type === ProductionType.InHouse ? (
                        !isEditingMolds ? (
                            // ... Existing Molds View ...
                            <div className="bg-white p-4 rounded-xl border border-slate-200">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                        <MapPin size={14}/> Απαιτούμενα Λάστιχα
                                    </label>
                                    <button onClick={() => setIsEditingMolds(true)} className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                                        <Edit3 size={12}/> Επεξεργασία
                                    </button>
                                </div>
                                {(editedProduct.molds && editedProduct.molds.length > 0) ? (
                                    <div className="flex flex-wrap gap-2">
                                        {editedProduct.molds.map(m => {
                                            const moldDetails = allMolds.find(md => md.code === m.code);
                                            return (
                                                <div key={m.code} className="relative group">
                                                    <div className="bg-amber-50 text-amber-800 text-sm font-bold font-mono px-3 py-1.5 rounded-lg border border-amber-100 cursor-help">
                                                        {m.code}{m.quantity > 1 ? ` (x${m.quantity})` : ''}
                                                    </div>
                                                    {moldDetails && (
                                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-xs bg-slate-800 text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                                                            <p className="font-bold border-b border-slate-600 pb-1 mb-1">{moldDetails.description || 'Χωρίς Περιγραφή'}</p>
                                                            <p className="flex items-center gap-1.5"><MapPin size={12} className="text-amber-400"/> {moldDetails.location || 'Άγνωστη Τοποθεσία'}</p>
                                                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-sm text-slate-400 italic">Δεν έχουν οριστεί λάστιχα.</div>
                                )}
                            </div>
                        ) : (
                            // ... Edit Molds View (unchanged) ...
                            <div className="bg-white p-4 rounded-xl border-2 border-emerald-200 shadow-lg shadow-emerald-50 animate-in fade-in">
                                <div className="flex justify-between items-center mb-4">
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2">
                                        <MapPin size={14}/> Επεξεργασία Λάστιχων
                                    </label>
                                    <button onClick={() => { setIsEditingMolds(false); setMoldSearch(''); }} className="text-xs font-bold bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-sm hover:bg-emerald-600">
                                        Τέλος
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 h-64 flex flex-col">
                                        <h4 className="text-xs font-bold text-slate-500 mb-2 shrink-0">Επιλεγμένα ({editedProduct.molds?.length || 0})</h4>
                                        <div className="overflow-y-auto flex-1 custom-scrollbar pr-1 -mr-1">
                                            <div className="flex flex-col gap-2">
                                                {(editedProduct.molds || []).map(m => (
                                                    <div key={m.code} className="bg-amber-100 text-amber-900 font-mono font-bold text-sm px-2 py-1 rounded-md border border-amber-200 flex items-center justify-between">
                                                        <span>{m.code}</span>
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={() => updateMoldQuantity(m.code, -1)} className={`p-1 bg-white rounded hover:bg-amber-50 ${m.quantity === 1 ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={m.quantity === 1}><Minus size={10}/></button>
                                                            <span className="w-4 text-center text-xs">{m.quantity}</span>
                                                            <button onClick={() => updateMoldQuantity(m.code, 1)} className="p-1 bg-white rounded hover:bg-amber-50"><Plus size={10}/></button>
                                                            <button onClick={() => removeMold(m.code)} className="ml-1 text-amber-500 hover:text-amber-700"><X size={14} /></button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!editedProduct.molds || editedProduct.molds.length === 0) && <p className="text-xs text-slate-400 italic w-full text-center py-4">Κανένα</p>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 h-64 flex flex-col">
                                        <h4 className="text-xs font-bold text-slate-500 mb-2 shrink-0">Διαθέσιμα</h4>
                                        <div className="relative mb-2 shrink-0">
                                            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input type="text" value={moldSearch} onChange={e => setMoldSearch(e.target.value)} placeholder="Αναζήτηση..." className="w-full text-xs pl-7 p-1.5 bg-white rounded-md border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-400"/>
                                        </div>
                                        <div className="overflow-y-auto flex-1 custom-scrollbar pr-1 -mr-1 space-y-1">
                                            {availableMolds.map(mold => (
                                                <div key={mold.code} onClick={() => addMold(mold.code)} className="p-2 rounded-md hover:bg-emerald-100 cursor-pointer flex justify-between items-center text-sm">
                                                    <span className="font-mono font-bold text-slate-700">{mold.code}</span>
                                                    <span className="text-xs text-slate-400 truncate ml-2">{mold.description}</span>
                                                    <Plus size={14} className="text-emerald-500"/>
                                                </div>
                                            ))}
                                            {availableMolds.length === 0 && <p className="text-xs text-slate-400 italic w-full text-center py-4">Δεν βρέθηκαν άλλα.</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="bg-white p-4 rounded-xl border border-slate-200">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2 mb-2">
                                <Globe size={14}/> Προμηθευτής
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Globe size={18}/></div>
                                <div>
                                    <div className="font-bold text-slate-800">{editedProduct.supplier_details?.name || 'Άγνωστος'}</div>
                                    <div className="text-xs text-slate-500">{editedProduct.supplier_details?.contact_person || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* ... Recipe Tab ... */}
            {activeTab === 'recipe' && viewMode === 'registry' && (
                <div className="space-y-3">
                   <div className="flex items-center gap-3 p-4 rounded-xl border bg-white border-slate-200 shadow-sm">
                       <div className="p-2 rounded-lg bg-slate-100 text-slate-600"><Coins size={20} /></div>
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Υλικό Βάσης</label>
                           <span className="font-bold text-slate-800">Ασήμι 925 (Βάση)</span>
                       </div>
                       <div className="text-right">
                           <div className="font-mono font-bold">{((editedProduct.weight_g * (settings.silver_price_gram * (1 + settings.loss_percentage/100)))).toFixed(2)}€</div>
                           <div className="text-xs text-slate-400">{editedProduct.weight_g}g @ {settings.silver_price_gram}€/g (+{settings.loss_percentage}%)</div>
                       </div>
                   </div>
                   
                   {editedProduct.recipe.map((item, idx) => {
                    const mat = item.type === 'raw' ? allMaterials.find(m => m.id === item.id) : null;
                    return (
                    <div key={idx} className="flex items-center gap-3 p-4 rounded-xl border bg-white shadow-sm">
                       <div className="flex-1">
                           <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">{item.type === 'raw' ? 'Υλικό' : 'Εξάρτημα'}</label>
                           
                           <div className="flex items-center gap-2">
                               {item.type === 'raw' && mat && getMaterialIcon(mat.type)}
                               {item.type === 'component' && getMaterialIcon('Component')}
                               
                               {item.type === 'raw' ? (
                                   <select value={item.id} onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                       {allMaterials.map(m => (<option key={m.id} value={m.id}>{m.name}</option>))}
                                   </select>
                               ) : (
                                   <select value={item.sku} onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)} className="w-full text-sm font-bold outline-none cursor-pointer bg-transparent">
                                       {allProducts.filter(p => p.is_component).map(p => (<option key={p.sku} value={p.sku}>{p.sku}</option>))}
                                   </select>
                               )}
                           </div>
                       </div>
                       <div className="w-24">
                           <input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-2 bg-slate-50 rounded font-bold text-center outline-none border border-slate-200" />
                       </div>
                       <button onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500">
                           <Trash2 size={18} />
                       </button>
                    </div>
                   )})}

                   <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => addRecipeItem('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-2.5 rounded-lg font-bold border border-purple-200 flex items-center gap-1 hover:bg-purple-100 transition-colors"><Plus size={14}/> Υλικό</button>
                        <button type="button" onClick={() => addRecipeItem('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-2.5 rounded-lg font-bold border border-blue-200 flex items-center gap-1 hover:bg-blue-100 transition-colors"><Plus size={14}/> STX</button>
                    </div>
                    {editedProduct.production_type === ProductionType.Imported && (
                        <p className="text-xs text-slate-400 italic text-center mt-2">
                            * Για εισαγόμενα προϊόντα, η συνταγή χρησιμοποιείται για τον υπολογισμό της εσωτερικής αξίας (Intrisic Value).
                        </p>
                    )}
                </div>
            )}
            
            {/* ... Labor Tab ... */}
            {activeTab === 'labor' && viewMode === 'registry' && (
                <div className="space-y-4">
                    {editedProduct.production_type === ProductionType.InHouse ? (
                        <div className="grid grid-cols-2 gap-4">
                            <LaborInput label="Χυτήριο (€)" value={editedProduct.labor.casting_cost} readOnly />
                            <LaborInput label="Καρφωτής (€)" value={editedProduct.labor.setter_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: val}})} />
                            <LaborInput 
                                label="Τεχνίτης (Finishing)" 
                                value={editedProduct.labor.technician_cost} 
                                onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: val}})}
                                isOverridden={editedProduct.labor.technician_cost_manual_override}
                                onToggleOverride={() => setEditedProduct(prev => ({...prev, labor: {...prev.labor, technician_cost_manual_override: !prev.labor.technician_cost_manual_override}}))}
                            />
                             <LaborInput 
                                label="Επιμετάλλωση X/H (€)" 
                                value={editedProduct.labor.plating_cost_x} 
                                onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost_x: val}})}
                                isOverridden={editedProduct.labor.plating_cost_x_manual_override}
                                onToggleOverride={() => setEditedProduct(prev => ({...prev, labor: {...prev.labor, plating_cost_x_manual_override: !prev.labor.plating_cost_x_manual_override}}))}
                            />
                            <LaborInput 
                                label="Επιμετάλλωση D (€)" 
                                value={editedProduct.labor.plating_cost_d} 
                                onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost_d: val}})}
                                isOverridden={editedProduct.labor.plating_cost_d_manual_override}
                                onToggleOverride={() => setEditedProduct(prev => ({...prev, labor: {...prev.labor, plating_cost_d_manual_override: !prev.labor.plating_cost_d_manual_override}}))}
                            />
                        </div>
                    ) : (
                        // Imported Smart Audit View
                        <div className="space-y-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-200">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-2 mb-2">
                                    <Globe size={14} /> Προμηθευτής
                                </label>
                                <select 
                                    value={editedProduct.supplier_id} 
                                    onChange={e => setEditedProduct(prev => ({...prev, supplier_id: e.target.value}))}
                                    className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 font-bold text-slate-800"
                                >
                                    <option value="">Επιλέξτε Προμηθευτή...</option>
                                    {suppliers?.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <LaborInput label="Κόστος Αγοράς (Supplier) €" value={editedProduct.supplier_cost || 0} onChange={val => setEditedProduct({...editedProduct, supplier_cost: val})} />
                            
                            {/* SMART AUDIT CARD - now updated with forensics */}
                            {currentCostCalc.breakdown.smart_analysis && (
                                <SmartAuditCard analysis={currentCostCalc.breakdown.smart_analysis} />
                            )}

                            {/* Informational Breakdown Input for Forensics */}
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
                                    <div className="flex items-center gap-2">
                                        <Info size={18} className="text-slate-400" />
                                        <h4 className="font-bold text-slate-600 text-sm uppercase tracking-wide">Ανάλυση Κόστους Προμηθευτή</h4>
                                    </div>
                                    <button onClick={() => setShowAnalysisHelp(true)} className="p-1 hover:bg-slate-200 rounded-full text-slate-400 hover:text-blue-600 transition-colors">
                                        <HelpCircle size={18} />
                                    </button>
                                </div>
                                <p className="text-xs text-slate-400 mb-4 italic">
                                    Συμπληρώστε τα παρακάτω για να ενεργοποιήσετε την <strong>Ιατροδικαστική Ανάλυση Κόστους</strong>. Τα ποσά αυτά θεωρούνται ότι συμπεριλαμβάνονται ήδη στην "Τιμή Αγοράς" παραπάνω.
                                </p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <LaborCostCard icon={<Hammer size={14}/>} label="Εργατικά" value={editedProduct.labor.technician_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: val, technician_cost_manual_override: true}})} hint="Εκτιμώμενο κόστος εργασίας" readOnly={false}/>
                                    <LaborCostCard icon={<Gem size={14}/>} label="Καρφωτικά/Πέτρες" value={editedProduct.labor.stone_setting_cost} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, stone_setting_cost: val}})} hint="Κόστος τοποθέτησης" readOnly={false}/>
                                    <LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση" value={editedProduct.labor.plating_cost_x} onChange={val => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost_x: val, plating_cost_x_manual_override: true}})} hint="Κόστος επιμετάλλωσης" readOnly={false}/>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* ... Variants Tab (Unchanged) ... */}
            {activeTab === 'variants' && (
              <div className="space-y-6">
                  {/* ... Variants UI ... */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Wand2 size={16} className="text-emerald-500"/> Έξυπνη Προσθήκη</h4>
                            <div className="flex w-full rounded-lg border border-slate-200 overflow-hidden">
                                <div className="bg-slate-100 px-3 py-2 text-slate-500 font-mono text-sm font-bold border-r border-slate-200 flex items-center">
                                    {editedProduct.sku}
                                </div>
                                <input type="text" placeholder="Suffix (e.g. P, X)" value={smartAddSuffix} onChange={e => setSmartAddSuffix(e.target.value.toUpperCase())} className="flex-1 p-2 font-mono text-sm uppercase outline-none bg-white text-slate-800 font-bold"/>
                                <button onClick={handleSmartAdd} className="bg-emerald-600 text-white px-4 py-2 font-bold text-sm hover:bg-emerald-700 transition-colors whitespace-nowrap">Προσθήκη</button>
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400">Συμπληρώστε μόνο την κατάληξη (π.χ. P για Πατίνα, X για Επίχρυσο).</div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-sm text-slate-600 mb-2">Χειροκίνητη Προσθήκη</h4>
                            <div className="grid grid-cols-[80px_1fr_120px_auto] gap-2 w-full items-end">
                                <input type="text" placeholder="Suffix" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0 bg-white text-slate-800"/>
                                <input type="text" placeholder="Περιγραφή" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800"/>
                                <button onClick={handleManualAdd} className="bg-[#060b00] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-black transition-colors flex items-center justify-center h-10"><Plus size={16}/></button>
                            </div>
                            {manualSuffixAnalysis && <div className="mt-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 flex items-center gap-1"><Wand2 size={12}/> {manualSuffixAnalysis}</div>}
                        </div>
                  </div>

                  <div>
                      <h4 className="font-bold text-sm text-slate-600 mb-3 uppercase tracking-wide">Λίστα Παραλλαγών ({editedProduct.variants.length})</h4>
                      <div className="space-y-3">
                          {sortedVariantsList.map((variant, index) => {
                              const wholesale = variant.selling_price ?? editedProduct.selling_price;
                              const retail = wholesale * 3;
                              const hasPriceOverride = variant.selling_price !== null;
                              const hasCostOverride = variant.active_price !== null;

                              return (
                              <div key={index} className="flex flex-col md:flex-row md:items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    <div className="font-mono font-bold text-lg text-emerald-600 w-16 text-center bg-emerald-50 rounded-lg py-2">{variant.suffix}</div>
                                    <input type="text" value={variant.description} onChange={e => updateVariant(index, 'description', e.target.value)} placeholder="Περιγραφή" className="flex-1 md:w-48 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-500 outline-none text-slate-800"/>
                                </div>
                                <div className="flex items-center gap-2 flex-1 w-full border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                                     <div className="flex flex-col w-1/2 md:w-auto relative group/cost">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Κόστος</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none text-base">€</span>
                                            <input type="text" inputMode="decimal" placeholder={(variant.active_price || 0).toFixed(2)} value={variant.active_price === null ? '' : (variant.active_price || 0).toFixed(2)} onChange={e => updateVariant(index, 'active_price', e.target.value)} className={`w-full p-2 h-9 pl-7 border rounded-lg text-sm font-bold outline-none transition-colors text-right ${hasCostOverride ? 'border-amber-400 text-amber-700 bg-white ring-1 ring-amber-100' : 'border-slate-200 text-slate-700 bg-slate-50 focus:bg-white focus:border-amber-500'}`}/>
                                        </div>
                                     </div>
                                     <div className="flex flex-col w-1/2 md:w-auto relative group/price">
                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Χονδρική</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none text-base">€</span>
                                            <input type="text" inputMode="decimal" placeholder={editedProduct.selling_price.toFixed(2)} value={variant.selling_price === null ? '' : variant.selling_price.toFixed(2)} onChange={e => updateVariant(index, 'selling_price', e.target.value)} className={`w-full p-2 h-9 pl-7 border rounded-lg text-sm font-bold outline-none transition-colors text-right ${hasPriceOverride ? 'border-slate-200 text-slate-700 bg-slate-50' : 'border-emerald-500 text-emerald-700 bg-white ring-1 ring-emerald-100 focus:border-emerald-500'}`}/>
                                        </div>
                                        <div className="absolute top-full left-0 w-full mt-1 text-[9px] text-slate-400 font-medium whitespace-nowrap opacity-0 group-focus-within/price:opacity-100 transition-opacity">Λιανική: <span className="text-slate-600 font-bold">{retail.toFixed(2)}€</span></div>
                                     </div>
                                     <button onClick={() => deleteVariant(index)} className="ml-auto md:ml-2 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto"><Trash2 size={18}/></button>
                                </div>
                              </div>
                              );
                          })}
                          {editedProduct.variants.length === 0 && <div className="text-center text-slate-400 py-6 italic text-sm">Δεν υπάρχουν παραλλαγές. Θα αποθηκευτεί μόνο το Master προϊόν.</div>}
                      </div>
                  </div>
              </div>
            )}
            
            {/* ... Barcodes Tab ... */}
            {activeTab === 'barcodes' && (
                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3 mb-6">
                        <ScanBarcode className="text-blue-600 mt-1" size={24} />
                        <div>
                            <h4 className="font-bold text-blue-900 text-sm">Διαχείριση Barcode</h4>
                            <p className="text-xs text-blue-700 mt-1">Εδώ μπορείτε να δείτε μεμονωμένα τα barcode για κάθε παραλλαγή.</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {sortedVariantsList.length === 0 && (
                            <BarcodeRow product={editedProduct} />
                        )}
                        {sortedVariantsList.map((v, i) => (
                            <BarcodeRow key={i} product={editedProduct} variant={v} />
                        ))}
                    </div>
                </div>
            )}

          </div>
        </main>

      </div>
      {showPrintModal && <PrintModal product={editedProduct} onClose={() => setShowPrintModal(false)} onPrint={setPrintItems} />}
    </>,
    document.body
  );
}

// ... Helper Components ...
const TabButton = ({ name, label, activeTab, setActiveTab }: any) => (
    <button onClick={() => setActiveTab(name)} className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors whitespace-nowrap ${activeTab === name ? 'bg-slate-50 border-x border-t border-slate-200 text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}>
        {label}
    </button>
);

const InfoCard = ({ label, value, unit }: any) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</label>
        <div className="flex items-baseline gap-2 mt-1">
            <p className="font-bold text-slate-800 text-lg">{value}</p>
            {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
        </div>
    </div>
);

const LaborInput = ({ label, value, onChange, isOverridden, onToggleOverride, readOnly }: any) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{label}</label>
        <div className="relative mt-1">
            <input 
                type="number" 
                step="0.01" 
                value={value}
                readOnly={readOnly || (onToggleOverride && !isOverridden)}
                onChange={!readOnly && onChange ? (e => onChange(parseFloat(e.target.value) || 0)) : undefined}
                className={`w-full bg-transparent font-mono font-bold text-lg outline-none ${readOnly || (onToggleOverride && !isOverridden) ? 'text-slate-500' : 'text-slate-800'}`}
            />
            {onToggleOverride && (
                 <button onClick={onToggleOverride} title="Manual Override" className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:bg-slate-100">
                    {isOverridden ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
        </div>
    </div>
);

const LaborCostCard = ({ icon, label, value, onChange, isOverridden, onToggleOverride, readOnly = false, hint }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    onChange?: (value: number) => void;
    isOverridden?: boolean;
    onToggleOverride?: () => void;
    readOnly?: boolean;
    hint?: string;
}) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200">
        <label className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center justify-between">
            <span className="flex items-center gap-2">{icon} {label}</span>
            {onToggleOverride && (
                <button onClick={onToggleOverride} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
                    {isOverridden ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
        </label>
        <div className="relative mt-1">
            <input 
                type="number" step="0.01" 
                value={value}
                readOnly={readOnly || (onToggleOverride && !isOverridden)}
                onChange={!readOnly && onChange ? (e => onChange(parseFloat(e.target.value) || 0)) : undefined}
                className={`w-full bg-transparent font-mono font-bold text-lg outline-none pr-2 transition-colors ${readOnly || (onToggleOverride && !isOverridden) ? 'text-slate-500' : 'text-slate-800'}`}
            />
        </div>
        {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
);
