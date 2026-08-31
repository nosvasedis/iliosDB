import React from 'react';

type FulfillmentMode = 'sale' | 'consignment';

interface Props {
  value?: FulfillmentMode | null;
  onChange: (mode: FulfillmentMode) => void;
  label?: string;
  compact?: boolean;
}

export default function FulfillmentModeToggle({
  value,
  onChange,
  label,
  compact = false,
}: Props) {
  const mode: FulfillmentMode = value === 'consignment' ? 'consignment' : 'sale';
  const button = compact
    ? 'rounded-md px-2 py-1 text-[10px] font-black transition-colors'
    : 'rounded-lg px-3 py-1.5 text-[11px] font-black transition-colors';

  return (
    <div className={`flex items-center gap-2 ${compact ? '' : ''}`}>
      {label ? <span className="text-[10px] font-bold text-slate-500">{label}</span> : null}
      <div className="flex items-center rounded-lg bg-white p-0.5 shadow-sm ring-1 ring-slate-200">
        <button
          type="button"
          onClick={() => onChange('sale')}
          className={`${button} ${mode === 'sale' ? 'bg-[#060b00] text-white' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          Πώληση
        </button>
        <button
          type="button"
          onClick={() => onChange('consignment')}
          className={`${button} ${
            mode === 'consignment'
              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200'
              : 'text-slate-500 hover:bg-indigo-50/60'
          }`}
        >
          Παρακαταθήκη
        </button>
      </div>
    </div>
  );
}
