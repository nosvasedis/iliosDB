import React, { useMemo } from 'react';
import { GlobalSettings, LaborCost, Product } from '../../types';
import { hasMixedTechnicianVariants, shouldUseSplitTechnicianCost } from '../../utils/pricingEngine';
import {
    applyFormulaRateChange,
    applyFormulaTotalChange,
    getCastingFormulaLine,
    getPlatingDFormulaLine,
    getPlatingXFormulaLine,
    getTechnicianFormulaLine,
    syncPrimaryWeightFromTotalBasis,
    syncSecondaryWeightFromPlatingDBasis,
    type LaborFormulaField,
} from '../../utils/laborFormula';

const OVERRIDE_KEYS: Record<LaborFormulaField, keyof LaborCost> = {
    casting: 'casting_cost_manual_override',
    technician: 'technician_cost_manual_override',
    plating_x: 'plating_cost_x_manual_override',
    plating_d: 'plating_cost_d_manual_override',
};

/** Formula lines (rate × weight basis) and their edit handlers for the labor section. */
export function useLaborFormulas(
    editedProduct: Product,
    setEditedProduct: React.Dispatch<React.SetStateAction<Product>>,
    settings: GlobalSettings,
    allProducts: Product[],
) {
    const useSplitTechnician = useMemo(
        () => shouldUseSplitTechnicianCost(editedProduct),
        [editedProduct.plating_type, editedProduct.gender, editedProduct.variants],
    );
    const hasMixedTechnician = useMemo(
        () => hasMixedTechnicianVariants(editedProduct),
        [editedProduct.plating_type, editedProduct.gender, editedProduct.variants],
    );

    const castingFormula = useMemo(
        () => getCastingFormulaLine(editedProduct.labor, editedProduct, settings),
        [editedProduct.labor, editedProduct.weight_g, editedProduct.secondary_weight_g, editedProduct.is_component, settings, editedProduct.skip_casting],
    );
    const technicianFormula = useMemo(
        () => getTechnicianFormulaLine(editedProduct.labor, editedProduct, useSplitTechnician, settings),
        [editedProduct.labor, editedProduct.weight_g, editedProduct.secondary_weight_g, editedProduct.is_component, useSplitTechnician, settings, editedProduct.skip_casting],
    );
    const platingXFormula = useMemo(
        () => getPlatingXFormulaLine(editedProduct.labor, editedProduct, allProducts, settings),
        [editedProduct.labor, editedProduct.weight_g, editedProduct.recipe, allProducts, settings, editedProduct.skip_casting],
    );
    const platingDFormula = useMemo(
        () => getPlatingDFormulaLine(editedProduct.labor, editedProduct, allProducts, settings),
        [editedProduct.labor, editedProduct.secondary_weight_g, editedProduct.recipe, allProducts, settings, editedProduct.skip_casting],
    );

    const patchLabor = (patch: Partial<LaborCost>, productPatch?: Partial<Product>) => {
        setEditedProduct(prev => ({ ...prev, ...productPatch, labor: { ...prev.labor, ...patch } }));
    };

    const onRateChange = (field: LaborFormulaField, rate: number, weightBasis: number) => {
        patchLabor(applyFormulaRateChange(field, rate, weightBasis));
    };

    const onTotalChange = (field: LaborFormulaField, total: number) => {
        patchLabor(applyFormulaTotalChange(field, total));
    };

    const onToggleOverride = (field: LaborFormulaField) => {
        const key = OVERRIDE_KEYS[field];
        patchLabor({ [key]: !editedProduct.labor[key] } as Partial<LaborCost>);
    };

    const onCastingWeightChange = (newBasis: number) => {
        patchLabor(
            applyFormulaRateChange('casting', castingFormula.rate, newBasis),
            { weight_g: syncPrimaryWeightFromTotalBasis(editedProduct, newBasis) },
        );
    };

    const onTechnicianWeightChange = (newBasis: number) => {
        const weight_g = editedProduct.is_component ? newBasis : syncPrimaryWeightFromTotalBasis(editedProduct, newBasis);
        patchLabor(applyFormulaRateChange('technician', technicianFormula.rate, newBasis), { weight_g });
    };

    const onPlatingDWeightChange = (newBasis: number) => {
        patchLabor(
            applyFormulaRateChange('plating_d', platingDFormula.rate, newBasis),
            { secondary_weight_g: syncSecondaryWeightFromPlatingDBasis(editedProduct, allProducts, newBasis) },
        );
    };

    return {
        useSplitTechnician,
        hasMixedTechnician,
        castingFormula,
        technicianFormula,
        platingXFormula,
        platingDFormula,
        onRateChange,
        onTotalChange,
        onToggleOverride,
        onCastingWeightChange,
        onTechnicianWeightChange,
        onPlatingDWeightChange,
    };
}

export type LaborFormulas = ReturnType<typeof useLaborFormulas>;
