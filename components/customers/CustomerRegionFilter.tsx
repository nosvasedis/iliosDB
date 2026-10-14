import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, MapPinOff, Map as MapIcon, Search, X } from 'lucide-react';
import { GREEK_PERIFERIES, GREEK_REGIONAL_UNITS } from '../../features/customers/greekRegions';
import { NO_REGION_KEY, type RegionCounts, type RegionFilterKey } from '../../features/customers/customerLocation';
import { normalizedIncludes } from '../../utils/greekSearch';

interface Props {
  counts: RegionCounts;
  selection: RegionFilterKey[];
  onChange: (next: RegionFilterKey[]) => void;
  className?: string;
}

const unitsOf = (periferiaId: string) => GREEK_REGIONAL_UNITS.filter(u => u.periferiaId === periferiaId);

/** Applies a Περιφέρεια / ΠΕ toggle while keeping the selection minimal (whole region ↔ its units). */
export function toggleRegionKey(selection: RegionFilterKey[], key: RegionFilterKey, counts: RegionCounts): RegionFilterKey[] {
  if (key === NO_REGION_KEY || key.startsWith('p:')) {
    const id = key.slice(2);
    const withoutChildren = key === NO_REGION_KEY
      ? selection
      : selection.filter(k => !unitsOf(id).some(u => k === `u:${u.id}`));
    return withoutChildren.includes(key) ? withoutChildren.filter(k => k !== key) : [...withoutChildren, key];
  }

  const unitId = key.slice(2);
  const unitInfo = GREEK_REGIONAL_UNITS.find(u => u.id === unitId);
  if (!unitInfo) return selection;
  const parentKey = `p:${unitInfo.periferiaId}`;
  const siblings = unitsOf(unitInfo.periferiaId).filter(u => (counts.units[u.id] ?? 0) > 0).map(u => `u:${u.id}`);

  if (selection.includes(parentKey)) {
    // Whole region was selected: deselect just this unit.
    return [...selection.filter(k => k !== parentKey), ...siblings.filter(k => k !== key)];
  }
  const next = selection.includes(key) ? selection.filter(k => k !== key) : [...selection, key];
  const allSiblingsSelected = siblings.length > 1 && siblings.every(k => next.includes(k));
  return allSiblingsSelected ? [...next.filter(k => !siblings.includes(k)), parentKey] : next;
}

function Tick({ state }: { state: 'on' | 'off' | 'partial' }) {
  return (
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition ${
      state === 'on' ? 'border-[#060b00] bg-[#060b00] text-white'
        : state === 'partial' ? 'border-[#060b00] bg-white' : 'border-slate-300 bg-white group-hover:border-slate-400'}`}
    >
      {state === 'on' && <Check size={11} strokeWidth={3.5} />}
      {state === 'partial' && <span className="h-1.5 w-1.5 rounded-sm bg-[#060b00]" />}
    </span>
  );
}

export default function CustomerRegionFilter({ counts, selection, onChange, className = '' }: Props) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showEmpty, setShowEmpty] = useState(false);

  const total = useMemo(
    () => Object.values(counts.periferia).reduce((a, b) => a + b, 0) + counts.none,
    [counts],
  );
  const max = Math.max(1, ...Object.values(counts.periferia), counts.none);

  const regions = useMemo(() => GREEK_PERIFERIES
    .map(p => ({
      ...p,
      count: counts.periferia[p.id] ?? 0,
      units: unitsOf(p.id).map(u => ({ ...u, count: counts.units[u.id] ?? 0 })),
    }))
    .filter(p => showEmpty || p.count > 0 || selection.includes(`p:${p.id}`))
    .filter(p => !query || normalizedIncludes(p.label, query) || p.units.some(u => normalizedIncludes(u.label, query)))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'el')),
  [counts, showEmpty, selection, query]);

  const toggle = (key: RegionFilterKey) => onChange(toggleRegionKey(selection, key, counts));

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-sm font-black text-slate-800">
          <MapIcon size={16} className="text-sky-600" /> Περιοχές
        </div>
        {selection.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800">
            <X size={12} /> Καθαρισμός
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Εύρεση περιοχής…"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
        />
      </div>

      <div className="custom-scrollbar -mx-1 mt-3 min-h-0 flex-1 overflow-y-auto px-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`mb-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition ${selection.length === 0 ? 'bg-[#060b00] text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
        >
          Όλες οι περιοχές
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${selection.length === 0 ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{total}</span>
        </button>

        {regions.map(region => {
          const regionKey = `p:${region.id}`;
          const regionOn = selection.includes(regionKey);
          const someUnits = region.units.some(u => selection.includes(`u:${u.id}`));
          const isOpen = expanded[region.id] ?? (someUnits || Boolean(query));
          const visibleUnits = region.units.filter(u => (showEmpty || u.count > 0 || selection.includes(`u:${u.id}`))
            && (!query || normalizedIncludes(u.label, query) || normalizedIncludes(region.label, query)));
          return (
            <div key={region.id} className="rounded-xl">
              <div className="group flex items-center">
                <button
                  type="button"
                  onClick={() => toggle(regionKey)}
                  className={`relative flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-left transition ${regionOn ? 'bg-sky-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="absolute inset-y-1 left-0 rounded-r-full bg-sky-100/70 transition-all" style={{ width: `${(region.count / max) * 100}%` }} aria-hidden />
                  <span className="relative"><Tick state={regionOn ? 'on' : someUnits ? 'partial' : 'off'} /></span>
                  <span className={`relative min-w-0 flex-1 truncate text-xs font-bold ${region.count ? 'text-slate-700' : 'text-slate-300'}`}>{region.label}</span>
                  <span className="relative text-[11px] font-black tabular-nums text-slate-500">{region.count}</span>
                </button>
                {visibleUnits.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(prev => ({ ...prev, [region.id]: !isOpen }))}
                    className="ml-0.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label={isOpen ? 'Σύμπτυξη' : 'Ανάπτυξη'}
                  >
                    <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
              {isOpen && visibleUnits.length > 0 && (
                <div className="mb-1 ml-5 border-l border-slate-100 pl-2">
                  {visibleUnits.map(u => {
                    const unitOn = regionOn || selection.includes(`u:${u.id}`);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle(`u:${u.id}`)}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-50"
                      >
                        <Tick state={unitOn ? 'on' : 'off'} />
                        <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${u.count ? 'text-slate-600' : 'text-slate-300'}`}>{u.label}</span>
                        <span className="text-[10px] font-bold tabular-nums text-slate-400">{u.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {(counts.none > 0 || selection.includes(NO_REGION_KEY)) && !query && (
          <button
            type="button"
            onClick={() => toggle(NO_REGION_KEY)}
            className={`group mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition ${selection.includes(NO_REGION_KEY) ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
          >
            <Tick state={selection.includes(NO_REGION_KEY) ? 'on' : 'off'} />
            <MapPinOff size={13} className="text-amber-500" />
            <span className="flex-1 text-xs font-bold text-slate-600">Χωρίς περιοχή</span>
            <span className="text-[11px] font-black tabular-nums text-slate-500">{counts.none}</span>
          </button>
        )}

        {regions.length === 0 && <div className="py-6 text-center text-xs italic text-slate-400">Δεν βρέθηκε περιοχή.</div>}
      </div>

      <button
        type="button"
        onClick={() => setShowEmpty(v => !v)}
        className="mt-2 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
      >
        {showEmpty ? 'Απόκρυψη κενών περιοχών' : 'Εμφάνιση όλων των περιοχών'}
      </button>
    </div>
  );
}
