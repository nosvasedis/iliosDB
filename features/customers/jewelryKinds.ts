import { normalizeGreekForSearch } from '../../utils/greekSearch';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { isSpecialRingSku } from '../../utils/sizing';

/** A jewellery kind (Δαχτυλίδια, Σκουλαρίκια…): the top level of «τι πουλάμε σε ποιον». */
export interface JewelryKind {
  id: string;
  label: string;
}

const KNOWN_KINDS: Array<JewelryKind & { stems: string[]; prefixes: string[] }> = [
  { id: 'ring', label: 'Δαχτυλίδια', stems: ['δαχτυλιδ', 'δακτυλιδ'], prefixes: ['RN', 'DA'] },
  { id: 'earrings', label: 'Σκουλαρίκια', stems: ['σκουλαρικ'], prefixes: ['SK'] },
  { id: 'bracelet', label: 'Βραχιόλια', stems: ['βραχιολ'], prefixes: ['BR', 'XR'] },
  { id: 'necklace', label: 'Κολιέ', stems: ['κολιε'], prefixes: [] },
  { id: 'pendant', label: 'Μενταγιόν', stems: ['μενταγιο'], prefixes: ['PN', 'MN'] },
  { id: 'cross', label: 'Σταυροί', stems: ['σταυρ'], prefixes: ['CR'] },
  { id: 'chain', label: 'Αλυσίδες', stems: ['αλυσιδ'], prefixes: [] },
  { id: 'anklet', label: 'Ποδαράκια', stems: ['ποδαρακ'], prefixes: [] },
  { id: 'brooch', label: 'Καρφίτσες', stems: ['καρφιτσ'], prefixes: [] },
  { id: 'cufflinks', label: 'Μανικετόκουμπα', stems: ['μανικετοκουμπ'], prefixes: [] },
  { id: 'keyring', label: 'Μπρελόκ', stems: ['μπρελοκ'], prefixes: [] },
];

/** The standard kinds, for pickers (exclusivity scopes, filters). */
export const JEWELRY_KIND_OPTIONS: JewelryKind[] = KNOWN_KINDS.map(({ id, label }) => ({ id, label }));

export const SPECIAL_KIND: JewelryKind = { id: 'special', label: 'Ειδικές δημιουργίες' };
export const UNMATCHED_KIND: JewelryKind = { id: 'unmatched', label: 'Εκτός καταλόγου' };

const KIND_BY_ID = new Map<string, JewelryKind>(
  [...KNOWN_KINDS, SPECIAL_KIND, UNMATCHED_KIND].map(kind => [kind.id, { id: kind.id, label: kind.label }]),
);

/** Greek capitals typed in SKU prefixes, as the team transliterates them (ΧΡ → XR, ΡΝ → RN, ΠΝ → PN…). */
const LOOKALIKE: Record<string, string> = { Α: 'A', Β: 'B', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Χ: 'X' };

function skuLetters(sku: string): string {
  const head = (sku.trim().toUpperCase().match(/^\p{L}+/u)?.[0] ?? '').slice(0, 2);
  return [...head].map(ch => LOOKALIKE[ch] ?? ch).join('');
}

/** Kind from a product category («Βραχιόλι Δερμάτινο» → Βραχιόλια). Unknown categories become their own kind. */
export function kindFromCategory(category?: string | null): JewelryKind | null {
  const text = (category ?? '').trim();
  if (!text) return null;
  const key = normalizeGreekForSearch(text);
  const known = KNOWN_KINDS.find(kind => kind.stems.some(stem => key.startsWith(stem)));
  if (known) return { id: known.id, label: known.label };
  const id = `c:${key}`;
  if (!KIND_BY_ID.has(id)) KIND_BY_ID.set(id, { id, label: text });
  return KIND_BY_ID.get(id)!;
}

/** Best-effort kind for a SKU that is no longer (or never was) in the catalogue. */
export function kindFromSku(sku: string): JewelryKind | null {
  if (isSpecialRingSku(sku)) return { id: 'ring', label: 'Δαχτυλίδια' };
  const letters = skuLetters(sku);
  const known = KNOWN_KINDS.find(kind => kind.prefixes.includes(letters));
  return known ? { id: known.id, label: known.label } : null;
}

export function classifyJewelryKind(sku: string, category?: string | null): JewelryKind {
  if (isSpecialCreationSku(sku)) return SPECIAL_KIND;
  if (isSpecialRingSku(sku)) return { id: 'ring', label: 'Δαχτυλίδια' };
  return kindFromCategory(category) ?? kindFromSku(sku) ?? UNMATCHED_KIND;
}

export function jewelryKindLabel(id: string): string {
  return KIND_BY_ID.get(id)?.label ?? (id.startsWith('c:') ? id.slice(2) : id);
}
