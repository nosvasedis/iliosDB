import React, { useMemo } from 'react';
import { Hammer, Flame, Crown, Coins, Users } from 'lucide-react';
import { useNewProductState } from '../../hooks/useNewProductState';
import { LaborCostCard } from '../ProductRegistry/LaborCostCard';
import { LaborCostFormulaRow } from '../ProductRegistry/LaborCostFormulaRow';
import { TechnicianLaborFormulaRow } from '../ProductRegistry/TechnicianLaborFormulaRow';
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
import { shouldUseSplitTechnicianCost, hasMixedTechnicianVariants } from '../../utils/pricingEngine';
import { Gender, LaborCost } from '../../types';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    allProducts: import('../../types').Product[];
}

export const StepLaborCosts: React.FC<Props> = ({ formState, allProducts }) => {
    const { state, setters } = formState;
    const productLike = useMemo(() => ({
        weight_g: state.weight,
        secondary_weight_g: state.secondaryWeight,
        is_component: state.isSTX,
        recipe: state.recipe,
        plating_type: state.plating,
        gender: state.gender || Gender.Unisex,
        variants: state.variants,
    }), [state.weight, state.secondaryWeight, state.isSTX, state.recipe, state.plating, state.gender, state.variants]);

    const useSplitTechnician = useMemo(
        () => shouldUseSplitTechnicianCost(productLike),
        [productLike.plating_type, productLike.gender, productLike.variants],
    );
    const hasMixedTechnician = useMemo(
        () => hasMixedTechnicianVariants(productLike as import('../../types').Product),
        [productLike.plating_type, productLike.gender, productLike.variants],
    );

    const castingFormula = useMemo(
        () => getCastingFormulaLine(state.labor, productLike),
        [state.labor, productLike],
    );
    const platingXFormula = useMemo(
        () => getPlatingXFormulaLine(state.labor, productLike, allProducts),
        [state.labor, productLike, allProducts],
    );
    const platingDFormula = useMemo(
        () => getPlatingDFormulaLine(state.labor, productLike, allProducts),
        [state.labor, productLike, allProducts],
    );

    const patchLabor = (patch: Partial<LaborCost>, weightPatch?: { weight?: number; secondaryWeight?: number }) => {
        setters.setLabor({ ...state.labor, ...patch });
        if (weightPatch?.weight !== undefined) setters.setWeight(weightPatch.weight);
        if (weightPatch?.secondaryWeight !== undefined) setters.setSecondaryWeight(weightPatch.secondaryWeight);
    };

    const handleFormulaRateChange = (field: LaborFormulaField, rate: number, weightBasis: number) => {
        patchLabor(applyFormulaRateChange(field, rate, weightBasis));
    };

    const handleFormulaTotalChange = (field: LaborFormulaField, total: number) => {
        patchLabor(applyFormulaTotalChange(field, total));
    };

    const toggleOverride = (field: LaborFormulaField) => {
        const keys: Record<LaborFormulaField, keyof LaborCost> = {
            casting: 'casting_cost_manual_override',
            technician: 'technician_cost_manual_override',
            plating_x: 'plating_cost_x_manual_override',
            plating_d: 'plating_cost_d_manual_override',
        };
        const key = keys[field];
        patchLabor({ [key]: !state.labor[key] } as Partial<LaborCost>);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Εργατικά</h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h4 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2"><Hammer size={18} /> Κόστη Εργατικών</h4>
                <div className="space-y-2">
                    <LaborCostFormulaRow
                        icon={<Flame size={14} />}
                        label="Χυτήριο (€)"
                        rate={castingFormula.rate}
                        weightBasis={castingFormula.weightBasis}
                        total={castingFormula.total}
                        isOverridden={castingFormula.isOverridden}
                        onRateChange={(r) => handleFormulaRateChange('casting', r, castingFormula.weightBasis)}
                        onWeightChange={(w) => {
                            const weight = syncPrimaryWeightFromTotalBasis(productLike, w);
                            patchLabor(applyFormulaRateChange('casting', castingFormula.rate, w), { weight });
                        }}
                        onTotalChange={(t) => handleFormulaTotalChange('casting', t)}
                        onToggleOverride={() => toggleOverride('casting')}
                        hint={state.isSTX ? 'Εξάρτημα STX — χωρίς χυτήριο' : 'Από συνολικό βάρος'}
                    />
                    <LaborCostCard
                        icon={<Crown size={14} />}
                        label="Καρφωτής (€)"
                        value={state.labor.setter_cost}
                        onChange={val => setters.setLabor({ ...state.labor, setter_cost: val })}
                    />
                    <TechnicianLaborFormulaRow
                        icon={<Hammer size={14} />}
                        labor={state.labor}
                        product={productLike}
                        useSplitTechnician={useSplitTechnician}
                        hasMixedTechnician={hasMixedTechnician}
                        onRateChange={(r, basis) => handleFormulaRateChange('technician', r, basis)}
                        onWeightChange={(w) => {
                            const { rate } = getTechnicianFormulaLine(state.labor, productLike, useSplitTechnician);
                            if (state.isSTX) {
                                patchLabor(applyFormulaRateChange('technician', rate, w), { weight: w });
                            } else {
                                const weight = syncPrimaryWeightFromTotalBasis(productLike, w);
                                patchLabor(applyFormulaRateChange('technician', rate, w), { weight });
                            }
                        }}
                        onTotalChange={(t) => handleFormulaTotalChange('technician', t)}
                        onToggleOverride={() => toggleOverride('technician')}
                    />
                    <LaborCostFormulaRow
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση X/H (€)"
                        rate={platingXFormula.rate}
                        weightBasis={platingXFormula.weightBasis}
                        total={platingXFormula.total}
                        isOverridden={platingXFormula.isOverridden}
                        onRateChange={(r) => handleFormulaRateChange('plating_x', r, platingXFormula.weightBasis)}
                        onWeightChange={() => {}}
                        onTotalChange={(t) => handleFormulaTotalChange('plating_x', t)}
                        onToggleOverride={() => toggleOverride('plating_x')}
                        weightReadOnly
                        hint="Από συνολικό βάρος (βασικό + εξαρτήματα)"
                    />
                    <LaborCostFormulaRow
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση D (€)"
                        rate={platingDFormula.rate}
                        weightBasis={platingDFormula.weightBasis}
                        total={platingDFormula.total}
                        isOverridden={platingDFormula.isOverridden}
                        onRateChange={(r) => handleFormulaRateChange('plating_d', r, platingDFormula.weightBasis)}
                        onWeightChange={(w) => {
                            const secondaryWeight = syncSecondaryWeightFromPlatingDBasis(productLike, allProducts, w);
                            patchLabor(applyFormulaRateChange('plating_d', platingDFormula.rate, w), { secondaryWeight });
                        }}
                        onTotalChange={(t) => handleFormulaTotalChange('plating_d', t)}
                        onToggleOverride={() => toggleOverride('plating_d')}
                        hint="Από δευτερεύον βάρος"
                    />
                    <LaborCostCard
                        icon={<Users size={14} />}
                        label="Φασόν / Έξτρα (€)"
                        value={state.labor.subcontract_cost}
                        onChange={val => setters.setLabor({ ...state.labor, subcontract_cost: val })}
                    />
                </div>
            </div>
        </div>
    );
};
