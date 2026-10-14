import React from 'react';
import {
  ACTIVITY_META, TIER_META, TIER_ORDER, tierRangeLabel,
  type CustomerActivity, type CustomerDirectoryEntry, type CustomerTier,
} from '../../features/customers/customerLocation';

interface Props {
  entries: CustomerDirectoryEntry[];
  activity: CustomerActivity | null;
  tier: CustomerTier | null;
  onChange: (activity: CustomerActivity | null, tier: CustomerTier | null) => void;
}

const ACTIVITIES: CustomerActivity[] = ['active', 'quiet', 'inactive', 'none'];
const buttonClass = (selected: boolean) => `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`;

export default function CustomerCategoryFilter({ entries, activity, tier, onChange }: Props) {
  const counts = { active: 0, quiet: 0, inactive: 0, none: 0, top: 0, key: 0, steady: 0, regular: 0 };
  for (const entry of entries) {
    if (entry.isSystem) continue;
    counts[entry.activity] += 1;
    if (entry.tier) counts[entry.tier] += 1;
  }
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100 [scrollbar-width:none]" role="group" aria-label="Κατηγορία πελατών">
        <button type="button" aria-pressed={!activity} onClick={() => onChange(null, null)} className={buttonClass(!activity)}>Όλοι</button>
        {ACTIVITIES.map(value => (
          <button key={value} type="button" aria-pressed={activity === value} title={ACTIVITY_META[value].hint}
            onClick={() => onChange(activity === value ? null : value, null)} className={buttonClass(activity === value)}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_META[value].dot}`} />
            {ACTIVITY_META[value].plural} <span className="tabular-nums opacity-60">{counts[value]}</span>
          </button>
        ))}
      </div>
      {activity === 'active' && (
        <div className="flex items-center gap-2">
          <select aria-label="Υποκατηγορία ενεργών πελατών" value={tier ?? ''} onChange={event => onChange('active', (event.target.value || null) as CustomerTier | null)}
            className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            <option value="">Όλοι οι ενεργοί ({counts.active})</option>
            {TIER_ORDER.map(value => <option key={value} value={value}>{TIER_META[value].plural} · {tierRangeLabel(value)} ({counts[value]})</option>)}
          </select>
          <span className="text-[10px] text-slate-400">Τζίρος φέτος, χωρίς ΦΠΑ</span>
        </div>
      )}
    </div>
  );
}
