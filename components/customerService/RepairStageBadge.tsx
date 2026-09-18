import React from 'react';
import type { ProductionBatch, RepairItem } from '../../types';
import { getRepairProductionPresentation } from '../../features/customerService/repairProductionPresentation';

export default function RepairStageBadge({
  item,
  batch,
  className = '',
}: {
  item: RepairItem;
  batch?: ProductionBatch | null;
  className?: string;
}) {
  const presentation = getRepairProductionPresentation(item, batch);
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] font-black ${presentation.className} ${className}`}>
      {presentation.label}
    </span>
  );
}
