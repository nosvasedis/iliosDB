export const compareSkuValues = (a: string, b: string) =>
    (a || '').localeCompare(b || '', 'el', { numeric: true, sensitivity: 'base' });

export const buildSkuKey = (sku?: string | null, variantSuffix?: string | null) =>
    `${(sku || '').trim()}${(variantSuffix || '').trim()}`;

export const sortBySkuKey = <T>(items: T[], getKey: (item: T) => string): T[] =>
    [...items].sort((a, b) => compareSkuValues(getKey(a), getKey(b)));
