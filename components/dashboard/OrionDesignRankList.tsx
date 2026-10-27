import { formatNumber } from '../../utils/numberFormat';
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
  1: 'bg-amber-400 text-amber-950',
  2: 'bg-slate-300 text-slate-800',
  3: 'bg-orange-300 text-orange-950',
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
            title={`${chip.label}: ${formatNumber(qty)} τεμ.`}
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
      className="group w-full rounded-2xl bg-white p-3 text-left ring-1 ring-slate-200/70 transition-all hover:shadow-sm hover:ring-slate-300"
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black tabular-nums ${
            rankStyle ?? 'bg-slate-100 text-slate-500'
          }`}
        >
          {formatNumber(row.rank)}
        </span>
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200/60">
          {src ? (
            <img src={src} alt={row.displayName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-300">
              <ImageIcon size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-900">{row.displayName}</p>
          <p className="text-[11px] font-medium text-slate-400">Παράσταση {row.label}</p>
          <TypeMixBar row={row} />
        </div>
        <div className="hidden shrink-0 grid-cols-[3.25rem_5.75rem_5.75rem] gap-2 text-right sm:grid">
          {[
            { label: 'Τεμ.', value: formatNumber(row.quantity) },
            { label: 'Έσοδα', value: formatCurrency(row.revenue) },
            { label: 'Κέρδος', value: formatCurrency(row.profit) },
          ].map((cell) => (
            <div key={cell.label}>
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{cell.label}</p>
              <p className="truncate text-xs font-black tabular-nums text-slate-800">{cell.value}</p>
            </div>
          ))}
        </div>
        <ChevronRight size={16} className="shrink-0 text-slate-300 transition-colors group-hover:text-emerald-500" />
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center sm:hidden">
        {[
          { label: 'Τεμ.', value: formatNumber(row.quantity) },
          { label: 'Έσοδα', value: formatCurrency(row.revenue) },
          { label: 'Κέρδος', value: formatCurrency(row.profit) },
        ].map((cell) => (
          <div key={cell.label} className="rounded-lg bg-slate-50 px-1 py-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{cell.label}</p>
            <p className="truncate text-xs font-black tabular-nums text-slate-800">{cell.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-[6.25rem] text-[10px] font-semibold text-slate-500">
        {ORION_TYPE_CHIPS.filter((chip) => row.typeMix[chip.id].quantity > 0).map((chip) => (
          <span key={chip.id} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[chip.id]}`} />
            {chip.label} {formatNumber(row.typeMix[chip.id].quantity)}
          </span>
        ))}
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
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/70 bg-white px-4 py-2.5 sm:px-5">
        {ORION_TYPE_CHIPS.map((chip) => {
          const active = jewelleryTypes.size === 0 || jewelleryTypes.has(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggleType(chip.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                active ? 'bg-white text-slate-900 ring-1 ring-slate-300' : 'bg-slate-100 text-slate-400 hover:text-slate-700'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${active ? TYPE_DOT[chip.id] : 'bg-slate-300'}`} />
              {chip.label}
            </button>
          );
        })}
        {rows.length > 0 && (
          <span className="text-[11px] font-semibold text-slate-400">{formatNumber(rows.length)} παραστάσεις</span>
        )}
        <button
          type="button"
          onClick={onShowSkus}
          className="ml-auto rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          Προβολή κωδικών
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
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
