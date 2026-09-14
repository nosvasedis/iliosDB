import React from 'react';
import { Customer } from '../types';
import {
  AADE_VAT_EXEMPTION_CATEGORY_OPTIONS,
  MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY,
  MOUNT_ATHOS_VAT_EXEMPTION_NOTE,
} from '../utils/legalDocuments';

export default function CustomerVatExemptionFields({
  customer,
  onChange,
}: {
  customer: Customer;
  onChange: (customer: Customer) => void;
}) {
  if (Math.abs(customer.vat_rate ?? 0.24) >= 0.001) return null;

  const applyMountAthos = () => onChange({
    ...customer,
    vat_rate: 0,
    vat_exemption_category: MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY,
    vat_exemption_legal_note: MOUNT_ATHOS_VAT_EXEMPTION_NOTE,
  });

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-black text-amber-950">Στοιχεία απαλλαγής ΦΠΑ</div>
          <div className="mt-0.5 text-[11px] leading-snug text-amber-800">Αποθηκεύονται στον πελάτη και εφαρμόζονται αυτόματα σε όλες τις γραμμές του παραστατικού.</div>
        </div>
        <button type="button" onClick={applyMountAthos} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-950 hover:bg-amber-100">
          Πελάτης Αγίου Όρους
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Αιτία απαλλαγής myDATA *</span>
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400"
          value={customer.vat_exemption_category ?? ''}
          onChange={(event) => onChange({ ...customer, vat_exemption_category: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Επιλέξτε την πραγματική αιτία...</option>
          {AADE_VAT_EXEMPTION_CATEGORY_OPTIONS.map((option) => (
            <option key={option.category} value={option.category}>{option.category} · {option.label}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Νομική ένδειξη στο PDF</span>
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-amber-400"
          value={customer.vat_exemption_legal_note || ''}
          onChange={(event) => onChange({ ...customer, vat_exemption_legal_note: event.target.value || null })}
          placeholder="Η ακριβής ένδειξη που απαιτεί η νόμιμη βάση"
        />
      </label>
    </div>
  );
}
