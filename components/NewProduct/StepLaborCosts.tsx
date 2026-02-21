import React from 'react';
import { Hammer, Flame, Crown, Coins, Users } from 'lucide-react';
import { useNewProductState } from '../../hooks/useNewProductState';
import { LaborCostCard } from '../ProductRegistry/LaborCostCard';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
}

export const StepLaborCosts: React.FC<Props> = ({ formState }) => {
    const { state, setters } = formState;

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <h3 className="text-xl font-bold text-slate-800 border-b border-slate-100 pb-4">3. Εργατικά</h3>
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <h4 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2"><Hammer size={18} /> Κόστη Εργατικών</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <LaborCostCard
                        icon={<Flame size={14} />}
                        label="Χυτήριο (€)"
                        value={state.labor.casting_cost}
                        onChange={val => setters.setLabor({ ...state.labor, casting_cost: val })}
                        isOverridden={state.labor.casting_cost_manual_override}
                        onToggleOverride={() => setters.setLabor({ ...state.labor, casting_cost_manual_override: !state.labor.casting_cost_manual_override })}
                        hint="Από Συνολικό Βάρος"
                    />
                    <LaborCostCard
                        icon={<Crown size={14} />}
                        label="Καρφωτής (€)"
                        value={state.labor.setter_cost}
                        onChange={val => setters.setLabor({ ...state.labor, setter_cost: val })}
                    />
                    <LaborCostCard
                        icon={<Hammer size={14} />}
                        label="Τεχνίτης (€)"
                        value={state.labor.technician_cost}
                        onChange={val => setters.setLabor({ ...state.labor, technician_cost: val })}
                        isOverridden={state.labor.technician_cost_manual_override}
                        onToggleOverride={() => setters.setLabor({ ...state.labor, technician_cost_manual_override: !state.labor.technician_cost_manual_override })}
                    />
                    <LaborCostCard
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση X/H (€)"
                        value={state.labor.plating_cost_x}
                        onChange={val => setters.setLabor({ ...state.labor, plating_cost_x: val })}
                        isOverridden={state.labor.plating_cost_x_manual_override}
                        onToggleOverride={() => setters.setLabor({ ...state.labor, plating_cost_x_manual_override: !state.labor.plating_cost_x_manual_override })}
                        hint="Από Συνολικό Βάρος (Βασικό+Comp+Sec)"
                    />
                    <LaborCostCard
                        icon={<Coins size={14} />}
                        label="Επιμετάλλωση D (€)"
                        value={state.labor.plating_cost_d}
                        onChange={val => setters.setLabor({ ...state.labor, plating_cost_d: val })}
                        isOverridden={state.labor.plating_cost_d_manual_override}
                        onToggleOverride={() => setters.setLabor({ ...state.labor, plating_cost_d_manual_override: !state.labor.plating_cost_d_manual_override })}
                        hint="Από Β' Βάρος"
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
