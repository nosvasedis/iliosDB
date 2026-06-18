import React, { useEffect, useMemo, useState } from 'react';
import { LaborCost, Product } from '../../types';
import {
  getTechnicianAutoLineForFinish,
  getTechnicianFormulaLine,
  getTechnicianSplitDetailHint,
  MIXED_TECHNICIAN_VARIANT_HINT,
  SPLIT_TECHNICIAN_HINT,
  TECHNICIAN_D_VARIANT_HINT,
  TECHNICIAN_LUMP_VARIANT_HINT,
  TECHNICIAN_MASTER_BADGE,
  TECHNICIAN_TIER_HINT,
  TECHNICIAN_VARIANT_RULE_BADGE,
  type LaborFormulaLine,
} from '../../utils/laborFormula';
import { getTechnicianCarouselSlides, type TechnicianCarouselSlide } from '../../utils/pricingEngine';
import { LaborCostFormulaRow } from './LaborCostFormulaRow';

type TechnicianProduct = Pick<
  Product,
  'weight_g' | 'secondary_weight_g' | 'is_component' | 'gender' | 'variants'
>;

export interface TechnicianLaborFormulaRowProps {
  icon: React.ReactNode;
  labor: LaborCost;
  product: TechnicianProduct;
  useSplitTechnician: boolean;
  hasMixedTechnician: boolean;
  onRateChange: (rate: number, weightBasis: number) => void;
  onWeightChange: (weight: number) => void;
  onTotalChange: (total: number) => void;
  onToggleOverride: () => void;
}

function lineForSlide(
  slide: TechnicianCarouselSlide,
  labor: LaborCost,
  product: TechnicianProduct,
  useSplitTechnician: boolean,
  masterLine: LaborFormulaLine,
): LaborFormulaLine {
  if (slide.isMasterStoredRule) {
    return masterLine;
  }
  // Standard lump — same formula for Λουστρέ / P / X / H (resolveTechnicianCostVariant non-D path).
  return getTechnicianAutoLineForFinish(product, 'P');
}

function hintForSlide(
  slide: TechnicianCarouselSlide,
  isOverridden: boolean,
  product: TechnicianProduct,
): string | undefined {
  if (slide.isMasterStoredRule && isOverridden) return undefined;
  if (slide.id === 'standard') {
    return TECHNICIAN_LUMP_VARIANT_HINT;
  }
  return `${TECHNICIAN_D_VARIANT_HINT} · ${MIXED_TECHNICIAN_VARIANT_HINT} · ${getTechnicianSplitDetailHint(product)}`;
}

export const TechnicianLaborFormulaRow: React.FC<TechnicianLaborFormulaRowProps> = ({
  icon,
  labor,
  product,
  useSplitTechnician,
  hasMixedTechnician,
  onRateChange,
  onWeightChange,
  onTotalChange,
  onToggleOverride,
}) => {
  const slides = useMemo(
    () => getTechnicianCarouselSlides(product),
    [product.gender, product.variants],
  );

  const showCarousel = hasMixedTechnician && !product.is_component && slides.length > 1;
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    setCarouselIndex(0);
  }, [slides.map((s) => s.id).join('|')]);

  const masterLine = useMemo(
    () => getTechnicianFormulaLine(labor, product, useSplitTechnician),
    [labor, product, useSplitTechnician],
  );

  if (!showCarousel) {
    const hint = product.is_component
      ? undefined
      : useSplitTechnician
        ? `${SPLIT_TECHNICIAN_HINT}${masterLine.usesSplitTechnician ? ` · ${getTechnicianSplitDetailHint(product)}` : ''}`
        : TECHNICIAN_TIER_HINT;

    return (
      <LaborCostFormulaRow
        icon={icon}
        label="Τεχνίτης (€)"
        rate={masterLine.rate}
        weightBasis={masterLine.weightBasis}
        total={masterLine.total}
        isOverridden={masterLine.isOverridden}
        onRateChange={(r) => onRateChange(r, masterLine.weightBasis)}
        onWeightChange={onWeightChange}
        onTotalChange={onTotalChange}
        onToggleOverride={onToggleOverride}
        hint={masterLine.isOverridden ? undefined : hint}
      />
    );
  }

  const safeIndex = carouselIndex % slides.length;
  const slide = slides[safeIndex];
  const isMasterSlide = slide.isMasterStoredRule;
  const line = lineForSlide(slide, labor, product, useSplitTechnician, masterLine);

  return (
    <LaborCostFormulaRow
      icon={icon}
      label="Τεχνίτης (€)"
      rate={line.rate}
      weightBasis={line.weightBasis}
      total={line.total}
      isOverridden={isMasterSlide ? line.isOverridden : false}
      readOnly={!isMasterSlide}
      statusBadge={isMasterSlide ? TECHNICIAN_MASTER_BADGE : TECHNICIAN_VARIANT_RULE_BADGE}
      carousel={{
        finishLabel: slide.finishLabel,
        finishCode: slide.finishCode,
        index: safeIndex,
        total: slides.length,
        onPrev: () => setCarouselIndex((i) => (i - 1 + slides.length) % slides.length),
        onNext: () => setCarouselIndex((i) => (i + 1) % slides.length),
      }}
      onRateChange={(r) => onRateChange(r, line.weightBasis)}
      onWeightChange={onWeightChange}
      onTotalChange={onTotalChange}
      onToggleOverride={onToggleOverride}
      hint={hintForSlide(slide, line.isOverridden, product)}
    />
  );
};

TechnicianLaborFormulaRow.displayName = 'TechnicianLaborFormulaRow';
