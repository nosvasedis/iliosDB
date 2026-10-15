export interface CustomerPhones {
  phone?: string | null;
  mobile_phone?: string | null;
  landline_phone?: string | null;
  phone_unclassified?: string | null;
  country?: string | null;
}

/** Preserve labels, formatting and all numbers; only classify unambiguous Greek numbers. */
export function splitCustomerPhone(phone?: string | null, country?: string | null) {
  const mobile: string[] = [], landline: string[] = [], unknown: string[] = [];
  for (const part of (phone || '').split(/[,;/\n]+/).map(p => p.trim()).filter(Boolean)) {
    const digits = part.replace(/\([^)]*\)/g, '').replace(/\D/g, '');
    const explicitGreek = /^(?:0030|30)(?:69\d{8}|2\d{9})$/.test(digits);
    const domestic = !country || ['GR', 'EL', 'GRC'].includes(country.toUpperCase());
    const local = explicitGreek ? digits.slice(-10) : digits;
    if ((domestic || explicitGreek) && /^69\d{8}$/.test(local)) mobile.push(part);
    else if ((domestic || explicitGreek) && /^2\d{9}$/.test(local)) landline.push(part);
    else unknown.push(part);
  }
  return { mobile_phone: mobile.join(' / '), landline_phone: landline.join(' / '), phone_unclassified: unknown.join(' / ') };
}

export function customerPhones(customer: CustomerPhones) {
  // Null/undefined means an older client record; empty strings are deliberate clears.
  const legacy = splitCustomerPhone(customer.phone, customer.country);
  return {
    mobile_phone: customer.mobile_phone ?? legacy.mobile_phone,
    landline_phone: customer.landline_phone ?? legacy.landline_phone,
    phone_unclassified: customer.phone_unclassified ?? legacy.phone_unclassified,
  };
}

export function withCustomerPhones<T extends CustomerPhones>(customer: T, patch: Partial<ReturnType<typeof customerPhones>> = {}): T {
  const fields = { ...customerPhones(customer), ...patch };
  return { ...customer, ...fields, phone: [fields.mobile_phone, fields.landline_phone, fields.phone_unclassified].filter(Boolean).join(' / ') };
}
