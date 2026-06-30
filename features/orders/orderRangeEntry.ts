import type { Product, ProductVariant } from '../../types';
import { getSizingInfo, type ProductSizingInfo } from '../../utils/sizing';
import { allowsBareMasterSkuResolution } from '../../utils/skuProductPicker';

export type OrderRangeRowStatus =
  | 'ready'
  | 'missing_product'
  | 'missing_variant'
  | 'ambiguous_variant';

export interface ParsedOrderRange {
  prefix: string;
  start: number;
  end: number;
  width: number;
  suffix: string;
}

export interface OrderRangeRow {
  sku: string;
  displaySku: string;
  suffix: string;
  status: OrderRangeRowStatus;
  product?: Product;
  variant?: ProductVariant | null;
  sizing: ProductSizingInfo | null;
}

export interface OrderRangeResolution {
  parsed: ParsedOrderRange;
  rows: OrderRangeRow[];
  readyRows: OrderRangeRow[];
  hasSizableRows: boolean;
}

export interface OrderRangeAddEntry {
  product: Product;
  variant: ProductVariant | null;
  size: string;
}

const RANGE_TOKEN_RE = /^([A-ZΑ-Ω]{2,3})(\d+)([A-ZΑ-Ω]*)$/iu;

function parseRangeToken(token: string): { prefix: string; digits: string; num: number; suffix: string } | null {
  const match = token.trim().toUpperCase().match(RANGE_TOKEN_RE);
  if (!match) return null;
  const [, prefix, digits, suffix] = match;
  const num = parseInt(digits, 10);
  if (Number.isNaN(num)) return null;
  return { prefix, digits, num, suffix };
}

export function parseOrderRangeInput(input: string): ParsedOrderRange | null {
  const parts = input.trim().toUpperCase().split(/\s*-\s*/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const start = parseRangeToken(parts[0]);
  const end = parseRangeToken(parts[1]);
  if (!start || !end) return null;
  if (start.prefix !== end.prefix) return null;
  if (start.suffix !== end.suffix) return null;
  if (start.num > end.num) return null;

  return {
    prefix: start.prefix,
    start: start.num,
    end: end.num,
    width: Math.max(start.digits.length, end.digits.length),
    suffix: start.suffix,
  };
}

function resolveVariant(product: Product, suffix: string): Pick<OrderRangeRow, 'status' | 'variant'> {
  const variants = product.variants || [];

  if (suffix) {
    const variant = variants.find((entry) => entry.suffix.toUpperCase() === suffix);
    if (!variant) return { status: 'missing_variant', variant: null };
    return { status: 'ready', variant };
  }

  if (!variants.length) return { status: 'ready', variant: null };

  if (!allowsBareMasterSkuResolution(product)) {
    return { status: 'ambiguous_variant', variant: null };
  }

  const emptyVariant = variants.find((entry) => entry.suffix === '') || null;
  return { status: 'ready', variant: emptyVariant };
}

export function resolveOrderRangeInput(input: string, products: Product[]): OrderRangeResolution | null {
  const parsed = parseOrderRangeInput(input);
  if (!parsed) return null;

  const productBySku = new Map(products.map((product) => [product.sku.toUpperCase(), product]));
  const rows: OrderRangeRow[] = [];

  for (let n = parsed.start; n <= parsed.end; n += 1) {
    const sku = `${parsed.prefix}${String(n).padStart(parsed.width, '0')}`;
    const displaySku = `${sku}${parsed.suffix}`;
    const product = productBySku.get(sku.toUpperCase());

    if (!product || product.is_component) {
      rows.push({
        sku,
        displaySku,
        suffix: parsed.suffix,
        status: 'missing_product',
        sizing: null,
      });
      continue;
    }

    const resolved = resolveVariant(product, parsed.suffix);
    rows.push({
      sku,
      displaySku,
      suffix: parsed.suffix,
      status: resolved.status,
      product,
      variant: resolved.variant,
      sizing: resolved.status === 'ready' ? getSizingInfo(product) : null,
    });
  }

  const readyRows = rows.filter((row) => row.status === 'ready' && row.product) as Array<
    OrderRangeRow & { product: Product }
  >;

  return {
    parsed,
    rows,
    readyRows,
    hasSizableRows: readyRows.some((row) => Boolean(row.sizing)),
  };
}

export function buildOrderRangeAddEntries(
  rows: OrderRangeRow[],
  sizesBySku: Record<string, string>,
): OrderRangeAddEntry[] {
  return rows
    .filter((row): row is OrderRangeRow & { product: Product } => row.status === 'ready' && Boolean(row.product))
    .map((row) => ({
      product: row.product,
      variant: row.variant ?? null,
      size: sizesBySku[row.sku] || '',
    }));
}
