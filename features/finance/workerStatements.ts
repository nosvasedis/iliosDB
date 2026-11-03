import { getProductCategoryPath, matchesProductCategory } from '../../utils/productCategories';
import { MaterialType, type Material, type Product, type ProductionBatch } from '../../types';
import { roundMoney } from './financeMath';
import type {
  FinanceRateCard,
  FinanceRateUnit,
  FinanceStatementLine,
  ProductionStageAssignment,
} from './types';

/** Stages whose work is done by an outside partner and billed per piece/stone. */
export const BILLABLE_STAGES = [
  { stage: 'Setting', label: 'Καρφωτής' },
  { stage: 'Polishing', label: 'Τεχνίτης' },
  { stage: 'Casting', label: 'Χυτήριο' },
  { stage: 'Waxing', label: 'Κεριά' },
  { stage: 'Plating', label: 'Χρύσωμα' },
  { stage: 'Assembly', label: 'Συναρμολόγηση' },
] as const;

export const stageLabel = (stage: string): string =>
  BILLABLE_STAGES.find((entry) => entry.stage === stage)?.label || stage;

export const RATE_UNIT_LABELS: Record<FinanceRateUnit, string> = {
  per_stone: '€ / πέτρα',
  per_piece: '€ / τεμάχιο',
  per_gram: '€ / γραμμάριο',
  per_hour: '€ / ώρα',
  fixed: '€ σταθερό',
};

export interface StoneUsage {
  materialId: string;
  name: string;
  perPiece: number;
}

/** Stones per finished piece from the recipe (including stones inside STX components). */
export function stonesPerPiece(product: Product | undefined, materialsById: ReadonlyMap<string, Material>, productsBySku: ReadonlyMap<string, Product>, depth = 0): StoneUsage[] {
  if (!product || depth > 4) return [];
  const usage = new Map<string, StoneUsage>();
  (product.recipe || []).forEach((item) => {
    if (item.type === 'raw') {
      const material = materialsById.get(item.id);
      if (material?.type !== MaterialType.Stone) return;
      const current = usage.get(material.id) || { materialId: material.id, name: material.description ? `${material.name} ${material.description}` : material.name, perPiece: 0 };
      current.perPiece += Number(item.quantity || 0);
      usage.set(material.id, current);
    } else {
      stonesPerPiece(productsBySku.get(item.sku), materialsById, productsBySku, depth + 1).forEach((inner) => {
        const current = usage.get(inner.materialId) || { ...inner, perPiece: 0 };
        current.perPiece += inner.perPiece * Number(item.quantity || 0);
        usage.set(inner.materialId, current);
      });
    }
  });
  return [...usage.values()].filter((stone) => stone.perPiece > 0);
}

interface MatchContext {
  stage: string;
  sku: string;
  variantSuffix: string;
  category: string;
  materialId?: string;
}

function cardMatches(card: FinanceRateCard, context: MatchContext): boolean {
  const match = card.match || {};
  if (match.stage && match.stage !== context.stage) return false;
  if (match.sku_prefix && !context.sku.toUpperCase().startsWith(match.sku_prefix.toUpperCase())) return false;
  if (match.category && !matchesProductCategory(context.category, match.category)) return false;
  if (match.stone_code && !context.variantSuffix.toUpperCase().includes(match.stone_code.toUpperCase())) return false;
  if (match.material_id && match.material_id !== context.materialId) return false;
  if (card.unit === 'per_stone' && !context.materialId) return false;
  if (card.unit !== 'per_stone' && context.materialId) return false;
  return true;
}

const specificity = (card: FinanceRateCard): number =>
  Object.values(card.match || {}).filter((value) => value !== undefined && value !== null && value !== '').length;

/** Highest priority wins; on a tie the more specific card wins. */
export function pickRateCard(cards: readonly FinanceRateCard[], context: MatchContext): FinanceRateCard | undefined {
  return cards
    .filter((card) => card.is_active && cardMatches(card, context))
    .sort((a, b) => b.priority - a.priority || specificity(b) - specificity(a)
      || getProductCategoryPath(b.match?.category).length - getProductCategoryPath(a.match?.category).length)[0];
}

export interface StatementSuggestion {
  lines: FinanceStatementLine[];
  unmatched: Array<{ assignment: ProductionStageAssignment; reason: string }>;
  total: number;
}

/**
 * Builds the lines of a partner statement from unbilled production assignments.
 * Stone-priced cards produce one line per stone type; piece/gram/fixed cards one line per batch.
 */
export function suggestStatement(params: {
  assignments: readonly ProductionStageAssignment[];
  rateCards: readonly FinanceRateCard[];
  products: readonly Product[];
  materials: readonly Material[];
  batches?: readonly ProductionBatch[];
}): StatementSuggestion {
  const productsBySku = new Map(params.products.map((product) => [product.sku, product]));
  const materialsById = new Map(params.materials.map((material) => [material.id, material]));
  const batchById = new Map((params.batches || []).map((batch) => [batch.id, batch]));
  const lines: FinanceStatementLine[] = [];
  const unmatched: StatementSuggestion['unmatched'] = [];

  params.assignments.filter((assignment) => !assignment.statement_id).forEach((assignment) => {
    const batch = batchById.get(assignment.batch_id);
    const sku = assignment.sku || batch?.sku || '';
    const variantSuffix = assignment.variant_suffix ?? batch?.variant_suffix ?? '';
    const product = productsBySku.get(sku);
    const base: MatchContext = { stage: assignment.stage, sku, variantSuffix: variantSuffix || '', category: product?.category || '' };
    const quantity = assignment.quantity;
    const before = lines.length;

    stonesPerPiece(product, materialsById, productsBySku).forEach((stone) => {
      const card = pickRateCard(params.rateCards, { ...base, materialId: stone.materialId });
      if (!card) return;
      const units = stone.perPiece * quantity;
      lines.push({
        assignment_id: assignment.id, batch_id: assignment.batch_id, sku, variant_suffix: variantSuffix, quantity,
        rate_card_id: card.id, label: `${sku}${variantSuffix || ''} · ${stone.name}`, unit: card.unit,
        units: roundMoney(units), rate: card.rate, amount: roundMoney(units * card.rate),
      });
    });

    const pieceCard = pickRateCard(params.rateCards, base);
    if (pieceCard) {
      const weight = Number(product?.weight_g || 0) + Number(product?.secondary_weight_g || 0);
      const units = pieceCard.unit === 'per_gram' ? weight * quantity
        : pieceCard.unit === 'fixed' ? 1
        : pieceCard.unit === 'per_hour' ? 0
        : quantity;
      lines.push({
        assignment_id: assignment.id, batch_id: assignment.batch_id, sku, variant_suffix: variantSuffix, quantity,
        rate_card_id: pieceCard.id, label: `${sku}${variantSuffix || ''} · ${pieceCard.label}`, unit: pieceCard.unit,
        units: roundMoney(units), rate: pieceCard.rate, amount: roundMoney(units * pieceCard.rate),
      });
    }

    if (lines.length === before) {
      unmatched.push({
        assignment,
        reason: product ? 'Δεν βρέθηκε τιμή στον τιμοκατάλογο του συνεργάτη.' : 'Ο κωδικός δεν υπάρχει πλέον στο μητρώο.',
      });
    }
  });

  return { lines, unmatched, total: roundMoney(lines.reduce((sum, line) => sum + line.amount, 0)) };
}

export const recalcLine = (line: FinanceStatementLine): FinanceStatementLine => ({
  ...line,
  amount: roundMoney(line.units * line.rate),
});
