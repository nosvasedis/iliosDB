import React, { useMemo } from 'react';
import { Check, Minus } from 'lucide-react';
import { getProductCategoryOptions, matchesProductCategory, toggleProductCategorySelection } from '../../utils/productCategories';

export default function ProductCategorySelection({ available, selected, onChange }: {
  available: string[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const options = useMemo(() => getProductCategoryOptions(available), [available]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  return <div className="space-y-1">
    {options.map((option) => {
      const branch = available.filter((category) => matchesProductCategory(category, option.value));
      const count = branch.filter((category) => selectedSet.has(category)).length;
      const full = count === branch.length && count > 0;
      const partial = count > 0 && !full;
      return <button key={option.value} type="button" role="checkbox" aria-checked={partial ? 'mixed' : full}
        onClick={() => onChange(toggleProductCategorySelection(selected, option.value, available))}
        style={{ paddingLeft: 12 + option.depth * 12 }}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-xs ${count ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600'}`}>
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${count ? 'bg-indigo-600 text-white' : 'border border-slate-300'}`}>
          {full ? <Check size={12} /> : partial ? <Minus size={12} /> : null}
        </span>
        <span className={option.depth === 0 ? 'font-bold' : ''}>{option.label}</span>
      </button>;
    })}
  </div>;
}
