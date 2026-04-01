export const productKeys = {
  all: ['products'] as const,
  list: () => [...productKeys.all, 'list'] as const,
  catalog: () => [...productKeys.all, 'catalog'] as const,
  detail: (sku: string) => [...productKeys.all, 'detail', sku] as const,
  variants: (sku: string) => [...productKeys.all, 'variants', sku] as const,
  collections: (sku: string) => [...productKeys.all, 'collections', sku] as const,
};
