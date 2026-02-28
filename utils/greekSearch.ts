/**
 * Normalizes a string for Greek-aware search: lowercases and strips accents (τόνος).
 * Enables matching "Νίκη" with "ΝΙΚΗ", "νικη", "Νικη" etc.
 */
export function normalizeGreekForSearch(s: string): string {
    if (!s || typeof s !== 'string') return '';
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
        .toLowerCase();
}

/**
 * Returns true if normalizedSearch is contained in normalizedFullString.
 * Use with normalizeGreekForSearch for both arguments.
 */
export function normalizedIncludes(fullString: string, search: string): boolean {
    const nFull = normalizeGreekForSearch(fullString);
    const nSearch = normalizeGreekForSearch(search);
    if (!nSearch) return true;
    return nFull.includes(nSearch);
}
