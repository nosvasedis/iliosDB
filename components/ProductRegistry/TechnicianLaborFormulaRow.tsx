import type { PricingSettings } from '../../utils/pricingRules';
import React, { useMemo } from 'react';
import { FINISH_CODES } from '../../constants';
import { LaborCost, Product } from '../../types';
import {
  getTechnicianAutoLineForFinish,
  getTechnicianFormulaLine,
  getTechnicianSplitDetailHint,
  getTotalWeight,
  SPLIT_TECHNICIAN_HINT,
  type LaborFormulaLine,
} from '../../utils/laborFormula';
import { getVariantComponents } from '../../utils/pricingEngine';
import { LaborCostFormulaRow } from './LaborCostFormulaRow';
import { TechnicianTierScale } from './TechnicianTierScale';

type TechnicianProduct = Pick<
  Product,
  'weight_g' | 'secondary_weight_g' | 'is_component' | 'gender' | 'variants'
>;

export interface TechnicianLaborFormulaRowProps {
  settings?: PricingSettings;
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

export interface ResolvedTechnicianRow {
  line: LaborFormulaLine;
  readOnly: boolean;
  contextLabel?: string;
  hint?: string;
  showTierScale: boolean;
  tierPrimaryWeight: number;
  tierSecondaryWeight: number;
}

/**
 * Which technician rule applies for the variant in view (shared by the wizard row
 * and the SKU card labor sheet so both always agree).
 */
export function resolveTechnicianRow({
  settings,
  labor,
  product,
  useSplitTechnician,
  hasMixedTechnician,
  selectedVariantSuffix = null,
}: Pick<TechnicianLaborFormulaRowProps, 'settings' | 'labor' | 'product' | 'useSplitTechnician' | 'hasMixedTechnician' | 'selectedVariantSuffix'>): ResolvedTechnicianRow {
  const masterLine = getTechnicianFormulaLine(labor, product, useSplitTechnician, settings);
  const selectedFinishCode = selectedVariantSuffix == null
    ? null
    : getVariantComponents(selectedVariantSuffix, product.gender).finish.code;

  const showVariantRule = hasMixedTechnician
    && !product.is_component
    && selectedVariantSuffix != null
    && selectedFinishCode !== 'D';

  let line: LaborFormulaLine = masterLine;
  let readOnly = false;
  let contextLabel: string | undefined;

  if (showVariantRule) {
    line = getTechnicianAutoLineForFinish(product, selectedFinishCode ?? 'P', settings);
    readOnly = true;
    contextLabel = finishLabel(selectedFinishCode ?? '');
  }

  let hint: string | undefined;
  if (!(line.isOverridden && !readOnly) && !product.is_component && !readOnly && useSplitTechnician) {
    hint = `${SPLIT_TECHNICIAN_HINT} · ${getTechnicianSplitDetailHint(product, settings)}`;
  }

  return {
    line,
    readOnly,
    contextLabel,
    hint,
    showTierScale: !product.is_component,
    tierPrimaryWeight: useSplitTechnician && !readOnly ? getTotalWeight(product) : line.weightBasis,
    tierSecondaryWeight: useSplitTechnician && !readOnly ? (product.secondary_weight_g || 0) : 0,
  };
}

export const TechnicianLaborFormulaRow: React.FC<TechnicianLaborFormulaRowProps> = ({
  settings,
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
  const { line, readOnly, contextLabel, hint, showTierScale, tierPrimaryWeight, tierSecondaryWeight } = useMemo(
    () => resolveTechnicianRow({ settings, labor, product, useSplitTechnician, hasMixedTechnician, selectedVariantSuffix }),
    [settings, labor, product, useSplitTechnician, hasMixedTechnician, selectedVariantSuffix],
  );

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
      footer={showTierScale ? (
        <TechnicianTierScale
          primaryWeightG={tierPrimaryWeight}
          secondaryWeightG={tierSecondaryWeight}
          compact
        />
      ) : undefined}
    />
  );
};

TechnicianLaborFormulaRow.displayName = 'TechnicianLaborFormulaRow';
