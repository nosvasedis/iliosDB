import React from 'react';
import type { ProductCollectionOption } from '../../utils/productCollectionScopes';

/** Keep real collection chips compact; browse virtual unassigned groups in a labelled picker. */
export default function UnassignedCollectionSelect({ options, value, onChange, allValue = 'all' }: {
  options: ProductCollectionOption[]; value: string | number; onChange: (value: string) => void; allValue?: string;
}) {
  const unassigned = options.filter(option => option.id === 'none' || option.id.startsWith('none:'));
  if (!unassigned.length) return null;
  return <label className="mt-3 block w-full min-w-0 space-y-1.5 text-xs font-bold text-slate-500">
    <span>Είδη χωρίς συλλογή</span>
    <select className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-700 outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      value={String(value).startsWith('none') ? value : ''} onChange={event => onChange(event.target.value || allValue)}>
      <option value="">Επιλογή ομάδας ειδών…</option>
      {unassigned.map(option => <option key={option.id} value={option.id}>{'　'.repeat(Math.max(0, option.depth - 1))}{option.name.replace('Χωρίς συλλογή · ', '')}</option>)}
    </select>
  </label>;
}
