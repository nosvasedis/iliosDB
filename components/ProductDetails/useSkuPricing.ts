import React, { useState } from 'react';
import { GlobalSettings, Material, Product, ProductVariant } from '../../types';
import { estimateVariantCost, getIliosSuggestedPriceForProduct, roundPrice } from '../../utils/pricingEngine';
import { formatNumber } from '../../utils/numberFormat';

type ShowToast = (message: string, type: 'success' | 'error' | 'info') => void;

/** Selling-price suggestions and bulk repricing for the SKU card. */
export function useSkuPricing({
    editedProduct,
    setEditedProduct,
    settings,
    allMaterials,
    allProducts,
    finishGroups,
    masterCost,
    showToast,
}: {
    editedProduct: Product;
    setEditedProduct: React.Dispatch<React.SetStateAction<Product>>;
    settings: GlobalSettings;
    allMaterials: Material[];
    allProducts: Product[];
    finishGroups: Record<string, ProductVariant[]>;
    masterCost: number;
    showToast: ShowToast;
}) {
    const [showRepriceTool, setShowRepriceTool] = useState(false);
    const [targetMargin, setTargetMargin] = useState(50);
    const [calculatedPrice, setCalculatedPrice] = useState(0);
    const hasVariants = (editedProduct.variants?.length ?? 0) > 0;

    const updateCalculatedPrice = (margin: number) => {
        const marginDecimal = margin / 100;
        if (marginDecimal >= 1) {
            setCalculatedPrice(0);
            return;
        }
        setCalculatedPrice(roundPrice(masterCost / (1 - marginDecimal), settings));
    };

    const handleStandardFormula = () => {
        const suggested = getIliosSuggestedPriceForProduct(editedProduct, null, settings, allMaterials, allProducts);
        setCalculatedPrice(suggested);
        if (suggested > 0 && suggested > masterCost) {
            const impliedMargin = ((suggested - masterCost) / suggested) * 100;
            setTargetMargin(parseFloat(impliedMargin.toFixed(1)));
        }
    };

    const applyReprice = () => {
        setEditedProduct(prev => ({ ...prev, selling_price: calculatedPrice, selling_price_manual_override: false }));
    };

    /** Per-variant suggestion so stone/material differences are priced precisely. */
    const getSuggestedPriceForVariant = (suffix: string, mode: 'formula' | 'margin' = 'formula', margin: number = 0) => {
        if (mode === 'formula') {
            return getIliosSuggestedPriceForProduct(editedProduct, hasVariants ? suffix : null, settings, allMaterials, allProducts);
        }
        const { total } = estimateVariantCost(editedProduct, suffix, settings, allMaterials, allProducts);
        const marginDecimal = margin / 100;
        if (marginDecimal >= 1) return 0;
        return roundPrice(total / (1 - marginDecimal), settings);
    };

    /** Finish-group hint uses the group's first variant as representative. */
    const getSuggestedPriceForFinishGroup = (finishCode: string, mode: 'formula' | 'margin' = 'formula', margin: number = 0) => {
        const representative = (finishGroups[finishCode] || [])[0];
        return getSuggestedPriceForVariant(representative ? representative.suffix : '', mode, margin);
    };

    const handleApplyAllSuggestions = (mode: 'formula' | 'margin') => {
        const updates = [...(editedProduct.variants || [])];
        let masterPriceUpdate = editedProduct.selling_price;
        let updateCount = 0;

        updates.forEach((variant, idx) => {
            const suggested = getSuggestedPriceForVariant(variant.suffix, mode, targetMargin);
            if (Math.abs((variant.selling_price || 0) - suggested) > 0.01) {
                updates[idx] = { ...variant, selling_price: suggested, selling_price_manual_override: false };
                updateCount++;
            }
        });

        if (!hasVariants) {
            const suggested = getSuggestedPriceForVariant('', mode, targetMargin);
            if (Math.abs(masterPriceUpdate - suggested) > 0.01) {
                masterPriceUpdate = suggested;
                updateCount++;
            }
        }

        setEditedProduct(prev => ({
            ...prev,
            variants: updates,
            selling_price: !hasVariants ? masterPriceUpdate : prev.selling_price,
            selling_price_manual_override: !hasVariants ? false : prev.selling_price_manual_override,
        }));

        if (updateCount > 0) {
            showToast(`Ενημερώθηκαν ${formatNumber(updateCount)} τιμές (με ανάλυση υλικών/πετρών).`, 'success');
        } else {
            showToast('Οι τιμές είναι ήδη ενημερωμένες.', 'info');
        }
    };

    const applyFormulaToVariant = (suffix: string) => {
        const suggested = getSuggestedPriceForVariant(suffix, 'formula');
        setEditedProduct(prev => ({
            ...prev,
            variants: (prev.variants || []).map(v => v.suffix === suffix
                ? { ...v, selling_price: suggested, selling_price_manual_override: false }
                : v),
        }));
        showToast(`Τιμή για ${suffix}: ${formatNumber(suggested)}€`, 'success');
    };

    return {
        showRepriceTool,
        toggleRepriceTool: () => setShowRepriceTool(prev => !prev),
        targetMargin,
        setTargetMargin,
        calculatedPrice,
        updateCalculatedPrice,
        handleStandardFormula,
        applyReprice,
        getSuggestedPriceForFinishGroup,
        handleApplyAllSuggestions,
        applyFormulaToVariant,
    };
}

export type SkuPricing = ReturnType<typeof useSkuPricing>;
