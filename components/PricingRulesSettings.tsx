import React from 'react';
import { Calculator, RotateCcw } from 'lucide-react';
import type { GlobalSettings } from '../types';
import { DEFAULT_PRICING_RULES, getPricingRules, PRICING_RULE_FIELDS, validatePricingRules } from '../utils/pricingRules';
import { formatDecimal } from '../utils/pricingEngine';

interface Props {
  settings: GlobalSettings;
  onChange: (settings: GlobalSettings) => void;
}

export default function PricingRulesSettings({ settings, onChange }: Props) {
  const rules = { ...getPricingRules(), ...settings.pricing_rules };
  const error = validatePricingRules(rules);
  return (
    <section className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm md:p-8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><Calculator size={20} className="text-amber-600" /> Κόστη παραγωγής & Ilios Formula</h2>
          <p className="mt-2 text-sm text-slate-500">Επεξεργαστείτε τις προεπιλογές και πατήστε «Αποθήκευση Αλλαγών».</p>
        </div>
        <button type="button" onClick={() => onChange({ ...settings, pricing_rules: { ...DEFAULT_PRICING_RULES } })} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600"><RotateCcw size={14} /> Προεπιλογές</button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRICING_RULE_FIELDS.map(({ key, label, unit }) => (
          <label key={key} className="block text-xs font-bold text-slate-600">
            {label}
            <span className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400">
              <input type="number" min={key.includes('threshold') || key.includes('multiplier') ? '0.0001' : '0'} max="10000" step="0.01" value={Number.isFinite(rules[key]) ? rules[key] : ''} onChange={event => onChange({ ...settings, pricing_rules: { ...settings.pricing_rules, [key]: event.target.value === '' ? NaN : Number(event.target.value) } })} className="min-w-0 w-full bg-transparent py-3 font-mono text-base text-slate-900 outline-none" />
              <span className="shrink-0 text-[10px] text-slate-400">{unit}</span>
            </span>
          </label>
        ))}
      </div>
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Χυτήριο: {formatDecimal(rules.casting_rate)} €/g → {formatDecimal(rules.casting_rate * rules.ilios_labor_material_multiplier)} €/g στην Ilios Formula.
          <br />Χονδρική = ασήμι + (εργατικά + υλικά) × {formatDecimal(rules.ilios_labor_material_multiplier)} + συνολικό βάρος × {formatDecimal(rules.ilios_weight_surcharge)} €.
        </p>
      )}
      <p className="text-xs leading-relaxed text-slate-500">Οι χειροκίνητες εξαιρέσεις εργατικών ανά προϊόν διατηρούνται. Η στρογγυλοποίηση ακολουθεί το παραπάνω βήμα. Η αποθήκευση αλλάζει τους υπολογισμούς· για ενημέρωση των αποθηκευμένων τιμών όλων των βασικών κωδικών και παραλλαγών, χρησιμοποιήστε την προεπισκόπηση παρακάτω. Οι τιμές σε υπάρχουσες παραγγελίες και παραστατικά παραμένουν αμετάβλητες.</p>
    </section>
  );
}
