import {
  Customer,
  LegalArchiveFilterState,
  LegalArchiveLineMatch,
  LegalArchiveMatchState,
  LegalArchiveRecord,
  LegalDocument,
  LegalDocumentLine,
  LegalExternalItemAlias,
  Order,
  Product,
  ProformaDocument,
  ProformaDocumentLine,
  UserProfile,
} from '../../types';
import { normalizeGreekForSearch } from '../../utils/greekSearch';
import { normalizeVatNumber, parseTransmittedDocumentsXml } from '../../utils/legalDocuments';
import { resolveFinanceLineSku } from '../../utils/financeLineSku';
import { transliterateForBarcode } from '../../utils/pricingEngine';

export const LEGAL_ARCHIVE_PARSE_VERSION = 1;

export function normalizeExternalItemCode(value?: string | null): string {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function createDefaultLegalArchiveFilters(): LegalArchiveFilterState {
  return {
    scope: 'all',
    query: '',
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
    month: '',
    customerId: '',
    customerQuery: '',
    documentKind: 'all',
    status: 'all',
    externalSource: 'all',
    matchState: 'all',
    productSku: '',
    sort: 'date_desc',
  };
}

function toIsoDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthBounds(year: number, monthIndex: number): { from: string; to: string } {
  return {
    from: toIsoDateLocal(new Date(year, monthIndex, 1)),
    to: toIsoDateLocal(new Date(year, monthIndex + 1, 0)),
  };
}

export function resolveLegalArchiveDateRange(
  filters: Pick<LegalArchiveFilterState, 'datePreset' | 'dateFrom' | 'dateTo' | 'month'>,
  now = new Date(),
): { from: string; to: string } | null {
  switch (filters.datePreset) {
    case 'today': {
      const today = toIsoDateLocal(now);
      return { from: today, to: today };
    }
    case 'current_month':
      return monthBounds(now.getFullYear(), now.getMonth());
    case 'previous_month':
      return monthBounds(now.getFullYear(), now.getMonth() - 1);
    case 'last_3_months':
    case 'last_6_months':
    case 'last_12_months': {
      const months = Number(filters.datePreset.match(/\d+/)?.[0] || 0);
      return {
        from: toIsoDateLocal(new Date(now.getFullYear(), now.getMonth() - months + 1, 1)),
        to: toIsoDateLocal(now),
      };
    }
    case 'specific_month': {
      if (!/^\d{4}-\d{2}$/.test(filters.month)) return null;
      const [year, month] = filters.month.split('-').map(Number);
      return monthBounds(year, month - 1);
    }
    case 'custom': {
      if (!filters.dateFrom && !filters.dateTo) return null;
      return {
        from: filters.dateFrom || '0000-01-01',
        to: filters.dateTo || '9999-12-31',
      };
    }
    default:
      return null;
  }
}

function resolveCustomer(
  document: LegalDocument | ProformaDocument,
  customerById: Map<string, Customer>,
  customersByVat: Map<string, Customer[]>,
) {
  if (document.counterpart_customer_id) {
    const manual = customerById.get(document.counterpart_customer_id);
    if (manual) {
      return { state: 'matched' as const, customer: manual, candidates: [manual], method: 'manual' as const };
    }
  }

  const vat = normalizeVatNumber(document.counterpart?.vat_number);
  const candidates = vat ? customersByVat.get(vat) || [] : [];
  if (candidates.length === 1) {
    return { state: 'matched' as const, customer: candidates[0], candidates, method: 'vat' as const };
  }
  if (candidates.length > 1) {
    const sourceName = normalizeGreekForSearch(document.counterpart?.name || '');
    const exactNameMatches = sourceName
      ? candidates.filter((candidate) => normalizeGreekForSearch(candidate.full_name) === sourceName)
      : [];
    if (exactNameMatches.length === 1) {
      return {
        state: 'matched' as const,
        customer: exactNameMatches[0],
        candidates,
        recommendedCustomer: exactNameMatches[0],
        method: 'vat_name' as const,
        explanation: 'Μοναδική συμφωνία ΑΦΜ και επωνυμίας',
      };
    }
    const ranked = [...candidates].sort((left, right) => {
      const leftName = normalizeGreekForSearch(left.full_name);
      const rightName = normalizeGreekForSearch(right.full_name);
      const leftGeneric = leftName === 'λιανικη' ? 1 : 0;
      const rightGeneric = rightName === 'λιανικη' ? 1 : 0;
      if (leftGeneric !== rightGeneric) return leftGeneric - rightGeneric;
      const leftContained = sourceName && sourceName.includes(leftName) ? 1 : 0;
      const rightContained = sourceName && sourceName.includes(rightName) ? 1 : 0;
      if (leftContained !== rightContained) return rightContained - leftContained;
      return String(right.created_at || '').localeCompare(String(left.created_at || ''));
    });
    return {
      state: 'ambiguous' as const,
      candidates: ranked,
      recommendedCustomer: ranked[0],
      method: 'none' as const,
      explanation: 'Το ΑΦΜ είναι ακριβές, αλλά υπάρχει διπλή εγγραφή στο πελατολόγιο',
    };
  }
  return { state: 'unmatched' as const, candidates: [], method: 'none' as const };
}

function normalizedNameTokens(value?: string | null): string[] {
  return normalizeGreekForSearch(value || '')
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function resolveSeller(
  document: LegalDocument | ProformaDocument,
  sellerById: Map<string, UserProfile>,
  sellers: UserProfile[],
) {
  if (document.document_kind !== 'delivery_note') {
    return { state: 'not_applicable' as const, candidates: [], method: 'none' as const };
  }
  const legalDocument = document as LegalDocument;
  if (legalDocument.counterpart_seller_id) {
    const manual = sellerById.get(legalDocument.counterpart_seller_id);
    if (manual) {
      return { state: 'matched' as const, seller: manual, candidates: [manual], method: 'manual' as const };
    }
  }

  const sourceTokens = new Set(normalizedNameTokens(document.counterpart?.name));
  if (!sourceTokens.size) {
    return { state: 'unmatched' as const, candidates: [], method: 'none' as const };
  }
  const ranked = sellers
    .map((seller) => {
      const sellerTokens = normalizedNameTokens(seller.full_name);
      const matches = sellerTokens.filter((token) => sourceTokens.has(token)).length;
      return {
        seller,
        exact: sellerTokens.length >= 2 && matches === sellerTokens.length,
        score: sellerTokens.length ? matches / sellerTokens.length : 0,
      };
    })
    .filter((candidate) => candidate.score >= 0.5)
    .sort((left, right) => Number(right.exact) - Number(left.exact) || right.score - left.score);
  const exact = ranked.filter((candidate) => candidate.exact);
  if (exact.length === 1) {
    return {
      state: 'matched' as const,
      seller: exact[0].seller,
      candidates: ranked.map((candidate) => candidate.seller),
      method: 'name' as const,
    };
  }
  if (ranked.length) {
    return {
      state: 'suggested' as const,
      candidates: ranked.map((candidate) => candidate.seller),
      method: 'none' as const,
    };
  }
  return { state: 'unmatched' as const, candidates: [], method: 'none' as const };
}

function lineIdentity(match: LegalArchiveLineMatch): string | null {
  if (!match.product || !match.masterSku) return null;
  return `${match.masterSku.toUpperCase()}::${String(match.variantSuffix || '').toUpperCase()}`;
}

function aggregateResolvedLines(matches: LegalArchiveLineMatch[]): Map<string, number> | null {
  const result = new Map<string, number>();
  for (const match of matches) {
    if (!match.rawItemCode) return null;
    const key = lineIdentity(match);
    if (!key) return null;
    result.set(key, (result.get(key) || 0) + Number(match.line.quantity || 0));
  }
  return result;
}

function aggregateOrderItems(order: Order, products: Product[], productsMap: Map<string, Product>): Map<string, number> {
  const result = new Map<string, number>();
  order.items.forEach((item) => {
    const resolved = resolveFinanceLineSku(item, products, productsMap);
    const key = `${resolved.masterSku.toUpperCase()}::${resolved.variantSuffix.toUpperCase()}`;
    result.set(key, (result.get(key) || 0) + Number(item.quantity || 0));
  });
  return result;
}

function equalQuantityMaps(left: Map<string, number>, right: Map<string, number>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (Math.abs(value - (right.get(key) || 0)) > 0.0001) return false;
  }
  return true;
}

function resolveLineMatches(params: {
  source: 'legal' | 'proforma';
  document: LegalDocument | ProformaDocument;
  lines: Array<LegalDocumentLine | ProformaDocumentLine>;
  aliasesByKey: Map<string, LegalExternalItemAlias>;
  products: Product[];
  productsMap: Map<string, Product>;
  catalogByCode: Map<string, { product: Product; variantSuffix: string }>;
  linkedOrder?: Order;
}): LegalArchiveLineMatch[] {
  const externalSource = params.source === 'proforma'
    ? 'proforma'
    : ((params.document as LegalDocument).external_source || 'ilios');

  return params.lines.map((line, index) => {
    const rawItemCode = line.item_code
      || line.source_metadata?.raw_item_code
      || (line.sku && line.sku !== 'AADE' && line.sku !== '—' ? line.sku : null);
    const normalizedCode = normalizeExternalItemCode(rawItemCode);
    const alias = normalizedCode ? params.aliasesByKey.get(`${externalSource}::${normalizedCode}`) : undefined;
    if (alias) {
      const product = params.productsMap.get(alias.product_sku);
      if (product) {
        return {
          line,
          product,
          masterSku: product.sku,
          variantSuffix: alias.variant_suffix || '',
          method: 'alias' as const,
          alias,
          rawItemCode,
        };
      }
    }

    if (rawItemCode) {
      const catalogIdentity = params.catalogByCode.get(normalizeExternalItemCode(rawItemCode));
      const resolved = catalogIdentity
        ? {
            product: catalogIdentity.product,
            masterSku: catalogIdentity.product.sku,
            variantSuffix: catalogIdentity.variantSuffix,
          }
        : resolveFinanceLineSku(
            { sku: rawItemCode, variant_suffix: line.variant_suffix },
            params.products,
            params.productsMap,
          );
      if (resolved.product) {
        return {
          line,
          product: resolved.product,
          masterSku: resolved.masterSku,
          variantSuffix: resolved.variantSuffix,
          method: 'catalog' as const,
          rawItemCode,
        };
      }
    }

    const orderItem = params.linkedOrder && params.linkedOrder.items.length === params.lines.length
      ? params.linkedOrder.items[index]
      : undefined;
    if (orderItem) {
      const resolved = resolveFinanceLineSku(orderItem, params.products, params.productsMap);
      if (resolved.product) {
        return {
          line,
          product: resolved.product,
          masterSku: resolved.masterSku,
          variantSuffix: resolved.variantSuffix,
          method: 'order' as const,
          rawItemCode,
        };
      }
    }

    return { line, method: 'none' as const, rawItemCode };
  });
}

function buildRecordSearchText(record: Omit<LegalArchiveRecord, 'searchText'>): string {
  const document = record.document;
  const productText = record.lineMatches.flatMap((match) => [
    match.rawItemCode,
    match.masterSku,
    match.variantSuffix,
    match.product?.description,
    match.product?.category,
    match.line.description,
    match.line.source_metadata?.item_description,
    match.line.source_metadata?.line_comments,
  ]);
  return normalizeGreekForSearch([
    document.series,
    document.aa,
    document.issue_date,
    document.counterpart?.name,
    document.counterpart?.vat_number,
    record.customerMatch.customer?.full_name,
    record.customerMatch.customer?.vat_number,
    record.sellerMatch.seller?.full_name,
    record.linkedOrder?.id,
    record.source === 'legal' ? (document as LegalDocument).aade_mark : null,
    record.source === 'legal' ? (document as LegalDocument).aade_uid : null,
    record.source === 'legal' ? (document as LegalDocument).last_error : null,
    record.source === 'legal' ? (document as LegalDocument).local_notes : (document as ProformaDocument).notes,
    ...productText,
  ].filter(Boolean).join(' '));
}

export function buildLegalArchiveRecords(params: {
  legalDocuments: LegalDocument[];
  legalLines: LegalDocumentLine[];
  proformas: ProformaDocument[];
  proformaLines: ProformaDocumentLine[];
  customers: Customer[];
  products: Product[];
  orders: Order[];
  aliases: LegalExternalItemAlias[];
  sellers?: UserProfile[];
}): LegalArchiveRecord[] {
  const legalLinesByDocument = new Map<string, LegalDocumentLine[]>();
  params.legalLines.forEach((line) => {
    const list = legalLinesByDocument.get(line.document_id) || [];
    list.push(line);
    legalLinesByDocument.set(line.document_id, list);
  });
  const proformaLinesByDocument = new Map<string, ProformaDocumentLine[]>();
  params.proformaLines.forEach((line) => {
    const list = proformaLinesByDocument.get(line.proforma_id) || [];
    list.push(line);
    proformaLinesByDocument.set(line.proforma_id, list);
  });
  legalLinesByDocument.forEach((lines) => lines.sort((a, b) => a.line_number - b.line_number));
  proformaLinesByDocument.forEach((lines) => lines.sort((a, b) => a.line_number - b.line_number));

  const customerById = new Map(params.customers.map((customer) => [customer.id, customer]));
  const customersByVat = new Map<string, Customer[]>();
  params.customers.forEach((customer) => {
    const vat = normalizeVatNumber(customer.vat_number);
    if (!vat) return;
    customersByVat.set(vat, [...(customersByVat.get(vat) || []), customer]);
  });
  const orderById = new Map(params.orders.map((order) => [order.id, order]));
  const sellers = params.sellers || [];
  const sellerById = new Map(sellers.map((seller) => [seller.id, seller]));
  const ordersByCustomer = new Map<string, Order[]>();
  params.orders.forEach((order) => {
    if (!order.customer_id) return;
    const list = ordersByCustomer.get(order.customer_id) || [];
    list.push(order);
    ordersByCustomer.set(order.customer_id, list);
  });
  const productsMap = new Map(params.products.map((product) => [product.sku, product]));
  const aliasesByKey = new Map(
    params.aliases.map((alias) => [
      `${alias.external_source}::${alias.normalized_item_code}`,
      alias,
    ]),
  );
  const orderItemAggregates = new Map<string, Map<string, number>>();
  const getOrderItemAggregate = (order: Order) => {
    const cached = orderItemAggregates.get(order.id);
    if (cached) return cached;
    const aggregate = aggregateOrderItems(order, params.products, productsMap);
    orderItemAggregates.set(order.id, aggregate);
    return aggregate;
  };
  const catalogByCode = new Map<string, { product: Product; variantSuffix: string }>();
  params.products.forEach((product) => {
    const identities = [
      { code: product.sku, variantSuffix: '' },
      ...(product.variants || []).map((variant) => ({
        code: `${product.sku}${variant.suffix}`,
        variantSuffix: variant.suffix,
      })),
    ];
    identities.forEach(({ code, variantSuffix }) => {
      catalogByCode.set(normalizeExternalItemCode(code), { product, variantSuffix });
      catalogByCode.set(normalizeExternalItemCode(transliterateForBarcode(code)), { product, variantSuffix });
    });
  });

  const inputs: Array<{
    source: 'legal' | 'proforma';
    document: LegalDocument | ProformaDocument;
    lines: Array<LegalDocumentLine | ProformaDocumentLine>;
  }> = [
    ...params.legalDocuments.map((document) => ({
      source: 'legal' as const,
      document,
      lines: legalLinesByDocument.get(document.id) || [],
    })),
    ...params.proformas.map((document) => ({
      source: 'proforma' as const,
      document,
      lines: proformaLinesByDocument.get(document.id) || [],
    })),
  ];

  return inputs.map(({ source, document, lines }) => {
    const isOperationalDeliveryNote = source === 'legal'
      && (document as LegalDocument).document_kind === 'delivery_note';
    const customerMatch = resolveCustomer(document, customerById, customersByVat);
    const sellerMatch = resolveSeller(document, sellerById, sellers);
    const linkedOrder = document.order_id ? orderById.get(document.order_id) : undefined;
    const lineMatches = resolveLineMatches({
      source,
      document,
      lines,
      aliasesByKey,
      products: params.products,
      productsMap,
      catalogByCode,
      linkedOrder,
    });
    const resolvedLines = lineMatches.filter((match) => match.method !== 'none').length;
    let matchState: LegalArchiveMatchState = isOperationalDeliveryNote ? 'operational' : 'unmatched';
    if (!isOperationalDeliveryNote && customerMatch.state === 'ambiguous') matchState = 'ambiguous';
    else if (
      !isOperationalDeliveryNote
      && customerMatch.state === 'matched'
      && lineMatches.length > 0
      && resolvedLines === lineMatches.length
    ) matchState = 'matched';
    else if (!isOperationalDeliveryNote && (customerMatch.state === 'matched' || resolvedLines > 0)) matchState = 'partial';

    const customerOrders = customerMatch.customer
      ? ordersByCustomer.get(customerMatch.customer.id) || []
      : [];
    const suggestedOrders = isOperationalDeliveryNote ? [] : customerOrders
      .filter((order) =>
        Math.round(Number(order.total_price || 0) * 100)
        === Math.round(Number(document.totals.gross || 0) * 100)
      )
      .sort((a, b) => {
        const target = new Date(`${document.issue_date}T00:00:00`).getTime();
        return Math.abs(new Date(a.created_at).getTime() - target) - Math.abs(new Date(b.created_at).getTime() - target);
      });
    const resolvedAggregate = aggregateResolvedLines(lineMatches);
    const strictMatches = resolvedAggregate
      ? suggestedOrders.filter((order) => equalQuantityMaps(
          resolvedAggregate,
          getOrderItemAggregate(order),
        ))
      : [];

    const withoutSearch: Omit<LegalArchiveRecord, 'searchText'> = {
      id: document.id,
      key: `${source}:${document.id}`,
      source,
      document,
      lines,
      customerMatch,
      sellerMatch,
      lineMatches,
      matchState,
      linkedOrder,
      autoOrderCandidate: !linkedOrder && strictMatches.length === 1 ? strictMatches[0] : undefined,
      autoSellerCandidate: source === 'legal'
        && !(document as LegalDocument).counterpart_seller_id
        && sellerMatch.state === 'matched'
        && sellerMatch.method === 'name'
          ? sellerMatch.seller
          : undefined,
      customerOrders,
      suggestedOrders,
    };
    return { ...withoutSearch, searchText: buildRecordSearchText(withoutSearch) };
  });
}

export function filterLegalArchiveRecords(
  records: LegalArchiveRecord[],
  filters: LegalArchiveFilterState,
  now = new Date(),
): LegalArchiveRecord[] {
  const queryTokens = normalizeGreekForSearch(filters.query.trim()).split(/\s+/).filter(Boolean);
  const customerTokens = normalizeGreekForSearch(filters.customerQuery.trim()).split(/\s+/).filter(Boolean);
  const dateRange = resolveLegalArchiveDateRange(filters, now);
  const filtered = records.filter((record) => {
    const document = record.document;
    if (filters.scope !== 'all' && record.source !== filters.scope) return false;
    if (queryTokens.length && !queryTokens.every((token) => record.searchText.includes(token))) return false;
    if (dateRange && (document.issue_date < dateRange.from || document.issue_date > dateRange.to)) return false;
    if (filters.customerId && record.customerMatch.customer?.id !== filters.customerId) return false;
    if (!filters.customerId && customerTokens.length) {
      const customerText = normalizeGreekForSearch([
        record.customerMatch.customer?.full_name,
        record.customerMatch.customer?.vat_number,
        document.counterpart?.name,
        document.counterpart?.vat_number,
      ].filter(Boolean).join(' '));
      if (!customerTokens.every((token) => customerText.includes(token))) return false;
    }
    if (filters.documentKind !== 'all') {
      if (filters.documentKind === 'proforma' && record.source !== 'proforma') return false;
      if (filters.documentKind !== 'proforma' && (record.source !== 'legal' || (document as LegalDocument).document_kind !== filters.documentKind)) return false;
    }
    if (filters.status !== 'all' && document.status !== filters.status) return false;
    if (filters.externalSource !== 'all') {
      const source = record.source === 'proforma'
        ? 'proforma'
        : ((document as LegalDocument).external_source || 'ilios');
      if (source !== filters.externalSource) return false;
    }
    if (filters.matchState !== 'all' && record.matchState !== filters.matchState) return false;
    if (filters.productSku && !record.lineMatches.some((match) => match.masterSku === filters.productSku)) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'date_asc':
        return a.document.issue_date.localeCompare(b.document.issue_date);
      case 'gross_desc':
        return Number(b.document.totals.gross || 0) - Number(a.document.totals.gross || 0);
      case 'gross_asc':
        return Number(a.document.totals.gross || 0) - Number(b.document.totals.gross || 0);
      case 'customer_asc':
        return (a.customerMatch.customer?.full_name || a.document.counterpart?.name || '')
          .localeCompare(b.customerMatch.customer?.full_name || b.document.counterpart?.name || '', 'el');
      default:
        return b.document.issue_date.localeCompare(a.document.issue_date)
          || String(b.document.created_at || '').localeCompare(String(a.document.created_at || ''));
    }
  });
}

export function getLegalArchiveStats(records: LegalArchiveRecord[]) {
  const stats = records.reduce((current, record) => ({
    count: current.count + 1,
    net: current.net + Number(record.document.totals.net || 0),
    vat: current.vat + Number(record.document.totals.vat || 0),
    gross: current.gross + Number(record.document.totals.gross || 0),
    matched: current.matched + (record.matchState === 'matched' ? 1 : 0),
    reviewable: current.reviewable + (record.matchState === 'operational' ? 0 : 1),
    needsReview: current.needsReview + (
      record.matchState === 'matched' || record.matchState === 'operational' ? 0 : 1
    ),
    operational: current.operational + (record.matchState === 'operational' ? 1 : 0),
  }), {
    count: 0,
    net: 0,
    vat: 0,
    gross: 0,
    matched: 0,
    reviewable: 0,
    needsReview: 0,
    operational: 0,
  });
  return {
    ...stats,
    net: Math.round(stats.net * 100) / 100,
    vat: Math.round(stats.vat * 100) / 100,
    gross: Math.round(stats.gross * 100) / 100,
  };
}

export function buildArchivedDocumentEnrichment(
  document: LegalDocument,
  persistedLines: LegalDocumentLine[],
): { document: LegalDocument; lines: LegalDocumentLine[] } | null {
  if (!document.raw_xml) return null;
  const parsed = parseTransmittedDocumentsXml(document.raw_xml).documents[0];
  if (!parsed) return null;
  const sourceLines = new Map(parsed.lines.map((line) => [line.lineNumber, line]));
  const lines = persistedLines.map((line) => {
    const source = sourceLines.get(line.line_number);
    if (!source) return line;
    return {
      ...line,
      sku: source.itemCode || line.sku,
      description: source.itemDescription || line.description,
      quantity: source.quantity || line.quantity,
      measurement_unit: source.measurementUnit || line.measurement_unit,
      item_code: source.itemCode || line.item_code || null,
      source_metadata: {
        ...(line.source_metadata || {}),
        item_description: source.itemDescription || null,
        line_comments: source.lineComments || null,
        raw_item_code: source.itemCode || null,
        parser_version: LEGAL_ARCHIVE_PARSE_VERSION,
      },
    };
  });
  return {
    document: {
      ...document,
      issuer: { ...document.issuer, ...(parsed.issuer || {}) },
      counterpart: {
        ...document.counterpart,
        ...(parsed.counterpart || {}),
        name: parsed.counterpart?.name || document.counterpart?.name || null,
        address: parsed.counterpart?.address || document.counterpart?.address || null,
      },
      archive_parse_version: LEGAL_ARCHIVE_PARSE_VERSION,
    },
    lines,
  };
}
