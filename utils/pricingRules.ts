import type { GlobalSettings, PricingRules } from '../types';

export type PricingSettings = Pick<GlobalSettings, 'pricing_rules'>;

export const DEFAULT_PRICING_RULES: Readonly<PricingRules> = Object.freeze({
  casting_rate: 0.20,
  plating_rate: 0.60,
  stx_technician_rate: 0.50,
  technician_threshold_1: 2.2,
  technician_threshold_2: 4.2,
  technician_threshold_3: 8.2,
  technician_rate_1: 1.30,
  technician_rate_2: 0.90,
  technician_rate_3: 0.70,
  technician_rate_4: 0.50,
  ilios_labor_material_multiplier: 2,
  ilios_weight_surcharge: 2,
  retail_multiplier: 3,
  price_rounding_step: 0.10,
});

export function validatePricingRules(rules: Partial<PricingRules> | undefined): string | null {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return 'Μη έγκυρες παράμετροι τιμολόγησης.';
  for (const key of Object.keys(rules)) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_PRICING_RULES, key)) return 'Άγνωστη παράμετρος τιμολόγησης.';
    const value = rules[key as keyof PricingRules];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000) {
      return 'Οι παράμετροι πρέπει να είναι αριθμοί από 0 έως 10.000.';
    }
  }
  const merged = { ...DEFAULT_PRICING_RULES, ...rules };
  if (!(merged.technician_threshold_1 > 0 && merged.technician_threshold_2 > merged.technician_threshold_1 && merged.technician_threshold_3 > merged.technician_threshold_2)) {
    return 'Τα όρια βάρους τεχνίτη πρέπει να είναι θετικά και σε αύξουσα σειρά.';
  }
  if (merged.ilios_labor_material_multiplier <= 0 || merged.retail_multiplier <= 0) {
    return 'Οι πολλαπλασιαστές πρέπει να είναι μεγαλύτεροι από 0.';
  }
  if (merged.price_rounding_step < 0.01 || merged.price_rounding_step > 100 || Math.abs(merged.price_rounding_step * 100 - Math.round(merged.price_rounding_step * 100)) > 0.000001) {
    return 'Το βήμα στρογγυλοποίησης πρέπει να είναι από 0,01 έως 100 € σε ακέραια λεπτά.';
  }
  return null;
}

// Legacy/offline records without a policy retain defaults. An invalid policy is
// rejected as a whole instead of mixing incompatible tier boundaries.
export function getPricingRules(settings?: PricingSettings): PricingRules {
  const rules = settings?.pricing_rules;
  return rules && !validatePricingRules(rules)
    ? { ...DEFAULT_PRICING_RULES, ...rules }
    : { ...DEFAULT_PRICING_RULES };
}

export function pricingRulesMatch(a: Partial<PricingRules> | undefined, b: Partial<PricingRules> | undefined): boolean {
  return Object.keys(a || {}).length === Object.keys(b || {}).length &&
    Object.entries(a || {}).every(([key, value]) => b?.[key] === value);
}

export const PRICING_RULE_FIELDS: Array<{ key: keyof PricingRules; label: string; unit: string }> = [
  { key: 'casting_rate', label: 'Χυτήριο', unit: '€/g' },
  { key: 'plating_rate', label: 'Επιμετάλλωση X / H / D', unit: '€/g' },
  { key: 'stx_technician_rate', label: 'Τεχνίτης εξαρτημάτων STX', unit: '€/g' },
  { key: 'technician_threshold_1', label: 'Όριο 1ης κλίμακας τεχνίτη', unit: 'g' },
  { key: 'technician_threshold_2', label: 'Όριο 2ης κλίμακας τεχνίτη', unit: 'g' },
  { key: 'technician_threshold_3', label: 'Όριο 3ης κλίμακας τεχνίτη', unit: 'g' },
  { key: 'technician_rate_1', label: 'Τεχνίτης — 1η κλίμακα', unit: '€/g' },
  { key: 'technician_rate_2', label: 'Τεχνίτης — 2η κλίμακα', unit: '€/g' },
  { key: 'technician_rate_3', label: 'Τεχνίτης — 3η κλίμακα', unit: '€/g' },
  { key: 'technician_rate_4', label: 'Τεχνίτης — πάνω από το 3ο όριο', unit: '€/g' },
  { key: 'ilios_labor_material_multiplier', label: 'Ilios Formula — εργατικά + υλικά', unit: '×' },
  { key: 'ilios_weight_surcharge', label: 'Ilios Formula — προσαύξηση κόστους', unit: '€/g' },
  { key: 'retail_multiplier', label: 'Τιμή λιανικής στις ετικέτες', unit: '× χονδρική' },
  { key: 'price_rounding_step', label: 'Βήμα στρογγυλοποίησης τιμών', unit: '€' },
];
