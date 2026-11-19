import type { LegalDocumentLine } from '../types';

/**
 * Units the user works with on a document line, mapped onto the myDATA
 * `measurementUnit` list (Παράρτημα 8.13: 1 Τεμάχια, 2 Κιλά, 3 Λίτρα, 4 Μέτρα,
 * 5 m², 6 m³, 7 Τεμάχια-Λοιπά). myDATA has no grams, so «gr» lines are stored
 * and transmitted as Κιλά (2) — quantity in kg, unit price per kg — and only
 * shown/typed in grams. The XML, SBZ `measurementUnitLabel`, sync and
 * reconciliation therefore never see a non-AADE unit.
 */
export type LegalLineUnit = 'pcs' | 'g' | 'kg' | 'l' | 'm';

export interface LegalLineUnitMeta {
  id: LegalLineUnit;
  /** myDATA measurementUnit code actually stored and transmitted. */
  aadeCode: number;
  label: string;
  short: string;
  /** Stored quantity = displayed quantity × factor (g → kg = 0.001). */
  factor: number;
}

export const LEGAL_LINE_UNITS: readonly LegalLineUnitMeta[] = [
  { id: 'pcs', aadeCode: 1, label: 'Τεμάχια', short: 'τεμ.', factor: 1 },
  { id: 'g', aadeCode: 2, label: 'Γραμμάρια (gr)', short: 'gr', factor: 0.001 },
  { id: 'kg', aadeCode: 2, label: 'Κιλά', short: 'kg', factor: 1 },
  { id: 'l', aadeCode: 3, label: 'Λίτρα', short: 'lt', factor: 1 },
  { id: 'm', aadeCode: 4, label: 'Μέτρα', short: 'm', factor: 1 },
] as const;

const BY_ID = new Map(LEGAL_LINE_UNITS.map((unit) => [unit.id, unit]));

export function getLegalLineUnitMeta(unit: LegalLineUnit | string | null | undefined): LegalLineUnitMeta {
  return BY_ID.get(unit as LegalLineUnit) || BY_ID.get('pcs')!;
}

export function isLegalLineUnit(value: unknown): value is LegalLineUnit {
  return typeof value === 'string' && BY_ID.has(value as LegalLineUnit);
}

type UnitLine = Pick<LegalDocumentLine, 'measurement_unit' | 'quantity' | 'unit_price' | 'source_metadata'>;

/** The unit a line is displayed in. Grams only when explicitly chosen on a kg line. */
export function getLegalLineUnit(line: Pick<LegalDocumentLine, 'measurement_unit' | 'source_metadata'>): LegalLineUnit {
  const code = Number(line.measurement_unit) || 1;
  const chosen = line.source_metadata?.display_unit;
  if (chosen === 'g' && code === 2) return 'g';
  if (code === 2) return 'kg';
  if (code === 3) return 'l';
  if (code === 4) return 'm';
  return 'pcs';
}

const roundQuantity = (value: number) => Math.round((Number(value) || 0) * 1e6) / 1e6;
const roundDisplay = (value: number) => Math.round((Number(value) || 0) * 1e3) / 1e3;
const roundPrice = (value: number) => Math.round(((Number(value) || 0) + Number.EPSILON) * 1e5) / 1e5;

/** Quantity as the user sees it (e.g. 125 gr for a stored 0.125 kg). */
export function getLegalLineDisplayQuantity(line: UnitLine): number {
  return roundDisplay((Number(line.quantity) || 0) / getLegalLineUnitMeta(getLegalLineUnit(line)).factor);
}

/** Original (pre-discount) unit price as the user sees it (per gram for a gram line). */
export function getLegalLineDisplayUnitPrice(line: UnitLine): number {
  const stored = Number(line.source_metadata?.original_unit_price ?? line.unit_price) || 0;
  return roundPrice(stored * getLegalLineUnitMeta(getLegalLineUnit(line)).factor);
}

/** Stored quantity from what the user typed in the line's unit. */
export function toStoredLegalQuantity(line: Pick<LegalDocumentLine, 'measurement_unit' | 'source_metadata'>, displayQuantity: number): number {
  return roundQuantity((Number(displayQuantity) || 0) * getLegalLineUnitMeta(getLegalLineUnit(line)).factor);
}

/** Stored (per AADE unit) price from a price typed per displayed unit. Kept to cents per kg. */
export function toStoredLegalUnitPrice(line: Pick<LegalDocumentLine, 'measurement_unit' | 'source_metadata'>, displayUnitPrice: number): number {
  const stored = (Number(displayUnitPrice) || 0) / getLegalLineUnitMeta(getLegalLineUnit(line)).factor;
  return Math.round((stored + Number.EPSILON) * 100) / 100;
}

/**
 * Switches a line's unit, keeping the numbers the user sees (quantity and unit
 * price as displayed) and converting what is stored. Callers recalculate totals.
 */
export function applyLegalLineUnit<T extends UnitLine>(line: T, unit: LegalLineUnit): T {
  const displayQuantity = getLegalLineDisplayQuantity(line);
  const displayPrice = getLegalLineDisplayUnitPrice(line);
  const meta = getLegalLineUnitMeta(unit);
  const { display_unit: _previous, ...restMetadata } = line.source_metadata || {};
  const source_metadata = {
    ...restMetadata,
    ...(unit === 'g' ? { display_unit: 'g' as const } : {}),
  };
  const next = { ...line, measurement_unit: meta.aadeCode, source_metadata } as T;
  const storedPrice = toStoredLegalUnitPrice(next, displayPrice);
  const hasDiscountPricing = line.source_metadata?.discount_percent !== undefined && line.source_metadata?.discount_percent !== null;
  return {
    ...next,
    quantity: toStoredLegalQuantity(next, displayQuantity),
    unit_price: storedPrice,
    source_metadata: hasDiscountPricing || line.source_metadata?.original_unit_price !== undefined
      ? { ...source_metadata, original_unit_price: storedPrice }
      : source_metadata,
  };
}

export function formatLegalQuantity(value: number): string {
  return (Number(value) || 0).toLocaleString('el-GR', { maximumFractionDigits: 3 });
}

/** «12 τεμ. · 1.250 gr» — quantities are only summed within the same displayed unit. */
export function summarizeLegalQuantities(lines: UnitLine[]): string {
  const totals = new Map<LegalLineUnit, number>();
  for (const line of lines) {
    const unit = getLegalLineUnit(line);
    totals.set(unit, (totals.get(unit) || 0) + getLegalLineDisplayQuantity(line));
  }
  return LEGAL_LINE_UNITS
    .filter((unit) => totals.has(unit.id))
    .map((unit) => `${formatLegalQuantity(roundDisplay(totals.get(unit.id) || 0))} ${unit.short}`)
    .join(' · ');
}
