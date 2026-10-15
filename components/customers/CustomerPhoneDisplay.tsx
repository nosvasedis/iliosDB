import React from 'react';
import { customerPhones, type CustomerPhones } from '../../features/customers/customerPhones';

export default function CustomerPhoneDisplay({ customer }: { customer: CustomerPhones }) {
  const fields = customerPhones(customer);
  return <div className="space-y-1 text-xs text-slate-600">
    {Object.entries(fields).filter(([, value]) => value).map(([field, value]) => <div key={field}>
      <span className="font-semibold">{field === 'mobile_phone' ? 'Κινητό' : field === 'landline_phone' ? 'Σταθερό' : 'Προς έλεγχο'}: </span>
      {value.split(' / ').map((number, index) => <React.Fragment key={index}>
        {index > 0 && ' / '}<a onClick={event => event.stopPropagation()} href={`tel:${number.replace(/\([^)]*\)/g, '').replace(/[^+\d]/g, '')}`} className="hover:text-sky-700">{number}</a>
      </React.Fragment>)}
    </div>)}
    {!Object.values(fields).some(Boolean) && <span className="text-slate-400">Χωρίς τηλέφωνο</span>}
  </div>;
}
