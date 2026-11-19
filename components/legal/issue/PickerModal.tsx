import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, Check, Search, UserRound, X } from 'lucide-react';
import type { Customer, Supplier } from '../../../types';
import { useEscapeToClose } from '../../../hooks/useEscapeToClose';
import { SupplierAvatar } from '../../suppliers/SupplierCard';
import { inputBaseClass } from './ui';

/** Centered dialog for the long lists of the creation step (orders, customers, partners). */
export function PickerModal({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  useEscapeToClose(onClose);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-black tracking-tight text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-sm font-medium text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Κλείσιμο"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

const normalize = (value: string) => value.toLocaleLowerCase('el-GR').normalize('NFD').replace(/[̀-ͯ]/g, '');

export type CounterpartChoice = { kind: 'customer'; id: string } | { kind: 'supplier'; id: string };

/** Searchable list of customers or partners for a manual document. */
export function CounterpartPickerModal({
  kind,
  customers,
  suppliers,
  selected,
  onSelect,
  onClose,
}: {
  kind: CounterpartChoice['kind'];
  customers: Customer[];
  suppliers: Supplier[];
  selected: CounterpartChoice | null;
  onSelect: (choice: CounterpartChoice) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const needle = normalize(query.trim());
  const rows = useMemo(() => {
    const all = kind === 'customer'
      ? customers.map((customer) => ({ id: customer.id, name: customer.full_name, vat: customer.vat_number || '', detail: customer.address || '', code: customer.customer_code || '', logo: null as string | null }))
      : suppliers.filter((supplier) => supplier.is_active !== false).map((supplier) => ({ id: supplier.id, name: supplier.name, vat: supplier.vat_number || '', detail: supplier.address || '', code: '', logo: supplier.logo_url || null }));
    return all
      .filter((row) => !needle || normalize([row.name, row.vat, row.code, row.detail].join(' ')).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'el'))
      .slice(0, 80);
  }, [kind, customers, suppliers, needle]);

  return (
    <PickerModal
      title={kind === 'customer' ? 'Επιλογή πελάτη' : 'Επιλογή συνεργάτη / προμηθευτή'}
      subtitle={kind === 'customer' ? 'Συμπληρώνονται ΑΦΜ, επωνυμία, ΔΟΥ, έδρα και καθεστώς ΦΠΑ.' : 'Για δελτία αποστολής ή παραστατικά προς συνεργάτες (π.χ. χυτήριο). Συμπληρώνονται ΑΦΜ, ΔΟΥ και έδρα.'}
      onClose={onClose}
    >
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && rows[0]) { event.preventDefault(); onSelect({ kind, id: rows[0].id }); } }}
          placeholder="Αναζήτηση επωνυμίας, ΑΦΜ ή κωδικού"
          aria-label="Αναζήτηση"
          className={`${inputBaseClass} pl-9`}
        />
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm font-medium text-slate-500">Δεν βρέθηκαν αποτελέσματα.</p>
      ) : (
        <ul role="listbox" aria-label={kind === 'customer' ? 'Πελάτες' : 'Συνεργάτες'} className="grid gap-1.5 sm:grid-cols-2">
          {rows.map((row) => {
            const active = selected?.kind === kind && selected.id === row.id;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect({ kind, id: row.id })}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                >
                  {kind === 'supplier'
                    ? <SupplierAvatar name={row.name} logoUrl={row.logo} size="sm" />
                    : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><UserRound size={16} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-900">{row.name}</span>
                    <span className="block truncate text-[11px] font-medium text-slate-500">
                      {[row.vat ? `ΑΦΜ ${row.vat}` : 'Χωρίς ΑΦΜ', row.code ? `κωδ. ${row.code}` : '', row.detail].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {active ? <Check size={16} className="shrink-0 text-emerald-600" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {kind === 'supplier' ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><Building2 size={12} /> Νέους συνεργάτες τους προσθέτετε στους «Προμηθευτές & Συνεργάτες».</p>
      ) : null}
    </PickerModal>
  );
}
