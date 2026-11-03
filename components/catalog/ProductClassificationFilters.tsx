import React from 'react';
import { COMPONENT_FAMILIES, getComponentFamily, componentFamilyLabel } from '../../features/resources/componentFamilies';
import { PRODUCT_THEMES, type ProductTheme } from '../../features/products/productThemes';

const selectClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
export function ThemeFilter({ value = 'all', onChange }: { value?: string; onChange: (value: ProductTheme | 'all') => void }) {
  return <label className="block min-w-0 space-y-1.5 text-xs font-bold text-slate-500"><span>Θέμα</span><select className={selectClass} value={value} onChange={event => onChange(event.target.value as ProductTheme | 'all')}>
    <option value="all">Όλα τα θέματα</option>{PRODUCT_THEMES.map(theme => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
  </select></label>;
}
export function ComponentFamilyFilter({ value = 'all', onChange }: { value?: string; onChange: (value: string) => void }) {
  return <label className="block min-w-0 space-y-1.5 text-xs font-bold text-slate-500"><span>Ομάδα εξαρτήματος STX</span><select className={selectClass} value={value} onChange={event => onChange(event.target.value)}>
    <option value="all">Όλες οι ομάδες STX</option>{COMPONENT_FAMILIES.map(family => <option key={family.id} value={family.id}>{family.label}</option>)}
  </select></label>;
}
export function ComponentFamilyBadge({ product }: { product: { is_component?: boolean; description?: string | null } }) {
  const family = getComponentFamily(product);
  return family ? <span className="inline-flex rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">{componentFamilyLabel(family)}</span> : null;
}
