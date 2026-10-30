const MASTER_SKU_RE = /^([A-ZΑ-Ω]{2,3})(\d+)/i;

export function parseMasterSkuParts(sku: string): { letters: string; digits: string; num: number } | null {
  const m = sku.trim().match(MASTER_SKU_RE);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  const digits = m[2];
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return null;
  return { letters, digits, num };
}

/** Detects Ωρίων (Greek) or Orion (Latin) collection names. */
export function isOrionCollectionName(name: string): boolean {
  const stripped = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (stripped.includes('orion')) return true;
  return stripped.includes('ωριων');
}
