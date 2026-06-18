import React from 'react';
import { getTechnicianRateForWeight } from '../../utils/laborFormula';

export interface TechnicianTier {
  id: string;
  label: string;
  rate: number;
  matches: (weightG: number) => boolean;
  activeClass: string;
  idleClass: string;
}

export const TECHNICIAN_TIERS: TechnicianTier[] = [
  {
    id: 'xs',
    label: '≤2,2g',
    rate: 1.30,
    matches: (w) => w > 0 && w <= 2.2,
    activeClass: 'bg-rose-100 text-rose-800 border-rose-300 ring-2 ring-rose-400/40 font-black',
    idleClass: 'bg-slate-50 text-slate-400 border-slate-100',
  },
  {
    id: 's',
    label: '≤4,2g',
    rate: 0.90,
    matches: (w) => w > 2.2 && w <= 4.2,
    activeClass: 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-400/40 font-black',
    idleClass: 'bg-slate-50 text-slate-400 border-slate-100',
  },
  {
    id: 'm',
    label: '≤8,2g',
    rate: 0.70,
    matches: (w) => w > 4.2 && w <= 8.2,
    activeClass: 'bg-sky-100 text-sky-900 border-sky-300 ring-2 ring-sky-400/40 font-black',
    idleClass: 'bg-slate-50 text-slate-400 border-slate-100',
  },
  {
    id: 'l',
    label: '>8,2g',
    rate: 0.50,
    matches: (w) => w > 8.2,
    activeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300 ring-2 ring-emerald-400/40 font-black',
    idleClass: 'bg-slate-50 text-slate-400 border-slate-100',
  },
];

function tierForWeight(weightG: number): TechnicianTier | null {
  if (weightG <= 0) return null;
  return TECHNICIAN_TIERS.find((t) => t.matches(weightG)) ?? null;
}

interface Props {
  /** Weight used to pick the highlighted tier (total weight for lump sum). */
  primaryWeightG: number;
  /** D-split: secondary piece uses its own tier. */
  secondaryWeightG?: number;
  compact?: boolean;
}

export const TechnicianTierScale: React.FC<Props> = ({
  primaryWeightG,
  secondaryWeightG = 0,
  compact = false,
}) => {
  const primaryTier = tierForWeight(primaryWeightG);
  const secondaryTier = secondaryWeightG > 0 ? tierForWeight(secondaryWeightG) : null;

  return (
    <div className={`mt-2 ${compact ? 'space-y-1' : 'space-y-1.5'}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        Κλιμάκωση τεχνίτη
      </div>
      <div className="flex flex-wrap gap-1">
        {TECHNICIAN_TIERS.map((tier) => {
          const isPrimary = primaryTier?.id === tier.id;
          const isSecondary = secondaryTier?.id === tier.id && !isPrimary;
          const isActive = isPrimary || isSecondary;
          return (
            <span
              key={tier.id}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] transition-all ${
                isPrimary
                  ? tier.activeClass
                  : isSecondary
                    ? `${tier.activeClass} ring-dashed opacity-90`
                    : tier.idleClass
              }`}
              title={
                isPrimary
                  ? `Κλιμάκωση για ${primaryWeightG.toFixed(2)}g`
                  : isSecondary
                    ? `Κλιμάκωση δευτερεύοντος ${secondaryWeightG.toFixed(2)}g`
                    : undefined
              }
            >
              <span>{tier.label}</span>
              <span className={isActive ? 'opacity-80' : 'opacity-60'}>→</span>
              <span className="font-mono">{tier.rate.toFixed(2)}€/g</span>
            </span>
          );
        })}
      </div>
      {secondaryTier && primaryTier && (
        <p className="text-[10px] text-slate-400 leading-snug">
          Έντονη: κύριο ({primaryWeightG.toFixed(2)}g × {getTechnicianRateForWeight(primaryWeightG).toFixed(2)}€)
          {secondaryWeightG > 0 && (
            <> · Δευτερεύον ({secondaryWeightG.toFixed(2)}g × {getTechnicianRateForWeight(secondaryWeightG).toFixed(2)}€)</>
          )}
        </p>
      )}
    </div>
  );
};

TechnicianTierScale.displayName = 'TechnicianTierScale';
