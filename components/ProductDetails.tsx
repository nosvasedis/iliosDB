import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, RecipeItem, LaborCost, ProductVariant, Gender, GlobalSettings, Collection, Mold, ProductionType, PlatingType, ProductMold, Supplier } from '../types';
import { calculateProductCost, calculateTechnicianCost, analyzeSku, analyzeSuffix, estimateVariantCost, getPrevalentVariant, getVariantComponents, roundPrice, SupplierAnalysis, formatCurrency, transliterateForBarcode, formatDecimal } from '../utils/pricingEngine';
import { FINISH_CODES } from '../constants'; 
import { X, Save, Printer, Box, Gem, Hammer, MapPin, Copy, Trash2, Plus, Info, Wand2, TrendingUp, Camera, Loader2, Upload, History, AlertTriangle, FolderKanban, CheckCircle, RefreshCw, Tag, ImageIcon, Coins, Lock, Unlock, Calculator, Percent, ChevronLeft, ChevronRight, Layers, ScanBarcode, ChevronDown, Edit3, Search, Link, Activity, Puzzle, Minus, Palette, Globe, DollarSign, ThumbsUp, HelpCircle, BookOpen, Scroll, Users, Weight, Flame } from 'lucide-react';
import { uploadProductImage, supabase, deleteProduct } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import JsBarcode from 'jsbarcode';
import BarcodeView from './BarcodeView';

// CONSTANTS
const PLATING_LABELS: Record<string, string> = {
    [PlatingType.None]: 'Λουστρέ',
    [PlatingType.GoldPlated]: 'Επίхρυσο',
    [PlatingType.TwoTone]: 'Δíхρωμο',
    [PlatingType.Platinum]: 'Πλατίνα'
};

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

const SmartAnalysisCard = ({ analysis }: { analysis: SupplierAnalysis }) => {
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
        <div className={`border-2 border-${color}-100 bg-${color}-50/50 rounded-2xl p-5 space-y-4`}>
            <div className="flex items-center gap-3 border-b border-${color}-200 pb-3">
                <div className={`p-2 bg-${color}-100 text-${color}-600 rounded-lg`}>
                    <Icon size={20} />
                </div>
                <div>
                    <h4 className={`text-sm font-bold uppercase text-${color}-800`}>Έξυπνη Ανάλυση</h4>
                    <p className={`text-xs font-medium text-${color}-600`}>Αξιολόγηση Τιμής Προμηθευτή</p>
                </div>
                <div className={`ml-auto px-3 py-1 bg-${color}-100 text-${color}-700 rounded-full text-xs font-black uppercase tracking-wide`}>
                    {analysis.verdict === 'Excellent' && 'Εξαιρετική Τιμή'}
                    {analysis.verdict === 'Fair' && 'Δίκαιη Τιμή'}
                    {analysis.verdict === 'Expensive' && 'Ακριβό'}
                    {analysis.verdict === 'Overpriced' && 'Υπερκοστολογημένο'}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Θεωρητικό Κόστος (Make)</div>
                    <div className="text-xl font-bold text-slate-700">{formatCurrency(analysis.theoreticalMakeCost)}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Αξία Υλικών (Melt)</div>
                    <div className="text-xl font-bold text-slate-700">{formatCurrency(analysis.intrinsicValue)}</div>
                </div>
            </div>

            {hasReportedLabor && (
                <div className="bg-white/60 p-3 rounded-xl border border-slate-100 space-y-2">
                    <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wide border-b border-slate-100 pb-1 mb-2">Ανάλυση Εργατικών (Forensics)</h5>
                    
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">Κόστος Εργασίας Προμηθευτή:</span>
                        <div className="flex items-center gap-2">
                            <span className="font-bold">{formatCurrency(analysis.breakdown.supplierReportedTotalLabor)}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                analysis.laborEfficiency === 'Cheaper' ? 'bg-emerald-100 text-emerald-700' :
                                analysis.laborEfficiency === 'More Expensive' ? 'bg-orange-100 text-orange-700' : 
                                'bg-slate-100 text-slate-600'
                            }`}>
                                {analysis.laborEfficiency === 'Cheaper' ? 'Φθηνότερο' : analysis.laborEfficiency === 'More Expensive' ? 'Ακριβότερο' : 'Παρόμοιο'}
                            </span>
                        </div>
                    </div>

                    {analysis.effectiveSilverPrice > 0 && (
                        <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100/50">
                            <span className="text-slate-500">Πραγματική Χρέωση Ασημιού:</span>
                            <div className="flex items-center gap-2">
                                <span className={`font-mono font-bold ${analysis.hasHiddenMarkup ? 'text-red-600' : 'text-slate-700'}`}>
                                    {analysis.effectiveSilverPrice.toFixed(2)}€/g
                                </span>
                                {analysis.hasHiddenMarkup && <span title="Κρυφή χρέωση στο μέταλλο"><AlertTriangle size={12} className="text-red-500"/></span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="space-y-2 pt-1">
                <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-500">Επιπλέον Χρέωση</span>
                    <span className={`font-bold text-${color}-700`}>{analysis.supplierPremium > 0 ? '+' : ''}{formatCurrency(analysis.supplierPremium)}</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden flex">
                    <div className="h-full bg-slate-400" style={{ width: `${(analysis.intrinsicValue / analysis.theoreticalMakeCost) * 100}%` }} title="Υλικά" />
                    <div className={`h-full bg-${color}-500`} style={{ width: `${Math.min(100, (Math.max(0, analysis.supplierPremium) / analysis.theoreticalMakeCost) * 100)}%` }} title="Premium" />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{formatCurrency(analysis.intrinsicValue)} Υλικά</span>
                    <span>Περιθώριο: {analysis.premiumPercent}%</span>
                </div>
            </div>
        </div>
    );
};

const AnalysisExplainerModal = ({ onClose }: { onClose: () => void }) => (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white rounded-xl shadow-sm text-blue-600">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Πώς λειτουργεί ο Έλεγχos Τιμής;</h2>
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
                        Εδώ γίνεται ο έλεγχos για "κρυφές χρεώσεις". Ζητώντας σας να συμπληρώσετε τα επιμέρους εργατικά που ισχυρίζεται ο προμηθευτής, το σύστημα κάνει τα εξής:
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

const LaborCostInput = ({ label, value, onChange, override, onToggleOverride, readOnly = false, icon = <Hammer size={14}/> }: { label: string, value: number, onChange: (v: number) => void, override?: boolean, onToggleOverride?: () => void, readOnly?: boolean, icon?: React.ReactNode }) => (
    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
        <span className="text-sm text-slate-600 font-medium flex items-center gap-2">{icon} {label}</span>
        <div className="flex items-center gap-2">
            <input 
                type="number" step="0.01" 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value) || 0)} 
                readOnly={readOnly || (onToggleOverride && !override)}
                className={`w-20 text-right bg-white border border-slate-200 rounded-lg p-1.5 font-mono text-sm outline-none focus:border-amber-500 ${readOnly || (onToggleOverride && !override) ? 'text-slate-400' : 'text-slate-800 font-bold'}`}
            />
            {onToggleOverride && (
                <button onClick={onToggleOverride} className="text-slate-400 hover:text-amber-600 transition-colors">
                    {override ? <Unlock size={14}/> : <Lock size={14}/>}
                </button>
            )}
            <span className="text-xs text-slate-400">€</span>
        </div>
    </div>
);

const SummaryRow = ({ label, value, sub, color }: { label: string, value: string, sub?: string, color: string }) => (
    <div className="flex items-center justify-between py-1">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
            <div className="font-mono font-bold text-slate-800 text-sm">{value}</div>
            {sub && <div className="text-[10px] text-slate-400 font-medium">{sub}</div>}
        </div>
    </div>
);

const BarcodeGallery = ({ product, variants, onPrint, settings }: { product: Product; variants: ProductVariant[]; onPrint: (items: any[]) => void; settings: GlobalSettings; }) => {
    const handlePrintItem = (variant: ProductVariant | null, qty: number) => {
        onPrint([{
            product,
            variant: variant || undefined,
            quantity: qty,
            format: 'standard'
        }]);
    };

    const handlePrintAll = () => {
        const items = variants.length > 0 
            ? variants.map(v => ({ product, variant: v, quantity: 1, format: 'standard' as const }))
            : [{ product, quantity: 1, format: 'standard' as const }];
        onPrint(items);
    };

    const items = variants.length > 0 
        ? variants.map(v => ({ variant: v, key: v.suffix })) 
        : [{ variant: null, key: 'master' }];

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-slate-700">Προεπισκόπηση Ετικετών</h4>
                <button onClick={handlePrintAll} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors flex items-center gap-2">
                    <Printer size={16}/> Εκτύπωση Όλων (1x)
                </button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-4">
                {items.map(({ variant, key }) => (
                    <div key={key} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center gap-4 hover:shadow-md transition-shadow">
                        <div className="bg-white border border-slate-100 shadow-inner p-2 rounded-xl flex items-center justify-center min-h-[140px] w-full">
                            {/* Visual Barcode Preview */}
                            <BarcodeView 
                                product={product} 
                                variant={variant || undefined} 
                                width={settings.barcode_width_mm} 
                                height={settings.barcode_height_mm} 
                                format="standard"
                            />
                        </div>
                        
                        <div className="w-full text-center">
                            <div className="font-bold text-slate-800 text-lg">{variant ? `${product.sku}${variant.suffix}` : product.sku}</div>
                            <div className="text-xs text-slate-500">{variant ? variant.description : product.category}</div>
                        </div>

                        <div className="flex items-center gap-2 w-full mt-auto pt-4 border-t border-slate-50">
                            <button 
                                onClick={() => handlePrintItem(variant, 1)} 
                                className="flex-1 bg-slate-900 text-white py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-black transition-colors shadow-sm"
                            >
                                <Printer size={14} /> Εκτύπωση
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, allMolds, viewMode = 'registry' }: Props) {
  const queryClient = useQueryClient();
  const { showToast, confirm } = useUI();
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers });
  
  const [activeTab, setActiveTab] = useState<'overview' | 'recipe' | 'labor' | 'variants' | 'barcodes'>('overview');
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
        supplier_sku: product.supplier_sku,
        supplier_cost: product.supplier_cost || 0,
        description: product.description || '', // Initialize description
        labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            subcontract_cost: 0,
            casting_cost_manual_override: false,
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

  const [isAddingMold, setIsAddingMold] = useState(false);
  const [moldSearch, setMoldSearch] = useState('');
  const [showAnalysisHelp, setShowAnalysisHelp] = useState(false);
  
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [smartAddSuffix, setSmartAddSuffix] = useState(''); 
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [manualSuffixAnalysis, setManualSuffixAnalysis] = useState<string | null>(null);
  
  const TABS = useMemo(() => {
    const baseTabs = [
        { id: 'overview', label: 'Στοιχεία', icon: Info },
    ];
    if (editedProduct.production_type === ProductionType.InHouse) {
        baseTabs.push({ id: 'recipe', label: 'Συνταγή', icon: Box });
        baseTabs.push({ id: 'labor', label: 'Εργατικά', icon: Hammer });
    }
    baseTabs.push({ id: 'variants', label: `Παραλλαγές (${editedProduct.variants?.length || 0})`, icon: Layers });
    baseTabs.push({ id: 'barcodes', label: 'Barcodes', icon: ScanBarcode });
    return baseTabs;
  }, [editedProduct.production_type, editedProduct.variants?.length]);

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
      supplier_sku: product.supplier_sku,
      supplier_cost: product.supplier_cost || 0,
      description: product.description || '', // Initialize description
      labor: {
            casting_cost: 0,
            setter_cost: 0,
            technician_cost: 0,
            stone_setting_cost: 0,
            plating_cost_x: 0,
            plating_cost_d: 0,
            subcontract_cost: 0,
            casting_cost_manual_override: false,
            technician_cost_manual_override: false,
            plating_cost_x_manual_override: false,
            plating_cost_d_manual_override: false,
            ...initialLabor,
        }
    });
    setViewIndex(0);
  }, [product]);

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
    if (editedProduct.production_type === ProductionType.InHouse && !editedProduct.labor.casting_cost_manual_override) {
        const baseCastingCost = editedProduct.weight_g * 0.15;
        const secondaryCastingCost = (editedProduct.secondary_weight_g || 0) * 0.15;
        const castCost = baseCastingCost + secondaryCastingCost;
        setEditedProduct(prev => ({
            ...prev,
            labor: { ...prev.labor, casting_cost: castCost }
        }));
    }
  }, [editedProduct.weight_g, editedProduct.secondary_weight_g, editedProduct.production_type, editedProduct.labor.casting_cost_manual_override]);

  useEffect(() => {
    if (!editedProduct.labor.plating_cost_x_manual_override) {
        let totalPlatingWeight = editedProduct.weight_g;
        editedProduct.recipe.forEach(item => {
            if (item.type === 'component') {
                const subProduct = allProducts.find(p => p.sku === item.sku);
                if (subProduct) {
                    totalPlatingWeight += (subProduct.weight_g * item.quantity);
                }
            }
        });
        const costX = parseFloat((totalPlatingWeight * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_x: costX } }));
    }
  }, [editedProduct.weight_g, editedProduct.recipe, allProducts, editedProduct.labor.plating_cost_x_manual_override]);

  useEffect(() => {
    if (!editedProduct.labor.plating_cost_d_manual_override) {
        let totalSecondaryWeight = editedProduct.secondary_weight_g || 0;
        editedProduct.recipe.forEach(item => {
            if (item.type === 'component') {
                const subProduct = allProducts.find(p => p.sku === item.sku);
                if (subProduct) {
                    totalSecondaryWeight += ((subProduct.secondary_weight_g || 0) * item.quantity);
                }
            }
        });
        const costD = parseFloat((totalSecondaryWeight * 0.60).toFixed(2));
        setEditedProduct(prev => ({ ...prev, labor: { ...prev.labor, plating_cost_d: costD } }));
    }
  }, [editedProduct.secondary_weight_g, editedProduct.recipe, allProducts, editedProduct.labor.plating_cost_d_manual_override]);

  useEffect(() => {
      setEditedProduct(prev => {
          if (!prev.variants || prev.variants.length === 0) return prev;

          let hasChanges = false;
          const updatedVariants = prev.variants.map(v => {
              const { total: estimated } = estimateVariantCost(
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
      editedProduct.labor.subcontract_cost,
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
      
      const getPriority = (suffix: string) => {
        const { finish } = getVariantComponents(suffix, editedProduct.gender);
        switch (finish.code) {
            case '': return 1;    // Λουστρέ (Γυαλιστερό)
            case 'P': return 2;     // Πατίνα
            case 'H': return 3;     // Επιπλατινωμένο
            case 'X': return 4;     // Επίхρυσο
            case 'D': return 5;     // Δíхρωμο
            default: return 6;      // Anything else with stones
        }
      };
      
      return [...variants].sort((a, b) => {
          const priorityA = getPriority(a.suffix);
          const priorityB = getPriority(b.suffix);
          if (priorityA !== priorityB) {
              return priorityA - priorityB;
          }
          // If priorities are the same (e.g. same finish, different stone), sort alphabetically
          return a.suffix.localeCompare(b.suffix);
      });
  }, [variants, editedProduct.gender]);

  const maxViews = hasVariants ? sortedVariantsList.length : (product.production_type === ProductionType.InHouse ? 1 : 0);
  const showPager = hasVariants && variants.length > 1;
  const initialViewIndex = 0; // Always start at the most prevalent variant

  useEffect(() => {
      setViewIndex(initialViewIndex);
  }, [product.sku]);

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
      
      if (currentViewVariant.active_price != null) displayedCost = currentViewVariant.active_price;
      if (currentViewVariant.selling_price != null) displayedPrice = currentViewVariant.selling_price;
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
      
      const getPriority = (code: string) => {
        switch (code) {
          case '': return 0; // Empty code (Lustre) is top priority
          case 'P': return 1;
          case 'D': return 2;
          case 'X': return 3;
          case 'H': return 4;
          default: return 5;
        }
      };

      const sortedFinishNames = Array.from(finishCodes)
        .sort((a, b) => getPriority(a) - getPriority(b))
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
        let finalEditedProduct = { ...editedProduct };

        // Special logic for 'ST' SKUs with 'H' variant
        if (finalEditedProduct.sku.startsWith('ST') && finalEditedProduct.variants.some(v => v.suffix === 'H')) {
            const hasLustreVariant = finalEditedProduct.variants.some(v => v.suffix === '');
            if (!hasLustreVariant) {
                const { total: estimatedCost } = estimateVariantCost(
                    finalEditedProduct,
                    '',
                    settings,
                    allMaterials,
                    allProducts
                );
                // UPDATED: Use 'Λουστρέ' simple description
                const lustreDescription = analyzeSuffix('', finalEditedProduct.gender) || 'Λουστρέ';
                const newLustreVariant: ProductVariant = {
                    suffix: '',
                    description: lustreDescription,
                    stock_qty: 0,
                    active_price: parseFloat(estimatedCost.toFixed(2)),
                    selling_price: finalEditedProduct.is_component ? 0 : finalEditedProduct.selling_price
                };
                finalEditedProduct = {
                    ...finalEditedProduct,
                    variants: [...finalEditedProduct.variants, newLustreVariant]
                };
                showToast("Αυτόματη προσθήκη παραλλαγής Λουστρέ για ST κωδικό.", "info");
            }
        }

        const isComponent = finalEditedProduct.sku.toUpperCase().startsWith('STX');
        const currentCost = calculateProductCost(finalEditedProduct, settings, allMaterials, allProducts).total;

        const { error: productUpdateError } = await supabase.from('products').update({
            // Editable fields
            category: finalEditedProduct.category,
            description: isComponent ? finalEditedProduct.description : null,
            gender: finalEditedProduct.gender,
            weight_g: finalEditedProduct.weight_g,
            secondary_weight_g: finalEditedProduct.secondary_weight_g || null,
            selling_price: isComponent ? 0 : finalEditedProduct.selling_price,
            plating_type: finalEditedProduct.plating_type,
            
            // Labor
            labor_casting: finalEditedProduct.labor.casting_cost,
            labor_setter: finalEditedProduct.labor.setter_cost,
            labor_technician: finalEditedProduct.labor.technician_cost,
            labor_plating_x: finalEditedProduct.labor.plating_cost_x,
            labor_plating_d: finalEditedProduct.labor.plating_cost_d,
            labor_subcontract: finalEditedProduct.labor.subcontract_cost,
            labor_casting_manual_override: finalEditedProduct.labor.casting_cost_manual_override,
            labor_technician_manual_override: finalEditedProduct.labor.technician_cost_manual_override,
            labor_plating_x_manual_override: finalEditedProduct.labor.plating_cost_x_manual_override,
            labor_plating_d_manual_override: finalEditedProduct.labor.plating_cost_d_manual_override,

            // Recalculated / System fields
            active_price: currentCost,
            draft_price: currentCost,
            is_component: isComponent,

            // Production Strategy
            production_type: finalEditedProduct.production_type,
            supplier_id: (finalEditedProduct.production_type === ProductionType.Imported && finalEditedProduct.supplier_id) ? finalEditedProduct.supplier_id : null,
            supplier_sku: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.supplier_sku : null,
            supplier_cost: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.supplier_cost : null,
            labor_stone_setting: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.labor.stone_setting_cost : null 
        }).eq('sku', finalEditedProduct.sku);

        if (productUpdateError) throw productUpdateError;

        await supabase.from('recipes').delete().eq('parent_sku', finalEditedProduct.sku);
        if (finalEditedProduct.recipe.length > 0) {
            const recipeInserts = finalEditedProduct.recipe.map(r => ({
                parent_sku: finalEditedProduct.sku,
                type: r.type,
                material_id: r.type === 'raw' ? r.id : null,
                component_sku: r.type === 'component' ? r.sku : null,
                quantity: r.quantity
            }));
            await supabase.from('recipes').insert(recipeInserts);
        }
        
        await supabase.from('product_molds').delete().eq('product_sku', finalEditedProduct.sku);
        if (finalEditedProduct.molds && finalEditedProduct.molds.length > 0 && finalEditedProduct.production_type === ProductionType.InHouse) {
            const moldInserts = finalEditedProduct.molds.map(m => ({
                product_sku: finalEditedProduct.sku,
                mold_code: m.code,
                quantity: m.quantity
            }));
            const { error: moldError } = await supabase.from('product_molds').insert(moldInserts);
            if (moldError) throw moldError;
        }

        await supabase.from('product_variants').delete().eq('product_sku', finalEditedProduct.sku);
        if (finalEditedProduct.variants && finalEditedProduct.variants.length > 0) {
            const newVariantsForDB = finalEditedProduct.variants.map(v => ({
                product_sku: finalEditedProduct.sku,
                suffix: v.suffix,
                description: v.description,
                stock_qty: v.stock_qty || 0,
                active_price: v.active_price || null,
                selling_price: finalEditedProduct.is_component ? 0 : ((v.selling_price !== null && !isNaN(Number(v.selling_price))) ? Number(v.selling_price) : null)
            }));
            await supabase.from('product_variants').insert(newVariantsForDB);
        }
        
        await queryClient.refetchQueries({ queryKey: ['products'] });

        if (onSave) onSave(finalEditedProduct);
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

    const { total: estimatedCost } = estimateVariantCost(
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
      selling_price: editedProduct.is_component ? 0 : editedProduct.selling_price
    };
    
    setEditedProduct(prev => ({ ...prev, variants: [...prev.variants, newVariant] }));
    setSmartAddSuffix('');
    showToast(`Παραλλαγή ${analysis.suffix} προστέθηκε!`, 'success');
  };

  const handleManualAdd = () => {
      if (!newVariantSuffix) { showToast("Το Suffix είναι υποχρεωτικό.", 'error'); return; }
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (editedProduct.variants.some(v => v.suffix === upperSuffix)) { showToast('Αυτό το Suffix υπάρχει ήδη.', 'info'); return; }
      
      const { total: estimatedCost } = estimateVariantCost(
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
        selling_price: editedProduct.is_component ? 0 : editedProduct.selling_price
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
      newVariants[realIndex] = { ...newVariants[realIndex], [field]: value };
      setEditedProduct(prev => ({ ...prev, variants: newVariants }));
  };

  const deleteVariant = (index: number) => {
      const variantToDelete = sortedVariantsList[index];
      setEditedProduct(prev => ({
          ...prev,
          variants: prev.variants.filter(v => v.suffix !== variantToDelete.suffix)
      }));
  };

  const addMold = (code: string) => {
      if (editedProduct.molds.some(m => m.code === code)) return;
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
      const usedCodes = new Set(editedProduct.molds.map(m => m.code));
      return allMolds
        .filter(m => !usedCodes.has(m.code))
        .filter(m => 
            m.code.includes(moldSearch.toUpperCase()) || 
            m.description.toLowerCase().includes(moldSearch.toLowerCase())
        )
        .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }, [allMolds, editedProduct.molds, moldSearch]);

  const secondaryWeightLabel = useMemo(() => {
    if (editedProduct.gender === Gender.Men && editedProduct.category.includes('Δαχτυλίδι')) {
        return "Βάρος Καπακιού (g)";
    }
    return "Β' Βáρος (g)";
  }, [editedProduct.gender, editedProduct.category]);

  const totalWeightForSilver = editedProduct.weight_g + (editedProduct.secondary_weight_g || 0);

  const analyticalCostingItems = useMemo(() => {
    if (hasVariants) {
        return sortedVariantsList.map(v => ({
            key: v.suffix,
            title: `${product.sku}${v.suffix} (${v.description})`,
            costResult: estimateVariantCost(editedProduct, v.suffix, settings, allMaterials, allProducts)
        }));
    } else {
        return [{
            key: 'master-lustre',
            title: `${product.sku} (Λουστρέ)`,
            costResult: currentCostCalc
        }];
    }
  }, [hasVariants, sortedVariantsList, product.sku, editedProduct, settings, allMaterials, allProducts, currentCostCalc]);

  // RENDER
  return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 print:hidden">
        {showAnalysisHelp && <AnalysisExplainerModal onClose={() => setShowAnalysisHelp(false)} />}
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
        <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl relative flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100">
           
           {/* Header */}
           <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-white z-10 shrink-0">
               <div>
                   <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                       <span>{displayedSku}</span>
                       {showPager && (
                            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                                <button onClick={prevView} className="p-1.5 rounded-md hover:bg-white text-slate-400 hover:text-slate-700 transition-colors">
                                    <ChevronLeft size={18} />
                                </button>
                                <span className="text-xs font-mono text-slate-500 w-10 text-center">
                                    {viewIndex + 1}/{maxViews}
                                </span>
                                <button onClick={nextView} className="p-1.5 rounded-md hover:bg-white text-slate-400 hover:text-slate-700 transition-colors">
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        )}
                       {editedProduct.is_component && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase">Component</span>}
                       {editedProduct.production_type === ProductionType.Imported && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1"><Globe size={12}/> Εισαγόμενο</span>}
                   </h2>
                   <div className="flex gap-3 text-sm text-slate-500 font-medium mt-1">
                       <span>{editedProduct.category}</span>
                       <span>•</span>
                       <span className="font-bold text-slate-600">{displayedLabel}</span>
                   </div>
               </div>
               <div className="flex items-center gap-2">
                   {viewMode === 'registry' && (
                       <button onClick={requestDelete} disabled={isDeleting} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors mr-2">
                           <Trash2 size={20}/>
                       </button>
                   )}
                   <button onClick={onClose} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors">
                       <X size={20}/>
                   </button>
               </div>
           </div>

           {/* Content */}
           <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50/50">
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                   {/* Left Column: Image & Quick Stats */}
                   <div className="lg:col-span-4 space-y-6">
                       <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm relative group">
                           <div className="aspect-square bg-slate-100 rounded-2xl overflow-hidden relative">
                               {editedProduct.image_url ? (
                                   <img src={editedProduct.image_url} className="w-full h-full object-cover" alt={editedProduct.sku}/>
                               ) : (
                                   <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={48}/></div>
                               )}
                               
                               <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                   <div className="bg-white/20 backdrop-blur-md text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 border border-white/30">
                                       <Camera size={18}/> {isUploadingImage ? 'Μεταφόρτωση...' : 'Αλλαγή'}
                                   </div>
                                   <input type="file" className="hidden" accept="image/*" onChange={handleImageUpdate} disabled={isUploadingImage}/>
                               </label>
                           </div>
                       </div>

                       <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                           <h3 className="font-bold text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-2">
                               <TrendingUp size={18} className="text-emerald-500"/> Οικονομικά
                           </h3>
                           
                           <div className="flex justify-between items-center text-sm">
                               <span className="text-slate-500">Κόστος</span>
                               <span className="font-mono font-bold text-slate-800">{formatCurrency(displayedCost)}</span>
                           </div>
                           
                           {!editedProduct.is_component && (
                               <>
                               <div className="flex justify-between items-center text-sm">
                                   <span className="text-slate-500">Τιμή Πώλησης</span>
                                   <span className="font-mono font-bold text-emerald-600">{formatCurrency(displayedPrice)}</span>
                               </div>
                               <div className="w-full h-px bg-slate-100"></div>
                               <div className="flex justify-between items-center text-xs">
                                   <span className="font-bold text-slate-400 uppercase">Περιθωριο</span>
                                   <span className={`font-black ${displayedMargin < 30 ? 'text-red-500' : 'text-emerald-600'}`}>{displayedMargin.toFixed(0)}%</span>
                               </div>
                               </>
                           )}
                       </div>
                   </div>

                   {/* Right Column: Details & Editing */}
                   <div className="lg:col-span-8 space-y-6">
                       
                       {/* TABS */}
                       <div className="flex gap-2 bg-slate-200/50 p-1.5 rounded-2xl w-fit">
                           {TABS.map(tab => (
                               <button 
                                   key={tab.id}
                                   onClick={() => setActiveTab(tab.id as any)}
                                   className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                               >
                                   <tab.icon size={16} className={activeTab === tab.id ? 'text-amber-500' : ''}/> {tab.label}
                               </button>
                           ))}
                       </div>

                       {/* TAB CONTENT */}
                       <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm min-h-[400px]">
                           {activeTab === 'overview' && (
                               <div className="space-y-6 animate-in fade-in">
                                   {editedProduct.production_type === ProductionType.InHouse ? (
                                    <>
                                       <div className="grid grid-cols-2 gap-6">
                                           <div>
                                               <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Κατηγορία</label>
                                               <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.category} onChange={e => setEditedProduct({...editedProduct, category: e.target.value})} />
                                           </div>
                                           <div>
                                               <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βάρος (g)</label>
                                               <input type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.weight_g} onChange={e => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value) || 0})} />
                                           </div>
                                           <div>
                                               <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">{secondaryWeightLabel}</label>
                                               <input type="number" step="0.01" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.secondary_weight_g} onChange={e => setEditedProduct({...editedProduct, secondary_weight_g: parseFloat(e.target.value) || 0})} />
                                           </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Φύλο</label>
                                                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.gender} onChange={e => setEditedProduct({...editedProduct, gender: e.target.value as Gender})}>
                                                    <option value={Gender.Women}>Γυναικείο</option>
                                                    <option value={Gender.Men}>Ανδρικό</option>
                                                    <option value={Gender.Unisex}>Unisex</option>
                                                </select>
                                            </div>
                                            {editedProduct.is_component && (
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Περιγραφή STX</label>
                                                    <input className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.description || ''} onChange={e => setEditedProduct({...editedProduct, description: e.target.value})} placeholder="π.χ. Μικρή Πεταλούδα" />
                                                </div>
                                            )}
                                            {hasVariants ? (
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Διαθέσιμες Επιμεταλλώσεις</label>
                                                    <div className="w-full p-3 bg-slate-100 text-slate-700 font-medium border border-slate-200 rounded-xl mt-1">
                                                        {displayPlating}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Βασική Επιμετάλλωση</label>
                                                    <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl mt-1 font-medium" value={editedProduct.plating_type} onChange={e => setEditedProduct({...editedProduct, plating_type: e.target.value as PlatingType})}>
                                                        <option value={PlatingType.None}>Λουστρέ</option>
                                                        <option value={PlatingType.GoldPlated}>Επίхρυσο</option>
                                                        <option value={PlatingType.TwoTone}>Δίχρωμο</option>
                                                        <option value={PlatingType.Platinum}>Πλατίνα</option>
                                                    </select>
                                                </div>
                                            )}
                                           {!editedProduct.is_component && (
                                               <div>
                                                   <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">Τιμή Πώλησης (€)</label>
                                                   <div className="flex gap-2">
                                                       <input type="number" step="0.01" className="w-full p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl mt-1 font-bold font-mono" value={editedProduct.selling_price} onChange={e => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value) || 0})} />
                                                       <button onClick={() => setShowRepriceTool(!showRepriceTool)} className="mt-1 p-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-600"><Calculator size={20}/></button>
                                                   </div>
                                               </div>
                                           )}
                                       </div>
                                        {showRepriceTool && (
                                           <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 animate-in slide-in-from-top-2">
                                               <h4 className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-2"><TrendingUp size={16}/> Εργαλείο Ανατιμολόγησης</h4>
                                               <div className="flex items-end gap-4">
                                                   <div>
                                                       <label className="text-[10px] font-bold text-blue-600 uppercase">Στόχος Margin (%)</label>
                                                       <input type="number" value={targetMargin} onChange={e => { setTargetMargin(parseFloat(e.target.value)); updateCalculatedPrice(parseFloat(e.target.value)); }} className="w-24 p-2 rounded-lg border border-blue-200 font-bold text-center"/>
                                                   </div>
                                                   <div>
                                                       <label className="text-[10px] font-bold text-blue-600 uppercase">Προτεινόμενη Τιμή</label>
                                                       <div className="font-mono font-black text-xl text-blue-900">{calculatedPrice}€</div>
                                                   </div>
                                                   <button onClick={applyReprice} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700">Εφαρμογή</button>
                                               </div>
                                           </div>
                                       )}
                                       <div>
                                            <h4 className="font-bold text-slate-700 mb-3 flex items-center justify-between">
                                                <span className="flex items-center gap-2"><MapPin size={18} className="text-amber-500"/> Λάστιχα</span>
                                                <button onClick={() => setIsAddingMold(prev => !prev)} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-1.5 rounded-lg transition-colors">
                                                    {isAddingMold ? 'Ακύρωση' : 'Προσθήκη'}
                                                </button>
                                            </h4>
                                           <div className="flex flex-wrap gap-2 mb-4">
                                                {editedProduct.molds.map(m => {
                                                    const moldDetails = allMolds.find(mold => mold.code === m.code);
                                                    const tooltipText = moldDetails ? `${moldDetails.description}${moldDetails.location ? ` (${moldDetails.location})` : ''}` : '';
                                                    return (
                                                        <div key={m.code} title={tooltipText} className="bg-amber-50 border border-amber-200 text-amber-800 pl-3 pr-1 py-1 rounded-lg text-sm font-bold flex items-center gap-2">
                                                            <span>{m.code}</span>
                                                            <div className="flex items-center bg-amber-100/50 rounded border border-amber-200">
                                                                <button type="button" onClick={() => updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-amber-100 text-amber-600 rounded-l ${m.quantity <= 1 ? 'opacity-30' : ''}`} disabled={m.quantity <= 1}>
                                                                    <Minus size={12}/>
                                                                </button>
                                                                <input 
                                                                    type="number" 
                                                                    min="1" 
                                                                    value={m.quantity} 
                                                                    onChange={(e) => {
                                                                        const val = parseInt(e.target.value) || 1;
                                                                        setEditedProduct(prev => ({
                                                                            ...prev,
                                                                            molds: prev.molds.map(pm => pm.code === m.code ? { ...pm, quantity: val } : pm)
                                                                        }));
                                                                    }}
                                                                    className="w-8 text-center bg-transparent outline-none text-xs font-bold text-amber-900"
                                                                />
                                                                <button type="button" onClick={() => updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-amber-100 text-amber-600 rounded-r">
                                                                    <Plus size={12}/>
                                                                </button>
                                                            </div>
                                                            <button onClick={() => removeMold(m.code)} className="p-1 text-slate-300 hover:text-red-500 ml-1 hover:bg-red-50 rounded transition-colors"><X size={14}/></button>
                                                        </div>
                                                    );
                                                })}
                                               {editedProduct.molds.length === 0 && <span className="text-slate-400 text-sm italic">Κανένα λάστιχο.</span>}
                                           </div>
                                           {isAddingMold && (
                                               <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 space-y-2 animate-in fade-in">
                                                   <div className="relative">
                                                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14}/>
                                                       <input 
                                                           type="text" 
                                                           placeholder="Αναζήτηση..." 
                                                           value={moldSearch} 
                                                           onChange={e => setMoldSearch(e.target.value)} 
                                                           className="w-full pl-9 p-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-500"
                                                           autoFocus
                                                       />
                                                   </div>
                                                   <div className="max-h-40 overflow-y-auto space-y-1">
                                                       {availableMolds.map(m => (
                                                           <button key={m.code} onClick={() => addMold(m.code)} className="w-full text-left p-2 hover:bg-white rounded-lg flex justify-between items-center group text-sm">
                                                               <span className="font-bold text-slate-700">{m.code}</span>
                                                               <span className="text-xs text-slate-400 group-hover:text-amber-600">{m.description}</span>
                                                           </button>
                                                       ))}
                                                       {availableMolds.length === 0 && <div className="text-center text-xs text-slate-400 p-2">Δεν βρέθηκαν διαθέσιμα λάστιχα.</div>}
                                                   </div>
                                               </div>
                                           )}
                                       </div>
                                    </>
                                   ) : (
                                    <div className="space-y-6">
                                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                           <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
                                                <h4 className="font-bold text-slate-700 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">
                                                    <Calculator size={14}/> Κοστολόγηση Εισαγωγής
                                                </h4>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Weight size={12}/> Βάρος (g)</label>
                                                    <input type="number" step="0.01" className="w-full p-3 bg-white border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.weight_g} onChange={e => setEditedProduct({...editedProduct, weight_g: parseFloat(e.target.value) || 0})} />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">Κωδικός Προμηθευτή</label>
                                                    <input type="text" className="w-full p-3 bg-white border border-slate-200 rounded-xl mt-1 font-bold font-mono" value={editedProduct.supplier_sku || ''} onChange={e => setEditedProduct({...editedProduct, supplier_sku: e.target.value})} placeholder="π.χ. ITEM-123"/>
                                                </div>
                                                <LaborCostInput icon={<Hammer size={14}/>} label="Εργατικά (€/g)" value={editedProduct.labor.technician_cost} onChange={val => setEditedProduct(p => ({...p, labor: {...p.labor, technician_cost: val}}))} />
                                                <LaborCostInput icon={<Coins size={14}/>} label="Επιμετάλλωση (€/g)" value={editedProduct.labor.plating_cost_x} onChange={val => setEditedProduct(p => ({...p, labor: {...p.labor, plating_cost_x: val}}))} />
                                                <LaborCostInput icon={<Gem size={14}/>} label="Καρφωτικά (€)" value={editedProduct.labor.stone_setting_cost} onChange={val => setEditedProduct(p => ({...p, labor: {...p.labor, stone_setting_cost: val}}))} />
                                           </div>
                                           <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200 shadow-sm flex flex-col">
                                                <h4 className="font-bold text-emerald-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-emerald-200 pb-2">
                                                    <Calculator size={14}/> Ανάλυση Κόστους
                                                </h4>
                                                <div className="space-y-1 flex-1">
                                                    <SummaryRow label="Ασήμι" value={formatCurrency(currentCostCalc.breakdown?.silver)} sub={`${editedProduct.weight_g}g`} color="bg-slate-400" />
                                                    <SummaryRow label="Εργατικά" value={formatCurrency(currentCostCalc.breakdown?.details?.technician_cost)} sub={`/ ${editedProduct.weight_g}g`} color="bg-blue-400" />
                                                    <SummaryRow label="Επιμετάλλωση" value={formatCurrency(currentCostCalc.breakdown?.details?.plating_cost_x)} sub={`/ ${editedProduct.weight_g}g`} color="bg-amber-400" />
                                                    <SummaryRow label="Καρφωτικά" value={formatCurrency(currentCostCalc.breakdown?.details?.stone_setting_cost)} sub="Σταθερό" color="bg-purple-400" />
                                                </div>
                                                <div className="pt-3 mt-3 border-t border-emerald-200 flex justify-between items-center">
                                                    <span className="font-bold text-emerald-700 text-sm uppercase">Τελικο Κοστος</span>
                                                    <span className="font-black text-2xl text-emerald-800">{formatCurrency(masterCost)}</span>
                                                </div>
                                           </div>
                                       </div>
                                       <div className="bg-amber-50 p-6 rounded-2xl border border-amber-200 shadow-sm">
                                            <h4 className="font-bold text-amber-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-amber-200 pb-2">
                                                <DollarSign size={14}/> Εμπορική Πολιτική
                                            </h4>
                                            <div className="grid grid-cols-2 gap-6 items-end">
                                               <div>
                                                   <label className="text-xs font-bold text-slate-500 uppercase">Τιμή Πώλησης (€)</label>
                                                   <div className="flex gap-2">
                                                       <input type="number" step="0.01" className="w-full p-3 bg-white border border-amber-200 text-amber-800 rounded-xl mt-1 font-bold font-mono" value={editedProduct.selling_price} onChange={e => setEditedProduct({...editedProduct, selling_price: parseFloat(e.target.value) || 0})} />
                                                       <button onClick={() => setShowRepriceTool(!showRepriceTool)} className="mt-1 p-3 bg-white hover:bg-amber-50 border border-amber-200 rounded-xl text-slate-600"><Calculator size={20}/></button>
                                                   </div>
                                               </div>
                                            </div>
                                            {showRepriceTool && (
                                               <div className="bg-amber-100/50 p-4 rounded-xl border border-amber-200 animate-in slide-in-from-top-2 mt-4">
                                                   <h4 className="font-bold text-amber-800 text-sm mb-3 flex items-center gap-2"><TrendingUp size={16}/> Εργαλείο Ανατιμολόγησης</h4>
                                                   <div className="flex items-end gap-4">
                                                       <div>
                                                           <label className="text-[10px] font-bold text-amber-700 uppercase">Στόχος Margin (%)</label>
                                                           <input type="number" value={targetMargin} onChange={e => { setTargetMargin(parseFloat(e.target.value)); updateCalculatedPrice(parseFloat(e.target.value)); }} className="w-24 p-2 rounded-lg border border-amber-300 font-bold text-center bg-white"/>
                                                       </div>
                                                       <div>
                                                           <label className="text-[10px] font-bold text-amber-700 uppercase">Προτεινόμενη Τιμή</label>
                                                           <div className="font-mono font-black text-xl text-amber-900">{calculatedPrice}€</div>
                                                       </div>
                                                       <button onClick={applyReprice} className="bg-amber-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-amber-700">Εφαρμογή</button>
                                                   </div>
                                               </div>
                                           )}
                                       </div>
                                    </div>
                                   )}
                               </div>
                           )}

                           {activeTab === 'recipe' && (
                               <div className="space-y-4 animate-in fade-in">
                                   <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 shadow-sm">
                                       <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-600">
                                           <Coins size={16} />
                                       </div>
                                       <div className="flex-1">
                                           <div className="font-bold text-slate-800 text-sm">Ασήμι 925 (Βάση)</div>
                                           <div className="text-xs text-slate-400 font-mono">
                                                {totalWeightForSilver > editedProduct.weight_g
                                                    ? `${formatDecimal(totalWeightForSilver)}g (${formatDecimal(editedProduct.weight_g)}g + ${formatDecimal(editedProduct.secondary_weight_g || 0)}g)`
                                                    : `${formatDecimal(totalWeightForSilver)}g`
                                                } @ {formatDecimal(settings.silver_price_gram, 3)}€/g
                                           </div>
                                       </div>
                                       <div className="text-right">
                                           <div className="font-mono font-bold text-slate-800 text-lg">
                                               {formatCurrency(currentCostCalc.breakdown.silver)}
                                           </div>
                                       </div>
                                   </div>
                                   {editedProduct.recipe.map((item, idx) => {
                                       const isRaw = item.type === 'raw';
                                       const details = isRaw ? allMaterials.find(m => m.id === item.id) : allProducts.find(p => p.sku === item.sku);
                                       
                                        let itemCost = 0;
                                        if (isRaw) {
                                            const mat = details as Material | undefined;
                                            if (mat) {
                                                let unitCost = mat.cost_per_unit;
                                                if (currentViewVariant?.suffix) {
                                                    const { stone } = getVariantComponents(currentViewVariant.suffix, editedProduct.gender);
                                                    if (stone.code && mat.variant_prices && mat.variant_prices[stone.code] != null) {
                                                        unitCost = mat.variant_prices[stone.code];
                                                    }
                                                }
                                                itemCost = unitCost * item.quantity;
                                            }
                                        } else { // component
                                            const subProduct = details as Product | undefined;
                                            if (subProduct) {
                                                itemCost = (subProduct.active_price || 0) * item.quantity;
                                            }
                                        }

                                       return (
                                           <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                                               <div className="p-2 bg-white rounded-lg border border-slate-100">
                                                   {isRaw ? <Gem size={16} className="text-emerald-500"/> : <Puzzle size={16} className="text-blue-500"/>}
                                               </div>
                                               <div className="flex-1">
                                                   {isRaw ? (
                                                       <select 
                                                           className="bg-transparent font-bold text-slate-800 outline-none w-full"
                                                           value={item.id}
                                                           onChange={(e) => updateRecipeItem(idx, 'id', e.target.value)}
                                                       >
                                                           {allMaterials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                                       </select>
                                                   ) : (
                                                       <select 
                                                           className="bg-transparent font-bold text-slate-800 outline-none w-full"
                                                           value={item.sku}
                                                           onChange={(e) => updateRecipeItem(idx, 'sku', e.target.value)}
                                                       >
                                                           {allProducts.filter(p => p.is_component).map(p => <option key={p.sku} value={p.sku}>{p.sku} - {p.category}</option>)}
                                                       </select>
                                                   )}
                                               </div>
                                                <div className="font-mono font-bold text-slate-700 text-sm">{formatCurrency(itemCost)}</div>
                                               <div className="flex items-center gap-2">
                                                   <input type="number" className="w-16 p-1 text-center font-bold bg-white rounded border border-slate-200 outline-none" value={item.quantity} onChange={e => updateRecipeItem(idx, 'quantity', e.target.value)}/>
                                                   <span className="text-xs text-slate-400 font-bold w-8">{isRaw ? (details as Material)?.unit : 'τεμ'}</span>
                                               </div>
                                               <button onClick={() => removeRecipeItem(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                                           </div>
                                       );
                                   })}
                                   <div className="flex gap-2 pt-4">
                                       <button onClick={() => addRecipeItem('raw')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2"><Plus size={14}/> Υλικό</button>
                                       <button onClick={() => addRecipeItem('component')} className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors flex items-center justify-center gap-2"><Plus size={14}/> Εξάρτημα</button>
                                   </div>
                               </div>
                           )}

                           {activeTab === 'labor' && (
                               <div className="space-y-6 animate-in fade-in">
                                   <div>
                                       <h3 className="font-bold text-slate-800 mb-4">Εισαγωγή Κόστους Εργατικών</h3>
                                       <div className="space-y-2">
                                            <LaborCostInput label="Χυτήριο (€)" value={editedProduct.labor.casting_cost} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, casting_cost: v}})} override={editedProduct.labor.casting_cost_manual_override} onToggleOverride={() => setEditedProduct(p=>({...p, labor: {...p.labor, casting_cost_manual_override: !p.labor.casting_cost_manual_override}}))} icon={<Flame size={14}/>}/>
                                            <LaborCostInput label="Καρφωτής (€)" value={editedProduct.labor.setter_cost} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, setter_cost: v}})} icon={<Gem size={14}/>}/>
                                            <LaborCostInput label="Τεχνίτης (€)" value={editedProduct.labor.technician_cost} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, technician_cost: v}})} override={editedProduct.labor.technician_cost_manual_override} onToggleOverride={() => setEditedProduct(p=>({...p, labor: {...p.labor, technician_cost_manual_override: !p.labor.technician_cost_manual_override}}))} icon={<Hammer size={14}/>}/>
                                            <LaborCostInput label="Επιμετάλλωση X/H (€)" value={editedProduct.labor.plating_cost_x} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost_x: v}})} override={editedProduct.labor.plating_cost_x_manual_override} onToggleOverride={() => setEditedProduct(p=>({...p, labor: {...p.labor, plating_cost_x_manual_override: !p.labor.plating_cost_x_manual_override}}))} icon={<Coins size={14}/>}/>
                                            <LaborCostInput label="Επιμετάλλωση D (€)" value={editedProduct.labor.plating_cost_d} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, plating_cost_d: v}})} override={editedProduct.labor.plating_cost_d_manual_override} onToggleOverride={() => setEditedProduct(p=>({...p, labor: {...p.labor, plating_cost_d_manual_override: !p.labor.plating_cost_d_manual_override}}))} icon={<Coins size={14}/>}/>
                                            <LaborCostInput label="Φασόν/Έξτρα (€)" value={editedProduct.labor.subcontract_cost} onChange={v => setEditedProduct({...editedProduct, labor: {...editedProduct.labor, subcontract_cost: v}})} icon={<Users size={14}/>}/>
                                       </div>
                                   </div>
                                    <div className="mt-8 pt-6 border-t border-slate-100">
                                        <h3 className="font-bold text-slate-800 mb-4">Αναλυτική Κοστολόγηση Παραλλαγών</h3>
                                        <div className="space-y-4">
                                            {analyticalCostingItems.map(item => {
                                                const { key, title, costResult } = item;
                                                return (
                                                    <div key={key} className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                                                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3">
                                                            <span className="font-bold text-slate-800 text-sm">{title}</span>
                                                            <span className="font-black text-lg text-emerald-700">{formatCurrency(costResult.total)}</span>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                            <div className="text-center bg-white p-2 rounded-lg border border-slate-100">
                                                                <div className="text-[10px] font-bold text-slate-400">ΑΣΗΜΙ</div>
                                                                <div className="font-mono text-slate-700 font-bold">{formatCurrency(costResult.breakdown.silver)}</div>
                                                            </div>
                                                            <div className="text-center bg-white p-2 rounded-lg border border-slate-100">
                                                                <div className="text-[10px] font-bold text-slate-400">ΥΛΙΚΑ</div>
                                                                <div className="font-mono text-slate-700 font-bold">{formatCurrency(costResult.breakdown.materials)}</div>
                                                            </div>
                                                            <div className="text-center bg-white p-2 rounded-lg border border-slate-100">
                                                                <div className="text-[10px] font-bold text-slate-400">ΕΡΓΑΤΙΚΑ</div>
                                                                <div className="font-mono text-slate-700 font-bold">{formatCurrency(costResult.breakdown.labor)}</div>
                                                            </div>
                                                        </div>
                                                        <div className="mt-2 text-xs text-slate-500 font-mono bg-white rounded p-2 border border-slate-100">
                                                            Χυτ: {formatCurrency(costResult.breakdown.details.casting_cost)} |
                                                            Τεχν: {formatCurrency(costResult.breakdown.details.technician_cost)} |
                                                            Καρφ: {formatCurrency(costResult.breakdown.details.setter_cost)} |
                                                            Επιμ: {formatCurrency(costResult.breakdown.details.plating_cost)} |
                                                            Φασόν: {formatCurrency(costResult.breakdown.details.subcontract_cost)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                               </div>
                           )}

                           {activeTab === 'variants' && (
                               <div className="space-y-4 animate-in fade-in">
                                   {/* Smart Add */}
                                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                       <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Wand2 size={16} className="text-amber-500"/> Έξυπνη Προσθήκη</h4>
                                       <div className="flex gap-2">
                                           <input type="text" placeholder="Εισάγετε Suffix (π.χ. XKR)..." value={smartAddSuffix} onChange={e => setSmartAddSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase"/>
                                           <button onClick={handleSmartAdd} className="bg-amber-500 text-white px-4 rounded-lg font-bold text-sm hover:bg-amber-600">Add</button>
                                       </div>
                                   </div>
                                   
                                   {/* Manual Add */}
                                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                       <h4 className="font-bold text-sm text-slate-600 mb-2 flex items-center gap-2"><Plus size={16}/> Χειροκίνητη Προσθήκη</h4>
                                       <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-end">
                                           <input type="text" placeholder="Suffix" value={newVariantSuffix} onChange={e => { setNewVariantSuffix(e.target.value.toUpperCase()); setManualSuffixAnalysis(analyzeSuffix(e.target.value, editedProduct.gender)); }} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase"/>
                                           <input type="text" placeholder="Περιγραφή" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm"/>
                                           <button onClick={handleManualAdd} className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-black">Add</button>
                                       </div>
                                       {manualSuffixAnalysis && <div className="text-xs text-blue-600 mt-2 ml-1">Πρόταση: {manualSuffixAnalysis}</div>}
                                   </div>
                                   
                                   <div className="pt-4 border-t border-slate-100 space-y-2">
                                       {sortedVariantsList.map((v, index) => (
                                           <div key={v.suffix} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
                                               <span className="font-mono font-bold w-20 text-center">{v.suffix}</span>
                                               <input value={v.description} onChange={e => updateVariant(index, 'description', e.target.value)} className="flex-1 p-1 bg-slate-50 rounded border border-slate-200 text-sm outline-none focus:border-blue-500"/>
                                               <div className="text-xs text-slate-400">Κόστος: <span className="font-bold text-slate-600">{formatCurrency(v.active_price)}</span></div>
                                               {!editedProduct.is_component && <input type="number" step="0.1" value={v.selling_price || ''} onChange={e => updateVariant(index, 'selling_price', parseFloat(e.target.value))} className="w-20 p-1 bg-emerald-50 rounded border border-emerald-200 text-sm font-bold text-emerald-800 outline-none focus:border-emerald-500"/>}
                                               <button onClick={() => deleteVariant(index)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={16}/></button>
                                           </div>
                                       ))}
                                   </div>
                               </div>
                           )}

                            {activeTab === 'barcodes' && (
                                <div className="animate-in fade-in h-full">
                                    <BarcodeGallery product={editedProduct} variants={sortedVariantsList} onPrint={setPrintItems} settings={settings}/>
                                </div>
                            )}
                       </div>
                   </div>
               </div>
           </div>

           {/* Footer */}
           <div className="flex justify-between items-center p-4 border-t border-slate-100 bg-white/80 backdrop-blur-sm shrink-0">
               <div className="flex gap-2">
                   {/* Removed redundant Print Buttons */}
               </div>
               <button onClick={handleSave} className="bg-emerald-600 text-white font-bold px-8 py-3 rounded-xl flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-100">
                   <Save size={18}/> Αποθήκευση
               </button>
           </div>
        </div>
      </div>,
      document.body
  );
}