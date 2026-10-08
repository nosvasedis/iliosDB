import { LegalArchiveLineMatch, LegalArchiveRecord } from '../../types';
import { buildFullSku, normalizeSkuQuery, skuPartsMatchQuery } from '../../utils/skuSearchMatch';
import { normalizeGreekForSearch } from '../../utils/greekSearch';

export interface IssuedSkuFilters {
  query: string;
  customer: string;
  from: string;
  to: string;
  includeCancelled: boolean;
}

export interface IssuedSkuResult {
  key: string;
  record: LegalArchiveRecord;
  match: LegalArchiveLineMatch;
  sku: string;
  customer: string;
  fromDeliveryNote: boolean;
  hasPrice: boolean;
}

export function searchIssuedSkus(records: LegalArchiveRecord[], filters: IssuedSkuFilters): IssuedSkuResult[] {
  if (normalizeSkuQuery(filters.query).length < 2 || (filters.from && filters.to && filters.from > filters.to)) return [];
  const customerQuery = normalizeGreekForSearch(filters.customer.trim());
  return records.flatMap((record) => {
    const document = record.document;
    if (record.source !== 'legal' || !(document.status === 'issued' || (filters.includeCancelled && document.status === 'cancelled'))) return [];
    const date = document.issue_date.slice(0, 10);
    if ((filters.from && date < filters.from) || (filters.to && date > filters.to)) return [];
    const customer = document.counterpart.name || record.customerMatch.customer?.full_name || 'Χωρίς όνομα πελάτη';
    if (customerQuery && !normalizeGreekForSearch(`${customer} ${document.counterpart.vat_number || ''}`).includes(customerQuery)) return [];
    const direct = record.lineMatches.map((match) => ({ match, fromDeliveryNote: false }));
    const linked = (record.linkedDeliveryNote?.lineMatches || []).filter((match) => !direct.some(({ match: own }) =>
      buildFullSku(own.masterSku || own.line.sku, own.variantSuffix ?? own.line.variant_suffix) === buildFullSku(match.masterSku || match.line.sku, match.variantSuffix ?? match.line.variant_suffix),
    )).map((match) => ({ match, fromDeliveryNote: true }));
    return [...direct, ...linked].flatMap(({ match, fromDeliveryNote }) => {
      const master = match.masterSku || match.line.sku || match.rawItemCode || '';
      const suffix = match.variantSuffix ?? match.line.variant_suffix;
      if (!skuPartsMatchQuery(master, suffix, filters.query) && !skuPartsMatchQuery(match.rawItemCode || match.line.item_code || '', '', filters.query)) return [];
      return [{
        key: `${record.key}:${fromDeliveryNote ? 'delivery' : 'line'}:${match.line.id}`,
        record, match, sku: buildFullSku(master, suffix), customer, fromDeliveryNote,
        hasPrice: !fromDeliveryNote && document.document_kind !== 'delivery_note',
      }];
    });
  }).sort((a, b) => b.record.document.issue_date.localeCompare(a.record.document.issue_date) || a.record.key.localeCompare(b.record.key) || a.match.line.line_number - b.match.line.line_number);
}

/** Preserve stored issue-time amounts; never consult current catalog pricing. */
export function issuedSkuPricing(line: LegalArchiveLineMatch['line']) {
  const original = line.source_metadata?.original_unit_price;
  const discount = line.source_metadata?.discount_percent;
  return {
    original: original != null && Number.isFinite(original) ? original : null,
    discount: discount != null && Number.isFinite(discount) ? discount : null,
    discountAmount: original != null && Number.isFinite(original) ? Math.round((original * line.quantity - line.net_value) * 100) / 100 : null,
  };
}
