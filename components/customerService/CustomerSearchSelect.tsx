import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { normalizedIncludes } from '../../utils/greekSearch';

export type CustomerSearchOption = { id: string; full_name: string };

interface Props {
  customers: CustomerSearchOption[];
  value: string;
  onChange: (customerId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function CustomerSearchSelect({
  customers,
  value,
  onChange,
  disabled = false,
  placeholder = 'Αναζήτηση πελάτη…',
}: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = customers.find((customer) => customer.id === value);
  const matches = useMemo(
    () => customers.filter((customer) => normalizedIncludes(customer.full_name, query)).slice(0, 12),
    [customers, query],
  );

  return (
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={open ? query : (selected?.full_name || '')}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange('');
        }}
        onFocus={() => {
          setQuery(selected?.full_name || '');
          setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-500"
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-xs font-medium text-slate-500">Δεν βρέθηκε πελάτης.</div>
          ) : matches.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(customer.id);
                setQuery(customer.full_name);
                setOpen(false);
              }}
              className={`flex w-full px-3 py-2 text-left text-sm font-bold hover:bg-slate-50 ${
                customer.id === value ? 'bg-slate-50 text-[#060b00]' : 'text-slate-700'
              }`}
            >
              {customer.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
