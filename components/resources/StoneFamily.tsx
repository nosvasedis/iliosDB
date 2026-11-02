import React from 'react';
import type { Material } from '../../types';
import { getStoneFamily, STONE_FAMILIES, type StoneFamily } from '../../features/resources/stoneFamilies';
import { formatNumber } from '../../utils/numberFormat';

export function StoneFamilyBadge({ material }: { material: Pick<Material, 'type' | 'name' | 'stones_per_strand'> }) {
  const family = STONE_FAMILIES.find((entry) => entry.id === getStoneFamily(material));
  if (!family) return null;
  return <span title={family.label} className={`inline-flex max-w-full rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${family.tone}`}>{family.label}</span>;
}

export function StoneFamilyFilters({ value, onChange, materials }: { value: StoneFamily | 'all'; onChange: (value: StoneFamily | 'all') => void; materials: readonly Material[] }) {
  const families = STONE_FAMILIES.filter((family) => family.id !== 'strand');
  return <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ομάδα συμβατικών πετρών">
    {[{ id: 'all' as const, shortLabel: 'Όλες οι ομάδες', label: '' }, ...families].map((family) => {
      const count = materials.filter((material) => {
        const group = getStoneFamily(material);
        return family.id === 'all' ? group !== null && group !== 'strand' : group === family.id;
      }).length;
      return <button type="button" key={family.id} title={family.label || undefined} aria-pressed={value === family.id} onClick={() => onChange(family.id)} className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${value === family.id ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        {family.shortLabel} <span className="ml-1 opacity-60">{formatNumber(count)}</span>
      </button>;
    })}
  </div>;
}

export function StoneFamilyHint({ material }: { material: Pick<Material, 'type' | 'name' | 'stones_per_strand'> }) {
  return <div className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3">
    <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-600">Ομάδα πέτρας</span><StoneFamilyBadge material={material} /></div>
    <p className="text-[11px] leading-relaxed text-slate-500">Αυτόματη ταξινόμηση: ονόματα με «ζιργκόν» → Ζιργκόν, Κορδόνι Αιματίτης / Όνυχας → πέτρες για κολιέ, υπόλοιπες συμβατικές → Διπλέτες. Οι πέτρες σε σειρά παραμένουν στο Κορδόνι. Οι ειδικές τιμές διατηρούνται ανά κωδικό.</p>
  </div>;
}
