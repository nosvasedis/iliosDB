import { api } from '../../lib/supabase';
import type { AadeVatRegistryResult, CustomerVatLookupResult } from '../../types';

function registryAddress(result: AadeVatRegistryResult): string | null {
  const street = [result.address.street, result.address.number].filter(Boolean).join(' ').trim();
  const place = [result.address.postalCode, result.address.city].filter(Boolean).join(' ').trim();
  return [street, place].filter(Boolean).join(', ') || null;
}

function primaryProfession(result: AadeVatRegistryResult): string | null {
  const primary = result.activities.find(activity =>
    String(activity.kindDescription || '').toLocaleUpperCase('el-GR').includes('ΚΥΡΙΑ')
  ) || result.activities[0];
  return primary?.description?.trim() || null;
}

/** Official AADE registry first; VIES/VATComply only as a clearly identified fallback. */
export async function lookupCustomerVat(vatNumber: string): Promise<CustomerVatLookupResult> {
  let officialError: string | null = null;
  try {
    const settings = await api.getLegalSettings();
    const requestedByVat = String(settings.issuer.vat_number || '').replace(/^EL/i, '').replace(/\D/g, '');
    if (!/^\d{9}$/.test(requestedByVat)) {
      throw new Error('Δεν έχει ρυθμιστεί έγκυρο ΑΦΜ εκδότη για τον επίσημο έλεγχο ΑΑΔΕ.');
    }
    const result = await api.lookupAadeVatRegistry({ vatNumber, requestedByVat });
    return {
      source: 'aade_registry',
      name: result.businessName || result.tradeName || '',
      address: registryAddress(result),
      phone: result.phone || null,
      email: result.email || null,
      profession: primaryProfession(result),
      taxOffice: result.taxOfficeDescription || result.taxOfficeCode || null,
      active: result.active,
    };
  } catch (error) {
    officialError = error instanceof Error ? error.message : 'Ο επίσημος έλεγχος ΑΑΔΕ δεν ήταν διαθέσιμος.';
  }

  const fallback = await api.lookupAfm(vatNumber);
  if (!fallback) throw new Error(officialError || 'Δεν βρέθηκαν στοιχεία για το ΑΦΜ.');
  return {
    ...fallback,
    profession: null,
    taxOffice: null,
    active: null,
    fallbackReason: officialError,
  };
}

export function applyCustomerVatLookup<T extends {
  full_name: string;
  address?: string;
  phone?: string;
  email?: string;
  profession?: string;
  tax_office?: string;
}>(customer: T, result: CustomerVatLookupResult): T {
  return {
    ...customer,
    full_name: result.name || customer.full_name,
    address: result.address || customer.address,
    phone: customer.phone || result.phone || undefined,
    email: customer.email || result.email || undefined,
    profession: result.profession || customer.profession,
    tax_office: result.taxOffice || customer.tax_office,
  };
}

export function describeCustomerVatLookup(result: CustomerVatLookupResult): string {
  if (result.source === 'aade_registry') {
    const fields = ['επωνυμία', result.address && 'διεύθυνση', result.profession && 'επάγγελμα', result.taxOffice && 'ΔΟΥ']
      .filter(Boolean).join(', ');
    return `Επίσημο Μητρώο ΑΑΔΕ: ${fields}${result.active === false ? ' · ΠΡΟΣΟΧΗ: ανενεργό ΑΦΜ' : ''}.`;
  }
  return `Βρέθηκαν βασικά στοιχεία μέσω ${result.source === 'vies' ? 'VIES' : 'VATComply'}. Το επάγγελμα και η ΔΟΥ δεν επιβεβαιώθηκαν από την ΑΑΔΕ.`;
}
