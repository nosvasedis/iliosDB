import { Gender, type Product, type SupplierOrderItem } from '../../types';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getSizingInfo, SIZE_TYPE_NUMBER } from '../../utils/sizing';

export const PURCHASE_FINISH_STYLES: Record<string, string> = {
  X: 'bg-amber-100 text-amber-800 border-amber-200',
  P: 'bg-stone-200 text-stone-800 border-stone-300',
  D: 'bg-orange-100 text-orange-800 border-orange-200',
  H: 'bg-cyan-100 text-cyan-900 border-cyan-200',
  '': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const PURCHASE_STONE_TEXT_COLORS: Record<string, string> = {
  KR: 'text-rose-600',
  QN: 'text-slate-900',
  LA: 'text-blue-600',
  TY: 'text-teal-500',
  TG: 'text-orange-700',
  IA: 'text-red-700',
  BSU: 'text-slate-800',
  GSU: 'text-emerald-800',
  RSU: 'text-rose-800',
  MA: 'text-emerald-600',
  FI: 'text-slate-400',
  OP: 'text-indigo-500',
  NF: 'text-green-800',
  CO: 'text-orange-500',
  PCO: 'text-emerald-500',
  MCO: 'text-purple-500',
  PAX: 'text-green-600',
  MAX: 'text-blue-700',
  KAX: 'text-red-700',
  AI: 'text-slate-600',
  AP: 'text-cyan-600',
  AM: 'text-teal-700',
  AZM: 'text-teal-600',
  LR: 'text-indigo-700',
  SB: 'text-sky-500',
  MP: 'text-blue-500',
  LE: 'text-slate-400',
  PR: 'text-green-500',
  KO: 'text-red-500',
  MV: 'text-purple-400',
  RZ: 'text-pink-500',
  AK: 'text-cyan-400',
  XAL: 'text-stone-500',
};

const isRingPurchaseLine = (product: Product | undefined, item?: SupplierOrderItem): boolean => {
  const sizing = product ? getSizingInfo(product) : null;
  const values = [
    product?.prefix,
    product?.sku,
    product?.supplier_sku,
    product?.category,
    item?.item_id,
    item?.item_name,
  ].map((value) => (value || '').toUpperCase());

  return (
    sizing?.type === SIZE_TYPE_NUMBER ||
    values.some(
      (value) =>
        value.startsWith('DM') ||
        value.includes('ΔΑΧ') ||
        value.includes('ΔΑΚΤΥΛ') ||
        value.includes('RING'),
    )
  );
};

export const shouldShowPurchaseOrderSizeInput = (
  product: Product | undefined,
  item: SupplierOrderItem,
): boolean => item.item_type === 'Product' && (isRingPurchaseLine(product, item) || !!item.size_info);

export function getPurchaseOrderLinePresentation(item: SupplierOrderItem, product?: Product) {
  const suffix = product && item.item_name.startsWith(product.sku)
    ? item.item_name.slice(product.sku.length)
    : '';
  const { finish, stone } = getVariantComponents(suffix, product?.gender || Gender.Unisex);
  const isProduct = item.item_type === 'Product';
  const finishStyle = isProduct
    ? PURCHASE_FINISH_STYLES[finish.code] || PURCHASE_FINISH_STYLES['']
    : 'bg-slate-50 text-slate-800 border-slate-200';
  const stoneColor = PURCHASE_STONE_TEXT_COLORS[stone.code] || 'text-slate-600';

  let description = product?.category || 'Είδος';
  if (finish.name) description = finish.name;
  if (stone.name) description += ` · ${stone.name}`;
  if (!isProduct) description = 'Υλικό';

  return {
    imageUrl: isProduct ? product?.image_url || null : null,
    supplierRef: isProduct ? product?.supplier_sku || null : null,
    description,
    finishStyle,
    stoneCode: stone.code,
    stoneColor,
  };
}
