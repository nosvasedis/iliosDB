import React from 'react';
import { Calculator, RotateCcw, Tag } from 'lucide-react';
import type { GlobalSettings, PricingRules } from '../types';
import { DEFAULT_PRICING_RULES, PRICING_RULE_FIELDS, validatePricingRules } from '../utils/pricingRules';
import { formatDecimal, getLabelDisplayPrice, roundPrice } from '../utils/pricingEngine';

interface Props {
  settings: GlobalSettings;
  onChange: (settings: GlobalSettings) => void;
}

const TECHNICIAN_TIERS = [
  { threshold: 'technician_threshold_1', rate: 'technician_rate_1' },
  { threshold: 'technician_threshold_2', rate: 'technician_rate_2' },
  { threshold: 'technician_threshold_3', rate: 'technician_rate_3' },
  { threshold: null, rate: 'technician_rate_4' },
] as const;

export default function PricingRulesSettings({ settings, onChange }: Props) {
  const rules = { ...DEFAULT_PRICING_RULES, ...settings.pricing_rules };
  const error = validatePricingRules(rules);

  const renderField = (key: keyof PricingRules, label?: string) => {
    const field = PRICING_RULE_FIELDS.find(field => field.key === key)!;
    const min = key === 'price_rounding_step' ? 0.01 : key.includes('threshold') || key.includes('multiplier') ? 0.0001 : 0;
    return (
      <label className="block text-xs font-semibold text-slate-600">
        {label || field.label}
        <span className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 transition focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
          <input
            type="number" min={min} max={key === 'price_rounding_step' ? 100 : 10000} step="0.01"
            value={Number.isFinite(rules[key]) ? rules[key] : ''}
            onChange={event => onChange({ ...settings, pricing_rules: { ...settings.pricing_rules, [key]: event.target.value === '' ? NaN : Number(event.target.value) } })}
            className="min-w-0 w-full bg-transparent py-3 font-mono text-base font-semibold text-slate-900 outline-none"
          />
          <span className="shrink-0 text-xs font-medium text-slate-400">{field.unit}</span>
        </span>
      </label>
    );
  };

  const displayWeight = (value: number) => Number.isFinite(value) ? formatDecimal(value) : '…';

  return (
    <section aria-labelledby="pricing-rules-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/70 p-5 md:px-8 md:py-6">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-700"><Calculator size={22} /></div>
          <div>
            <h2 id="pricing-rules-title" className="text-lg font-bold text-slate-800">Κόστη παραγωγής & Ilios Formula</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">Ορίστε τις χρεώσεις και τον τρόπο υπολογισμού των τιμών.</p>
          </div>
        </div>
        <button type="button" onClick={() => onChange({ ...settings, pricing_rules: { ...DEFAULT_PRICING_RULES } })} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-100 focus-visible:outline-amber-500"><RotateCcw size={14} /> Επαναφορά προεπιλογών</button>
      </div>

      <div className="space-y-7 p-5 md:p-8">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Βασικά κόστη παραγωγής</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Χρέωση ανά γραμμάριο για κάθε εργασία.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {renderField('casting_rate')}
            {renderField('plating_rate')}
            {renderField('stx_technician_rate')}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-bold text-slate-800">Κλίμακες τεχνίτη</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Τα όρια βάρους καθορίζουν ποια χρέωση €/g χρησιμοποιείται στον υπολογισμό εργατικών.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TECHNICIAN_TIERS.map(({ threshold, rate }, index) => (
              <div key={rate} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <span className="text-xs font-bold text-amber-700">{index + 1}η κλίμακα</span>
                  <p className="mt-1 text-xs text-slate-500">
                    {index === 0 ? 'Έως το πρώτο όριο' : threshold ? `Πάνω από ${displayWeight(rules[TECHNICIAN_TIERS[index - 1].threshold!])} g` : 'Πάνω από το τρίτο όριο'}
                  </p>
                </div>
                {threshold ? renderField(threshold, `Έως και (${index + 1}ο όριο)`) : (
                  <div>
                    <p className="text-xs font-semibold text-slate-600">Βάρος τεμαχίου</p>
                    <p className="mt-2 flex h-[50px] items-center rounded-xl border border-dashed border-slate-300 px-3 font-mono text-base font-semibold text-slate-700">&gt; {displayWeight(rules.technician_threshold_3)} g</p>
                  </div>
                )}
                {renderField(rate, `Χρέωση ${index + 1}ης κλίμακας`)}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Τα τρία όρια βάρους πρέπει να είναι σε αύξουσα σειρά.</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 md:p-5">
          <h3 className="text-sm font-bold text-slate-800">Ilios Formula · Προτεινόμενη χονδρική</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {renderField('ilios_labor_material_multiplier', 'Πολλαπλασιαστής εργατικών & υλικών')}
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Πολλαπλασιάζει το άθροισμα εργατικών και υλικών, εκτός ασημιού.</p>
            </div>
            <div>
              {renderField('ilios_weight_surcharge', 'Προσαύξηση κόστους')}
              <p className="mt-2 text-xs leading-relaxed text-slate-500">Προσθέτει κόστος ανά γραμμάριο συνολικού βάρους στην προτεινόμενη χονδρική.</p>
              {!error && <p className="mt-1 text-xs font-semibold text-amber-800">Π.χ. 5 g × {formatDecimal(rules.ilios_weight_surcharge)} €/g = +{formatDecimal(5 * rules.ilios_weight_surcharge)} €.</p>}
            </div>
          </div>
          {!error && (
            <div className="mt-4 rounded-xl border border-amber-100 bg-white/80 p-3 text-sm leading-relaxed text-amber-900">
              <span className="font-bold">Χονδρική</span> = κόστος ασημιού + (εργατικά + υλικά) × {formatDecimal(rules.ilios_labor_material_multiplier)} + συνολικό βάρος × {formatDecimal(rules.ilios_weight_surcharge)} €/g
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-6 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-center">
          {renderField('price_rounding_step')}
          <div className="text-xs leading-relaxed text-slate-500">
            <p>Στρογγυλοποιεί τα υπολογισμένα κόστη και τις προτεινόμενες τιμές στο πλησιέστερο πολλαπλάσιο του ποσού που ορίζετε.</p>
            {!error && <p className="mt-2 font-semibold text-slate-700">Με βήμα {formatDecimal(rules.price_rounding_step)} €: 21,54 € → {formatDecimal(roundPrice(21.54, { pricing_rules: rules }))} € · 21,56 € → {formatDecimal(roundPrice(21.56, { pricing_rules: rules }))} €.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4 md:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Tag size={17} className="text-purple-600" /> Τιμή λιανικής στις ετικέτες</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Η λιανική στην ετικέτα προκύπτει από την τιμή χονδρικής επί τον παρακάτω συντελεστή.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,240px)_1fr] sm:items-center">
            {renderField('retail_multiplier', 'Πολλαπλασιαστής λιανικής')}
            {!error && <p className="rounded-xl border border-purple-100 bg-white/80 p-3 text-sm text-purple-900">Χονδρική <span className="font-bold">20,00 €</span> × {formatDecimal(rules.retail_multiplier)} = λιανική <span className="font-bold">{formatDecimal(getLabelDisplayPrice(20, 'retail', { pricing_rules: rules }))} €</span></p>}
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <p className="border-t border-slate-100 pt-5 text-xs leading-relaxed text-slate-500">Πατήστε «Αποθήκευση» για να ισχύσουν οι αλλαγές στους υπολογισμούς. Για μαζική ενημέρωση των αποθηκευμένων τιμών του καταλόγου, ανοίξτε την «Τιμολόγηση». Οι χειροκίνητες εξαιρέσεις εργατικών ανά προϊόν και οι τιμές σε υπάρχουσες παραγγελίες και παραστατικά διατηρούνται.</p>
      </div>
    </section>
  );
}
