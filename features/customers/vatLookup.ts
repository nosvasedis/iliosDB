import { api } from '../../lib/supabase';
import type { AadeVatRegistryResult, CustomerVatLookupResult, VatRegistryStatus } from '../../types';
import { customerPhones, splitCustomerPhone, withCustomerPhones } from './customerPhones';
import {
  cleanRegistryText, detectVatRegistryStatus, formatFreeAddress, formatProfession, formatRegistryAddress,
  formatRegistryName, formatTaxOffice, makeVatRegistryStatus,
} from './vatFormatting';

function primaryProfession(result: AadeVatRegistryResult): string | null {
  const primary = result.activities.find(activity =>
    String(activity.kindDescription || '').toLocaleUpperCase('el-GR').includes('ΚΥΡΙΑ')
  ) || result.activities[0];
  return formatProfession(primary?.description);
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
    const business = formatRegistryName(result.businessName);
    const trade = formatRegistryName(result.tradeName);
    const status = detectVatRegistryStatus({
      active: result.active,
      activeDescription: result.activeDescription,
      businessStatus: result.businessStatus,
      legalStatus: result.legalStatus,
      stopDate: result.stopDate,
      names: [result.businessName, result.tradeName],
    });
    return {
      vatNumber,
      normalVatRegime: result.normalVatRegime ?? null,
      source: 'aade_registry',
      name: business.name || trade.name,
      address: formatRegistryAddress(result.address ?? {}),
      phone: cleanRegistryText(result.phone) || null,
      email: cleanRegistryText(result.email).toLowerCase() || null,
      profession: primaryProfession(result),
      taxOffice: formatTaxOffice(result.taxOfficeDescription) || cleanRegistryText(result.taxOfficeCode) || null,
      active: status.kind === 'inactive' ? false : result.active,
      status,
    };
  } catch (error) {
    officialError = error instanceof Error ? error.message : 'Ο επίσημος έλεγχος ΑΑΔΕ δεν ήταν διαθέσιμος.';
  }

  const fallback = await api.lookupAfm(vatNumber);
  if (!fallback) throw new Error(officialError || 'Δεν βρέθηκαν στοιχεία για το ΑΦΜ.');
  const { name, statusHits } = formatRegistryName(fallback.name);
  const status = statusHits.length ? detectVatRegistryStatus({ names: [fallback.name] }) : makeVatRegistryStatus('unknown');
  return {
    ...fallback,
    name,
    address: formatFreeAddress(fallback.address),
    vatNumber,
    normalVatRegime: null,
    profession: null,
    taxOffice: null,
    active: status.kind === 'inactive' ? false : null,
    status,
    fallbackReason: officialError,
  };
}

/** Status of a lookup, also for results created before status detection existed. */
export function vatLookupStatus(result: Pick<CustomerVatLookupResult, 'active' | 'status'>): VatRegistryStatus {
  if (result.status) return result.status;
  return makeVatRegistryStatus(result.active === false ? 'inactive' : result.active === true ? 'active' : 'unknown');
}

/** Message for the confirmation shown before applying or saving data of a non-active ΑΦΜ. */
export function describeVatRegistryStatus(status: VatRegistryStatus): string {
  const reason = {
    liquidation: 'Η επιχείρηση έχει τεθεί υπό εκκαθάριση.',
    bankruptcy: 'Η επιχείρηση έχει κηρυχθεί σε πτώχευση.',
    closed: 'Η επιχείρηση έχει κάνει διακοπή εργασιών.',
    inactive: 'Το ΑΦΜ είναι απενεργοποιημένο στο Μητρώο ΑΑΔΕ.',
    non_business: 'Το ΑΦΜ ανήκει σε μη επιτηδευματία (χωρίς επιχειρηματική δραστηριότητα).',
    active: '',
    unknown: 'Η κατάσταση του ΑΦΜ δεν επιβεβαιώθηκε από την ΑΑΔΕ.',
  }[status.kind];
  const date = status.stopDate ? ` Διακοπή από ${status.stopDate}.` : '';
  const evidence = status.evidence.length ? ` Μητρώο: «${status.evidence.join(' · ')}».` : '';
  return `${reason}${date}${evidence}`.trim();
}

export function applyCustomerVatLookup<T extends {
  full_name: string;
  address?: string;
  phone?: string;
  email?: string;
  profession?: string;
  tax_office?: string;
  vat_number?: string;
}>(customer: T, result: CustomerVatLookupResult): T {
  // A slow response must not populate a different AFM entered while it was loading.
  if (result.vatNumber && customer.vat_number !== result.vatNumber) return customer;
  const current = customerPhones(customer);
  const incoming = splitCustomerPhone(result.phone);
  const contact = result.phone ? withCustomerPhones(customer, {
    mobile_phone: current.mobile_phone || incoming.mobile_phone,
    landline_phone: current.landline_phone || incoming.landline_phone,
    phone_unclassified: current.phone_unclassified || incoming.phone_unclassified,
  }) : customer;
  return {
    ...contact,
    full_name: result.name || customer.full_name,
    address: result.address || customer.address,
    email: customer.email || result.email || undefined,
    profession: result.profession || customer.profession,
    tax_office: result.taxOffice || customer.tax_office,
  };
}

export function describeCustomerVatLookup(result: CustomerVatLookupResult): string {
  if (result.source === 'aade_registry') {
    const fields = ['επωνυμία', result.address && 'διεύθυνση', result.profession && 'επάγγελμα', result.taxOffice && 'ΔΟΥ']
      .filter(Boolean).join(', ');
    const regime = result.normalVatRegime === true ? 'κανονικό καθεστώς ΦΠΑ'
      : result.normalVatRegime === false ? 'εκτός κανονικού καθεστώτος ΦΠΑ — δεν τεκμηριώνει απαλλαγή στις αγορές' : 'καθεστώς ΦΠΑ άγνωστο';
    const status = vatLookupStatus(result);
    const warning = status.blocking || status.kind === 'non_business' ? ` · ΠΡΟΣΟΧΗ: ${status.label}` : '';
    return `Επίσημο Μητρώο ΑΑΔΕ: ${fields}${warning}. ${regime}. Ελέγξτε το Φορολογικό Προφίλ για τον συντελεστή πώλησης.`;
  }
  const status = vatLookupStatus(result);
  if (status.blocking) {
    return `Βρέθηκαν βασικά στοιχεία μέσω ${result.source === 'vies' ? 'VIES' : 'VATComply'} · ΠΡΟΣΟΧΗ: ${status.label}. Ελέγξτε την κατάσταση στην ΑΑΔΕ.`;
  }
  return `Βρέθηκαν βασικά στοιχεία μέσω ${result.source === 'vies' ? 'VIES' : 'VATComply'}. Το επάγγελμα και η ΔΟΥ δεν επιβεβαιώθηκαν από την ΑΑΔΕ. Ο συντελεστής ΦΠΑ δεν επιβεβαιώθηκε· ελέγξτε το Φορολογικό Προφίλ.`;
}
