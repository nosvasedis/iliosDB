import React from 'react';
import { Check } from 'lucide-react';
import {
  ACTIVITY_META, TIER_META, TIER_ORDER, tierRangeLabel,
  type CategorySelection, type CustomerActivity, type CustomerDirectoryEntry, type CustomerTier,
} from '../../features/customers/customerLocation';

interface Props {
  /** Entries in the current scope (other filters applied), so counts follow regions/search. */
  entries: CustomerDirectoryEntry[];
  value: CategorySelection;
  onChange: (next: CategorySelection) => void;
}

const ACTIVITIES: CustomerActivity[] = ['active', 'quiet', 'inactive', 'none'];
const chip = (selected: boolean) => `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`;

/** Multi-select: e.g. Ενεργοί + Σε ύφεση; when Ενεργοί is on, its tiers can be narrowed too. */
export default function CustomerCategoryFilter({ entries, value, onChange }: Props) {
  const counts = { active: 0, quiet: 0, inactive: 0, none: 0, top: 0, key: 0, steady: 0, regular: 0 };
  for (const entry of entries) {
    if (entry.isSystem) continue;
    counts[entry.activity] += 1;
    if (entry.tier) counts[entry.tier] += 1;
  }
  const all = value.activities.length === 0;
  const toggleActivity = (activity: CustomerActivity) => {
    const on = value.activities.includes(activity);
    const activities = on ? value.activities.filter(a => a !== activity) : [...value.activities, activity];
    onChange({ activities: ACTIVITIES.filter(a => activities.includes(a)), tiers: activities.includes('active') ? value.tiers : [] });
  };
  const toggleTier = (tier: CustomerTier) => {
    const tiers = value.tiers.includes(tier) ? value.tiers.filter(t => t !== tier) : [...value.tiers, tier];
    onChange({ activities: value.activities, tiers: TIER_ORDER.filter(t => tiers.includes(t)) });
  };

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-100 [scrollbar-width:none]" role="group" aria-label="Κατηγορία πελατών (πολλαπλή επιλογή)">
        <button type="button" aria-pressed={all} onClick={() => onChange({ activities: [], tiers: [] })} className={chip(all)}>Όλοι</button>
        {ACTIVITIES.map(activity => {
          const selected = value.activities.includes(activity);
          return (
            <button key={activity} type="button" aria-pressed={selected} title={ACTIVITY_META[activity].hint}
              onClick={() => toggleActivity(activity)} className={chip(selected)}>
              {selected ? <Check size={11} strokeWidth={3} className="shrink-0" /> : <span className={`h-2 w-2 shrink-0 rounded-full ${ACTIVITY_META[activity].dot}`} />}
              {ACTIVITY_META[activity].plural} <span className="tabular-nums opacity-60">{counts[activity]}</span>
            </button>
          );
        })}
      </div>
      {value.activities.includes('active') && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Υποκατηγορίες ενεργών πελατών">
          <span className="mr-1 text-[10px] font-bold text-slate-400">Ενεργοί:</span>
          {TIER_ORDER.map(tier => {
            const selected = value.tiers.includes(tier);
            return (
              <button key={tier} type="button" aria-pressed={selected} title={`${tierRangeLabel(tier)} φέτος, χωρίς ΦΠΑ`} onClick={() => toggleTier(tier)}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ring-1 transition ${selected ? 'bg-slate-900 text-white ring-slate-900' : `${TIER_META[tier].soft} hover:opacity-80`}`}>
                {!selected && <span className={`h-1.5 w-1.5 rounded-full ${TIER_META[tier].dot}`} />}
                {TIER_META[tier].plural} <span className="tabular-nums opacity-60">{counts[tier]}</span>
              </button>
            );
          })}
          <span className="ml-1 text-[10px] text-slate-400">{value.tiers.length ? 'Τζίρος φέτος, χωρίς ΦΠΑ' : 'όλες οι βαθμίδες'}</span>
        </div>
      )}
    </div>
  );
}
