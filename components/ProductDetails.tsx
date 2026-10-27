import { useRestartDraft } from '../hooks/useRestartBlocker';
import { productDraftSnapshot } from '../lib/editorSnapshots';

import './ProductDetails/productDetails.css';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, Material, Gender, GlobalSettings, Collection, Mold, ProductionType } from '../types';
import { calculateProductCost } from '../utils/pricingEngine';
import { getPricingRules } from '../utils/pricingRules';
import { Info, Layers, ScanBarcode, Factory, Box, Hammer } from 'lucide-react';
import { AUTH_KEY_SECRET, CLOUDFLARE_WORKER_URL } from '../lib/supabase';
import { prepareUploadSource } from '../utils/imageHelpers';
import { uploadCatalogPhotoWithChoice } from '../utils/catalogPhotoUpload';
import { useQueryClient } from '@tanstack/react-query';
import { refreshErpProducts, removeProductsFromCache } from '../features/erpCatalog';
import { useUI } from './UIProvider';
import { useAuth } from './AuthContext';
import DetailsHeader from './ProductDetails/DetailsHeader';
import DetailsKpiStrip from './ProductDetails/DetailsKpiStrip';
import DetailsSidebar from './ProductDetails/DetailsSidebar';
import DetailsTabBar, { type DetailsTab } from './ProductDetails/DetailsTabBar';
import DetailsFooter from './ProductDetails/DetailsFooter';
import RecipeItemSelectorModal, { type RecipeSelection } from './ProductDetails/RecipeItemSelectorModal';
import OverviewInHousePanel from './ProductDetails/OverviewInHousePanel';
import OverviewImportedPanel from './ProductDetails/OverviewImportedPanel';
import MoldsSection, { EMPTY_MOLD_DRAFT, type MoldDraft } from './ProductDetails/MoldsSection';
import RecipeSection from './ProductDetails/RecipeSection';
import LaborSection from './ProductDetails/LaborSection';
import VariantsPanel from './ProductDetails/VariantsPanel';
import { DetailsSection, DetailsSubTabs } from './ProductDetails/detailsUi';
import { useAutoCostSync } from './ProductDetails/useAutoCostSync';
import { useSkuPricing } from './ProductDetails/useSkuPricing';
import { useLaborFormulas } from './ProductDetails/useLaborFormulas';
import { useSuppliers } from '../hooks/api/useSuppliers';
import {
    buildEditableProduct,
    buildVariantFinishGroups,
    getAnalyticalCostingItems,
    getImportedCostAnalysisDisplay,
    getSortedFinishCodes,
    getSortedProductVariants,
    getVariantIndexBySuffix,
    PLATING_LABELS,
    productsRepository,
    saveProductGraph,
} from '../features/products';
import { getSecondaryWeightLabel } from '../features/products/productDetailsViewModels';
import ConvertToInhouseModal from './ConvertToInhouseModal';
import ConvertToImportedModal from './ConvertToImportedModal';
import BarcodeGallery from './ProductRegistry/BarcodeGallery';
import { PrintLabelItem } from '../features/printing';
import { dispatchLiveActivity } from '../hooks/useLiveActivity';
import { resolveInvoiceTotalWeight } from '../utils/invoiceTotalWeight';

interface Props {
    product: Product;
    allProducts: Product[];
    allMaterials: Material[];
    onClose: () => void;
    onSave?: (updatedProduct: Product) => void;
    setPrintItems: (items: PrintLabelItem[]) => void;
    settings: GlobalSettings;
    collections: Collection[];
    allMolds: Mold[];
    viewMode?: 'registry' | 'warehouse';
    onDuplicate?: (product: Product) => void;
    initialVariantSuffix?: string;
    /** Allows details to open above an existing workflow modal. */
    zIndex?: number;
}

const GENDER_LABELS: Record<Gender, string> = {
    [Gender.Women]: 'Γυναικείο',
    [Gender.Men]: 'Ανδρικό',
    [Gender.Unisex]: 'Ουδέτερο',
};

export default function ProductDetails({ product, allProducts, allMaterials, onClose, onSave, setPrintItems, settings, collections, allMolds, viewMode = 'registry', onDuplicate, initialVariantSuffix, zIndex = 100 }: Props) {
    const queryClient = useQueryClient();
    const { showToast, confirm } = useUI();
    const { profile } = useAuth();
    const { data: suppliers } = useSuppliers();

    const [activeTab, setActiveTab] = useState<DetailsTab['id']>('overview');
    const [productionSection, setProductionSection] = useState<'recipe' | 'labor'>('recipe');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [viewIndex, setViewIndex] = useState(() => getVariantIndexBySuffix(
        getSortedProductVariants(product, product.variants || []),
        initialVariantSuffix,
    ));
    const [isVariantPickerOpen, setIsVariantPickerOpen] = useState(false);
    const variantPickerRef = useRef<HTMLDivElement | null>(null);

    // Rename SKU State
    const [isEditingSku, setIsEditingSku] = useState(false);
    const [tempSku, setTempSku] = useState(product.sku);
    const [isRenaming, setIsRenaming] = useState(false);

    const [isRecipeModalOpen, setIsRecipeModalOpen] = useState<false | 'raw' | 'component'>(false);
    const [editedProduct, setEditedProduct] = useState<Product>(() => buildEditableProduct(product));
    const [moldDraft, setMoldDraft] = useState<MoldDraft>(EMPTY_MOLD_DRAFT);
    const [isCreatingMold, setIsCreatingMold] = useState(false);

    const [isUploadingImage, setIsUploadingImage] = useState(false);
    const [isDeletingImage, setIsDeletingImage] = useState(false);
    const [showConvertModal, setShowConvertModal] = useState(false);
    const productRestart = useRestartDraft('Καρτέλα SKU', { product: productDraftSnapshot(editedProduct), tempSku, newMoldCode: moldDraft.open ? moldDraft.code : '', newMoldLoc: moldDraft.open ? moldDraft.location : '', newMoldDesc: moldDraft.open ? moldDraft.description : '' }, { identity: product.sku, busy: isSaving || isRenaming || isDeleting || isUploadingImage || isDeletingImage || isCreatingMold });

    const isInHouse = editedProduct.production_type === ProductionType.InHouse;

    const TABS = useMemo((): DetailsTab[] => {
        const baseTabs: DetailsTab[] = [{ id: 'overview', label: 'Στοιχεία', icon: Info }];
        if (isInHouse) baseTabs.push({ id: 'production', label: 'Παραγωγή', icon: Factory });
        baseTabs.push({ id: 'variants', label: 'Παραλλαγές', icon: Layers, count: editedProduct.variants?.length || 0 });
        baseTabs.push({ id: 'barcodes', label: 'Barcodes', icon: ScanBarcode });
        return baseTabs;
    }, [isInHouse, editedProduct.variants?.length]);

    useEffect(() => {
        if (!TABS.some((tab) => tab.id === activeTab)) setActiveTab('overview');
    }, [TABS, activeTab]);

    useEffect(() => {
        if (productRestart.dirty && editedProduct.sku === product.sku) return;
        const next = buildEditableProduct(product);
        productRestart.markSaved({
            product: productDraftSnapshot(next), tempSku: product.sku,
            newMoldCode: '', newMoldLoc: '', newMoldDesc: '',
        });
        setEditedProduct(next);
        setTempSku(product.sku); // Reset SKU field
        setViewIndex(getVariantIndexBySuffix(
            getSortedProductVariants(product, product.variants || []),
            initialVariantSuffix,
        ));
    }, [product, initialVariantSuffix]);

    useAutoCostSync(editedProduct, setEditedProduct, settings, allMaterials, allProducts);

    const currentCostCalc = calculateProductCost(editedProduct, settings, allMaterials, allProducts);
    const masterCost = currentCostCalc.total;
    const importedCostAnalysis = getImportedCostAnalysisDisplay(currentCostCalc);

    const variants = editedProduct.variants || [];
    const hasVariants = variants.length > 0;

    const sortedVariantsList = useMemo(() => {
        if (!hasVariants) return [];
        return getSortedProductVariants(editedProduct, variants);
    }, [variants, editedProduct.gender]);

    const maxViews = hasVariants ? sortedVariantsList.length : (product.production_type === ProductionType.InHouse ? 1 : 0);

    useEffect(() => {
        setIsVariantPickerOpen(false);
    }, [product.sku, viewIndex]);

    useEffect(() => {
        if (!isVariantPickerOpen) return;
        const handlePointerDown = (event: MouseEvent) => {
            if (variantPickerRef.current && !variantPickerRef.current.contains(event.target as Node)) {
                setIsVariantPickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [isVariantPickerOpen]);

    const normalizedViewIndex = hasVariants && maxViews > 0 ? viewIndex % maxViews : 0;
    const nextView = () => setViewIndex(prev => (prev + 1) % maxViews);
    const prevView = () => setViewIndex(prev => (prev - 1 + maxViews) % maxViews);

    const currentViewVariant = hasVariants ? sortedVariantsList[normalizedViewIndex] : null;

    let displayedSku = editedProduct.sku;
    let displayedLabel = 'Βασικό';
    let displayedCost = masterCost;
    let displayedPrice = editedProduct.selling_price;

    if (currentViewVariant) {
        displayedSku = `${editedProduct.sku}${currentViewVariant.suffix}`;
        displayedLabel = currentViewVariant.description || currentViewVariant.suffix;
        if (currentViewVariant.active_price != null) displayedCost = currentViewVariant.active_price;
        if (currentViewVariant.selling_price != null) displayedPrice = currentViewVariant.selling_price;
    }

    // Same rule as retail labels: wholesale × configured retail multiplier.
    const retailMultiplier = getPricingRules(settings).retail_multiplier;
    const displayedProfit = displayedPrice - displayedCost;
    const displayedMargin = displayedPrice > 0 ? (displayedProfit / displayedPrice) * 100 : 0;

    const finishGroups = useMemo(() => {
        if (!hasVariants) return {};
        return buildVariantFinishGroups(editedProduct, sortedVariantsList);
    }, [sortedVariantsList, editedProduct.gender, hasVariants]);

    const sortedFinishCodes = useMemo(() => getSortedFinishCodes(finishGroups), [finishGroups]);

    const pricing = useSkuPricing({ editedProduct, setEditedProduct, settings, allMaterials, allProducts, finishGroups, masterCost, showToast });
    const laborFormulas = useLaborFormulas(editedProduct, setEditedProduct, settings, allProducts);

    const secondaryWeightLabel = useMemo(
        () => getSecondaryWeightLabel(editedProduct.gender, editedProduct.category),
        [editedProduct.gender, editedProduct.category],
    );

    const invoiceTotalWeightResult = useMemo(
        () => resolveInvoiceTotalWeight(editedProduct, allProducts, allMaterials),
        [editedProduct, allProducts, allMaterials],
    );

    const analyticalCostingItems = useMemo(() => {
        return getAnalyticalCostingItems(hasVariants, sortedVariantsList, product.sku, editedProduct, settings, allMaterials, allProducts, currentCostCalc);
    }, [hasVariants, sortedVariantsList, product.sku, editedProduct, settings, allMaterials, allProducts, currentCostCalc]);

    const displayedComposition = useMemo(() => {
        const item = currentViewVariant ? analyticalCostingItems.find(i => i.suffix === currentViewVariant.suffix) : null;
        const breakdown = (item?.costResult ?? currentCostCalc).breakdown || {};
        return { silver: breakdown.silver || 0, materials: breakdown.materials || 0, labor: breakdown.labor || 0 };
    }, [analyticalCostingItems, currentViewVariant, currentCostCalc]);

    const componentUsageCount = useMemo(() => {
        if (!editedProduct.is_component) return 0;
        return allProducts.filter(p => p.recipe?.some(r => r.type === 'component' && r.sku === editedProduct.sku)).length;
    }, [allProducts, editedProduct.is_component, editedProduct.sku]);

    const recordFacts = useMemo(() => {
        const supplier = suppliers?.find(s => s.id === editedProduct.supplier_id);
        const facts: { label: string; value: React.ReactNode }[] = [
            { label: 'Κωδικός', value: <span className="font-mono">{editedProduct.sku}</span> },
            { label: 'Κατηγορία', value: editedProduct.category || '—' },
            { label: 'Φύλο', value: GENDER_LABELS[editedProduct.gender] || editedProduct.gender },
            { label: 'Επιμετάλλωση', value: hasVariants ? 'Ανά παραλλαγή' : (PLATING_LABELS[editedProduct.plating_type] || editedProduct.plating_type) },
        ];
        if (isInHouse) {
            facts.push({ label: 'Συνταγή', value: `${editedProduct.recipe.length} είδη` });
            facts.push({ label: 'Λάστιχα', value: editedProduct.molds.length ? <span className="font-mono">{editedProduct.molds.map(m => m.quantity > 1 ? `${m.code}×${m.quantity}` : m.code).join(', ')}</span> : '—' });
        } else {
            facts.push({ label: 'Προμηθευτής', value: supplier?.name || '—' });
            facts.push({ label: 'Κωδ. προμηθευτή', value: editedProduct.supplier_sku ? <span className="font-mono">{editedProduct.supplier_sku}</span> : '—' });
        }
        return facts;
    }, [editedProduct, hasVariants, isInHouse, suppliers]);

    const handleSelectRecipeItem = (item: RecipeSelection) => {
        setEditedProduct(prev => ({
            ...prev,
            recipe: [...prev.recipe, item.type === 'raw' ? { type: 'raw', id: item.id, quantity: 1 } : { type: 'component', sku: item.sku, quantity: 1 }],
        }));
        setIsRecipeModalOpen(false);
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const finalEditedProduct = { ...editedProduct };

            const isComponent = finalEditedProduct.sku.toUpperCase().startsWith('STX');
            const currentCost = calculateProductCost(finalEditedProduct, settings, allMaterials, allProducts).total;
            const previousVariants = product.variants || [];
            const nextVariants = finalEditedProduct.variants || [];
            const previousVariantMap = new Map(previousVariants.map(v => [v.suffix, v]));
            const nextVariantMap = new Map(nextVariants.map(v => [v.suffix, v]));
            const addedVariantSuffixes = nextVariants
                .map(v => v.suffix)
                .filter(suffix => !previousVariantMap.has(suffix));
            const deletedVariantSuffixes = previousVariants
                .map(v => v.suffix)
                .filter(suffix => !nextVariantMap.has(suffix));
            const updatedVariantSuffixes = nextVariants
                .filter(v => {
                    const previous = previousVariantMap.get(v.suffix);
                    if (!previous) return false;
                    return previous.description !== v.description ||
                        previous.active_price !== v.active_price ||
                        previous.selling_price !== v.selling_price;
                })
                .map(v => v.suffix);

            const { anyPartQueued } = await saveProductGraph({
                finalMasterSku: finalEditedProduct.sku,
                productData: {
                    sku: finalEditedProduct.sku,
                    prefix: finalEditedProduct.sku.substring(0, 2),
                    category: finalEditedProduct.category,
                    description: isComponent ? finalEditedProduct.description : null,
                    gender: finalEditedProduct.gender,
                    image_url: finalEditedProduct.image_url,
                    weight_g: finalEditedProduct.weight_g,
                    secondary_weight_g: finalEditedProduct.secondary_weight_g || null,
                    invoice_total_weight_g: finalEditedProduct.invoice_total_weight_g && finalEditedProduct.invoice_total_weight_g > 0
                        ? finalEditedProduct.invoice_total_weight_g
                        : null,
                    selling_price: isComponent ? 0 : finalEditedProduct.selling_price,
                    selling_price_manual_override: isComponent ? false : !!finalEditedProduct.selling_price_manual_override,
                    plating_type: finalEditedProduct.plating_type,
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
                    active_price: currentCost,
                    draft_price: currentCost,
                    is_component: isComponent,
                    skip_casting: !!finalEditedProduct.skip_casting,
                    production_type: finalEditedProduct.production_type,
                    supplier_id: (finalEditedProduct.production_type === ProductionType.Imported && finalEditedProduct.supplier_id) ? finalEditedProduct.supplier_id : undefined,
                    supplier_sku: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.supplier_sku : null,
                    supplier_cost: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.supplier_cost : null,
                    labor_stone_setting: finalEditedProduct.production_type === ProductionType.Imported ? finalEditedProduct.labor.stone_setting_cost : null
                },
                finalVariants: finalEditedProduct.variants || [],
                productionType: finalEditedProduct.production_type,
                recipe: finalEditedProduct.recipe,
                selectedMolds: finalEditedProduct.molds || [],
                isSTX: finalEditedProduct.is_component
            });

            await refreshErpProducts(queryClient, [finalEditedProduct.sku]);

            if (onSave) onSave(finalEditedProduct);
            if (!anyPartQueued) {
                const userName = profile?.full_name || 'Κάποιος';
                if (addedVariantSuffixes.length === 1 && deletedVariantSuffixes.length === 0 && updatedVariantSuffixes.length === 0) {
                    dispatchLiveActivity({ type: 'product_variant_created', userName, sku: finalEditedProduct.sku, variantSuffix: addedVariantSuffixes[0] });
                } else if (deletedVariantSuffixes.length === 1 && addedVariantSuffixes.length === 0 && updatedVariantSuffixes.length === 0) {
                    dispatchLiveActivity({ type: 'product_variant_deleted', userName, sku: finalEditedProduct.sku, variantSuffix: deletedVariantSuffixes[0] });
                } else if (updatedVariantSuffixes.length === 1 && addedVariantSuffixes.length === 0 && deletedVariantSuffixes.length === 0) {
                    dispatchLiveActivity({ type: 'product_variant_updated', userName, sku: finalEditedProduct.sku, variantSuffix: updatedVariantSuffixes[0] });
                } else {
                    const variantChangeCount = addedVariantSuffixes.length + deletedVariantSuffixes.length + updatedVariantSuffixes.length;
                    dispatchLiveActivity({ type: 'product_updated', userName, sku: finalEditedProduct.sku, count: variantChangeCount || undefined });
                }
            }
            showToast("Οι αλλαγές αποθηκεύτηκαν.", "success");
            onClose();
        } catch (err: any) {
            showToast(`Σφάλμα αποθήκευσης: ${err.message}`, "error");
        } finally {
            setIsSaving(false);
        }
    };

    // Ctrl/Cmd+S saves while this card is the top-most editor.
    const saveShortcutRef = useRef(handleSave);
    saveShortcutRef.current = handleSave;
    const shortcutBlocked = !!isRecipeModalOpen || showConvertModal;
    useEffect(() => {
        if (shortcutBlocked) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                void saveShortcutRef.current();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [shortcutBlocked]);

    /** Closing never silently drops edits: ask first when the card has unsaved changes. */
    const requestClose = async () => {
        if (isSaving) return;
        if (productRestart.dirty) {
            const discard = await confirm({
                title: 'Μη αποθηκευμένες αλλαγές',
                message: `Η καρτέλα ${editedProduct.sku} έχει αλλαγές που δεν έχουν αποθηκευτεί. Κλείσιμο χωρίς αποθήκευση;`,
                confirmText: 'Κλείσιμο χωρίς αποθήκευση',
                cancelText: 'Επιστροφή',
                isDestructive: true,
            });
            if (!discard) return;
        }
        onClose();
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
        const result = await productsRepository.deleteProduct(editedProduct.sku, editedProduct.image_url);

        if (result.success) {
            removeProductsFromCache(queryClient, [editedProduct.sku]);
            onClose();
            dispatchLiveActivity({ type: 'product_deleted', userName: profile?.full_name || 'Κάποιος', sku: editedProduct.sku });
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
                const compressedBlob = await prepareUploadSource(file);
                const publicUrl = await uploadCatalogPhotoWithChoice(compressedBlob, editedProduct.sku, confirm);
                if (publicUrl) {
                    setEditedProduct(prev => ({ ...prev, image_url: publicUrl }));
                    await productsRepository.saveProduct({ ...editedProduct, image_url: publicUrl });
                    productRestart.markSaved((saved: any) => ({ ...saved, product: { ...saved.product, image_url: publicUrl } }));
                    await refreshErpProducts(queryClient, [editedProduct.sku]);
                    showToast("Η φωτογραφία ενημερώθηκε.", "success");
                }
            } catch (error) {
                console.error(error);
                showToast("Σφάλμα κατά την ενημέρωση.", "error");
            } finally {
                setIsUploadingImage(false);
                e.target.value = '';
            }
        }
    };

    const handleDeleteImage = async () => {
        if (!editedProduct.image_url) return;

        const confirmed = await confirm({
            title: 'Διαγραφή Φωτογραφίας',
            message: `Είστε σίγουροι ότι θέλετε να διαγράψετε τη φωτογραφία; Η εικόνα θα διαγραφεί και από τον αποθηκευτικό χώρο.`,
            confirmText: 'Διαγραφή',
            isDestructive: true
        });
        if (!confirmed) return;

        setIsDeletingImage(true);
        try {
            // Extract filename from URL to delete from R2
            const urlParts = editedProduct.image_url.split('/');
            const fileName = urlParts[urlParts.length - 1];

            const response = await fetch(`${CLOUDFLARE_WORKER_URL}/${fileName}`, {
                method: 'DELETE',
                headers: { 'Authorization': AUTH_KEY_SECRET }
            });
            if (!response.ok) {
                throw new Error(`Failed to delete image: ${response.status}`);
            }

            const updatedProduct = { ...editedProduct, image_url: null };
            setEditedProduct(updatedProduct);
            await productsRepository.saveProduct(updatedProduct);
            productRestart.markSaved((saved: any) => ({ ...saved, product: { ...saved.product, image_url: null } }));
            // Bring in the updated SKU without a full catalogue download
            await refreshErpProducts(queryClient, [editedProduct.sku]);

            showToast("Η φωτογραφία διαγράφηκε επιτυχώς.", "success");
        } catch (error) {
            console.error('Error deleting image:', error);
            showToast("Σφάλμα κατά τη διαγραφή της φωτογραφίας.", "error");
        } finally {
            setIsDeletingImage(false);
        }
    };

    const handleRenameSku = async () => {
        if (!tempSku || tempSku === product.sku) {
            setIsEditingSku(false);
            return;
        }

        const newSku = tempSku.trim().toUpperCase();
        if (newSku.length < 3) {
            showToast("Το SKU πρέπει να έχει τουλάχιστον 3 χαρακτήρες.", "error");
            return;
        }
        if (allProducts.some(p => p.sku === newSku)) {
            showToast(`Το SKU ${newSku} υπάρχει ήδη.`, "error");
            return;
        }

        const confirmed = await confirm({
            title: 'Μετονομασία SKU',
            message: `Είστε σίγουροι ότι θέλετε να αλλάξετε το SKU από ${product.sku} σε ${newSku}; Αυτό θα ενημερώσει όλες τις σχετικές εγγραφές (Απόθεμα, Παραγγελίες, Παραλλαγές).`,
            confirmText: 'Μετονομασία',
            isDestructive: true
        });
        if (!confirmed) {
            setTempSku(product.sku);
            setIsEditingSku(false);
            return;
        }

        setIsRenaming(true);
        try {
            await productsRepository.renameProduct(product.sku, newSku);
            setEditedProduct(prev => ({ ...prev, sku: newSku }));
            productRestart.markSaved((saved: any) => ({ ...saved, tempSku: newSku, product: { ...saved.product, sku: newSku } }));
            removeProductsFromCache(queryClient, [product.sku]);
            await refreshErpProducts(queryClient, [newSku]);
            dispatchLiveActivity({ type: 'product_renamed', userName: profile?.full_name || 'Κάποιος', sku: newSku, oldSku: product.sku, newSku });
            showToast(`Επιτυχής μετονομασία σε ${newSku}`, "success");
        } catch (e: any) {
            console.error(e);
            showToast(`Σφάλμα: ${e.message || 'Αποτυχία μετονομασίας'}`, "error");
            setTempSku(product.sku); // Revert
        } finally {
            setIsRenaming(false);
            setIsEditingSku(false);
        }
    };

    const scopeLabel = currentViewVariant ? `${displayedSku} · ${displayedLabel}` : `${editedProduct.sku} · Βασικό`;

    const mainPortal = createPortal(
        <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-5 print:hidden" style={{ zIndex }}>
            {isRecipeModalOpen && (
                <RecipeItemSelectorModal
                    type={isRecipeModalOpen}
                    productCategory={editedProduct.category}
                    allMaterials={allMaterials}
                    allProducts={allProducts}
                    onClose={() => setIsRecipeModalOpen(false)}
                    onSelect={handleSelectRecipeItem}
                />
            )}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={requestClose} />
            <div role="dialog" aria-modal="true" aria-label={`Καρτέλα SKU ${displayedSku}`} className="sku-details relative flex h-[94vh] w-full max-w-[90rem] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-200">

                <DetailsHeader
                    displayedSku={displayedSku}
                    displayedLabel={displayedLabel}
                    gender={editedProduct.gender}
                    category={editedProduct.category}
                    imageUrl={editedProduct.image_url}
                    productionType={editedProduct.production_type}
                    isComponent={!!editedProduct.is_component}
                    skipCasting={!!editedProduct.skip_casting}
                    viewMode={viewMode}
                    isEditingSku={isEditingSku}
                    tempSku={tempSku}
                    isRenaming={isRenaming}
                    showPager={hasVariants}
                    variantPickerRef={variantPickerRef}
                    isVariantPickerOpen={isVariantPickerOpen}
                    sortedVariants={sortedVariantsList}
                    masterSku={editedProduct.sku}
                    normalizedViewIndex={normalizedViewIndex}
                    maxViews={maxViews}
                    onTempSkuChange={setTempSku}
                    onRenameSku={handleRenameSku}
                    onCancelRename={() => { setIsEditingSku(false); setTempSku(product.sku); }}
                    onStartRename={() => setIsEditingSku(true)}
                    onToggleVariantPicker={() => setIsVariantPickerOpen(prev => !prev)}
                    onSelectVariant={(index) => {
                        setViewIndex(index);
                        setIsVariantPickerOpen(false);
                    }}
                    onPrevView={prevView}
                    onNextView={nextView}
                    onConvert={() => setShowConvertModal(true)}
                    onDuplicate={onDuplicate ? () => onDuplicate(product) : undefined}
                    onDelete={requestDelete}
                    onClose={requestClose}
                    isDeleting={isDeleting}
                />

                <DetailsKpiStrip
                    isComponent={!!editedProduct.is_component}
                    scopeLabel={currentViewVariant ? displayedLabel : 'Βασικό'}
                    cost={displayedCost}
                    price={displayedPrice}
                    margin={displayedMargin}
                    retailMultiplier={retailMultiplier}
                    totalWeight={editedProduct.weight_g + (editedProduct.secondary_weight_g || 0)}
                    secondaryWeight={editedProduct.secondary_weight_g || 0}
                    variantCount={variants.length}
                    moldCount={editedProduct.molds.length}
                    usageCount={componentUsageCount}
                />

                {/* Below lg the whole body scrolls; from lg the sidebar and the tab content scroll independently under a fixed tab bar. */}
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 lg:flex-row lg:overflow-hidden">
                        <aside className="shrink-0 border-slate-200 bg-white/70 p-4 md:p-5 lg:w-[17.5rem] lg:overflow-y-auto lg:border-r xl:w-[19.5rem]">
                            <DetailsSidebar
                                sku={editedProduct.sku}
                                imageUrl={editedProduct.image_url}
                                isUploadingImage={isUploadingImage}
                                isDeletingImage={isDeletingImage}
                                onImageUpdate={handleImageUpdate}
                                onDeleteImage={handleDeleteImage}
                                composition={displayedComposition}
                                cost={displayedCost}
                                scopeLabel={scopeLabel}
                                facts={recordFacts}
                            />
                        </aside>

                        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
                            <div className="sticky top-0 z-[5] shrink-0 border-b border-slate-200 bg-white/95 px-3 backdrop-blur-sm md:px-5">
                                <DetailsTabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
                            </div>

                            <div className="flex-1 p-4 md:p-6 lg:overflow-y-auto">
                                {activeTab === 'overview' && (isInHouse ? (
                                    <OverviewInHousePanel
                                        product={editedProduct}
                                        setProduct={setEditedProduct}
                                        hasVariants={hasVariants}
                                        allMolds={allMolds}
                                        secondaryWeightLabel={secondaryWeightLabel}
                                        invoiceTotalWeightResult={invoiceTotalWeightResult}
                                        finishGroups={finishGroups}
                                        sortedFinishCodes={sortedFinishCodes}
                                        masterCost={masterCost}
                                        pricing={pricing}
                                        retailMultiplier={retailMultiplier}
                                        showToast={showToast}
                                    />
                                ) : (
                                    <OverviewImportedPanel
                                        product={editedProduct}
                                        setProduct={setEditedProduct}
                                        suppliers={suppliers || []}
                                        invoiceTotalWeightResult={invoiceTotalWeightResult}
                                        importedCostAnalysis={importedCostAnalysis}
                                        masterCost={masterCost}
                                        pricing={pricing}
                                        retailMultiplier={retailMultiplier}
                                    />
                                ))}

                                {activeTab === 'production' && (
                                    <div className="space-y-5 animate-in fade-in">
                                        <DetailsSubTabs<'recipe' | 'labor'>
                                            tabs={[
                                                { id: 'recipe', label: 'Συνταγή & Λάστιχα', icon: Box },
                                                { id: 'labor', label: 'Εργατικά & Ανάλυση', icon: Hammer },
                                            ]}
                                            active={productionSection}
                                            onChange={setProductionSection}
                                        />
                                        {productionSection === 'recipe' ? (
                                            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
                                                <RecipeSection
                                                    product={editedProduct}
                                                    setProduct={setEditedProduct}
                                                    allMaterials={allMaterials}
                                                    allProducts={allProducts}
                                                    settings={settings}
                                                    silverCost={currentCostCalc.breakdown.silver}
                                                    variantSuffix={currentViewVariant?.suffix}
                                                    onOpenSelector={setIsRecipeModalOpen}
                                                />
                                                <MoldsSection
                                                    product={editedProduct}
                                                    setProduct={setEditedProduct}
                                                    allMolds={allMolds}
                                                    draft={moldDraft}
                                                    setDraft={setMoldDraft}
                                                    isCreating={isCreatingMold}
                                                    setIsCreating={setIsCreatingMold}
                                                    showToast={showToast}
                                                />
                                            </div>
                                        ) : (
                                            <LaborSection
                                                product={editedProduct}
                                                setProduct={setEditedProduct}
                                                settings={settings}
                                                formulas={laborFormulas}
                                                variantSuffix={currentViewVariant?.suffix ?? null}
                                                costingItems={analyticalCostingItems}
                                                retailMultiplier={retailMultiplier}
                                                onViewVariant={(suffix) => {
                                                    const index = sortedVariantsList.findIndex(v => v.suffix === suffix);
                                                    if (index >= 0) setViewIndex(index);
                                                }}
                                            />
                                        )}
                                    </div>
                                )}

                                {activeTab === 'variants' && (
                                    <VariantsPanel
                                        product={editedProduct}
                                        setProduct={setEditedProduct}
                                        sortedVariants={sortedVariantsList}
                                        activeSuffix={currentViewVariant?.suffix ?? null}
                                        settings={settings}
                                        allMaterials={allMaterials}
                                        allProducts={allProducts}
                                        pricing={pricing}
                                        retailMultiplier={retailMultiplier}
                                        onViewVariant={setViewIndex}
                                        showToast={showToast}
                                    />
                                )}

                                {activeTab === 'barcodes' && (
                                    <div className="h-full animate-in fade-in">
                                        <DetailsSection tone="barcodes" icon={ScanBarcode} title="Barcodes" subtitle="Προεπισκόπηση & εκτύπωση ετικετών">
                                            <BarcodeGallery product={editedProduct} variants={sortedVariantsList} activeSuffix={currentViewVariant?.suffix ?? null} onPrint={setPrintItems} settings={settings} />
                                        </DetailsSection>
                                    </div>
                                )}
                            </div>
                        </div>
                </div>

                <DetailsFooter isSaving={isSaving} isDirty={productRestart.dirty} onSave={handleSave} onClose={requestClose} />
            </div>
        </div>,
        document.body
    );

    return (
        <>
            {mainPortal}
            {showConvertModal && editedProduct.production_type === ProductionType.Imported && (
                <ConvertToInhouseModal
                    product={editedProduct}
                    settings={settings}
                    allMaterials={allMaterials}
                    allProducts={allProducts}
                    onConfirm={(newProduct) => {
                        setEditedProduct(newProduct);
                        setShowConvertModal(false);
                        showToast('Μετατράπηκε σε Ιδιοπαραγωγή. Αποθηκεύστε για να ολοκληρωθεί η αλλαγή.', 'info');
                    }}
                    onClose={() => setShowConvertModal(false)}
                />
            )}
            {showConvertModal && editedProduct.production_type === ProductionType.InHouse && !editedProduct.is_component && (
                <ConvertToImportedModal
                    product={editedProduct}
                    settings={settings}
                    allMaterials={allMaterials}
                    allProducts={allProducts}
                    suppliers={suppliers || []}
                    onConfirm={(newProduct) => {
                        setEditedProduct(newProduct);
                        setShowConvertModal(false);
                        showToast('Μετατράπηκε σε Εισαγωγή. Αποθηκεύστε για να ολοκληρωθεί η αλλαγή.', 'info');
                    }}
                    onClose={() => setShowConvertModal(false)}
                />
            )}
        </>
    );
}
