import React, { useMemo } from 'react';
import type { Material, Product } from '../../types';
import type { FinanceCategory, FinanceExpense } from '../../features/finance/types';
import { summarizeBookedResources } from '../../features/finance/bookedResourceQuantities';
import ResourceQuantitiesPanel from './ResourceQuantitiesPanel';

export default function BookedResourceQuantitiesPanel({ expenses, categories, materials, products, periodLabel }: { expenses: readonly FinanceExpense[]; categories: readonly FinanceCategory[]; materials: readonly Material[]; products: readonly Product[]; periodLabel: string }) {
  const report = useMemo(() => summarizeBookedResources(expenses, categories, materials, products), [expenses, categories, materials, products]);
  return <ResourceQuantitiesPanel realized={report} periodLabel={periodLabel} basis="booked" />;
}
