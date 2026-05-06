import { Customer, Order, OrderItem, Product, ProductVariant, VatRegime } from '../../types';
import { normalizedIncludes } from '../../utils/greekSearch';
import { getVariantComponents } from '../../utils/pricingEngine';
import { getSizingInfo, ProductSizingInfo } from '../../utils/sizing';
import { assignMissingOrderLineIds, getOrderItemMatchKey } from '../../utils/orderItemMatch';
import { getSpecialCreationProductStub, isSpecialCreationSku } from '../../utils/specialCreationSku';

export interface MobileOrderBuilderDraftState {
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  items: OrderItem[];
  vatRate: number;
  discountPercent: number;
  orderNotes: string;
  retailClientLabel?: string;
}

export interface MobileOrderBuilderItemEditState {
  editFinish: string;
  editVariantSuffix: string;
  editSizeInfo: string;
  editCordColor?: OrderItem['cord_color'];
  editEnamelColor?: OrderItem['enamel_color'];
}

export function buildMobileOrderBuilderItems(
  items: OrderItem[],
  products: Product[],
): OrderItem[] {
  return assignMissingOrderLineIds(items).map((item) => {
    if (isSpecialCreationSku(item.sku)) {
      return { ...item, product_details: getSpecialCreationProductStub() };
    }
    const product = products.find((candidate) => candidate.sku === item.sku);
    return { ...item, product_details: product || item.product_details };
  });
}

export function buildMobileOrderBuilderVariantGroups(product: Product | null | undefined) {
  if (!product?.variants?.length) return {} as Record<string, ProductVariant[]>;
  const groups: Record<string, ProductVariant[]> = {};
  const order = ['', 'P', 'X', 'D', 'H'];

  product.variants.forEach((variant) => {
    const { finish } = getVariantComponents(variant.suffix, product.gender);
    const code = finish.code ?? '';
    if (!groups[code]) groups[code] = [];
    groups[code].push(variant);
  });

  order.forEach((code) => {
    if (groups[code]) groups[code].sort((a, b) => a.suffix.localeCompare(b.suffix));
  });
  return groups;
}

export function buildMobileOrderBuilderFinishOrder(variantsByFinish: Record<string, ProductVariant[]>) {
  return ['', 'P', 'X', 'D', 'H'].filter((code) => variantsByFinish[code]?.length);
}

export function buildMobileOrderBuilderEditingProduct(
  editingItem: Order['items'][number] | null | undefined,
  products: Product[],
): Product | null {
  if (!editingItem) return null;
  return products.find((product) => product.sku === editingItem.sku) || editingItem.product_details || null;
}

export function buildMobileOrderBuilderEditingSizeMode(product: Product | null): ProductSizingInfo | null {
  if (!product) return null;
  return getSizingInfo(product);
}

export function buildMobileOrderBuilderEditVariantsByFinish(product: Product | null) {
  return buildMobileOrderBuilderVariantGroups(product);
}

export function buildMobileOrderBuilderEditFinishOptions(editVariantsByFinish: Record<string, ProductVariant[]>) {
  const preferred = ['', 'P', 'X', 'D', 'H'].filter((code) => editVariantsByFinish[code]?.length);
  const extras = Object.keys(editVariantsByFinish).filter((code) => !preferred.includes(code));
  return [...preferred, ...extras];
}

export function buildMobileOrderBuilderEditStoneOptions(
  editVariantsByFinish: Record<string, ProductVariant[]>,
  editFinish: string,
) {
  return editVariantsByFinish[editFinish] || [];
}

export function buildMobileOrderBuilderProductSuggestions(products: Product[], term: string) {
  const normalizedTerm = term.trim().toUpperCase();
  if (normalizedTerm.length < 2) return [];
  if (isSpecialCreationSku(normalizedTerm)) return [];

  return products
    .filter((product) => !product.is_component)
    .filter((product) => product.sku.startsWith(normalizedTerm) || (normalizedTerm.length >= 3 && product.sku.includes(normalizedTerm)))
    .slice(0, 10);
}

export function buildMobileOrderBuilderCustomerSuggestions(customers: Customer[] | undefined, customerName: string) {
  if (!customers || !customerName) return [];
  return customers.filter(
    (customer) =>
      normalizedIncludes(customer.full_name, customerName) ||
      (customer.phone && customer.phone.includes(customerName))
  ).slice(0, 5);
}

export function calculateMobileOrderBuilderTotals(
  items: OrderItem[],
  discountPercent: number,
  vatRate: number,
) {
  const subtotal = items.reduce((sum, item) => sum + (item.price_at_order * item.quantity), 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const netAmount = subtotal - discountAmount;
  const vatAmount = netAmount * vatRate;
  const grandTotal = netAmount + vatAmount;

  return { subtotal, discountAmount, netAmount, vatAmount, grandTotal };
}

export const buildMobileOrderBuilderTotals = calculateMobileOrderBuilderTotals;

export function buildMobileOrderBuilderItemUpdate(
  items: OrderItem[],
  itemIndex: number,
  nextVariantSuffix: string | undefined,
  nextSizeInfo: string | undefined,
  nextCordColor: OrderItem['cord_color'] | undefined,
  nextEnamelColor: OrderItem['enamel_color'] | undefined,
  products: Product[],
) {
  if (itemIndex < 0 || itemIndex >= items.length) return items;

  const current = items[itemIndex];
  if (isSpecialCreationSku(current.sku)) return items;

  const product = products.find((candidate) => candidate.sku === current.sku) || current.product_details;
  let nextPrice = current.price_at_order;

  if (product) {
    if (nextVariantSuffix !== undefined) {
      const variant = product.variants?.find((candidate) => candidate.suffix === nextVariantSuffix);
      nextPrice = variant?.selling_price || product.selling_price || 0;
    } else {
      nextPrice = product.selling_price || 0;
    }
  }

  const edited: OrderItem = {
    ...current,
    variant_suffix: nextVariantSuffix,
    size_info: nextSizeInfo,
    cord_color: nextCordColor,
    enamel_color: nextEnamelColor,
    price_at_order: nextPrice,
    product_details: product || current.product_details,
  };

  const mergeIdx = items.findIndex(
    (candidate, index) =>
      index !== itemIndex &&
      getOrderItemMatchKey(candidate) === getOrderItemMatchKey(edited)
  );

  if (mergeIdx !== -1) {
    const merged = [...items];
    merged[mergeIdx] = {
      ...merged[mergeIdx],
      quantity: merged[mergeIdx].quantity + edited.quantity,
    };
    merged.splice(itemIndex, 1);
    return merged;
  }

  const updated = [...items];
  updated[itemIndex] = edited;
  return updated;
}

export function buildMobileOrderBuilderItemEditState(
  item: Order['items'][number] | null | undefined,
  products: Product[],
): MobileOrderBuilderItemEditState {
  if (!item) {
    return {
      editFinish: '',
      editVariantSuffix: '',
      editSizeInfo: '',
      editCordColor: undefined,
      editEnamelColor: undefined,
    };
  }

  const product = buildMobileOrderBuilderEditingProduct(item, products);
  const variants = product?.variants || [];

  if (variants.length > 0) {
    const currentSuffix = item.variant_suffix ?? '';
    const safeSuffix = variants.some((variant) => variant.suffix === currentSuffix) ? currentSuffix : variants[0].suffix;
    const { finish } = getVariantComponents(safeSuffix, product?.gender);
    return {
      editFinish: finish.code ?? '',
      editVariantSuffix: safeSuffix,
      editSizeInfo: item.size_info || '',
      editCordColor: item.cord_color,
      editEnamelColor: item.enamel_color,
    };
  }

  return {
    editFinish: '',
    editVariantSuffix: '',
    editSizeInfo: item.size_info || '',
    editCordColor: item.cord_color,
    editEnamelColor: item.enamel_color,
  };
}

export function serializeMobileOrderBuilderDraft(draft: MobileOrderBuilderDraftState) {
  return JSON.stringify({
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    customerId: draft.customerId,
    items: draft.items.map(({ product_details, ...rest }) => rest),
    vatRate: draft.vatRate,
    discountPercent: draft.discountPercent,
    orderNotes: draft.orderNotes,
    retailClientLabel: draft.retailClientLabel,
  });
}

export function parseMobileOrderBuilderDraft(raw: string): MobileOrderBuilderDraftState | null {
  try {
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object') return null;
    return {
      customerName: draft.customerName || '',
      customerPhone: draft.customerPhone || '',
      customerId: draft.customerId || null,
      items: Array.isArray(draft.items) ? draft.items : [],
      vatRate: draft.vatRate ?? VatRegime.Standard,
      discountPercent: draft.discountPercent ?? 0,
      orderNotes: draft.orderNotes || '',
      retailClientLabel: draft.retailClientLabel,
    };
  } catch {
    return null;
  }
}

export function hydrateMobileOrderBuilderDraft(
  draft: MobileOrderBuilderDraftState,
  products: Product[],
) {
  return {
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    customerId: draft.customerId,
    items: buildMobileOrderBuilderItems(draft.items, products),
    vatRate: draft.vatRate,
    discountPercent: draft.discountPercent,
    orderNotes: draft.orderNotes,
    retailClientLabel: draft.retailClientLabel,
  };
}
