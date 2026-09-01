import React, { memo } from 'react';
import { ChevronRight, ImageIcon } from 'lucide-react';
import { resolveImageUrl } from '../../lib/supabase';
import { formatCurrency } from '../../utils/pricingEngine';
import {
  ORION_TYPE_CHIPS,
  type OrionDesignRanking,
  type OrionJewelleryType,
} from '../../features/dashboard/orionDesignAnalytics';

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-500 text-white ring-2 ring-amber-200',
  2: 'bg-slate-400 text-white ring-2 ring-slate-200',
  3: 'bg-orange-400 text-white ring-2 ring-orange-200',
};

const TYPE_DOT: Record<OrionJewelleryType, string> = {
  ring: 'bg-emerald-500',
  bracelet: 'bg-sky-500',
  pendant: 'bg-violet-500',
};

function TypeMixBar({ row }: { row: OrionDesignRanking }) {
  const total = row.quantity || 1;
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
      {ORION_TYPE_CHIPS.map((chip) => {
        const qty = row.typeMix[chip.id].quantity;
        if (qty <= 0) return null;
        return (
          <div
            key={chip.id}
            className={TYPE_DOT[chip.id]}
            style={{ width: `${(qty / total) * 100}%` }}
            title={`${chip.label}: ${qty} τεμ.`}
          />
        );
      })}
    </div>
  );
}

const DesignRow = memo(function DesignRow({
  row,
  onSelect,
}: {
  row: OrionDesignRanking;
  onSelect: () => void;
}) {
  const src = resolveImageUrl(row.image);
  const rankStyle = RANK_STYLES[row.rank];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="group w-full rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-200 hover:shadow-md"
    >
      <div className="flex gap-4">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
            rankStyle ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {row.rank}
        </div>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 shadow-sm">
          {src ? (
            <img src={src} alt={row.displayName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={20} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black text-slate-900">{row.displayName}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">Παράσταση {row.label}</p>
            </div>
            <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-300 group-hover:text-emerald-500" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50/80 px-2 py-1.5 ring-1 ring-emerald-100">
              <p className="text-[9px] font-bold uppercase text-emerald-600/80">Τεμ.</p>
              <p className="text-sm font-black text-emerald-900">{row.quantity}</p>
            </div>
            <div className="rounded-xl bg-blue-50/80 px-2 py-1.5 ring-1 ring-blue-100">
              <p className="text-[9px] font-bold uppercase text-blue-600/80">Έσοδα</p>
              <p className="text-sm font-black text-blue-900">{formatCurrency(row.revenue)}</p>
            </div>
            <div className="rounded-xl bg-teal-50/80 px-2 py-1.5 ring-1 ring-teal-100">
              <p className="text-[9px] font-bold uppercase text-teal-600/80">Κέρδος</p>
              <p className="text-sm font-black text-teal-900">{formatCurrency(row.profit)}</p>
            </div>
          </div>
          <TypeMixBar row={row} />
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-semibold text-slate-500">
            {ORION_TYPE_CHIPS.filter((chip) => row.typeMix[chip.id].quantity > 0).map((chip) => (
              <span key={chip.id} className="inline-flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[chip.id]}`} />
                {chip.label} {row.typeMix[chip.id].quantity}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
});

interface Props {
  rows: OrionDesignRanking[];
  jewelleryTypes: Set<OrionJewelleryType>;
  onToggleType: (type: OrionJewelleryType) => void;
  onSelectDesign: (designNo: number) => void;
  onShowSkus: () => void;
}

export default function OrionDesignRankList({
  rows,
  jewelleryTypes,
  onToggleType,
  onSelectDesign,
  onShowSkus,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-2 border-b border-slate-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {ORION_TYPE_CHIPS.map((chip) => {
            const active = jewelleryTypes.size === 0 || jewelleryTypes.has(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onToggleType(chip.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  active ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onShowSkus}
            className="ml-auto rounded-lg px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Κωδικοί
          </button>
        </div>
        {rows.length > 0 && (
          <p className="text-[10px] font-bold text-slate-400">{rows.length} παραστάσεις</p>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-4 py-4">
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            Δεν βρέθηκαν παραστάσεις με τα τρέχοντα φίλτρα.
          </div>
        ) : (
          rows.map((row) => (
            <DesignRow key={row.designNo} row={row} onSelect={() => onSelectDesign(row.designNo)} />
          ))
        )}
      </div>
    </div>
  );
}
