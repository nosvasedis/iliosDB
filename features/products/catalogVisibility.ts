import { isLegalShippingItemCode } from '../../utils/legalItemCodes';

export interface ProductCatalogVisibilityRow {
  sku?: string | null;
  prefix?: string | null;
  legal_only?: boolean | null;
}

export function isVisibleProductCatalogRow(row?: ProductCatalogVisibilityRow | null): boolean {
  return !!row
    && row.legal_only !== true
    && !isLegalShippingItemCode(row.sku)
    && !isLegalShippingItemCode(row.prefix);
}
