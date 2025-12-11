import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, Mold, ProductVariant, MaterialType, ProductMold, ProductionType, Supplier } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost, calculatePlatingCost, estimateVariantCost, analyzeSuffix, getVariantComponents, analyzeSupplierValue, formatCurrency, SupplierAnalysis, formatDecimal } from '../utils/pricingEngine';
import { Plus, Trash2, Camera, Box, Upload, Loader2, ArrowRight, ArrowLeft, CheckCircle, Lightbulb, Wand2, Percent, Search, ImageIcon, Lock, Unlock, MapPin, Tag, Layers, RefreshCw, DollarSign, Calculator, Crown, Coins, Hammer, Flame, Users, Palette, Check, X, PackageOpen, Gem, Link, Activity, Puzzle, Minus, Globe, Info, ThumbsUp, AlertTriangle, HelpCircle, BookOpen, Scroll } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../lib/supabase';
import { useUI } from './UIProvider';
import { FINISH_CODES } from '../constants';

// ... (keep Props, getSteps, getMaterialIcon, RecipeItemSelectorModal, SmartAnalysisCard, LaborCostCard, SummaryRow, AnalysisExplainerModal unchanged until NewProduct component) ...

// ... inside NewProduct component ...

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
        case 'Chain': return <Link size={16} className="text-slate-500" />;
        case 'Component': return <Puzzle size={16} className="text-blue-500" />;
        case 'Enamel': return <Palette size={16} className="text-rose-500" />;
        case 'Leather': return <Scroll size={16} className="text-amber-700" />;
        default: return <Box size={16} className="text-slate-400" />;
    }
};

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
        'Βραχιόλι': { types: [MaterialType.Cord, MaterialType.Chain, MaterialType.Leather], names: ['κούμπωμα', 'δέρμα'] },
        'Μενταγιόν': { types: [MaterialType.Chain, MaterialType.Leather], names: ['κρίκος', 'κρικάκι', 'κορδόνι'] },
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
            const isSuggested = keywords.types.includes(item.type) || keywords.names.some(kw => name.includes(kw));
            if (isSuggested) {
                suggestedItems.push(item);
            } else {
                otherItems.push(item);
            }
        });

        const filterFn = (item: any) => {
            const name = type === 'raw' ? item.name.toLowerCase() : item.sku.toLowerCase();
            return name.includes(searchTerm.toLowerCase());
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
    
    // @FIX: Refactor ListItem from a component-in-component to a render function to avoid React anti-pattern and fix TS error.
    const renderListItem = (item: any) => {
        const name = type === 'raw' ? item.name : item.sku;
        const icon = type === 'raw' ? getMaterialIcon(item.type) : getMaterialIcon('Component');
        const cost = type === 'raw' ? `${item.cost_per_unit.toFixed(2)}€ / ${item.unit}` : `${item.active_price.toFixed(2)}€`;

        return (
            <div
                key={item.id || item.sku}
                onClick={() => handleSelect(item)}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-emerald-50 cursor-pointer transition-colors border border-transparent hover:border-emerald-100"
            >
                <div className="p-2 bg-slate-100 rounded-lg">{icon}</div>
                <div className="flex-1">
                    <div className="font-bold text-slate-800 text-sm">{name}</div>
                    <div className="text-xs text-slate-400 font-mono">{cost}</div>
                </div>
                <div className="p-1 bg-white rounded-full shadow-sm border border-slate-100 text-slate-300 group-hover:text-emerald-500">
                   <Plus size={14}/>
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
                            placeholder="Αναζήτηση..."
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


const SmartAnalysisCard = ({ analysis }: { analysis: SupplierAnalysis }) => {
    // ... (unchanged) ...
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
            {/* Header Verdict */}
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

            {/* Main Stats Grid */}
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

            {/* Forensic Analysis Section (If breakdown provided) */}
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

            {/* Markup Bar */}
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

export default function NewProduct({ products, materials, molds = [], onCancel }: Props) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.getSuppliers }); 

  const [currentStep, setCurrentStep] = useState(1);
  const { showToast } = useUI();

  // Form State
  const [productionType, setProductionType] = useState<ProductionType>(ProductionType.InHouse);
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false);
  const [isGenderManuallySet, setIsGenderManuallySet] = useState(false);
  
  const [weight, setWeight] = useState(0);
  const [secondaryWeight, setSecondaryWeight] = useState(0);
  const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
  
  const [supplierId, setSupplierId] = useState<string>(''); 
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
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const [selectedMolds, setSelectedMolds] = useState<ProductMold[]>([]); 
  const [moldSearch, setMoldSearch] = useState('');
  
  const [newMoldCode, setNewMoldCode] = useState('L');
  const [newMoldLoc, setNewMoldLoc] = useState('');
  const [newMoldDesc, setNewMoldDesc] = useState('');
  const [isCreatingMold, setIsCreatingMold] = useState(false);
  
  const [isCreatingMaterial, setIsCreatingMaterial] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatType, setNewMatType] = useState<MaterialType>(MaterialType.Stone);
  const [newMatCost, setNewMatCost] = useState(0);
  const [newMatUnit, setNewMatUnit] = useState('Τεμ');
  const [isSavingMat, setIsSavingMat] = useState(false);

  const [isSTX, setIsSTX] = useState(false);
  const [masterEstimatedCost, setMasterEstimatedCost] = useState(0);
  const [costBreakdown, setCostBreakdown] = useState<any>(null);

  const [detectedMasterSku, setDetectedMasterSku] = useState('');
  const [detectedSuffix, setDetectedSuffix] = useState('');
  const [detectedVariantDesc, setDetectedVariantDesc] = useState('');
  const [detectedFinishCode, setDetectedFinishCode] = useState('');
  
  const [showAnalysisHelp, setShowAnalysisHelp] = useState(false);

  const STEPS = getSteps(productionType);
  const finalStepId = STEPS[STEPS.length - 1].id;

  useEffect(() => {
    const skuTrimmed = sku.trim();
    if (skuTrimmed.length >= 2) {
      const meta = parseSku(skuTrimmed);
      if (meta.category !== 'Γενικό' && !isCategoryManuallySet) {
         setCategory(meta.category);
      }
      if (meta.gender && !isGenderManuallySet) {
         setGender(meta.gender as Gender);
      }
      setIsSTX(skuTrimmed.startsWith('STX'));
      
      const analysis = analyzeSku(skuTrimmed, gender as Gender);
      const { finish } = getVariantComponents(analysis.suffix, gender as Gender);
      setDetectedFinishCode(finish.code);
      
      if (analysis.isVariant) {
          setDetectedMasterSku(analysis.masterSku);
          setDetectedSuffix(analysis.suffix);
          setDetectedVariantDesc(analysis.variantDescription);
          setPlating(analysis.detectedPlating);
      } else {
          setDetectedMasterSku(skuTrimmed.toUpperCase());
          setDetectedSuffix('');
          setDetectedVariantDesc('');
          setPlating(PlatingType.None);
      }
    } else {
        setCategory('');
        setGender('');
        setIsSTX(false);
        setDetectedMasterSku('');
        setDetectedSuffix('');
        setDetectedVariantDesc('');
        setIsCategoryManuallySet(false);
        setIsGenderManuallySet(false);
        setDetectedFinishCode('');
    }
  }, [sku, gender]);

  const platingNoneLabel = useMemo(() => {
    if (detectedFinishCode === 'P') {
        return FINISH_CODES['P'];
    }
    return FINISH_CODES['']; 
  }, [detectedFinishCode]);

  useEffect(() => {
      if (detectedSuffix) {
          const exists = variants.some(v => v.suffix === detectedSuffix);
          if (!exists) {
              setNewVariantSuffix(detectedSuffix);
              setNewVariantDesc(detectedVariantDesc);
          }
      }
  }, [detectedSuffix, detectedVariantDesc, variants]);

  useEffect(() => {
      setNewVariantPrice(sellingPrice);
  }, [sellingPrice]);

  useEffect(() => {
      // If marked as STX/Component, force selling price to 0
      if (isSTX) {
          setSellingPrice(0);
          setNewVariantPrice(0);
      }
  }, [isSTX]);

  useEffect(() => {
    if (productionType === ProductionType.InHouse && !labor.technician_cost_manual_override) {
      if (isSTX) {
          setLabor(prevLabor => ({...prevLabor, technician_cost: weight * 0.50}));
      } else {
          const techCost = calculateTechnicianCost(weight);
          setLabor(prevLabor => ({...prevLabor, technician_cost: techCost}));
      }
    }
  }, [weight, labor.technician_cost_manual_override, productionType, isSTX]);
  
  useEffect(() => {
    if (productionType === ProductionType.InHouse && !labor.casting_cost_manual_override) {
        const totalWeight = (weight || 0) + (secondaryWeight || 0);
        const castCost = isSTX ? 0 : totalWeight * 0.15;
        setLabor(prevLabor => ({...prevLabor, casting_cost: castCost}));
    }
  }, [weight, secondaryWeight, productionType, isSTX, labor.casting_cost_manual_override]);
  
  useEffect(() => {
    if (!labor.plating_cost_x_manual_override) {
        let totalPlatingWeight = weight;
        recipe.forEach(item => {
            if (item.type === 'component') {
                const subProduct = products.find(p => p.sku === item.sku);
                if (subProduct) {
                    totalPlatingWeight += (subProduct.weight_g * item.quantity);
                }
            }
        });
      const costX = totalPlatingWeight * 0.60;
      setLabor(prev => ({ ...prev, plating_cost_x: costX }));
    }
  }, [weight, recipe, products, labor.plating_cost_x_manual_override]);

  useEffect(() => {
    if (!labor.plating_cost_d_manual_override) {
        let totalSecondaryWeight = secondaryWeight || 0;
        recipe.forEach(item => {
            if (item.type === 'component') {
                const subProduct = products.find(p => p.sku === item.sku);
                if (subProduct) {
                    totalSecondaryWeight += ((subProduct.secondary_weight_g || 0) * item.quantity);
                }
            }
        });
        const costD = totalSecondaryWeight * 0.60;
        setLabor(prev => ({ ...prev, plating_cost_d: costD }));
    }
  }, [secondaryWeight, recipe, products, labor.plating_cost_d_manual_override]);


  // Cost Calculator Effect - VITAL: Passes 'labor' to calculation
  useEffect(() => {
    if (!settings) return;
    const tempProduct: Product = {
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
      supplier_cost: supplierCost,
      active_price: 0,
      draft_price: 0,
      selling_price: 0,
      stock_qty: 0,
      sample_qty: 0,
      molds: selectedMolds,
      is_component: isSTX,
      recipe: recipe,
      labor // This state contains the reported supplier breakdowns now
    };
    const cost = calculateProductCost(tempProduct, settings, materials, products);
    setMasterEstimatedCost(cost.total);
    setCostBreakdown(cost.breakdown);
  }, [sku, detectedMasterSku, category, gender, weight, secondaryWeight, plating, recipe, labor, materials, imagePreview, selectedMolds, isSTX, products, settings, productionType, supplierCost, supplierId]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedImage(file);
      const previewUrl = URL.createObjectURL(file);
      setImagePreview(previewUrl);
    }
  };

  const handleSelectRecipeItem = (item: { type: 'raw', id: string } | { type: 'component', sku: string }) => {
    if (item.type === 'raw') {
        setRecipe([...recipe, { type: 'raw', id: item.id, quantity: 1 }]);
    } else {
        setRecipe([...recipe, { type: 'component', sku: item.sku, quantity: 1 }]);
    }
    setIsRecipeModalOpen(false);
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...recipe];
    const item = newRecipe[index];
    if (field === 'quantity') item.quantity = parseFloat(value);
    else if (field === 'id' && item.type === 'raw') item.id = value;
    else if (field === 'sku' && item.type === 'component') item.sku = value;
    setRecipe(newRecipe);
  };

  const removeRecipeItem = (index: number) => {
    setRecipe(recipe.filter((_, i) => i !== index));
  };

  const addMold = (code: string) => {
      const existing = selectedMolds.find(m => m.code === code);
      if (existing) return;
      setSelectedMolds([...selectedMolds, { code, quantity: 1 }]);
  };

  const updateMoldQuantity = (code: string, delta: number) => {
      setSelectedMolds(prev => prev.map(m => {
          if (m.code === code) {
              return { ...m, quantity: Math.max(1, m.quantity + delta) };
          }
          return m;
      }));
  };

  const removeMold = (code: string) => {
      setSelectedMolds(prev => prev.filter(m => m.code !== code));
  };

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

  const handleQuickCreateMaterial = async () => {
      if (!newMatName) { showToast("Το όνομα είναι υποχρεωτικό.", "error"); return; }
      setIsSavingMat(true);
      try {
          const { data, error } = await supabase.from('materials').insert({
              name: newMatName,
              type: newMatType,
              cost_per_unit: newMatCost,
              unit: newMatUnit
          }).select().single();
          
          if (error) throw error;
          
          await queryClient.invalidateQueries({ queryKey: ['materials'] });
          
          if (data) {
              setRecipe([...recipe, { type: 'raw', id: data.id, quantity: 1 }]);
          }
          
          setNewMatName(''); setNewMatCost(0);
          setIsCreatingMaterial(false);
          showToast("Το υλικό προστέθηκε στη συνταγή!", "success");
      } catch(e) {
          showToast("Σφάλμα δημιουργίας υλικού.", "error");
      } finally {
          setIsSavingMat(false);
      }
  };

  const { suggestedMolds, otherMolds } = useMemo(() => {
    const upperSku = sku.toUpperCase();
    const usedMoldCodes = new Set(selectedMolds.map(m => m.code));
    const availableMolds = molds.filter(m => !usedMoldCodes.has(m.code));
    
    let suggestionKeyword: string | null = null;

    if (upperSku.startsWith('PN') || upperSku.startsWith('MN')) {
        suggestionKeyword = 'κρίκος';
    } else if (upperSku.startsWith('SK')) {
        suggestionKeyword = 'καβαλάρης';
    }

    const allMoldsFilteredBySearch = availableMolds
      .filter(m => 
          (m.code.toUpperCase().includes(moldSearch.toUpperCase()) || 
          m.description.toLowerCase().includes(moldSearch.toLowerCase()))
      );

    let suggested: Mold[] = [];
    let others: Mold[] = [];

    if (suggestionKeyword) {
        allMoldsFilteredBySearch.forEach(m => {
            if (m.description.toLowerCase().includes(suggestionKeyword!)) {
                suggested.push(m);
            } else {
                others.push(m);
            }
        });
    } else {
        others = allMoldsFilteredBySearch;
    }
    
    const sortFn = (a: Mold, b: Mold) => a.code.localeCompare(b.code, undefined, { numeric: true });
    
    suggested.sort(sortFn);
    others.sort(sortFn);

    return { suggestedMolds: suggested, otherMolds: others };
  }, [molds, moldSearch, sku, selectedMolds]);

  useEffect(() => {
      if (newVariantSuffix) {
          const desc = analyzeSuffix(newVariantSuffix, gender as Gender);
          if (desc) setNewVariantDesc(desc);
      }
  }, [newVariantSuffix, gender]);

  const handleAddVariant = () => {
      if (!newVariantSuffix) { showToast("Η κατάληξη είναι υποχρεωτική.", "error"); return; }
      
      const upperSuffix = newVariantSuffix.toUpperCase();
      if (variants.some(v => v.suffix === upperSuffix)) { showToast("Αυτή η παραλλαγή υπάρχει ήδη.", "error"); return; }

      const tempMaster: Product = {
          sku: detectedMasterSku || sku,
          prefix: sku.substring(0, 2),
          category, 
          gender: gender as Gender, 
          weight_g: weight, 
          secondary_weight_g: secondaryWeight,
          plating_type: plating,
          production_type: productionType,
          supplier_id: supplierId,
          supplier_cost: supplierCost,
          image_url: imagePreview || null,
          active_price: masterEstimatedCost, 
          draft_price: masterEstimatedCost,
          selling_price: isSTX ? 0 : sellingPrice, // FORCE 0 FOR STX
          stock_qty: 0, 
          sample_qty: 0, 
          molds: [], 
          is_component: isSTX, 
          recipe, 
          labor
      };

      const { total: estimatedCost } = estimateVariantCost(
          tempMaster, 
          upperSuffix, 
          settings!, 
          materials, 
          products
      );
      
      const newV: ProductVariant = {
          suffix: upperSuffix,
          description: newVariantDesc,
          stock_qty: 0,
          active_price: parseFloat(estimatedCost.toFixed(2)),
          selling_price: isSTX ? 0 : (newVariantPrice > 0 ? newVariantPrice : sellingPrice)
      };

      setVariants([...variants, newV]);
      setNewVariantSuffix('');
      setNewVariantDesc('');
      showToast(`Προστέθηκε η παραλλαγή ${upperSuffix}`, "success");
      
      if (suffixInputRef.current) {
          suffixInputRef.current.focus();
      }
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
      const updated = [...variants];
      updated[index] = { ...updated[index], [field]: value };
      setVariants(updated);
  };

  const removeVariant = (index: number) => {
      setVariants(variants.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!weight || weight <= 0) { 
        showToast("Το Βάρος (g) είναι υποχρεωτικό.", "error"); 
        setCurrentStep(1); 
        return; 
    }

    if (!sku) { showToast("Το SKU είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }
    if (!category) { showToast("Η Κατηγορία είναι υποχρεωτική", "error"); setCurrentStep(1); return; }
    if (!gender) { showToast("Το Φύλο είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }

    setIsUploading(true);
    let finalImageUrl: string | null = null; 
    const finalMasterSku = (detectedMasterSku || sku).toUpperCase().trim();

    try {
        let existingStockQty = 0;
        let existingSampleQty = 0;
        
        const { data: existingProd } = await supabase.from('products').select('stock_qty, sample_qty, image_url').eq('sku', finalMasterSku).single();

        if (existingProd) {
            existingStockQty = existingProd.stock_qty || 0;
            existingSampleQty = existingProd.sample_qty || 0;
            if (!selectedImage && existingProd.image_url) finalImageUrl = existingProd.image_url;
        }

        if (selectedImage) {
            const compressedBlob = await compressImage(selectedImage);
            finalImageUrl = await uploadProductImage(compressedBlob, finalMasterSku);
        }

        const { error: prodError } = await supabase.from('products').upsert({
            sku: finalMasterSku,
            prefix: finalMasterSku.substring(0, 2),
            category,
            gender,
            image_url: finalImageUrl,
            weight_g: Number(weight) || 0,
            secondary_weight_g: Number(secondaryWeight) || null,
            plating_type: plating,
            active_price: masterEstimatedCost,
            draft_price: masterEstimatedCost,
            selling_price: isSTX ? 0 : sellingPrice, // FORCE 0 FOR STX
            stock_qty: existingStockQty,
            sample_qty: existingSampleQty,
            is_component: isSTX,
            labor_casting: Number(labor.casting_cost),
            labor_setter: Number(labor.setter_cost),
            labor_technician: Number(labor.technician_cost),
            labor_plating_x: Number(labor.plating_cost_x || 0),
            labor_plating_d: Number(labor.plating_cost_d || 0),
            labor_subcontract: Number(labor.subcontract_cost || 0),
            labor_casting_manual_override: labor.casting_cost_manual_override,
            labor_technician_manual_override: labor.technician_cost_manual_override,
            labor_plating_x_manual_override: labor.plating_cost_x_manual_override,
            labor_plating_d_manual_override: labor.plating_cost_d_manual_override,
            production_type: productionType,
            // Ensure supplier_id is valid UUID or null
            supplier_id: (productionType === ProductionType.Imported && supplierId) ? supplierId : null,
            supplier_cost: productionType === ProductionType.Imported ? supplierCost : null,
            labor_stone_setting: productionType === ProductionType.Imported ? labor.stone_setting_cost : null 
        });

        if (prodError) throw prodError;

        if (variants.length > 0) {
            for (const v of variants) {
                const { data: existV } = await supabase.from('product_variants').select('stock_qty').match({ product_sku: finalMasterSku, suffix: v.suffix }).single();
                const vStock = existV ? existV.stock_qty : 0;

                const { error: varError } = await supabase.from('product_variants').upsert({
                    product_sku: finalMasterSku,
                    suffix: v.suffix,
                    description: v.description,
                    stock_qty: vStock,
                    active_price: v.active_price,
                    selling_price: isSTX ? 0 : v.selling_price // FORCE 0 FOR STX VARIANTS
                }, { onConflict: 'product_sku, suffix' });
                
                if (varError) throw varError;
            }
        }
        
        await supabase.from('recipes').delete().eq('parent_sku', finalMasterSku);
        if (productionType === ProductionType.InHouse && recipe.length > 0) {
            const recipeInserts = recipe.map(r => ({
                parent_sku: finalMasterSku,
                type: r.type,
                material_id: r.type === 'raw' ? r.id : null,
                component_sku: r.type === 'component' ? r.sku : null,
                quantity: r.quantity
            }));
             await supabase.from('recipes').insert(recipeInserts);
        }
        
        await supabase.from('product_molds').delete().eq('parent_sku', finalMasterSku);
        if (productionType === ProductionType.InHouse && selectedMolds.length > 0) {
             const moldInserts = selectedMolds.map(m => ({ 
                 product_sku: finalMasterSku, 
                 mold_code: m.code,
                 quantity: m.quantity
             }));
             await supabase.from('product_molds').insert(moldInserts);
        }

        await queryClient.invalidateQueries({ queryKey: ['products'] });
        await queryClient.refetchQueries({ queryKey: ['products'] });

        showToast(`Το προϊόν ${finalMasterSku} αποθηκεύτηκε με ${variants.length} παραλλαγές!`, "success");
        
        if (onCancel) onCancel();
        else {
            setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setVariants([]); setCurrentStep(1); setSecondaryWeight(0);
            setSupplierCost(0); setSupplierId('');
        }

    } catch (error: any) {
        console.error("Save error:", error);
        showToast(`Σφάλμα: ${error.message}`, "error");
    } finally {
        setIsUploading(false);
    }
  };

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, finalStepId));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));
  
  const secondaryWeightLabel = useMemo(() => {
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
  }, [gender, category]);

  const masterMargin = sellingPrice > 0 ? ((sellingPrice - masterEstimatedCost) / sellingPrice) * 100 : 0;

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-96px)] md:h-[calc(100vh-64px)] flex flex-col">
      {isRecipeModalOpen && (
        <RecipeItemSelectorModal
            type={isRecipeModalOpen}
            productCategory={category}
            allMaterials={materials}
            allProducts={products}
            onClose={() => setIsRecipeModalOpen(false)}
            onSelect={handleSelectRecipeItem}
        />
      )}
      
      {showAnalysisHelp && <AnalysisExplainerModal onClose={() => setShowAnalysisHelp(false)} />}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            {onCancel && (
                <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors">
                    <ArrowLeft size={24} />
                </button>
            )}
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-600">
                    <Wand2 size={24} />
                </div>
                Νέο Προϊόν
            </h1>
          </div>
          
          <div className="flex items-center gap-1 bg-white px-3 py-2 rounded-full shadow-sm border border-slate-100">
             {STEPS.map(s => (
                 <div key={s.id} className="flex items-center">
                    <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer
                        ${currentStep >= s.id ? 'bg-amber-500 text-white shadow-md shadow-amber-200' : 'bg-slate-100 text-slate-400'}
                    `} onClick={() => setCurrentStep(s.id)}>
                        {currentStep > s.id ? <CheckCircle size={14} /> : s.id}
                    </div>
                    {s.id !== finalStepId && <div className={`w-4 h-0.5 mx-1 rounded-full ${currentStep > s.id ? 'bg-amber-500' : 'bg-slate-200'}`} />}
                 </div>
             ))}
          </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col relative bg-white rounded-3xl shadow-lg shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-8 scroll-smooth custom-scrollbar">
            
            {currentStep === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right duration-300 fade-in">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                        <span>1. Βασικά Στοιχεία</span>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setProductionType(ProductionType.InHouse)}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${productionType === ProductionType.InHouse ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Hammer size={14}/> Εργαστήριο
                            </button>
                            <button
                                onClick={() => setProductionType(ProductionType.Imported)}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${productionType === ProductionType.Imported ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                <Globe size={14}/> Εισαγωγή
                            </button>
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
                                    {detectedSuffix && <div className="mt-2 text-xs bg-white text-blue-700 p-2 rounded flex items-center gap-1 border border-blue-100"><Lightbulb size={12}/> Η παραλλαγή <strong>{detectedSuffix}</strong> ({detectedVariantDesc}) έχει προετοιμαστεί.</div>}
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-bold text-blue-900 mb-1.5">Φύλο *</label>
                                        <select value={gender} onChange={(e) => { setGender(e.target.value as Gender); setIsGenderManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none"><option value="" disabled>Επιλέξτε</option><option value={Gender.Women}>Γυναικείο</option><option value={Gender.Men}>Ανδρικό</option><option value={Gender.Unisex}>Unisex</option></select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-blue-900 mb-1.5">Κατηγορία *</label>
                                        <input type="text" value={category} onChange={(e) => { setCategory(e.target.value); setIsCategoryManuallySet(true); }} className="w-full p-3 border border-blue-200 rounded-xl bg-white focus:ring-4 focus:ring-blue-500/20 outline-none" />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
                                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-2"><Hammer size={14}/> Τεχνικά Χαρακτηριστικά</div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1.5">Βασικό Βάρος (g) *</label>
                                        <input type="number" step="0.01" value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-slate-500/20 outline-none"/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-1.5">{secondaryWeightLabel}</label>
                                        <input type="number" step="0.01" value={secondaryWeight} onChange={e => setSecondaryWeight(parseFloat(e.target.value) || 0)} className="w-full p-3 border border-slate-200 rounded-xl font-bold bg-white focus:ring-4 focus:ring-slate-500/20 outline-none"/>
                                    </div>
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-1.5">
                                        Βασική Επιμετάλλωση (Master)
                                    </label>
                                    <select 
                                        value={plating} 
                                        onChange={(e) => { setPlating(e.target.value as PlatingType); }} 
                                        className="w-full p-3 border border-slate-200 rounded-xl bg-white focus:ring-4 focus:ring-slate-500/20 outline-none">
                                        <option value={PlatingType.None}>{platingNoneLabel}</option>
                                        <option value={PlatingType.GoldPlated}>Επίхρυσο (Gold)</option>
                                        <option value={PlatingType.TwoTone}>Δίχρωμο (Two-Tone)</option>
                                        <option value={PlatingType.Platinum}>Επιπλατινωμένο (Platinum)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 space-y-4">
                                <div className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-2"><DollarSign size={14}/> Τιμολόγηση</div>
                                <div className="flex gap-4">
                                    {productionType === ProductionType.InHouse && (
                                        <label className="flex-1 flex items-center gap-3 p-3 border border-emerald-200 rounded-xl bg-white cursor-pointer"><input type="checkbox" checked={isSTX} onChange={(e) => setIsSTX(e.target.checked)} className="h-5 w-5 text-emerald-600 rounded" /><span className="font-bold text-emerald-900">Είναι Εξάρτημα (STX);</span></label>
                                    )}
                                    {!isSTX && (
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Χονδρική (Βασική)</label>
                                            <div className="flex items-center gap-1"><input type="number" step="0.01" value={sellingPrice} onChange={e => setSellingPrice(parseFloat(e.target.value))} className="w-full p-2.5 border border-emerald-200 bg-white rounded-xl font-bold focus:ring-4 focus:ring-emerald-500/20 outline-none"/><span className="text-emerald-600 font-bold">€</span></div>
                                        </div>
                                    )}
                                </div>
                                {isSTX && <div className="text-xs text-emerald-700 italic flex items-center gap-1 bg-emerald-100/50 p-2 rounded"><Info size={14}/> Τα εξαρτήματα (STX) δεν έχουν τιμή πώλησης, μόνο κόστος παραγωγής.</div>}
                            </div>
                        </div>
                    </div>
                    {productionType === ProductionType.InHouse && (
                        <div className="pt-4 border-t border-slate-100">
                            <label className="block text-sm font-bold text-amber-700 mb-3">Λάστιχα</label>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    {selectedMolds.length > 0 && (
                                        <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                                            <h5 className="text-xs font-bold text-amber-700 uppercase mb-2">Επιλεγμένα</h5>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedMolds.map(m => (
                                                    <div key={m.code} className="bg-white border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm">
                                                        {m.code}{m.quantity > 1 ? ` (x${m.quantity})` : ''}
                                                        <button onClick={() => removeMold(m.code)} className="text-amber-400 hover:text-red-500 ml-1"><X size={14}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 h-64 flex flex-col gap-3">
                                        <div className="relative shrink-0">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                                            <input type="text" placeholder="Αναζήτηση..." value={moldSearch} onChange={e => setMoldSearch(e.target.value)} className="w-full pl-9 p-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/>
                                        </div>
                                        <div className="overflow-y-auto custom-scrollbar flex-1 pr-1">
                                            {otherMolds.concat(suggestedMolds).map(m => {
                                                const selected = selectedMolds.find(sm => sm.code === m.code);
                                                return (
                                                    <div key={m.code} className={`flex items-center gap-2 text-sm p-2 rounded-lg border mb-1 transition-colors ${selected ? 'bg-amber-50 border-amber-200' : 'bg-white border-transparent hover:border-slate-200'}`}>
                                                        <div onClick={() => addMold(m.code)} className="flex-1 cursor-pointer flex items-center gap-2">
                                                            <span className={`font-mono font-bold ${selected ? 'text-amber-800' : 'text-slate-700'}`}>{m.code}</span>
                                                            <span className="text-xs text-slate-400 truncate">{m.description}</span>
                                                        </div>
                                                        {selected ? (
                                                            <div className="flex items-center gap-1 bg-white rounded-md border border-amber-200 shadow-sm">
                                                                <button onClick={() => updateMoldQuantity(m.code, -1)} className={`p-1 hover:bg-slate-100 text-slate-500 ${selected.quantity === 1 ? 'opacity-30 cursor-not-allowed' : ''}`} disabled={selected.quantity === 1}><Minus size={12}/></button>
                                                                <span className="text-xs font-bold w-6 text-center">{selected.quantity}</span>
                                                                <button onClick={() => updateMoldQuantity(m.code, 1)} className="p-1 hover:bg-slate-100 text-slate-500"><Plus size={12}/></button>
                                                                <div className="w-px h-4 bg-slate-100 mx-1"></div>
                                                                <button onClick={() => removeMold(m.code)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-r-md"><X size={12}/></button>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => addMold(m.code)} className="text-slate-300 hover:text-amber-500"><Plus size={16}/></button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-200 hover:border-amber-300 transition-all group flex flex-col gap-3 h-full">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-400 group-hover:text-amber-500 uppercase tracking-wide transition-colors"><Plus size={14} /> Νέο Λάστιχο</div>
                                    <input type="text" placeholder="Κωδικός *" value={newMoldCode} onChange={e => setNewMoldCode(e.target.value.toUpperCase())} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all uppercase placeholder-slate-400"/>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" placeholder="Τοποθεσία" value={newMoldLoc} onChange={e => setNewMoldLoc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/>
                                        <input type="text" placeholder="Περιγραφή" value={newMoldDesc} onChange={e => setNewMoldDesc(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all placeholder-slate-400"/>
                                    </div>
                                    <button onClick={handleQuickCreateMold} disabled={isCreatingMold} className="mt-auto w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center">{isCreatingMold ? <Loader2 size={16} className="animate-spin" /> : 'Δημιουργία & Επιλογή'}</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {currentStep === 2 && productionType === ProductionType.InHouse && (
                <div className="space-y-4 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4 flex justify-between items-center">
                        2. Συνταγή (Bill of Materials)
                    </h3>
                    
                    <div className="flex items-center gap-3 p-3 bg-slate-100 rounded-xl border border-slate-200 shadow-sm">
                        <div className="p-2 bg-white rounded-lg border border-slate-100 text-slate-600">
                            <Coins size={16} />
                        </div>
                        <div className="flex-1">
                            <div className="font-bold text-slate-800 text-sm">Ασήμι 925 (Βάση)</div>
                            <div className="text-xs text-slate-400 font-mono">
                                {formatDecimal(weight)}g @ {formatDecimal(settings?.silver_price_gram, 3)}€/g (+{formatDecimal(settings?.loss_percentage, 1)}%)
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="font-mono font-bold text-slate-800 text-lg">
                                {formatCurrency(costBreakdown?.silver)}
                            </div>
                        </div>
                    </div>

                    {recipe.map((item, idx) => {
                        const itemDetails = item.type === 'raw' 
                            ? materials.find(m => m.id === item.id) 
                            : products.find(p => p.sku === item.sku);
                        const name = item.type === 'raw' 
                            ? (itemDetails as Material | undefined)?.name || "Άγνωστο"
                            : (itemDetails as Product | undefined)?.sku || "Άγνωστο";
                        const icon = item.type === 'raw' ? getMaterialIcon((itemDetails as Material)?.type) : getMaterialIcon('Component');
                        
                        return (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border bg-white shadow-sm border-slate-100">
                            <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">{icon}</div>
                            <div className="flex-1">
                               <div className="font-bold text-slate-800 text-sm">{name}</div>
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1 text-center">Ποσότητα</label>
                                <input type="number" value={item.quantity} onChange={(e) => updateRecipeItem(idx, 'quantity', e.target.value)} className="w-full p-2 bg-slate-50 rounded-lg font-bold text-center outline-none border border-slate-200 focus:border-blue-400"/>
                            </div>
                            <button onClick={() => removeRecipeItem(idx)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto"><Trash2 size={18} /></button>
                        </div>
                    )})}
                    
                    {recipe.length === 0 && <div className="text-center italic text-slate-400 py-4 text-xs">Μόνο Υλικό Βάσης (Ασήμι).</div>}

                    <div className="flex gap-2 pt-4 border-t border-slate-100">
                        <button type="button" onClick={() => setIsRecipeModalOpen('raw')} className="text-xs bg-purple-50 text-purple-700 px-4 py-3 rounded-xl font-bold border border-purple-200 flex items-center gap-2 hover:bg-purple-100 transition-all flex-1 justify-center"><Plus size={16}/> Προσθήκη Υλικού</button>
                        <button type="button" onClick={() => setIsRecipeModalOpen('component')} className="text-xs bg-blue-50 text-blue-700 px-4 py-3 rounded-xl font-bold border border-blue-200 flex items-center gap-2 hover:bg-blue-100 transition-all flex-1 justify-center"><PackageOpen size={16}/> Προσθήκη STX</button>
                    </div>
                </div>
            )}

            {currentStep === 2 && productionType === ProductionType.Imported && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">2. Κοστολόγηση Εισαγωγής</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: Inputs */}
                        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-100 shadow-lg shadow-emerald-50 space-y-4">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl"> <Calculator size={24} /> </div>
                                <div>
                                    <h4 className="font-black text-lg text-slate-800">Υπολογισμός Κόστους</h4>
                                    <p className="text-xs text-slate-500 font-medium">Συμπληρώστε τα παρακάτω πεδία.</p>
                                </div>
                            </div>

                            <LaborCostCard icon={<Hammer size={14}/>} label="Εργατικά (€/g)" value={labor.technician_cost} onChange={val => setLabor({...labor, technician_cost: val})} hint="Κόστος εργασίας ανά γραμμάριο"/>
                            <LaborCostCard icon={<Coins size={14}/>} label="Επιμετάλλωση (€/g)" value={labor.plating_cost_x} onChange={val => setLabor({...labor, plating_cost_x: val})} hint="Κόστος επιμετάλλωσης ανά γραμμάριο"/>
                            <LaborCostCard icon={<Gem size={14}/>} label="Καρφωτικά/Πέτρες (€)" value={labor.stone_setting_cost} onChange={val => setLabor({...labor, stone_setting_cost: val})} hint="Σταθερό κόστος"/>
                        </div>
                        
                        {/* Right: Breakdown */}
                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">
                                <Calculator size={14}/> Ανάλυση Κόστους (Live)
                            </h4>
                            <div className="space-y-1 flex-1">
                                <SummaryRow label="Ασήμι" value={costBreakdown?.silver || 0} sub={`${weight}g @ ${settings?.silver_price_gram}€`} color="bg-slate-400" />
                                <SummaryRow label="Εργατικά" value={costBreakdown?.details?.technician_cost || 0} sub={`${formatDecimal(labor.technician_cost)}€ x ${weight}g`} color="bg-blue-400" />
                                <SummaryRow label="Επιμετάλλωση" value={costBreakdown?.details?.plating_cost_x || 0} sub={`${formatDecimal(labor.plating_cost_x)}€ x ${weight}g`} color="bg-amber-400" />
                                <SummaryRow label="Καρφωτικά" value={costBreakdown?.details?.stone_setting_cost || 0} sub="Σταθερό" color="bg-purple-400" />
                            </div>
                            <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
                                <span className="font-bold text-slate-600 text-sm uppercase">Συνολο Κοστους</span>
                                <span className="font-black text-2xl text-emerald-700">{formatCurrency(masterEstimatedCost)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {currentStep === 3 && productionType === ProductionType.InHouse && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Εργατικά</h3>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                        <h4 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2"><Hammer size={18}/> Κόστη Εργατικών</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <LaborCostCard 
                                icon={<Flame size={14}/>} 
                                label="Χυτήριο (€)" 
                                value={labor.casting_cost}
                                onChange={val => setLabor({...labor, casting_cost: val})} 
                                isOverridden={labor.casting_cost_manual_override} 
                                onToggleOverride={() => setLabor(prev => ({...prev, casting_cost_manual_override: !prev.casting_cost_manual_override}))} 
                                hint="Από Συνολικό Βάρος"
                            />
                            <LaborCostCard icon={<Crown size={14}/>} label="Καρφωτής (€)" value={labor.setter_cost} onChange={val => setLabor({...labor, setter_cost: val})} />
                            <LaborCostCard 
                                icon={<Hammer size={14}/>} 
                                label="Τεχνίτης (€)" 
                                value={labor.technician_cost} 
                                onChange={val => setLabor({...labor, technician_cost: val})} 
                                isOverridden={labor.technician_cost_manual_override} 
                                onToggleOverride={() => setLabor(prev => ({...prev, technician_cost_manual_override: !prev.technician_cost_manual_override}))} 
                            />
                            <LaborCostCard 
                                icon={<Coins size={14}/>} 
                                label="Επιμετάλλωση X/H (€)" 
                                value={labor.plating_cost_x} 
                                onChange={val => setLabor({...labor, plating_cost_x: val})} 
                                isOverridden={labor.plating_cost_x_manual_override} 
                                onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_x_manual_override: !prev.plating_cost_x_manual_override}))} 
                                hint="Από Βασικό Βάρος" 
                            />
                            <LaborCostCard 
                                icon={<Coins size={14}/>} 
                                label="Επιμετάλλωση D (€)" 
                                value={labor.plating_cost_d} 
                                onChange={val => setLabor({...labor, plating_cost_d: val})} 
                                isOverridden={labor.plating_cost_d_manual_override} 
                                onToggleOverride={() => setLabor(prev => ({...prev, plating_cost_d_manual_override: !prev.plating_cost_d_manual_override}))} 
                                hint="Από Β' Βάρος" 
                            />
                            <LaborCostCard 
                                icon={<Users size={14}/>} 
                                label="Φασόν / Έξτρα (€)" 
                                value={labor.subcontract_cost} 
                                onChange={val => setLabor({...labor, subcontract_cost: val})} 
                            />
                        </div>
                    </div>
                </div>
            )}
            
            {currentStep === (productionType === ProductionType.Imported ? 3 : 4) && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">
                        {productionType === ProductionType.Imported ? '3. Παραλλαγές' : '4. Παραλλαγές'}
                    </h3>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <h4 className="font-bold text-sm text-slate-600 mb-2">Προσθήκη Νέας Παραλλαγής</h4>
                        <div className={`grid gap-2 w-full items-end ${isSTX ? 'grid-cols-[100px_1fr_auto]' : 'grid-cols-[100px_1fr_120px_auto]'}`}>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Κατάληξη (Suffix) *</label>
                                <input ref={suffixInputRef} type="text" placeholder="π.χ. P, XKR" value={newVariantSuffix} onChange={e => setNewVariantSuffix(e.target.value.toUpperCase())} className="w-full p-2 border border-slate-200 rounded-lg font-mono text-sm uppercase min-w-0 bg-white text-slate-800"/>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Περιγραφή</label>
                                <input type="text" placeholder="π.χ. Πατίνα, Επίхρυσο - Κορνεόλη" value={newVariantDesc} onChange={e => setNewVariantDesc(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800"/>
                            </div>
                            {!isSTX && (
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Χονδρική (€)</label>
                                    <input type="number" value={newVariantPrice} onChange={e => setNewVariantPrice(parseFloat(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-sm min-w-0 bg-white text-slate-800 font-bold"/>
                                </div>
                            )}
                            <button onClick={handleAddVariant} className="bg-[#060b00] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-black transition-colors flex items-center justify-center h-10"><Plus size={16}/></button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {variants.map((variant, index) => (
                            <div key={index} className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 transition-all">
                            <div className="font-mono font-bold text-lg text-emerald-600 w-16 text-center bg-emerald-50 rounded-lg py-2">{variant.suffix}</div>
                            <input type="text" value={variant.description} onChange={e => updateVariant(index, 'description', e.target.value)} placeholder="Περιγραφή" className="flex-1 md:w-48 p-2 border border-slate-200 rounded-lg text-sm bg-white focus:border-emerald-500 outline-none text-slate-800"/>
                                <div className="text-xs text-slate-400">Κόστος: <span className="font-bold text-slate-600">{(variant.active_price || 0).toFixed(2)}€</span></div>
                                {!isSTX && <div className="text-xs text-slate-400">Χονδρική: <span className="font-bold text-slate-600">{(variant.selling_price || 0).toFixed(2)}€</span></div>}
                            <button onClick={() => removeVariant(index)} className="ml-auto md:ml-2 p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-auto"><Trash2 size={18}/></button>
                            </div>
                        ))}
                        {variants.length === 0 && <div className="text-center text-slate-400 py-6 italic text-sm">Δεν υπάρχουν παραλλαγές. Θα αποθηκευτεί μόνο το Master προϊόν.</div>}
                    </div>
                </div>
            )}
            
            {currentStep === finalStepId && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                    <div className="flex gap-6 items-start">
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
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Users size={12}/> {gender}</span>
                                <span className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded"><Palette size={12}/> {platingNoneLabel}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-200 pb-2">
                                <Calculator size={14}/> Ανάλυση Κόστους (Master)
                            </h4>
                            <div className="space-y-1 flex-1">
                                {productionType === ProductionType.InHouse ? (
                                    <>
                                        <SummaryRow label="Ασήμι" value={costBreakdown?.silver || 0} sub={`${weight}g @ ${settings?.silver_price_gram}€`} color="bg-slate-400" />
                                        <SummaryRow label="Υλικά" value={costBreakdown?.materials || 0} color="bg-purple-400" />
                                        <SummaryRow label="Εργατικά" value={costBreakdown?.labor || 0} color="bg-blue-400" />
                                    </>
                                ) : (
                                    <>
                                        <SummaryRow label="Ασήμι" value={costBreakdown?.silver || 0} sub={`${weight}g @ ${settings?.silver_price_gram}€`} color="bg-slate-400" />
                                        <SummaryRow label="Εργατικά" value={costBreakdown?.labor || 0} color="bg-blue-400" />
                                        <SummaryRow label="Υλικά" value={costBreakdown?.materials || 0} color="bg-purple-400" />
                                    </>
                                )}
                                
                                {productionType === ProductionType.InHouse && (
                                <div className="ml-4 pl-4 border-l-2 border-slate-200 mt-1 space-y-1">
                                    <div className="flex justify-between text-[10px] text-slate-500"><span>Χυτήριο</span><span>{(costBreakdown?.details?.casting_cost || 0).toFixed(2)}€</span></div>
                                    <div className="flex justify-between text-[10px] text-slate-500"><span>Καρφωτής</span><span>{(costBreakdown?.details?.setter_cost || 0).toFixed(2)}€</span></div>
                                    <div className="flex justify-between text-[10px] text-slate-500"><span>Τεχνίτης</span><span>{(costBreakdown?.details?.technician_cost || 0).toFixed(2)}€</span></div>
                                    <div className="flex justify-between text-[10px] text-slate-500"><span>Φασόν</span><span>{(costBreakdown?.details?.subcontract_cost || 0).toFixed(2)}€</span></div>
                                </div>
                                )}
                                    
                                {productionType === ProductionType.InHouse && (labor.plating_cost_x > 0 || labor.plating_cost_d > 0) && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 border-dashed">
                                        <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Προσθετα (Ανα Παραλλαγη)</div>
                                        {labor.plating_cost_x > 0 && <div className="flex justify-between text-[10px] text-amber-600 font-medium"><span>Επιμετάλλωση (X/H)</span><span>+{labor.plating_cost_x.toFixed(2)}€</span></div>}
                                        {labor.plating_cost_d > 0 && <div className="flex justify-between text-[10px] text-amber-600 font-medium"><span>Επιμετάλλωση (D)</span><span>+{labor.plating_cost_d.toFixed(2)}€</span></div>}
                                    </div>
                                )}
                            </div>
                            <div className="pt-3 mt-3 border-t border-slate-200 flex justify-between items-center">
                                <span className="font-bold text-slate-600 text-sm uppercase">Σύνολο Κόστους</span>
                                <span className="font-black text-xl text-slate-800">{masterEstimatedCost.toFixed(2)}€</span>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
                            <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-slate-100 pb-2">
                                <Box size={14}/> Προδιαγραφές
                            </h4>
                            <div className="space-y-4 flex-1">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Συνταγή</div>
                                    {productionType === ProductionType.Imported ? (
                                        <div className="text-xs text-slate-500 italic">Προϊόν Εισαγωγής (Έτοιμο προς Πώληση)</div>
                                    ) : (
                                        recipe.length > 0 ? (
                                            <div className="space-y-1">
                                                {recipe.map((r, i) => {
                                                    let matName = '';
                                                    let iconNode: React.ReactNode = null;

                                                    if (r.type === 'raw') {
                                                        const mat = materials.find(m => m.id === r.id);
                                                        matName = mat ? mat.name : 'Άγνωστο Υλικό';
                                                        if (mat) iconNode = getMaterialIcon(mat.type);
                                                    } else {
                                                        matName = `STX: ${r.sku}`;
                                                        iconNode = getMaterialIcon('Component');
                                                    }

                                                    return (
                                                        <div key={i} className="flex justify-between items-center text-xs bg-slate-50 p-1.5 rounded border border-slate-100">
                                                            <div className="flex items-center gap-2 min-w-0">{iconNode}<span className="text-slate-700 truncate">{matName}</span></div>
                                                            <span className="font-mono font-bold text-slate-500 pl-2">x{r.quantity}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : <div className="text-xs text-slate-400 italic">Μόνο μέταλλο βάσης.</div>
                                    )}
                                </div>
                                {productionType === ProductionType.InHouse && (
                                    <div>
                                        <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">Λάστιχα</div>
                                        {selectedMolds.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {selectedMolds.map(m => (
                                                    <span key={m.code} className="px-2 py-1 bg-amber-50 text-amber-800 text-[10px] font-bold rounded border border-amber-100">{m.code}{m.quantity > 1 ? ` (x${m.quantity})` : ''}</span>
                                                ))}
                                            </div>
                                        ) : <div className="text-xs text-slate-400 italic">Κανένα.</div>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-amber-50 p-5 rounded-2xl border border-amber-100 shadow-sm flex flex-col">
                            <h4 className="font-bold text-amber-800 mb-4 flex items-center gap-2 uppercase text-xs tracking-wider border-b border-amber-200 pb-2">
                                <DollarSign size={14}/> Εμπορική Πολιτική (Master)
                            </h4>
                            <div className="flex-1 flex flex-col justify-center space-y-4 text-center">
                                {!isSTX ? (
                                    <>
                                    <div>
                                        <div className="text-xs font-bold text-amber-700/60 uppercase mb-1">Χονδρική Τιμή</div>
                                        <div className="text-4xl font-black text-amber-600 tracking-tight">{sellingPrice.toFixed(2)}€</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white/60 p-2 rounded-lg">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Κέρδος</div>
                                            <div className="font-bold text-emerald-600">{(sellingPrice - masterEstimatedCost).toFixed(2)}€</div>
                                        </div>
                                        <div className="bg-white/60 p-2 rounded-lg">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Margin</div>
                                            <div className="font-bold text-blue-600">{masterMargin.toFixed(0)}%</div>
                                        </div>
                                    </div>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-amber-800/50 italic text-sm">
                                        Εξάρτημα (Internal Cost Only)
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2"><Layers size={16}/> Παραλλαγές ({variants.length})</h4>
                        </div>
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                                <tr>
                                    <th className="p-4 w-24">Suffix</th>
                                    <th className="p-4">Περιγραφή</th>
                                    <th className="p-4 text-right">Κόστος</th>
                                    {!isSTX && <th className="p-4 text-right">Χονδρική</th>}
                                    {!isSTX && <th className="p-4 text-right">Κέρδος</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {variants.length > 0 ? variants.map((v, idx) => {
                                    const cost = v.active_price || masterEstimatedCost;
                                    const price = v.selling_price || sellingPrice;
                                    const profit = price - cost;
                                    const margin = price > 0 ? (profit / price) * 100 : 0;
                                    
                                    const diff = cost - masterEstimatedCost;
                                    const hasDiff = Math.abs(diff) > 0.01;
                                    const { stone } = getVariantComponents(v.suffix, gender as Gender);

                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="p-4 font-mono font-bold text-emerald-700 bg-emerald-50/30">{v.suffix}</td>
                                            <td className="p-4 font-medium text-slate-700">{v.description}</td>
                                            <td className="p-4 text-right">
                                                <div className="font-mono text-slate-600">{cost.toFixed(2)}€</div>
                                                {hasDiff && (
                                                    <div className={`text-[10px] font-bold ${diff > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(2)}€ {stone.code}
                                                    </div>
                                                )}
                                            </td>
                                            {!isSTX && <td className="p-4 text-right font-bold text-amber-600">{price.toFixed(2)}€</td>}
                                            {!isSTX && (
                                            <td className="p-4 text-right">
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${margin >= 50 ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {margin.toFixed(0)}%
                                                </span>
                                            </td>
                                            )}
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={isSTX ? 3 : 5} className="p-8 text-center text-slate-400 italic">
                                            Δεν υπάρχουν παραλλαγές. Θα αποθηκευτεί μόνο το Master προϊόν.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white/50 backdrop-blur-sm flex justify-between items-center">
                <button onClick={prevStep} disabled={currentStep === 1} className="flex items-center gap-2 px-5 py-3 rounded-xl text-slate-500 hover:bg-slate-100 font-bold disabled:opacity-50"><ArrowLeft size={16}/> Πίσω</button>
                
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">Βήμα {currentStep}/{finalStepId}: {STEPS.find(s => s.id === currentStep)?.title}</span>
                </div>

                {currentStep < finalStepId && <button onClick={nextStep} className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 text-white hover:bg-black font-bold shadow-md">Επόμενο <ArrowRight size={16}/></button>}
                {currentStep === finalStepId && (
                    <button onClick={handleSubmit} disabled={isUploading} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-200 hover:-translate-y-0.5 transition-all">
                    {isUploading ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} {isUploading ? 'Αποθήκευση...' : 'Ολοκλήρωση & Αποθήκευση'}
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}