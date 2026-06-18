import React, { useMemo } from 'react';
import { FINISH_CODES } from '../../constants';
import { LaborCost, Product } from '../../types';
import {
  getTechnicianAutoLineForFinish,
  getTechnicianFormulaLine,
  getTechnicianSplitDetailHint,
  SPLIT_TECHNICIAN_HINT,
  TECHNICIAN_TIER_HINT,
  type LaborFormulaLine,
} from '../../utils/laborFormula';
import { getVariantComponents } from '../../utils/pricingEngine';
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
  /** Active variant from product header pager — drives which technician rule is shown. */
  selectedVariantSuffix?: string | null;
  onRateChange: (rate: number, weightBasis: number) => void;
  onWeightChange: (weight: number) => void;
  onTotalChange: (total: number) => void;
  onToggleOverride: () => void;
}

function finishLabel(code: string): string {
  return FINISH_CODES[code] ?? code;
}

export const TechnicianLaborFormulaRow: React.FC<TechnicianLaborFormulaRowProps> = ({
  icon,
  labor,
  product,
  useSplitTechnician,
  hasMixedTechnician,
  selectedVariantSuffix = null,
  onRateChange,
  onWeightChange,
  onTotalChange,
  onToggleOverride,
}) => {
  const masterLine = useMemo(
    () => getTechnicianFormulaLine(labor, product, useSplitTechnician),
    [labor, product, useSplitTechnician],
  );

  const selectedFinishCode = useMemo(() => {
    if (selectedVariantSuffix == null) return null;
    return getVariantComponents(selectedVariantSuffix, product.gender).finish.code;
  }, [selectedVariantSuffix, product.gender]);

  const showVariantRule = hasMixedTechnician
    && !product.is_component
    && selectedVariantSuffix != null
    && selectedFinishCode !== 'D';

  let line: LaborFormulaLine = masterLine;
  let readOnly = false;
  let contextLabel: string | undefined;

  if (showVariantRule) {
    line = getTechnicianAutoLineForFinish(product, selectedFinishCode ?? 'P');
    readOnly = true;
    contextLabel = finishLabel(selectedFinishCode ?? '');
  }

  const hint = useMemo(() => {
    if (line.isOverridden && !readOnly) return undefined;
    if (product.is_component) return undefined;
    if (readOnly) return undefined;
    if (useSplitTechnician) {
      return `${SPLIT_TECHNICIAN_HINT} · ${getTechnicianSplitDetailHint(product)}`;
    }
    return TECHNICIAN_TIER_HINT;
  }, [line.isOverridden, readOnly, product, useSplitTechnician]);

  return (
    <LaborCostFormulaRow
      icon={icon}
      label="Τεχνίτης (€)"
      contextLabel={contextLabel}
      rate={line.rate}
      weightBasis={line.weightBasis}
      total={line.total}
      isOverridden={readOnly ? false : line.isOverridden}
      readOnly={readOnly}
      onRateChange={(r) => onRateChange(r, line.weightBasis)}
      onWeightChange={onWeightChange}
      onTotalChange={onTotalChange}
      onToggleOverride={onToggleOverride}
      hint={hint}
    />
  );
};

TechnicianLaborFormulaRow.displayName = 'TechnicianLaborFormulaRow';
