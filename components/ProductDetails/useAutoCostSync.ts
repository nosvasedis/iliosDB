import React, { useEffect } from 'react';
import { GlobalSettings, LaborCost, Material, Product, ProductionType } from '../../types';
import { estimateVariantCost, shouldUseSplitTechnicianCost } from '../../utils/pricingEngine';
import { computeAutoLaborCosts, getPlatingDWeightBasis } from '../../utils/laborFormula';
import { getPricingRules } from '../../utils/pricingRules';

/**
 * Keeps auto-derived labor costs and per-variant cost prices in sync with the
 * edited product, exactly as the SKU card always has (manual overrides win).
 */
export function useAutoCostSync(
    editedProduct: Product,
    setEditedProduct: React.Dispatch<React.SetStateAction<Product>>,
    settings: GlobalSettings,
    allMaterials: Material[],
    allProducts: Product[],
) {
    useEffect(() => {
        setEditedProduct(prev => {
            const labor = { ...prev.labor };
            let changed = false;

            const mergeLabor = (updates: Partial<LaborCost>) => {
                for (const [key, val] of Object.entries(updates)) {
                    const k = key as keyof LaborCost;
                    if (labor[k] !== val) {
                        (labor as Record<string, unknown>)[k] = val;
                        changed = true;
                    }
                }
            };

            if (prev.production_type === ProductionType.InHouse) {
                mergeLabor(computeAutoLaborCosts(prev, allProducts, shouldUseSplitTechnicianCost(prev), settings));
            } else if (prev.production_type === ProductionType.Imported) {
                if (!prev.labor.plating_cost_x_manual_override && prev.labor.plating_cost_x === 0) {
                    mergeLabor({ plating_cost_x: getPricingRules(settings).plating_rate });
                }
                if (!prev.labor.plating_cost_d_manual_override) {
                    const dWeight = getPlatingDWeightBasis(prev, allProducts);
                    mergeLabor({ plating_cost_d: parseFloat((dWeight * getPricingRules(settings).plating_rate).toFixed(2)) });
                }
            }

            return changed ? { ...prev, labor } : prev;
        });
    }, [
        editedProduct.weight_g,
        editedProduct.secondary_weight_g,
        editedProduct.recipe,
        editedProduct.production_type,
        editedProduct.is_component,
        editedProduct.plating_type,
        editedProduct.gender,
        editedProduct.variants?.length,
        editedProduct.variants,
        editedProduct.labor.casting_cost_manual_override,
        editedProduct.labor.technician_cost_manual_override,
        editedProduct.labor.plating_cost_x_manual_override,
        editedProduct.labor.plating_cost_d_manual_override,
        allProducts,
        settings,
    ]);

    useEffect(() => {
        setEditedProduct(prev => {
            if (!prev.variants || prev.variants.length === 0) return prev;

            let hasChanges = false;
            const updatedVariants = prev.variants.map(v => {
                const { total: estimated } = estimateVariantCost(prev, v.suffix, settings, allMaterials, allProducts);
                if (Math.abs((v.active_price || 0) - estimated) > 0.005) {
                    hasChanges = true;
                    return { ...v, active_price: estimated };
                }
                return v;
            });

            return hasChanges ? { ...prev, variants: updatedVariants } : prev;
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
}
