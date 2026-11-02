import { MaterialType, type Material } from '../../types';

export type StoneFamily = 'doublet' | 'zircon' | 'necklace' | 'strand';
export const STONE_FAMILIES: Array<{ id: StoneFamily; label: string; shortLabel: string; tone: string }> = [
  { id: 'doublet', label: 'Διπλέτες', shortLabel: 'Διπλέτες', tone: 'bg-rose-50 text-rose-700 ring-rose-100' },
  { id: 'zircon', label: 'Ζιργκόν', shortLabel: 'Ζιργκόν', tone: 'bg-sky-50 text-sky-700 ring-sky-100' },
  { id: 'necklace', label: 'Κορδόνι πετρών για κολιέ', shortLabel: 'Πέτρες για κολιέ', tone: 'bg-amber-50 text-amber-800 ring-amber-100' },
  { id: 'strand', label: 'Κορδόνι · πέτρες σε σειρά', shortLabel: 'Κορδόνι', tone: 'bg-purple-50 text-purple-700 ring-purple-100' },
];

type StoneIdentity = Pick<Material, 'type' | 'name' | 'stones_per_strand'>;
export const normalizeStoneName = (name: string) => (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el').replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();

/** Business classification only: it never changes material IDs, units, prices or strand conversion. */
export function getStoneFamily(material: StoneIdentity): StoneFamily | null {
  if (material.type !== MaterialType.Stone) return null;
  // Preserve the existing Συμβατικές / Κορδόνι distinction, including legacy presence flags.
  if (material.stones_per_strand !== null && material.stones_per_strand !== undefined) return 'strand';
  const name = normalizeStoneName(material.name);
  if (name.includes('ζιργκον') || name.includes('zircon')) return 'zircon';
  if (/^κορδονι (αιματιτησ|ονυχασ)(?=\s|\(|$)/.test(name)) return 'necklace';
  return 'doublet';
}

export const stoneFamilyLabel = (family: StoneFamily | null | undefined): string => STONE_FAMILIES.find((entry) => entry.id === family)?.label || '';
