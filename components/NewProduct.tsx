
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold, ProductVariant, MaterialType, ProductMold, ProductionType, Supplier } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost, calculatePlatingCost, estimateVariantCost, analyzeSuffix, getVariantComponents, analyzeSupplierValue, formatCurrency, SupplierAnalysis, formatDecimal } from '../utils/pricingEngine';
/* @FIX: Added missing 'Zap' icon import from lucide-react */
import { Plus, Trash2, Camera, Box, Upload, Loader2, ArrowRight, ArrowLeft, CheckCircle, Lightbulb, Wand2, Percent, Search, ImageIcon, Lock, Unlock, MapPin, Tag, Layers, RefreshCw, DollarSign, Calculator, Crown, Coins, Hammer, Flame, Users, Palette, Check, X, PackageOpen, Gem, Link, Activity, Puzzle, Minus, Globe, Info, ThumbsUp, AlertTriangle, HelpCircle, BookOpen, Scroll, Zap, PieChart, TrendingUp, Sparkles, Scale } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { FINISH_CODES } from '../constants';

// --- NEW RECIPE ITEM SELECTOR MODAL ---
const RecipeItemSelectorModal = ({
    type, productCategory, allMaterials, allProducts, onClose, onSelect
}: {
    type: 'raw' | 'component',
    productCategory: string,
    allMaterials: Material[],
    allProducts: Product[],
    onClose: () => void,
    onSelect: (item: { type: 'raw', id: string } | { type: 'component', sku: string }) => void
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    const suggestionKeywords: Record<string, { types: MaterialType[], names: string[] }> = {
        'Δαχτυλίδι': { types: [MaterialType.Stone], names: ['ζιργκόν'] },
        'Σκουλαρίκια': { types: [MaterialType.Stone], names: ['ζιργκόν', 'πεταλούδα', 'καρφωτάκι'] },
        'Βραχιόλι': { types: [MaterialType.Cord, MaterialType.Leather], names: ['κούμπωμα', 'δέρμα'] },
        'Μενταγιόν': { types: [MaterialType.Leather], names: ['κρίκος', 'κρικάκι', 'κορδόνι'] },
        'Σταυρός': { types: [], names: ['κρίκος', 'κρικάκι'] }
    };

    const { suggestions, others } = useMemo(() => {
        const keywords = Object.entries(suggestionKeywords).find(([catKey]) => productCategory.includes(catKey))?.[1] || { types: [], names: [] };
        
        let allItems: any[] = [];
        if (type === 'raw') {
            allItems = [...allMaterials];
        } else {
            allItems = allProducts.filter(p => p.is_component);
        }

        const suggestedItems: any[] = [];
        const otherItems: any[] = [];
        
        allItems.forEach(item => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            const description = type === 'component' ? (item.description || '').toLowerCase() : '';
            
            const isSuggested = keywords.types.includes(item.type) || keywords.names.some(kw => name.includes(kw));
            if (isSuggested) {
                suggestedItems.push(item);
            } else {
                otherItems.push(item);
            }
        });

        const filterFn = (item: any) => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            const search = searchTerm.toLowerCase();
            return name.includes(search);
        };

        return {
            suggestions: suggestedItems.filter(filterFn).sort((a,b) => a.name?.localeCompare(b.name) || a.sku?.localeCompare(b.sku)),
            others: otherItems.filter(filterFn).sort((a,b) => a.name?.localeCompare(b.name) || a.sku?.localeCompare(b.sku))
        };
    }, [type, productCategory, allMaterials, allProducts, searchTerm]);

    const handleSelect = (item: any) => {
        if (type === 'raw') {
            onSelect({ type: 'raw', id: item.id });
        } else {
            onSelect({ type: 'component', sku: item.sku });
        }
    };
    
    const renderListItem = (item: any) => {
        const isComponent = type === 'component';
        const name = isComponent ? item.sku : item.name;
        const description = isComponent ? item.description : null;
        const imageUrl = isComponent ? item.image_url : null;
        const cost = isComponent 
            ? `${item.active_price.toFixed(2)}€` 
            : `${item.cost_per_unit.toFixed(2)}€ / ${item.unit}`;
        
        // Icon fallback
        const icon = isComponent ? <Puzzle size={16} className="text-blue-500" /> : <Gem size={16} className="text-emerald-500" />;

        return (
            <div
                key={item.id || item.sku}
                onClick={() => handleSelect(item)}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-emerald-50 cursor-pointer transition-colors border border-transparent hover:border-emerald-100 group"
            >
                {/* Image / Icon Container */}
                <div className="w-12 h-12 shrink-0 bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex items-center justify-center relative">
                    {imageUrl ? (
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <div className="text-slate-400">{icon}</div>
                    )}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-800 text-sm truncate">{name}</div>
                        {isComponent && item.category && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[100px]">{item.category}</span>
                        )}
                    </div>
                    
                    {description ? (
                        <div className="text-xs text-slate-600 truncate font-medium">{description}</div>
                    ) : (
                        <div className="text-xs text-slate-400 truncate italic">{isComponent ? 'Χωρίς περιγραφή' : item.type}</div>
                    )}
                    
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{cost}</div>
                </div>

                <div className="p-2 bg-white rounded-full shadow-sm border border-slate-100 text-slate-300 group-hover:text-emerald-500 group-hover:border-emerald-200 transition-all shrink-0">
                   <Plus size={16}/>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl flex flex-col h-[70vh] animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Επιλογή {type === 'raw' ? 'Υλικού' : 'Εξαρτήματος'}</h3>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"><X size={20}/></button>
                </div>
                <div className="p-4 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18}/>
                        <input
                            type="text"
                            placeholder={type === 'component' ? "Αναζήτηση SKU ή Περιγραφής..." : "Αναζήτηση..."}
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {suggestions.length > 0 && (
                        <div className="mb-6">
                            <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2 ml-2">Προτεινόμενα</h4>
                            <div className="space-y-1">
                                {suggestions.map(renderListItem)}
                            </div>
                        </div>
                    )}
                    {(suggestions.length > 0 || searchTerm) && (
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 ml-2">Όλα</h4>
                    )}
                    <div className="space-y-1">
                        {others.map(renderListItem)}
                    </div>
                    {suggestions.length === 0 && others.length === 0 && (
                         <div className="text-center text-slate-400 py-10">
                             <p>Δεν βρέθηκαν αποτελέσματα.</p>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

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

const SummaryRow = ({ label, value, sub, color }: { label: string, value: number, sub?: string, color: string }) => (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{label}</span>
        </div>
        <div className="text-right">
            <div className="font-mono font-bold text-slate-800 text-sm">{value.toFixed(2)}€</div>
            {sub && <div className="text-[10px] text-slate-400 font-medium">{sub}</div>}
        </div>
    </div>
);

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

interface Props {
  products: Product[];
  materials: Material[];
  molds?: Mold[];
  onCancel?: () => void;
}

const getSteps = (type: ProductionType) => {
    if (type === ProductionType.Imported) {
        return [
            { id: 1, title: 'Στοιχεία' },
            { id: 2, title: 'Κοστολόγηση' }, 
            { id: 3, title: 'Παραλλαγές' },
            { id: 4, title: 'Σύνοψη & Αποθήκευση' }
        ];
    }
    return [
        { id: 1, title: 'Στοιχεία' },
        { id: 2, title: 'Συνταγή' },
        { id: 3, title: 'Εργατικά' },
        { id: 4, title: 'Παραλλαγές' },
        { id: 5, title: 'Σύνοψη & Αποθήκευση' }
    ];
};

const getMaterialIcon = (type?: string) => {
    switch (type) {
        case 'Stone': return <Gem size={16} className="text-emerald-500" />;
        case 'Cord': return <Activity size={16} className="text-amber-600" />;
        case 'Component': return <Puzzle size={16} className="text-blue-500" />;
        case 'Enamel': return <Palette size={16} className="text-rose-500" />;
        case 'Leather': return <Scroll size={16} className="text-amber-700" />;
        default: return <Box size={16} className="text-slate-400" />;
    }
};

const availableFinishes = [
    { code: '', label: 'Λουστρέ', color: 'bg-slate-100 border-slate-300 text-slate-700' },
    { code: 'P', label: 'Πατίνα', color: 'bg-stone-200 border-stone-400 text-stone-800' },
    { code: 'D', label: 'Δίχρωμο', color: 'bg-orange-100 border-orange-300 text-orange-800' },
    { code: 'X', label: 'Επίχρυσο', color: 'bg-amber-100 border-amber-300 text-amber-800' },
    { code: 'H', label: 'Επιπλατινωμένο', color: 'bg-cyan-100 border-cyan-300 text-cyan-800' }
];

export default function NewProduct({ products, materials, molds = [], onCancel }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers }); 

  const [currentStep, setCurrentStep] = useState(1);
  const { showToast } = useUI();

  const [productionType, setProductionType] = useState<ProductionType>(ProductionType.InHouse);
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false);
  const [isGenderManuallySet, setIsGenderManuallySet] = useState(false);
  const [stxDescription, setStxDescription] = useState('');
  
  const [weight, setWeight] = useState(0);
  const [secondaryWeight, setSecondaryWeight] = useState(0);
  const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
  const [selectedFinishes, setSelectedFinishes] = useState<string[]>(['']); 
  const [finishPrices, setFinishPrices] = useState<Record<string, number>>({}); // Store prices for each selected finish
  
  const [bridge, setBridge] = useState(''); // NEW: Detected bridge like 'S'
  
  const [supplierId, setSupplierId] = useState<string>(''); 
  const [supplierSku, setSupplierSku] = useState<string>(''); 
  const [supplierCost, setSupplierCost] = useState(0); 
  const [sellingPrice, setSellingPrice] = useState(0); 
  
  const [recipe, setRecipe] = useState<RecipeItem[]>([]);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<false | 'raw' | 'component'>(false);
  
  const [labor, setLabor] = useState<LaborCost>({ 
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
    plating_cost_d_manual_override: false
  });
  
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [newVariantSuffix, setNewVariantSuffix] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [newVariantPrice, setNewVariantPrice] = useState(0);
  const suffixInputRef = useRef<HTMLInputElement>(null);
  const stoneSuffixRef = useRef<HTMLInputElement>(null);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const [selectedMolds, setSelectedMolds] = useState<ProductMold[]>([]); 
  const [moldSearch, setMoldSearch] = useState('');
  
  const [newMoldCode, setNewMoldCode] = useState('L');
  const [newMoldLoc, setNewMoldLoc] = useState('');
  const [newMoldDesc, setNewMoldDesc] = useState('');
  const [isCreatingMold, setIsCreatingMold] = useState(false);
  
  const [isSTX, setIsSTX] = useState(false);
  const [masterEstimatedCost, setMasterEstimatedCost] = useState(0);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);

  const [detectedMasterSku, setDetectedMasterSku] = useState('');
  const [detectedSuffix, setDetectedSuffix] = useState('');
  const [detectedVariantDesc, setDetectedVariantDesc] = useState('');
  
  const [showAnalysisHelp, setShowAnalysisHelp] = useState(false);
  
  const [smartAddStoneSuffix, setSmartAddStoneSuffix] = useState('');

  const STEPS = getSteps(productionType);
  const finalStepId = STEPS[STEPS.length - 1].id;

  // SKU ANALYSIS & NORMALIZATION
  useEffect(() => {
    const skuTrimmed = sku.trim();
    if (skuTrimmed.length >= 2) {
      const meta = parseSku(skuTrimmed);
      if (meta.category !== 'Γενικό' && !isCategoryManuallySet) setCategory(meta.category);
      if (meta.gender && !isGenderManuallySet) setGender(meta.gender as Gender);
      setIsSTX(skuTrimmed.startsWith('STX'));
      
      const analysis = analyzeSku(skuTrimmed, gender as Gender);
      
      if (analysis.isVariant) {
          setDetectedMasterSku(analysis.masterSku);
          setDetectedSuffix(analysis.suffix);
          setDetectedVariantDesc(analysis.variantDescription);
          setPlating(analysis.detectedPlating);
          setBridge(analysis.detectedBridge || '');
          
          // SMART SYNC: Update selected finishes based on detected finish
          const finishCode = getVariantComponents(analysis.suffix, gender as Gender).finish.code;
          setSelectedFinishes(prev => {
              if (!prev.includes(finishCode)) return [...prev, finishCode];
              return prev;
          });
      } else {
          // If not a variant (e.g. Bridge Pattern or New Root), use the input SKU as master
          setDetectedMasterSku(skuTrimmed.toUpperCase());
          setDetectedSuffix('');
          setDetectedVariantDesc('');
          // RESPECT DETECTED PROPERTIES EVEN FOR NEW MASTERS (e.g. Bridge S + Gold X)
          setPlating(analysis.detectedPlating); 
          setBridge(analysis.detectedBridge || '');
      }
    } else {
        setCategory(''); setGender(''); setIsSTX(false);
        setDetectedMasterSku(''); setDetectedSuffix(''); setDetectedVariantDesc('');
        setIsCategoryManuallySet(false); setIsGenderManuallySet(false); setBridge('');
    }
  }, [sku, gender]);

  // Sync Selling Price logic
  useEffect(() => {
      // Keep sellingPrice in sync with the price of the Master Finish (based on plating state)
      // This ensures backward compatibility while allowing specific pricing in the new UI
      const platingMap: Record<string, string> = { 
          [PlatingType.None]: '', 
          [PlatingType.GoldPlated]: 'X', 
          [PlatingType.TwoTone]: 'D', 
          [PlatingType.Platinum]: 'H' 
      };
      const masterCode = platingMap[plating] || '';
      
      // If we have a price for this specific code, sync it to the main sellingPrice state
      if (finishPrices[masterCode] !== undefined) {
          setSellingPrice(finishPrices[masterCode]);
      }
  }, [finishPrices, plating]);

  // Dynamic Master Plating Label with Smart Mapping
  const platingMasterLabel = useMemo(() => {
    // Show all selected finishes dynamically
    if (selectedFinishes.length > 0) {
        return selectedFinishes.map(f => f ? FINISH_CODES[f] : 'Λουστρέ').join(', ');
    }
    const platingToCode: Record<string, string> = {
        [PlatingType.None]: '',
        [PlatingType.GoldPlated]: 'X',
        [PlatingType.TwoTone]: 'D',
        [PlatingType.Platinum]: 'H'
    };
    const code = platingToCode[plating];
    return FINISH_CODES[code] || 'Λουστρέ';
  }, [plating, selectedFinishes]);

  // Gender Localization Helper
  const genderLabel = useMemo(() => {
      const map: Record<string, string> = {
          [Gender.Men]: 'Ανδρικό',
          [Gender.Women]: 'Γυναικείο',
          [Gender.Unisex]: 'Unisex'
      };
      return map[gender] || gender;
  }, [gender]);

  useEffect(() => { if (detectedSuffix && !variants.some(v => v.suffix === detectedSuffix)) { setNewVariantSuffix(detectedSuffix); setNewVariantDesc(detectedVariantDesc); } }, [detectedSuffix, detectedVariantDesc, variants]);
  useEffect(() => { setNewVariantPrice(sellingPrice); }, [sellingPrice]);
  useEffect(() => { if (isSTX) { setSellingPrice(0); setNewVariantPrice(0); } }, [isSTX]);
  useEffect(() => { if (productionType === ProductionType.InHouse && !labor.technician_cost_manual_override) setLabor(prev => ({...prev, technician_cost: isSTX ? weight * 0.50 : calculateTechnicianCost(weight)})); }, [weight, labor.technician_cost_manual_override, productionType, isSTX]);
  useEffect(() => { if (productionType === ProductionType.InHouse && !labor.casting_cost_manual_override) setLabor(prev => ({...prev, casting_cost: isSTX ? 0 : (weight + secondaryWeight) * 0.15})); }, [weight, secondaryWeight, productionType, isSTX, labor.casting_cost_manual_override]);
  useEffect(() => { if (!labor.plating_cost_x_manual_override) {
      if (productionType === ProductionType.Imported) { if (labor.plating_cost_x === 0) setLabor(prev => ({ ...prev, plating_cost_x: 0.60 })); } 
      else { 
          // FIX: Calculate Plating X on TOTAL weight (Weight + Secondary + Components)
          let total = weight + secondaryWeight; 
          recipe.forEach(item => { if (item.type === 'component') { const sub = products.find(p => p.sku === item.sku); if (sub) total += sub.weight_g * item.quantity; } }); 
          setLabor(prev => ({ ...prev, plating_cost_x: parseFloat((total * 0.60).toFixed(2)) })); 
      }
  } }, [weight, secondaryWeight, recipe, products, labor.plating_cost_x_manual_override, productionType]);
  useEffect(() => { if (!labor.plating_cost_d_manual_override) { let total = secondaryWeight || 0; recipe.forEach(item => { if (item.type === 'component') { const sub = products.find(p => p.sku === item.sku); if (sub) total += ((sub.secondary_weight_g || 0) * item.quantity); } }); setLabor(prev => ({ ...prev, plating_cost_d: parseFloat((total * 0.60).toFixed(2)) })); } }, [secondaryWeight, recipe, products, labor.plating_cost_d_manual_override]);

  const currentTempProduct: Product = useMemo(() => ({
    sku: detectedMasterSku || sku,
    prefix: sku.substring(0, 2),
    category: category,
    gender: gender as Gender || Gender.Unisex,
    image_url: imagePreview,
    weight_g: weight,
    secondary_weight_g: secondaryWeight,
    plating_type: plating,
    production_type: productionType,
    supplier_id: supplierId,
    supplier_sku: supplierSku,
    supplier_cost: supplierCost,
    active_price: 0,
    draft_price: 0,
    selling_price: sellingPrice,
    stock_qty: 0,
    sample_qty: 0,
    molds: selectedMolds,
    is_component: isSTX,
    description: stxDescription,
    recipe: recipe,
    labor 
  }), [sku, detectedMasterSku, category, gender, weight, secondaryWeight, plating, recipe, labor, imagePreview, selectedMolds, isSTX, productionType, supplierCost, supplierId, supplierSku, stxDescription, sellingPrice]);

  useEffect(() => {
    if (!settings) return;
    const cost = calculateProductCost(currentTempProduct, settings, materials, products);
    setMasterEstimatedCost(cost.total);
    setCostBreakdown(cost.breakdown);
  }, [currentTempProduct, settings, materials, products]);

  // Derived Total Materials Cost for Step 2
  const recipeTotalCost = useMemo(() => {
      return recipe.reduce((acc, item) => {
          let itemCost = 0;
          if (item.type === 'raw') {
              const mat = materials.find(m => m.id === item.id);
              if (mat) itemCost = mat.cost_per_unit * item.quantity;
          } else {
              const prod = products.find(p => p.sku === item.sku);
              if (prod) itemCost = prod.active_price * item.quantity;
          }
          return acc + itemCost;
      }, 0);
  }, [recipe, materials, products]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };
  const handleSelectRecipeItem = (item: { type: 'raw', id: string } | { type: 'component', sku: string }) => {
    if (item.type === 'raw') setRecipe([...recipe, { type: 'raw', id: item.id, quantity: 1 }]);
    else setRecipe([...recipe, { type: 'component', sku: item.sku, quantity: 1 }]);
    setIsRecipeModalOpen(false);
  };
  const updateRecipeItem = (index: number, field: string, value: any) => { const newRecipe = [...recipe]; const item = newRecipe[index]; if (field === 'quantity') item.quantity = parseFloat(value); else if (field === 'id' && item.type === 'raw') item.id = value; else if (field === 'sku' && item.type === 'component') item.sku = value; setRecipe(newRecipe); };
  const removeRecipeItem = (index: number) => { setRecipe(recipe.filter((_, i) => i !== index)); };
  const addMold = (code: string) => { const existing = selectedMolds.find(m => m.code === code); if (existing) return; setSelectedMolds([...selectedMolds, { code, quantity: 1 }]); };
  const updateMoldQuantity = (code: string, delta: number) => { setSelectedMolds(prev => prev.map(m => { if (m.code === code) return { ...m, quantity: Math.max(1, m.quantity + delta) }; return m; })); };
  const removeMold = (code: string) => { setSelectedMolds(prev => prev.filter(m => m.code !== code)); };

  const handleQuickCreateMold = async () => {
      if (!newMoldCode) { showToast("Ο Κωδικός είναι υποχρεωτικός.", "error"); return; }
      setIsCreatingMold(true);
      try {
          const newMold: Mold = { code: newMoldCode.toUpperCase(), location: newMoldLoc, description: newMoldDesc };
          const { error } = await supabase.from('molds').insert(newMold);
          if (error) throw error;
          await queryClient.invalidateQueries({ queryKey: ['molds'] });
          setSelectedMolds(prev => [...prev, { code: newMold.code, quantity: 1 }]);
          setNewMoldCode('L'); setNewMoldLoc(''); setNewMoldDesc('');
          showToast(`Το λάστιχο ${newMold.code} επιλέχθηκε!`, "success");
      } catch (err: any) {
          showToast("Σφάλμα δημιουργίας.", "error");
      } finally { setIsCreatingMold(false); }
  };

  const { suggestedMolds, otherMolds } = useMemo(() => {
    const upperSku = sku.toUpperCase();
    const usedMoldCodes = new Set(selectedMolds.map(m => m.code));
    const availableMolds = molds.filter(m => !usedMoldCodes.has(m.code));
    let suggestionKeyword: string | null = null;
    if (upperSku.startsWith('PN') || upperSku.startsWith('MN')) suggestionKeyword = 'κρίκος';
    else if (upperSku.startsWith('SK')) suggestionKeyword = 'καβαλάρης';
    const allMoldsFilteredBySearch = availableMolds.filter(m => (m.code.toUpperCase().includes(moldSearch.toUpperCase()) || m.description.toLowerCase().includes(moldSearch.toLowerCase())));
    let suggested: Mold[] = []; let others: Mold[] = [];
    if (suggestionKeyword) { allMoldsFilteredBySearch.forEach(m => { if (m.description.toLowerCase().includes(suggestionKeyword!)) suggested.push(m); else others.push(m); }); } else { others = allMoldsFilteredBySearch; }
    const sortFn = (a: Mold, b: Mold) => a.code.localeCompare(b.code, undefined, { numeric: true });
    suggested.sort(sortFn); others.sort(sortFn);
    return { suggestedMolds: suggested, otherMolds: others };
  }, [molds, moldSearch, sku, selectedMolds]);

  useEffect(() => { 
      if (newVariantSuffix) { 
          const desc = analyzeSuffix(newVariantSuffix, gender as Gender, plating); 
          if (desc) setNewVariantDesc(desc); 
      } 
  }, [newVariantSuffix, gender, plating]);

  const handleAddVariant = () => {
      if (!newVariantSuffix) { showToast("Η κατάληξη είναι υποχρεωτική.", "error"); return; }
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (variants.some(v => v.suffix === upperSuffix)) { showToast("Αυτή η παραλλαγή υπάρχει ήδη.", "error"); return; }
      
      const { total: estimatedCost } = estimateVariantCost(currentTempProduct, upperSuffix, settings!, materials, products);
      
      const newV: ProductVariant = { 
        suffix: upperSuffix, 
        description: newVariantDesc, 
        stock_qty: 0, 
        active_price: parseFloat(estimatedCost.toFixed(2)), 
        selling_price: isSTX ? 0 : (newVariantPrice > 0 ? newVariantPrice : sellingPrice) 
      };
      setVariants([...variants, newV]);
      setNewVariantSuffix(''); setNewVariantDesc('');
      showToast(`Προστέθηκε η παραλλαγή ${upperSuffix}`, "success");
      if (suffixInputRef.current) suffixInputRef.current.focus();
  };

  const handleSmartAddBatch = () => {
      let addedCount = 0;
      let skippedCount = 0;
      const upperStoneSuffix = smartAddStoneSuffix.toUpperCase().trim();
      
      const platingMap: Record<string, string> = {
          [PlatingType.GoldPlated]: 'X',
          [PlatingType.Platinum]: 'H',
          [PlatingType.TwoTone]: 'D',
          [PlatingType.None]: ''
      };
      
      const masterPlatingCode = platingMap[plating] || '';
      const masterHasBridge = bridge === 'S'; 

      const sortedFinishes = [...selectedFinishes].sort((a, b) => {
          const getP = (c: string) => {
              if (c === '') return 0;
              if (c === 'P') return 1;
              if (c === 'D') return 2;
              if (c === 'X') return 3;
              if (c === 'H') return 4;
              return 5;
          };
          return getP(a) - getP(b);
      });

      sortedFinishes.forEach(finishCode => {
          if (masterPlatingCode && masterPlatingCode !== '' && finishCode !== masterPlatingCode) {
              skippedCount++;
              return;
          }

          let fullSuffix = '';
          if (!masterPlatingCode && finishCode !== '') {
              fullSuffix += finishCode;
          }
          fullSuffix += upperStoneSuffix;
          
          if (fullSuffix === '' && variants.some(v => v.suffix === '')) return; 
          if (variants.some(v => v.suffix === fullSuffix)) return;

          const { total: estimatedCost } = estimateVariantCost(currentTempProduct, fullSuffix, settings!, materials, products);
          const desc = analyzeSuffix(fullSuffix, gender as Gender, plating);
          
          // SMART PRICE PICKER: Use specific price for this finish if set, otherwise default
          const specificPrice = finishPrices[finishCode];
          const finalPrice = (specificPrice !== undefined && specificPrice > 0) ? specificPrice : sellingPrice;

          const newV: ProductVariant = {
              suffix: fullSuffix,
              description: desc || fullSuffix,
              stock_qty: 0,
              active_price: parseFloat(estimatedCost.toFixed(2)),
              selling_price: isSTX ? 0 : finalPrice
          };
          
          setVariants(prev => [...prev, newV]);
          addedCount++;
      });

      if (addedCount > 0) {
          showToast(`Προστέθηκαν ${addedCount} παραλλαγές`, "success");
          setSmartAddStoneSuffix('');
          if (stoneSuffixRef.current) stoneSuffixRef.current.focus();
      } else if (skippedCount > 0) {
          showToast(`Παραλείφθηκαν ${skippedCount} μη συμβατές παραλλαγές (π.χ. Πλατίνα σε Χρυσό κωδικό).`, "info");
      } else {
          showToast("Δεν προστέθηκαν νέες παραλλαγές (ίσως υπάρχουν ήδη).", "info");
      }
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => { const updated = [...variants]; updated[index] = { ...updated[index], [field]: value }; setVariants(updated); };
  const removeVariant = (index: number) => { setVariants(variants.filter((_, i) => i !== index)); };

  const handleSubmit = async () => {
    if (!weight || weight <= 0) { showToast("Το Βάρος (g) είναι υποχρεωτικό.", "error"); setCurrentStep(1); return; }
    if (!sku) { showToast("Το SKU είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }
    if (!category) { showToast("Η Κατηγορία είναι υποχρεωτική", "error"); setCurrentStep(1); return; }
    if (!gender) { showToast("Το Φύλο είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }

    let finalVariants = [...variants];
    const finalMasterSku = (detectedMasterSku || sku).toUpperCase().trim();

    setIsUploading(true);
    let finalImageUrl: string | null = null; 
    try {
        let existingStockQty = 0; let existingSampleQty = 0;
        try {
            const { data: existingProd } = await supabase.from('products').select('stock_qty, sample_qty, image_url').eq('sku', finalMasterSku).single();
            if (existingProd) {
                existingStockQty = existingProd.stock_qty || 0; existingSampleQty = existingProd.sample_qty || 0;
                if (!selectedImage && existingProd.image_url) finalImageUrl = existingProd.image_url;
            }
        } catch (e) { console.warn("Could not check existing stock, assuming 0/0"); }
        if (selectedImage) {
            try { const compressedBlob = await compressImage(selectedImage); finalImageUrl = await uploadProductImage(compressedBlob, finalMasterSku); } catch (imgErr) { console.warn("Image upload skipped (offline?)"); showToast("Η εικόνα δεν ανέβηκε λόγω σύνδεσης.", "info"); }
        }
        const productData = { sku: finalMasterSku, prefix: finalMasterSku.substring(0, 2), category, description: isSTX ? stxDescription : null, gender, image_url: finalImageUrl, weight_g: Number(weight) || 0, secondary_weight_g: Number(secondaryWeight) || null, plating_type: plating, active_price: masterEstimatedCost, draft_price: masterEstimatedCost, selling_price: isSTX ? 0 : sellingPrice, stock_qty: existingStockQty, sample_qty: existingSampleQty, is_component: isSTX, labor_casting: Number(labor.casting_cost), labor_setter: Number(labor.setter_cost), labor_technician: Number(labor.technician_cost), labor_plating_x: Number(labor.plating_cost_x || 0), labor_plating_d: Number(labor.plating_cost_d || 0), labor_subcontract: Number(labor.subcontract_cost || 0), labor_casting_manual_override: labor.casting_cost_manual_override, labor_technician_manual_override: labor.technician_cost_manual_override, labor_plating_x_manual_override: labor.plating_cost_x_manual_override, labor_plating_d_manual_override: labor.plating_cost_d_manual_override, production_type: productionType, supplier_id: (productionType === ProductionType.Imported && supplierId) ? supplierId : null, supplier_sku: productionType === ProductionType.Imported ? supplierSku : null, supplier_cost: productionType === ProductionType.Imported ? supplierCost : null, labor_stone_setting: productionType === ProductionType.Imported ? labor.stone_setting_cost : null };
        const { queued: prodQueued } = await api.saveProduct(productData);
        let anyPartQueued = prodQueued;
        if (finalVariants.length > 0) { for (const v of finalVariants) { const { queued } = await api.saveProductVariant({ product_sku: finalMasterSku, suffix: v.suffix, description: v.description, stock_qty: 0, active_price: v.active_price, selling_price: isSTX ? 0 : v.selling_price }); if (queued) anyPartQueued = true; } }
        await api.deleteProductRecipes(finalMasterSku);
        if (productionType === ProductionType.InHouse && recipe.length > 0) { for (const r of recipe) { const { queued } = await api.insertRecipe({ parent_sku: finalMasterSku, type: r.type, material_id: r.type === 'raw' ? r.id : null, component_sku: r.type === 'component' ? r.sku : null, quantity: r.quantity }); if (queued) anyPartQueued = true; } }
        await api.deleteProductMolds(finalMasterSku);
        if (productionType === ProductionType.InHouse && selectedMolds.length > 0) { for (const m of selectedMolds) { const { queued } = await api.insertProductMold({ product_sku: finalMasterSku, mold_code: m.code, quantity: m.quantity }); if (queued) anyPartQueued = true; } }
        await queryClient.invalidateQueries({ queryKey: ['products'] });
        if (anyPartQueued) showToast(`Το προϊόν αποθηκεύτηκε στην ουρά συγχρονισμού.`, "info");
        else showToast(`Το προϊόν ${finalMasterSku} αποθηκεύτηκε επιτυχώς!`, "success");
        if (onCancel) onCancel();
        else { setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setVariants([]); setCurrentStep(1); setSecondaryWeight(0); setSupplierCost(0); setSupplierId(''); setSupplierSku(''); setStxDescription(''); setSelectedFinishes(['']); setBridge(''); setFinishPrices({}); }
    } catch (error: any) { console.error("Save error:", error); showToast(`Σφάλμα: ${error.message}`, "error"); } finally { setIsUploading(false); }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, finalStepId));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  const secondaryWeightLabel = useMemo(() => { if (gender === Gender.Men && category.includes('Δαχτυλίδι')) return "Βάρος Καπακιού (g)"; if (gender === Gender.Women && (category.includes('Βραχιόλι') || category.includes('Σκουλαρίκια') || category.includes('Δαχτυλίδι') || category.includes('Μενταγιόν'))) return "Βάρος Καστονιού (g)"; return "Β' Βάρος (π.χ. Καστόνι) (g)"; }, [gender, category]);
  const masterMargin = sellingPrice > 0 ? ((sellingPrice - masterEstimatedCost) / sellingPrice) * 100 : 0;

  const getVariantTypeInfo = (suffix: string) => {
      const { finish, stone } = getVariantComponents(suffix, gender as Gender);
      const finishColors: any = { 'X': 'bg-amber-100 text-amber-700 border-amber-200', 'H': 'bg-cyan-100 text-cyan-700 border-cyan-200', 'D': 'bg-orange-100 text-orange-700 border-orange-200', 'P': 'bg-slate-100 text-slate-700 border-slate-200', '': 'bg-emerald-100 text-emerald-700 border-emerald-200' };
      return { finish, stone, color: finishColors[finish.code] || 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  const toggleFinish = (code: string) => {
      setSelectedFinishes(prev => {
          let newSelection = [...prev];
          if (code === '') {
              if (newSelection.includes('')) newSelection = newSelection.filter(c => c !== '');
              else newSelection.push('');
          } else {
              if (newSelection.includes(code)) {
                  newSelection = newSelection.filter(c => c !== code);
              } else {
                  newSelection.push(code);
                  newSelection = newSelection.filter(c => c !== ''); 
              }
          }
          return newSelection;
      });
  };

  // --- REPLACED representativeVariantInfo WITH finalStacks ---
  const finalStacks = useMemo(() => {
      const stacks = [];
      
      const hasX = variants.some(v => v.suffix.includes('X') || v.suffix.includes('H')) || [PlatingType.GoldPlated, PlatingType.Platinum].includes(plating);
      const hasD = variants.some(v => v.suffix.includes('D')) || plating === PlatingType.TwoTone;
      
      // Helper to generate stack data
      const getStackData = (type: 'X' | 'D' | 'Base') => {
          let est;
          // Strategy: Use actual variant if exists to capture specific stone differences, otherwise estimation
          if (type === 'Base') {
               // Base is master cost
               est = calculateProductCost(currentTempProduct, settings!, materials, products);
          } else {
               const variant = variants.find(v => {
                  if (type === 'X') return v.suffix.includes('X') || v.suffix.includes('H');
                  if (type === 'D') return v.suffix.includes('D');
                  return false;
               });
               const suffix = variant ? variant.suffix : type;
               est = estimateVariantCost(currentTempProduct, suffix, settings!, materials, products);
          }
          
          const details = est.breakdown.details || {};
          const platingCost = (details.plating_cost || 0);
          // Base labor excludes plating for visualization separation
          const baseLabor = (est.breakdown.labor || 0) - platingCost;
          
          return {
              total: est.total,
              silver: est.breakdown.silver || 0,
              materials: est.breakdown.materials || 0,
              baseLabor,
              platingCost,
              type
          };
      };

      if (hasD) {
          stacks.push({ ...getStackData('D'), label: 'Τελικό (D)', colorClass: 'bg-orange-100 text-orange-600', borderClass: 'border-orange-200' });
      }
      if (hasX) {
          stacks.push({ ...getStackData('X'), label: 'Τελικό (X)', colorClass: 'bg-amber-100 text-amber-600', borderClass: 'border-amber-200' });
      }
      
      // If no plating at all (Lustre only), show standard Final
      if (stacks.length === 0) {
          stacks.push({ ...getStackData('Base'), label: 'Τελικό', colorClass: 'bg-slate-100 text-slate-500', borderClass: 'border-slate-200' });
      }
      
      return stacks;
  }, [variants, plating, currentTempProduct, settings, materials, products, labor, masterEstimatedCost]);

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-96px)] md:h-[calc(100vh-64px)] flex flex-col">
      {isRecipeModalOpen && <RecipeItemSelectorModal type={isRecipeModalOpen} productCategory={category} allMaterials={materials} allProducts={products} onClose={() => setIsRecipeModalOpen(false)} onSelect={handleSelectRecipeItem} />}
      {showAnalysisHelp && <AnalysisExplainerModal onClose={() => setShowAnalysisHelp(false)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            {onCancel && <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"><ArrowLeft size={24} /></button>}
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3"><div className="p-2 bg-amber-100 rounded-xl text-amber-600"><Wand2 size={24} /></div>Νέο Προϊόν</h1>
          </div>
          <div className="flex items-center gap-1 bg-white px-3 py-2 rounded-full shadow-sm border border-slate-100">
             {STEPS.map(s => (
                 <div key={s.id} className="flex items-center">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer ${currentStep >= s.id ? 'bg-amber-600 text-white shadow-md shadow-amber-200' : 'bg-slate-100 text-slate-400'}`} onClick={() => setCurrentStep(s.id)}>{currentStep > s.id ? <CheckCircle size={14} /> : s.id}</div>
                    {s.id !== finalStepId && <div className={`w-4 h-0.5 mx-1 rounded-full ${currentStep > s.id ? 'bg-amber-600' : 'bg-slate-200'}`} />}
                 </div>
             ))}
          </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col relative bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
            
            {/* ... STEPS 1-4 REMAIN UNCHANGED ... */}
            {currentStep === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                        <span>1. Βασικά Στοιχεία</span>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button onClick={() => setProductionType(ProductionType.InHouse)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${productionType === ProductionType.InHouse ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><Hammer size={14}/> Εργαστήριο</button>
                            <button onClick={() => setProductionType(ProductionType.Imported)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${productionType === ProductionType.Imported ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}><Globe size={14}/> Εισαγωγή</button>
                        </div>
                    </h3>
                    <div className="flex flex-col lg:flex-row gap-8">
                        <div className="w-full lg:w-1/3">
                            <label className="block text-sm font-bold text-slate-700 mb-2">Φωτογραφία</label>
                            <div className="relative group w-full aspect-square bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl overflow-hidden hover:border-amber-400 transition-all cursor-pointer shadow-inner">
                                {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-slate-400 pointer-events-none"><ImageIcon size={32} className="opacity-50 mb-2"/><span className="text-xs font-bold">Επιλογή</span></div>}
                                <input type="file" accept="image/*" onChange={handleImageSelect} className="absolute inset-0 opacity-0 cursor-pointer z-50"/>
                            </div>
                        </div>
                        <div className="flex-1 space-y-6">
                            <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 space-y-4">
                                <div className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-2"><Tag size={14}/> Ταυτότητα Προϊόντος</div>
                                <div className="relative">
                                    <label className="block text-sm font-bold text-blue-900 mb-1.5">SKU *</label>
                                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} className="w-full p-3 border border-blue-200 rounded-xl font-mono uppercase bg-white focus:ring-4 focus:ring-blue-500/20 outline-none font-bold text-lg"/>
                                    {detectedSuffix && <div className="mt-2 text-xs bg-white text-blue-700 p-2 rounded flex items-center gap-1 border border-blue-100"><Lightbulb size={12}/> Ανιχνεύθηκε ρίζα <strong>{detectedMasterSku}{bridge}</strong> με φινίρισμα <strong>{platingMasterLabel}</strong>.</div>}
                                </div>
                                {productionType === ProductionType.Imported && (
                                    <div className="grid grid-cols-2 gap-5">
                                        <div>
                                            <label className="block text-sm font-bold text-blue-900 mb-1.5">Προμηθευτής</label>
                                            <select 
                                                value={supplierId} 
                                                onChange={(e) => setSupplierId(e.target.value)} 
                                                className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none cursor-pointer"
                                            >
                                                <option value="">Επιλογή...</option>
                                                {suppliers?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-blue-900 mb-1.5">Κωδικός Προμηθευτή</label>
                                            <input type="text" value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none" placeholder="π.χ. ITEM-123"/>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-5"><div><label className="block text-sm font-bold text-blue-900 mb-1.5">Φύλο *</label><select value={gender} onChange={(e) => { setGender(e.target.value as Gender); setIsGenderManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none"><option value="" disabled>Επιλέξτε</option><option value={Gender.Women}>Γυναικείο</option><option value={Gender.Men}>Ανδρικό</option><option value={Gender.Unisex}>Unisex</option></select></div><div><label className="block text-sm font-bold text-blue-900 mb-1.5">Κατηγορία *</label><input type="text" value={category} onChange={(e) => { setCategory(e.target.value); setIsCategoryManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none" /></div></div>
                            </div>
                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2"><Hammer size={14}/> Τεχνικά Χαρακτηριστικά</div>
                                <div className="grid grid-cols-2 gap-5"><div><label className="block text-sm font-bold text-slate-700 mb-1.5">Βασικό Βάρος (g) *</label><input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-slate-500/20 outline-none"/></div><div><label className="block text-sm font-bold text-slate-700 mb-1.5">{secondaryWeightLabel}</label><input type="number" step="0.01" value={secondaryWeight} onChange={e => setSecondaryWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-slate-500/20 outline-none"/></div></div>
                                
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-2">Διαθέσιμα Φινιρίσματα (Παραλλαγές)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableFinishes.map((f) => (
                                            <button
                                                key={f.code}
                                                onClick={() => {
                                                    toggleFinish(f.code);
                                                    if (selectedFinishes.length === 0 || (plating === f.code as any && !selectedFinishes.includes(f.code))) {
                                                        setPlating(f.code as PlatingType);
                                                    }
                                                }}
                                                className={`
                                                    px-3 py-2 rounded-xl text-xs font-bold transition-all border
                                                    ${selectedFinishes.includes(f.code) 
                                                        ? `${f.color} shadow-sm ring-2 ring-offset-1 ring-slate-200` 
                                                        : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}
                                                `}
                                            >
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                                        <Info size={12}/> Επιλέξτε όλα τα φινιρίσματα που θα διατίθεται το προϊόν. Το <strong>{platingMasterLabel}</strong> θα οριστεί ως Master.
                                    </div>
                                </div>
                            </div>
                            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-2"><DollarSign size={14}/> Τιμολόγηση</div>
                                <div className="flex gap-4">
                                    {productionType === ProductionType.InHouse && (
                                        <label className="flex items-center gap-3 p-3 border border-emerald-200 rounded-xl bg-white cursor-pointer shrink-0">
                                            <input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-5 w-5 text-emerald-600 rounded" />
                                            <span className="font-bold text-emerald-900">Εξάρτημα (STX)</span>
                                        </label>
                                    )}
                                    {!isSTX && (
                                        <div className="flex-1 grid grid-cols-2 gap-3">
                                            {selectedFinishes.map(finishCode => (
                                                <div key={finishCode}>
                                                    <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Χονδρική ({FINISH_CODES[finishCode]})</label>
                                                    <div className="flex items-center gap-1">
                                                        <input 
                                                            type="number" 
                                                            step="0.01" 
                                                            value={finishPrices[finishCode] || 0} 
                                                            onChange={e => {
                                                                const val = parseFloat(e.target.value);
                                                                setFinishPrices(prev => ({...prev, [finishCode]: val}));
                                                                // Sync main selling price if this is the master finish
                                                                const platingMap: any = { [PlatingType.None]: '', [PlatingType.GoldPlated]: 'X', [PlatingType.TwoTone]: 'D', [PlatingType.Platinum]: 'H' };
                                                                if (platingMap[plating] === finishCode) {
                                                                    setSellingPrice(val);
                                                                }
                                                            }} 
                                                            className="w-full p-2.5 border border-emerald-200 bg-white rounded-xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none text-sm"
                                                        />
                                                        <span className="text-emerald-600 font-bold text-xs">€</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {isSTX && (<><div><label className="block text-sm font-bold text-emerald-900 mb-1.5">Περιγραφή STX</label><input type="text" value={stxDescription} onChange={(e) => setStxDescription(e.target.value)} className="w-full p-3 border border-emerald-200 rounded-xl bg-white focus:ring-4 focus:ring-emerald-500/20 outline-none" placeholder="π.χ. Μικρή Πεταλούδα" /></div><div className="text-xs text-emerald-700 italic flex items-center gap-1 bg-emerald-100/50 p-2 rounded"><Info size={14}/> Τα εξαρτήματα (STX) δεν έχουν τιμή πώλησης, μόνο κόστος παραγωγής.</div></>)}
                            </div>
                        </div>
                    </div>
                    {productionType === ProductionType.InHouse && (
                        <div className="pt-4 border-t border-slate-100"><label className="block text-sm font-bold text-amber-700 mb-3">Λάστιχα</label><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><div className="space-y-4">{selectedMolds.length > 0 && (<div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100"><h5 className="text-xs font-bold text-amber-700 uppercase mb-2">Επιλεγμένα</h5><div className="flex flex-wrap gap-2">{selectedMolds.map(m => (<div key={m.code} className="bg-white border border-amber-200 text-amber-800 pl-3 pr-1 py-1 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm"><span>{m.code}</span><div className="flex items-center bg-amber-50 rounded border border-amber-100"><button type="button" onClick={() => updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-amber-100 text-amber-600 rounded-l ${m.quantity <= 1 ? 'opacity-30' : ''}`} disabled={m.quantity <= 1}><Minus size={12}/></button><input type="number" min="1" value={m.quantity} onChange={(e) => { const val = parseInt(e.target.value) || 1; setSelectedMolds(prev => prev.map(pm => pm.code === m.code ? { ...pm, quantity: val } : pm)); }} className="w-8 text-center bg-transparent outline-none text-xs font-bold text-amber-900"/><button type="button" onClick={() => updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-amber-100 text-amber-600 rounded-r"><Plus size={12}/></button></div><button onClick={() => removeMold(m.code)} className="p-1 text-slate-300 hover:text-red-500 ml-1 hover:bg-red-50 rounded transition-colors"><X size={14}/></button></div>))}</div></div>)}<div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-64 flex flex-col gap-3"><div className="relative shrink-0"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/><input type="text" placeholder="Αναζήτηση..." value={moldSearch} onChange={e => setMoldSearch(e.target.value)} className="w-full pl-9 p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/></div><div className="overflow-y-auto custom-scrollbar flex-1 pr-1">{otherMolds.concat(suggestedMolds).map(m => { const selected = selectedMolds.find(sm => sm.code === m.code); return (<div key={m.code} className={`flex items-center gap-2 text-sm p-2 rounded-lg border mb-1 transition-colors ${selected ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent hover:border-slate-200'}`}><div onClick={() => addMold(m.code)} className="flex-1 cursor-pointer flex items-center gap-2"><span className={`font-mono font-bold ${selected ? 'text-amber-800' : 'text-slate-700'}`}>{m.code}</span><span className="text-xs text-slate-400 truncate">{m.description}</span></div>{selected ? (<div className="flex items-center gap-1 bg-white rounded-md border border-amber-200 shadow-sm"><button onClick={() => updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-slate-100 text-slate-500 ${selected.quantity === 1 ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={selected.quantity === 1}><Minus size={12}/></button><span className="text-xs font-bold w-6 text-center">{selected.quantity}</span><button onClick={() => updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-slate-100 text-slate-500"><Plus size={12}/></button><div className="w-px h-4 bg-slate-100 mx-1"></div><button onClick={() => removeMold(m.code)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-r-md"><X size={12}/></button></div>) : (<button onClick={() => addMold(m.code)} className="text-slate-300 hover:text-amber-500"><Plus size={16}/></button>)}</div>); })}</div></div></div><div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-amber-300 transition-all group flex flex-col gap-3 h-full"><div className="flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-amber-500 uppercase tracking-wide transition-colors"><Plus size={14} /> Νέο Λάστιχο</div><input type="text" placeholder="Κωδικός *" value={newMoldCode} onChange={e => setNewMoldCode(e.target.value.toUpperCase())} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all uppercase placeholder-slate-400"/><div className="grid grid-cols-2 gap-3"><input type="text" placeholder="Τοποθεσία" value={newMoldLoc} onChange={e => setNewMoldLoc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/><input type="text" placeholder="Περιγραφή" value={newMoldDesc} onChange={e => setNewMoldDesc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/></div><button onClick={handleQuickCreateMold} disabled={isCreatingMold} className="mt-auto w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center">{isCreatingMold ? <Loader2 size={16} className="animate-spin" /> : 'Δημιουργία & Επιλογή'}</button></div></div></div>
                    )}
                </div>
            )}
            
            {/* Step 2-4 remains the same logic as previous version, included for completeness in updated file */}
            {currentStep === 2 && productionType === ProductionType.InHouse && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">2. Συνταγή (Bill of Materials)</h3>
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-3 pl-4">Είδος</th>
                                    <th className="p-3">Όνομα / SKU</th>
                                    <th className="p-3 text-right">Κόστος Μον.</th>
                                    <th className="p-3 text-center">Ποσότητα</th>
                                    <th className="p-3 text-right pr-4">Σύνολο</th>
                                    <th className="w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {recipe.map((item, idx) => {
                                    const itemDetails = item.type === 'raw' ? materials.find(m => m.id === item.id) : products.find(p => p.sku === item.sku);
                                    const name = item.type === 'raw' ? (itemDetails as Material | undefined)?.name || "Άγνωστο" : (itemDetails as Product | undefined)?.sku || "Άγνωστο";
                                    const icon = item.type === 'raw' ? getMaterialIcon((itemDetails as Material)?.type) : getMaterialIcon('Component');
                                    const unitCost = item.type === 'raw' ? (itemDetails as Material)?.cost_per_unit || 0 : (itemDetails as Product)?.active_price || 0;
                                    const lineTotal = unitCost * item.quantity;
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="p-3 pl-4"><div className="p-1.5 bg-slate-100 rounded-lg w-fit text-slate-500 border border-slate-200">{icon}</div></td>
                                            <td className="p-3 font-bold text-slate-700">{name}</td>
                                            <td className="p-3 text-right font-mono text-slate-500">{formatCurrency(unitCost)}</td>
                                            <td className="p-3 text-center"><input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-16 p-1 text-center font-bold bg-slate-50 rounded border border-slate-200 outline-none focus:border-blue-400"/></td>
                                            <td className="p-3 text-right font-mono font-bold text-slate-800 pr-4">{formatCurrency(lineTotal)}</td>
                                            <td className="p-3 text-center"><button onClick={() => removeRecipeItem(idx)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button></td>
                                        </tr>
                                    );
                                })}
                                {recipe.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">Δεν έχουν προστεθεί υλικά.</td></tr>)}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t border-slate-200">
                                <tr><td colSpan={4} className="p-3 text-right font-bold text-slate-600 uppercase text-xs">Συνολο Υλικων:</td><td className="p-3 text-right font-black font-mono text-lg text-emerald-600 pr-4">{formatCurrency(recipeTotalCost)}</td><td></td></tr>
                            </tfoot>
                        </table>
                    </div>
                    <div className="flex gap-2 pt-2">
                        <button type="button" onClick={() => setIsRecipeModalOpen('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-3 rounded-xl font-bold border border-purple-200 flex items-center gap-2 hover:bg-purple-100 transition-all flex-1 justify-center"><Plus size={16}/> Προσθήκη Υλικού</button>
                        <button type="button" onClick={() => setIsRecipeModalOpen('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-3 rounded-xl font-bold border border-blue-200 flex items-center gap-2 hover:bg-blue-100 transition-all flex-1 justify-center"><PackageOpen size={16}/> Προσθήκη STX</button>
                    </div>
                </div>
            )}

            {currentStep === 2 && productionType === ProductionType.Imported && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">2. Κοστολόγηση Εισαγωγής</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-100 shadow-lg shadow-emerald-50 space-y-4"><div className="flex items-center gap-3 mb-4"><div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl"> <Calculator size={24} /> </div><div><h4 className="font-black text-lg text-slate-800">Υπολογισμός Κόστους</h4><p className="text-xs text-slate-500 font-medium">Συμπληρώστε τα παρακάτω πεδία.</p></div></div><LaborCostCard icon={<Hammer size={14}/>} label="Εργατικά (€/g)" value={labor.technician_cost} onChange={val => setLabor({...labor, technician_cost: val})} hint="Κόστος εργασίας ανά γραμμάριο"/><LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση (€/g)" value={labor.plating_cost_x} onChange={val => setLabor({...labor, plating_cost_x: val})} hint="Κόστος επιμετάλλωσης ανά γραμμάριο"/><LaborCostCard icon={<Gem size={14}/>} label="Καρφωτικά/Πέτρες (€)" value={labor.stone_setting_cost} onChange={val => setLabor({...labor, stone_setting_cost: val})} hint="Σταθερό κόστος"/></div>
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col"><h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-2"><Calculator size={14}/> Ανάλυση Κόστους (Live)</h4><div className="space-y-1 flex-1"><SummaryRow label="Ασήμι" value={costBreakdown?.silver || 0} sub={`${weight}g @ ${settings?.silver_price_gram}€`} color="bg-slate-400" /><SummaryRow label="Εργατικά" value={costBreakdown?.details?.technician_cost || 0} sub={`${formatDecimal(labor.technician_cost)}€ x ${weight}g`} color="bg-blue-400" /><SummaryRow label="Επιμετάλλωση" value={costBreakdown?.details?.plating_cost_x || 0} sub={`${formatDecimal(labor.plating_cost_x)}€ x ${weight}g`} color="bg-amber-400" /><SummaryRow label="Καρφωτικά" value={costBreakdown?.details?.stone_setting_cost || 0} sub="Σταθερό" color="bg-purple-400" /></div><div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center"><span className="font-bold text-slate-600 text-sm uppercase">Συνολο Κοστους</span><span className="font-black text-2xl text-emerald-700">{formatCurrency(masterEstimatedCost)}</span></div></div>
                    </div>
                </div>
            )}

            {currentStep === 3 && productionType === ProductionType.InHouse && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Εργατικά</h3>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100"><h4 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2"><Hammer size={18}/> Κόστη Εργατικών</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><LaborCostCard icon={<Flame size={14}/>} label="Χυτήριο (€)" value={labor.casting_cost} onChange={val => setLabor({...labor, casting_cost: val})} isOverridden={labor.casting_cost_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, casting_cost_manual_override: !prev.casting_cost_manual_override}))} hint="Από Συνολικό Βάρος"/><LaborCostCard icon={<Crown size={14}/>} label="Καρφωτής (€)" value={labor.setter_cost} onChange={val => setLabor({...labor, setter_cost: val})} /><LaborCostCard icon={<Hammer size={14}/>} label="Τεχνίτης (€)" value={labor.technician_cost} onChange={val => setLabor({...labor, technician_cost: val})} isOverridden={labor.technician_cost_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, technician_cost_manual_override: !prev.technician_cost_manual_override}))} /><LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση X/H (€)" value={labor.plating_cost_x} onChange={val => setLabor({...labor, plating_cost_x: val})} isOverridden={labor.plating_cost_x_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_x_manual_override: !prev.plating_cost_x_manual_override}))} hint="Από Συνολικό Βάρος (Βασικό+Comp+Sec)" /><LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση D (€)" value={labor.plating_cost_d} onChange={val => setLabor({...labor, plating_cost_d: val})} isOverridden={labor.plating_cost_d_manual_override} onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_d_manual_override: !prev.plating_cost_d_manual_override}))} hint="Από Β' Βάρος" /><LaborCostCard icon={<Users size={14}/>} label="Φασόν / Έξτρα (€)" value={labor.subcontract_cost} onChange={val => setLabor({...labor, subcontract_cost: val})} /></div></div>
                </div>
            )}
            
            {currentStep === (productionType === ProductionType.Imported ? 3 : 4) && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                        <span>{productionType === ProductionType.Imported ? '3. Παραλλαγές' : '4. Παραλλαγές'}</span>
                        <div className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 font-bold">Base: {formatCurrency(masterEstimatedCost)}</div>
                    </h3>
                    
                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-inner space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-[#060b00] text-white rounded-xl shadow-md"><Zap size={18}/></div>
                            <h4 className="font-black text-slate-700 uppercase tracking-tighter text-sm">Έξυπνη Προσθήκη</h4>
                        </div>
                        
                        <div className="grid gap-4 w-full items-end grid-cols-[1fr_auto]">
                            <div className="relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Κωδικός Πέτρας (π.χ. PR)</label>
                                <input 
                                    ref={stoneSuffixRef}
                                    type="text" placeholder="Κενό για σκέτα μέταλλα" 
                                    value={smartAddStoneSuffix} 
                                    onChange={e => setSmartAddStoneSuffix(e.target.value.toUpperCase())} 
                                    className="w-full p-3.5 border border-slate-200 rounded-2xl font-mono text-lg font-black uppercase bg-white text-slate-800 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                                />
                                <p className="text-[10px] text-slate-400 mt-2 ml-1">
                                    {bridge ? <>Ανιχνεύθηκε διαχωριστικό <strong>{bridge}</strong>. </> : ''}
                                    Θα δημιουργηθούν αυτόματα παραλλαγές για: <strong>{selectedFinishes.map(f => f ? FINISH_CODES[f] : 'Λουστρέ').join(', ')}</strong>
                                </p>
                            </div>
                            
                            <button onClick={handleSmartAddBatch} className="bg-[#060b00] text-white p-4 rounded-2xl font-black hover:bg-black transition-all shadow-lg active:scale-95 h-[54px] flex items-center justify-center px-6">
                                <Plus size={20} className="mr-2"/> Δημιουργία
                            </button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2 mb-1">Λίστα Παραλλαγών</h4>
                        {variants.map((variant, index) => {
                            const { color, stone } = getVariantTypeInfo(variant.suffix);
                            const breakdown = estimateVariantCost(currentTempProduct, variant.suffix, settings!, materials, products);
                            
                            // Accurate Logic for Diff Breakdown
                            const diff = breakdown.total - masterEstimatedCost;
                            const details = breakdown.breakdown.details;
                            const platingCost = details.plating_cost || 0;
                            const stoneDiff = details.stone_diff || 0;
                            
                            let breakdownLabel: string[] = [];
                            if (platingCost > 0) breakdownLabel.push(`+${formatCurrency(platingCost)} Επιμ.`);
                            if (Math.abs(stoneDiff) > 0.01) breakdownLabel.push(`${stoneDiff > 0 ? '+' : ''}${formatCurrency(stoneDiff)} Υλικά`);
                            
                            // Fallback if no specific diff found but total is diff
                            if (breakdownLabel.length === 0 && Math.abs(diff) > 0.01) {
                                breakdownLabel.push(`${diff > 0 ? '+' : ''}${formatCurrency(diff)}`);
                            }
                            
                            const breakdownText = breakdownLabel.length > 0 ? breakdownLabel.join(', ') : 'Βασικό Κόστος';

                            return (
                                <div key={index} className="group flex items-center gap-4 p-5 bg-white rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all animate-in slide-in-from-bottom-2">
                                    <div className={`font-mono font-black text-xl w-24 h-14 flex items-center justify-center rounded-2xl border-2 shadow-sm ${color}`}>
                                        {variant.suffix || 'L'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <input 
                                                type="text" value={variant.description} 
                                                onChange={e => updateVariant(index, 'description', e.target.value)} 
                                                className="bg-transparent font-black text-slate-800 text-base outline-none focus:border-b-2 border-emerald-400 w-full truncate"
                                            />
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <span className="text-[10px] bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-100 font-bold uppercase tracking-tight">
                                                Κόστος: {formatCurrency(variant.active_price)}
                                            </span>
                                            {Math.abs(diff) > 0.01 && (
                                                <span className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                    {breakdownText}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {!isSTX && (
                                        <div className="text-right px-4 border-l border-slate-100">
                                            <div className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Χονδρική</div>
                                            <input 
                                                type="number" step="0.1" 
                                                value={variant.selling_price || 0} 
                                                onChange={e => updateVariant(index, 'selling_price', parseFloat(e.target.value) || 0)} 
                                                className="w-20 bg-emerald-50 text-emerald-800 font-black text-lg outline-none text-right rounded-lg px-2 border border-emerald-100"
                                            />
                                        </div>
                                    )}
                                    
                                    <button onClick={() => removeVariant(index)} className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100">
                                        <Trash2 size={20}/>
                                    </button>
                                </div>
                            );
                        })}
                        {variants.length === 0 && <div className="text-center text-slate-300 py-12 border-2 border-dashed border-slate-100 rounded-[2rem] flex flex-col items-center gap-2"><Layers size={40} className="opacity-20"/><p className="font-bold">Δεν υπάρχουν παραλλαγές</p><p className="text-xs">Το προϊόν θα αποθηκευτεί μόνο στην αρχική του μορφή.</p></div>}
                    </div>
                </div>
            )}
            
            {currentStep === finalStepId && (
                <div className="space-y-8 animate-in slide-in-from-right duration-300 h-full flex flex-col">
                    {/* Header Identity */}
                    <div className="flex gap-6 items-start shrink-0">
                        <div className="w-32 h-32 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 shadow-sm shrink-0">
                            {imagePreview ? <img src={imagePreview} className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-300"><ImageIcon size={32}/></div>}
                        </div>
                        <div className="flex-1">
                            <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                                {detectedMasterSku || sku}
                                {isSTX && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-md text-xs font-bold uppercase">Component</span>}
                                {productionType === ProductionType.Imported && <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-md text-xs font-bold uppercase flex items-center gap-1"><Globe size={12}/> Imported</span>}
                            </h2>
                            <div className="flex gap-4 text-sm font-medium text-slate-500 mt-2">
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Tag size={12}/> {category}</span>
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Users size={12}/> {genderLabel}</span>
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded font-bold text-slate-600"><Palette size={12}/> {platingMasterLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
                        {/* LEFT: MASTER COST BREAKDOWN ("Cost Puzzle") */}
                        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col gap-6">
                                <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider flex items-center gap-2 border-b border-slate-200 pb-2">
                                    <PieChart size={14}/> Ανάλυση Κόστους Παραγωγής
                                </h4>
                                
                                <div className="flex gap-4 items-end justify-center">
                                    {/* BASE STACK */}
                                    <div className="w-24 flex flex-col items-center gap-1">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Βασικό</div>
                                        <div className="w-full flex flex-col-reverse rounded-xl overflow-hidden shadow-sm border border-slate-200 bg-white">
                                            <div className="h-12 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600" title={`Ασήμι: ${formatCurrency(costBreakdown?.silver)}`}>Ag</div>
                                            <div className="h-8 bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600" title={`Εργατικά: ${formatCurrency(costBreakdown?.labor)}`}>Lab</div>
                                            <div className="h-6 bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-600" title={`Υλικά: ${formatCurrency(costBreakdown?.materials)}`}>Mat</div>
                                        </div>
                                        <div className="font-black text-slate-800 text-lg mt-1">{formatCurrency(masterEstimatedCost)}</div>
                                    </div>

                                    <div className="text-slate-300 pb-8"><ArrowRight size={24}/></div>

                                    {/* FINAL STACKS (Dynamic) */}
                                    {finalStacks.map((stack, idx) => (
                                        <div key={idx} className="w-24 flex flex-col items-center gap-1 animate-in slide-in-from-right-4 fade-in" style={{animationDelay: `${idx * 100}ms`}}>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stack.label}</div>
                                            <div className={`w-full flex flex-col-reverse rounded-xl overflow-hidden shadow-sm border bg-white ${stack.borderClass}`}>
                                                <div className="h-12 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-400">Ag</div>
                                                <div className="h-8 bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-400">Lab</div>
                                                <div className="h-6 bg-purple-100 flex items-center justify-center text-[10px] font-bold text-purple-400">Mat</div>
                                                
                                                {stack.platingCost > 0 && (
                                                    <div className={`h-6 flex items-center justify-center text-[10px] font-bold border-b border-white/50 ${stack.colorClass}`} title={`Plating: +${formatCurrency(stack.platingCost)}`}>
                                                        +{stack.type}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="font-black text-emerald-600 text-lg mt-1">{formatCurrency(stack.total)}</div>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2 mt-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-slate-200 rounded-full"></div> 
                                            <span className="text-slate-600 font-medium">Ασήμι ({settings?.silver_price_gram}€/g)</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{formatCurrency(costBreakdown?.silver)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-blue-100 rounded-full"></div> 
                                            <span className="text-slate-600 font-medium">Εργατικά</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{formatCurrency(costBreakdown?.labor)}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 bg-purple-100 rounded-full"></div> 
                                            <span className="text-slate-600 font-medium">Υλικά/Πέτρες</span>
                                        </div>
                                        <span className="font-bold text-slate-800">{formatCurrency(costBreakdown?.materials)}</span>
                                    </div>
                                    {labor.plating_cost_x > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 bg-amber-100 rounded-full"></div> 
                                                <span className="text-slate-600 font-medium">Επιμετάλλωση X/H</span>
                                            </div>
                                            <span className="font-bold text-slate-800">+{formatCurrency(labor.plating_cost_x)}</span>
                                        </div>
                                    )}
                                    {labor.plating_cost_d > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 bg-orange-100 rounded-full"></div> 
                                                <span className="text-slate-600 font-medium">Επιμετάλλωση D</span>
                                            </div>
                                            <span className="font-bold text-slate-800">+{formatCurrency(labor.plating_cost_d)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Additional Info Box (Expanded) */}
                            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                                <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2"><Box size={14}/> Λεπτομέρειες</h4>
                                <div className="space-y-3">
                                    <div>
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">Υλικά & Εξαρτήματα</div>
                                        {recipe.length > 0 ? (
                                            <ul className="space-y-1">
                                                {recipe.map((r, idx) => {
                                                    const name = r.type === 'raw' 
                                                        ? materials.find(m => m.id === r.id)?.name 
                                                        : products.find(p => p.sku === r.sku)?.category || r.sku;
                                                    return (
                                                        <li key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                            <div className="w-1 h-1 bg-purple-400 rounded-full"></div>
                                                            <span>{name} <span className="text-slate-400">x{r.quantity}</span></span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : <span className="text-xs text-slate-400 italic">Κανένα υλικό</span>}
                                    </div>
                                    
                                    <div>
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-1">Λάστιχα</div>
                                        {selectedMolds.length > 0 ? (
                                            <ul className="space-y-1">
                                                {selectedMolds.map((m, idx) => {
                                                    const details = molds?.find(mold => mold.code === m.code);
                                                    return (
                                                        <li key={idx} className="flex items-center gap-2 text-xs font-medium text-slate-700">
                                                            <div className="w-1 h-1 bg-amber-400 rounded-full"></div>
                                                            <span>{m.code} <span className="text-slate-400">{details?.location ? `(${details.location})` : ''}</span></span>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        ) : <span className="text-xs text-slate-400 italic">Κανένα λάστιχο</span>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                        <div>
                                            <span className="text-[10px] text-slate-400 font-bold block">ΒΑΡΟΣ</span>
                                            <span className="font-mono text-slate-800 font-bold text-sm">{weight + secondaryWeight}g</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-400 font-bold block">ΣΥΝΟΛΟ ΕΡΓΑΤΙΚΩΝ</span>
                                            <span className="font-mono text-slate-800 font-bold text-sm">{formatCurrency(costBreakdown?.labor)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT: PROFITABILITY MATRIX */}
                        <div className="lg:col-span-8 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={18} className="text-emerald-600"/> Ανάλυση Κερδοφορίας Παραλλαγών</h4>
                                <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">{variants.length} Παραλλαγές</span>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-4 pl-6">Παραλλαγή</th>
                                            <th className="p-4 text-right">Κόστος</th>
                                            <th className="p-4 text-right">Χονδρική</th>
                                            <th className="p-4 text-right text-emerald-700">Κέρδος</th>
                                            <th className="p-4 w-1/4 pr-6">Περιθώριο</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {variants.length > 0 ? variants.map((v, idx) => {
                                            const breakdown = estimateVariantCost(currentTempProduct, v.suffix, settings!, materials, products);
                                            const cost = breakdown.total; // Use accurate estimate
                                            const price = v.selling_price || sellingPrice;
                                            const profit = price - cost;
                                            const margin = price > 0 ? (profit / price) * 100 : 0;
                                            
                                            // Determine diff for breakdown tooltip based on COMPONENT costs
                                            const diff = cost - masterEstimatedCost;
                                            const details = breakdown.breakdown.details;
                                            const platingCost = details.plating_cost || 0;
                                            const stoneDiff = details.stone_diff || 0;
                                            
                                            let breakdownLabel: string[] = [];
                                            // Explicitly show Plating Labor if added
                                            if (platingCost > 0) breakdownLabel.push(`+${formatCurrency(platingCost)} Επιμ.`);
                                            // Explicitly show Stone Material Diff if significant
                                            if (Math.abs(stoneDiff) > 0.01) breakdownLabel.push(`${stoneDiff > 0 ? '+' : ''}${formatCurrency(stoneDiff)} Υλικά`);
                                            
                                            // Fallback if no specific logic caught it but diff exists
                                            if (breakdownLabel.length === 0 && Math.abs(diff) > 0.01) {
                                                breakdownLabel.push(`${diff > 0 ? '+' : ''}${formatCurrency(diff)}`);
                                            }
                                            
                                            const breakdownText = breakdownLabel.length > 0 ? breakdownLabel.join(', ') : 'Βασικό Κόστος';

                                            return (
                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="p-4 pl-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs border border-slate-200 w-12 text-center">{v.suffix || 'BAS'}</div>
                                                            <span className="font-medium text-slate-600 truncate max-w-[150px]" title={v.description}>{v.description}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right group-hover:bg-amber-50/30 transition-colors">
                                                        <div className="font-mono font-bold text-slate-700">{formatCurrency(cost)}</div>
                                                        <div className="text-[9px] text-slate-400 group-hover:text-amber-600 font-bold">{breakdownText}</div>
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        {isSTX ? (
                                                            <span className="text-slate-300 italic text-xs">N/A</span>
                                                        ) : (
                                                            <span className="font-mono font-bold text-slate-800 text-lg">{formatCurrency(price)}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-right font-mono font-bold text-emerald-600">
                                                        {isSTX ? '-' : formatCurrency(profit)}
                                                    </td>
                                                    <td className="p-4 pr-6">
                                                        {!isSTX && (
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div 
                                                                        className={`h-full rounded-full ${margin < 30 ? 'bg-rose-500' : (margin < 50 ? 'bg-amber-400' : 'bg-emerald-500')}`} 
                                                                        style={{width: `${Math.min(100, Math.max(0, margin))}%`}}
                                                                    ></div>
                                                                </div>
                                                                <span className={`text-xs font-black w-10 text-right ${margin < 30 ? 'text-rose-600' : 'text-emerald-700'}`}>{margin.toFixed(0)}%</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center">
                                                    <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-xs font-bold border border-blue-100">
                                                        <Info size={14}/> Θα δημιουργηθεί μόνο το Master προϊόν (χωρίς παραλλαγές).
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex justify-between items-center">
                <button onClick={prevStep} disabled={currentStep === 1} className="flex items-center gap-2 px-5 py-3 rounded-xl text-slate-500 hover:bg-slate-100 font-bold disabled:opacity-50"><ArrowLeft size={16}/> Πίσω</button>
                <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-400">Βήμα {currentStep}/{finalStepId}: {STEPS.find(s => s.id === currentStep)?.title}</span></div>
                {currentStep < finalStepId && <button onClick={nextStep} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 text-white hover:bg-black font-bold shadow-md">Επόμενο <ArrowRight size={16}/></button>}
                {currentStep === finalStepId && (<button onClick={handleSubmit} disabled={isUploading} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200 hover:-translate-y-0.5 transition-all">{isUploading ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} {isUploading ? 'Αποθήκευση...' : 'Ολοκλήρωση & Αποθήκευση'}</button>)}
            </div>
        </div>
      </div>
    </div>
  );
}
