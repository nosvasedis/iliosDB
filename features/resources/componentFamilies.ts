import { normalizeGreekForSearch } from '../../utils/greekSearch';

export const COMPONENT_FAMILIES = [
  { id: 'chain', label: 'Καδένες' },
  { id: 'clasp', label: 'Κουμπώματα' },
  { id: 'ending', label: 'Τελειώματα' },
  { id: 'extension', label: 'Εξτέ / Προεκτάσεις' },
  { id: 'earring', label: 'Εξαρτήματα σκουλαρικιών' },
  { id: 'pin', label: 'Γράνες' },
  { id: 'connector', label: 'Κρίκοι / Σύνδεσμοι' },
  { id: 'stamp', label: 'Σφραγίδες' },
  { id: 'decorative', label: 'Διακοσμητικά στοιχεία' },
  { id: 'other', label: 'Λοιπά / Χωρίς ταξινόμηση' },
] as const;
export type ComponentFamily = typeof COMPONENT_FAMILIES[number]['id'];

/** Derived presentation only: descriptions remain editable; no SKU or costing changes. */
export function getComponentFamily(product: { is_component?: boolean; description?: string | null }): ComponentFamily | null {
  if (!product.is_component) return null;
  const name = normalizeGreekForSearch(product.description || '').replace(/ς/g, 'σ');
  // Specific uses precede broader material names (e.g. τελειώματα καδένας).
  if (/τελειωμ/.test(name)) return 'ending';
  if (/\bexte\b|εξτε|προεκτα/.test(name)) return 'extension';
  if (/σκουλαρ|πεταλουδ|πειρο/.test(name)) return 'earring';
  if (/καβουρ|κουμπω/.test(name) || name.trim() === 'πλακε') return 'clasp';
  if (/καδεν|αλυσιδ/.test(name)) return 'chain';
  if (/γραν/.test(name)) return 'pin';
  if (/κρικ|συνδεσ/.test(name)) return 'connector';
  if (/σφραγ/.test(name)) return 'stamp';
  if (/μπιλ|βοτσαλ|μαργαριτ|ματακ|μπαριτσ/.test(name)) return 'decorative';
  return 'other';
}

export const componentFamilyLabel = (family?: ComponentFamily | null): string => COMPONENT_FAMILIES.find(item => item.id === family)?.label || '';
