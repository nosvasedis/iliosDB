import React from 'react';
import type { Customer } from '../../types';
import { customerPhones, withCustomerPhones } from '../../features/customers/customerPhones';

export default function CustomerPhoneFields({ customer, onChange, disabled = false }: {
  customer: Customer; onChange: (customer: Customer) => void; disabled?: boolean;
}) {
  const phones = customerPhones(customer);
  return <div className="space-y-2">
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['mobile_phone', 'landline_phone'] as const).map(field => <label key={field} className="block text-xs font-bold text-slate-500">
        {field === 'mobile_phone' ? 'Κινητό' : 'Σταθερό'}
        <input type="tel" disabled={disabled} value={phones[field]} placeholder={field === 'mobile_phone' ? '69…' : '2…'}
          onChange={event => onChange(withCustomerPhones(customer, { [field]: event.target.value }))}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-400 disabled:opacity-50" />
      </label>)}
    </div>
    {phones.phone_unclassified && <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950">
      <p>Παλαιό τηλέφωνο προς έλεγχο: <b>{phones.phone_unclassified}</b>. Δεν ταξινομήθηκε αυτόματα.</p>
      <div className="mt-2 flex gap-2">{(['mobile_phone', 'landline_phone'] as const).map(field => <button key={field} type="button" disabled={disabled}
        className="rounded-lg border border-amber-300 px-2 py-1 font-bold"
        onClick={() => onChange(withCustomerPhones(customer, { [field]: [phones[field], phones.phone_unclassified].filter(Boolean).join(' / '), phone_unclassified: '' }))}>
        Μεταφορά σε {field === 'mobile_phone' ? 'κινητό' : 'σταθερό'}
      </button>)}</div>
    </div>}
  </div>;
}
