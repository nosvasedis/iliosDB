import { useState, useEffect, useMemo, useRef } from 'react';
import { Product, Material, Gender, PlatingType, RecipeItem, LaborCost, ProductVariant, ProductionType, Mold, ProductMold } from '../types';
import { parseSku, calculateProductCost, analyzeSku, calculateTechnicianCost, estimateVariantCost, analyzeSuffix, getVariantComponents, calculateSuggestedWholesalePrice } from '../utils/pricingEngine';
import { supabase, uploadProductImage } from '../lib/supabase';
import { compressImage } from '../utils/imageHelpers';
import { api } from '../lib/supabase';
import { FINISH_CODES } from '../constants';
import { getSteps, availableFinishes } from '../components/ProductRegistry/constants';
import { useQueryClient } from '@tanstack/react-query';

export interface UseNewProductStateProps {
    products: Product[];
    materials: Material[];
    molds: Mold[];
    settings?: any;
    suppliers?: any[];
    duplicateTemplate?: Product;
    showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    onCancel?: () => void;
}

export const useNewProductState = ({ products, materials, molds, settings, suppliers, duplicateTemplate, showToast, onCancel }: UseNewProductStateProps) => {
    const queryClient = useQueryClient();

    const [currentStep, setCurrentStep] = useState(1);
    const [productionType, setProductionType] = useState<ProductionType>(ProductionType.InHouse);
    const [sku, setSku] = useState('');
    const [category, setCategory] = useState('');
    const [gender, setGender] = useState<Gender | ''>('');
    const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false);
    const [isGenderManuallySet, setIsGenderManuallySet] = useState(false);
    const [stxDescription, setStxDescription] = useState('');
    const [isAssembly, setIsAssembly] = useState(false);

    const [weight, setWeight] = useState(0);
    const [secondaryWeight, setSecondaryWeight] = useState(0);
    const [plating, setPlating] = useState<PlatingType>(PlatingType.None);
    const [selectedFinishes, setSelectedFinishes] = useState<string[]>(['']);
    const [finishPrices, setFinishPrices] = useState<Record<string, number>>({});
    const [bridge, setBridge] = useState('');

    const [supplierId, setSupplierId] = useState<string>('');
    const [supplierSku, setSupplierSku] = useState<string>('');
    const [supplierCost, setSupplierCost] = useState(0);
    const [sellingPrice, setSellingPrice] = useState(0);

    const [recipe, setRecipe] = useState<RecipeItem[]>([]);
    const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<false | 'raw' | 'component'>(false);

    const [labor, setLabor] = useState<LaborCost>({
        casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0,
        plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0,
        casting_cost_manual_override: false, technician_cost_manual_override: false,
        plating_cost_x_manual_override: false, plating_cost_d_manual_override: false
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

    // EFFECTS
    useEffect(() => {
        if (duplicateTemplate) {
            setProductionType(duplicateTemplate.production_type);
            setCategory(duplicateTemplate.category);
            setGender(duplicateTemplate.gender);
            setIsCategoryManuallySet(true);
            setIsGenderManuallySet(true);
            setWeight(duplicateTemplate.weight_g);
            setSecondaryWeight(duplicateTemplate.secondary_weight_g || 0);
            setPlating(duplicateTemplate.plating_type);
            setSupplierId(duplicateTemplate.supplier_id || '');
            setSupplierSku(duplicateTemplate.supplier_sku || '');
            setSupplierCost(duplicateTemplate.supplier_cost || 0);
            setRecipe(duplicateTemplate.recipe || []);
            setLabor(duplicateTemplate.labor ? { ...duplicateTemplate.labor } : {
                casting_cost: 0, setter_cost: 0, technician_cost: 0, stone_setting_cost: 0,
                plating_cost_x: 0, plating_cost_d: 0, subcontract_cost: 0,
                casting_cost_manual_override: false, technician_cost_manual_override: false,
                plating_cost_x_manual_override: false, plating_cost_d_manual_override: false
            });
            setSelectedMolds(duplicateTemplate.molds || []);
            setStxDescription(duplicateTemplate.description || '');
            setIsSTX(duplicateTemplate.is_component || false);
        }
    }, [duplicateTemplate]);

    useEffect(() => {
        if (isAssembly) {
            setWeight(0);
            setSecondaryWeight(0);
        }
    }, [isAssembly]);

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

                const finishCode = getVariantComponents(analysis.suffix, gender as Gender).finish.code;
                setSelectedFinishes(prev => {
                    if (!prev.includes(finishCode)) return [...prev, finishCode];
                    return prev;
                });
            } else {
                setDetectedMasterSku(skuTrimmed.toUpperCase());
                setDetectedSuffix('');
                setDetectedVariantDesc('');
                setPlating(analysis.detectedPlating);
                setBridge(analysis.detectedBridge || '');
            }
        } else {
            setCategory(''); setGender(''); setIsSTX(false);
            setDetectedMasterSku(''); setDetectedSuffix(''); setDetectedVariantDesc('');
            setIsCategoryManuallySet(false); setIsGenderManuallySet(false); setBridge('');
        }
    }, [sku, gender]);

    useEffect(() => {
        const platingMap: Record<string, string> = {
            [PlatingType.None]: '',
            [PlatingType.GoldPlated]: 'X',
            [PlatingType.TwoTone]: 'D',
            [PlatingType.Platinum]: 'H'
        };
        const masterCode = platingMap[plating] || '';
        if (finishPrices[masterCode] !== undefined) {
            setSellingPrice(finishPrices[masterCode]);
        }
    }, [finishPrices, plating]);

    useEffect(() => { if (detectedSuffix && !variants.some(v => v.suffix === detectedSuffix)) { setNewVariantSuffix(detectedSuffix); setNewVariantDesc(detectedVariantDesc); } }, [detectedSuffix, detectedVariantDesc, variants]);
    useEffect(() => { setNewVariantPrice(sellingPrice); }, [sellingPrice]);
    useEffect(() => { if (isSTX) { setSellingPrice(0); setNewVariantPrice(0); } }, [isSTX]);
    useEffect(() => { if (productionType === ProductionType.InHouse && !labor.technician_cost_manual_override) setLabor(prev => ({ ...prev, technician_cost: isSTX ? weight * 0.50 : calculateTechnicianCost(weight) })); }, [weight, labor.technician_cost_manual_override, productionType, isSTX]);
    useEffect(() => { if (productionType === ProductionType.InHouse && !labor.casting_cost_manual_override) setLabor(prev => ({ ...prev, casting_cost: isSTX ? 0 : (weight + secondaryWeight) * 0.15 })); }, [weight, secondaryWeight, productionType, isSTX, labor.casting_cost_manual_override]);
    useEffect(() => {
        if (!labor.plating_cost_x_manual_override) {
            if (productionType === ProductionType.Imported) { if (labor.plating_cost_x === 0) setLabor(prev => ({ ...prev, plating_cost_x: 0.60 })); }
            else {
                let total = weight + secondaryWeight;
                recipe.forEach(item => { if (item.type === 'component') { const sub = products.find(p => p.sku === item.sku); if (sub) total += sub.weight_g * item.quantity; } });
                setLabor(prev => ({ ...prev, plating_cost_x: parseFloat((total * 0.60).toFixed(2)) }));
            }
        }
    }, [weight, secondaryWeight, recipe, products, labor.plating_cost_x_manual_override, productionType]);
    useEffect(() => { if (!labor.plating_cost_d_manual_override) { let total = secondaryWeight || 0; recipe.forEach(item => { if (item.type === 'component') { const sub = products.find(p => p.sku === item.sku); if (sub) total += ((sub.secondary_weight_g || 0) * item.quantity); } }); setLabor(prev => ({ ...prev, plating_cost_d: parseFloat((total * 0.60).toFixed(2)) })); } }, [secondaryWeight, recipe, products, labor.plating_cost_d_manual_override]);

    useEffect(() => {
        if (newVariantSuffix) {
            const desc = analyzeSuffix(newVariantSuffix, gender as Gender, plating);
            if (desc) setNewVariantDesc(desc);
        }
    }, [newVariantSuffix, gender, plating]);

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

    // ACTIONS AND LOGIC
    const platingMasterLabel = useMemo(() => {
        if (selectedFinishes.length > 0) {
            return selectedFinishes.map(f => f ? FINISH_CODES[f] : 'Λουστρέ').join(', ');
        }
        const platingToCode: Record<string, string> = {
            [PlatingType.None]: '', [PlatingType.GoldPlated]: 'X', [PlatingType.TwoTone]: 'D', [PlatingType.Platinum]: 'H'
        };
        const code = platingToCode[plating];
        return FINISH_CODES[code] || 'Λουστρέ';
    }, [plating, selectedFinishes]);

    const genderLabel = useMemo(() => {
        const map: Record<string, string> = { [Gender.Men]: 'Ανδρικό', [Gender.Women]: 'Γυναικείο', [Gender.Unisex]: 'Unisex' };
        return map[gender] || gender;
    }, [gender]);

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
            const newMold: Mold = { code: newMoldCode.toUpperCase(), location: newMoldLoc, description: newMoldDesc, weight_g: 0 };
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

    const calculateWeightFromMolds = () => {
        const total = selectedMolds.reduce((sum, sm) => {
            const mold = molds.find(m => m.code === sm.code);
            return sum + ((mold?.weight_g || 0) * sm.quantity);
        }, 0);

        if (total > 0) {
            setWeight(total);
            showToast(`Βάρος ενημερώθηκε: ${total.toFixed(2)}g`, "success");
        } else {
            showToast("Δεν βρέθηκαν βάρη στα επιλεγμένα λάστιχα.", "info");
        }
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

    const handleApplyIliosFormula = () => {
        if (!settings) return;

        const updatedVariants = variants.map(v => {
            const est = estimateVariantCost(currentTempProduct, v.suffix, settings, materials, products);
            const silverCost = est.breakdown.silver;
            const laborCost = est.breakdown.labor;
            const materialCost = est.breakdown.materials;
            const totalWeight = est.breakdown.details?.total_weight || (weight + secondaryWeight);

            const suggested = calculateSuggestedWholesalePrice(totalWeight, silverCost, laborCost, materialCost);
            return { ...v, selling_price: suggested };
        });

        setVariants(updatedVariants);
        if (updatedVariants.length > 0) {
            setSellingPrice(updatedVariants[0].selling_price || 0);
        }
        showToast("Εφαρμόστηκε ο Τύπος Ilios σε όλες τις παραλλαγές!", "success");
    };

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
            if (!masterPlatingCode && finishCode !== '') fullSuffix += finishCode;
            fullSuffix += upperStoneSuffix;

            if (fullSuffix === '' && variants.some(v => v.suffix === '')) return;
            if (variants.some(v => v.suffix === fullSuffix)) return;

            const { total: estimatedCost } = estimateVariantCost(currentTempProduct, fullSuffix, settings!, materials, products);
            const desc = analyzeSuffix(fullSuffix, gender as Gender, plating);
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
        if (!sku) { showToast("Το SKU είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }
        if (!category) { showToast("Η Κατηγορία είναι υποχρεωτική", "error"); setCurrentStep(1); return; }
        if (!gender) { showToast("Το Φύλο είναι υποχρεωτικό", "error"); setCurrentStep(1); return; }
        if (!isAssembly && (!weight || weight <= 0)) {
            showToast("Το Βάρος (g) είναι υποχρεωτικό για προϊόντα χύτευσης.", "error");
            setCurrentStep(1);
            return;
        }

        if (isAssembly && recipe.length === 0) {
            showToast("Ένα προϊόν συναρμολόγησης πρέπει να έχει τουλάχιστον ένα υλικό στη συνταγή.", "error");
            setCurrentStep(2);
            return;
        }

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
            else { setSku(''); setWeight(0); setRecipe([]); setSellingPrice(0); setSelectedMolds([]); setSelectedImage(null); setImagePreview(''); setVariants([]); setCurrentStep(1); setSecondaryWeight(0); setSupplierCost(0); setSupplierId(''); setSupplierSku(''); setStxDescription(''); setSelectedFinishes(['']); setBridge(''); setFinishPrices({}); setIsAssembly(false); }
        } catch (error: any) { console.error("Save error:", error); showToast(`Σφάλμα: ${error?.message || error}`, "error"); } finally { setIsUploading(false); }
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

    const finalStacks = useMemo(() => {
        const stacks = [];
        const hasX = variants.some(v => v.suffix.includes('X') || v.suffix.includes('H')) || [PlatingType.GoldPlated, PlatingType.Platinum].includes(plating);
        const hasD = variants.some(v => v.suffix.includes('D')) || plating === PlatingType.TwoTone;

        const getStackData = (type: 'X' | 'D' | 'Base') => {
            let est;
            if (type === 'Base') {
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
        if (stacks.length === 0) {
            stacks.push({ ...getStackData('Base'), label: 'Τελικό', colorClass: 'bg-slate-100 text-slate-500', borderClass: 'border-slate-200' });
        }
        return stacks;
    }, [variants, plating, currentTempProduct, settings, materials, products, labor, masterEstimatedCost]);


    return {
        state: {
            currentStep, STEPS, finalStepId,
            productionType, isAssembly,
            sku, detectedMasterSku, bridge, detectedSuffix, detectedVariantDesc,
            category, gender, genderLabel,
            imagePreview, selectedImage, isUploading,
            supplierId, supplierSku, supplierCost,
            weight, secondaryWeight, secondaryWeightLabel,
            plating, platingMasterLabel, selectedFinishes, finishPrices,
            sellingPrice, masterEstimatedCost, masterMargin,
            labor, recipe, recipeTotalCost, costBreakdown,
            isSTX, stxDescription,
            variants, newVariantSuffix, newVariantDesc, newVariantPrice, smartAddStoneSuffix,
            selectedMolds, moldSearch, otherMolds, suggestedMolds,
            newMoldCode, newMoldLoc, newMoldDesc, isCreatingMold,
            isRecipeModalOpen, showAnalysisHelp,
            finalStacks, currentTempProduct
        },
        setters: {
            setCurrentStep, nextStep, prevStep,
            setProductionType, setIsAssembly,
            setSku, setCategory, setGender, setIsCategoryManuallySet, setIsGenderManuallySet,
            setImagePreview, setSelectedImage,
            setSupplierId, setSupplierSku, setSupplierCost,
            setWeight, setSecondaryWeight, setPlating, setFinishPrices,
            setSellingPrice, setLabor, setStxDescription, setIsSTX,
            setNewVariantSuffix, setNewVariantDesc, setNewVariantPrice, setSmartAddStoneSuffix,
            setMoldSearch, setNewMoldCode, setNewMoldLoc, setNewMoldDesc,
            setIsRecipeModalOpen, setShowAnalysisHelp
        },
        actions: {
            handleImageSelect, toggleFinish, handleSubmit,
            handleSelectRecipeItem, updateRecipeItem, removeRecipeItem,
            addMold, updateMoldQuantity, removeMold, handleQuickCreateMold, calculateWeightFromMolds,
            handleAddVariant, handleSmartAddBatch, updateVariant, removeVariant, handleApplyIliosFormula,
            getVariantTypeInfo
        },
        refs: {
            suffixInputRef, stoneSuffixRef
        }
    };
}
