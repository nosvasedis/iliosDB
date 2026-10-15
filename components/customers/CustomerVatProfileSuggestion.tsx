import React from 'react';
import type { Customer, CustomerVatLookupResult } from '../../types';
import { applyGeographicVat, REDUCED_VAT_SOURCE, suggestGeographicVat } from '../../features/customers/vatProfile';
import { MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY, MOUNT_ATHOS_VAT_EXEMPTION_NOTE } from '../../utils/legalDocuments';

export default function CustomerVatProfileSuggestion({ customer, onChange, lookup }: {
  customer: Customer;
  onChange: (customer: Customer) => void;
  lookup?: CustomerVatLookupResult | null;
}) {
  const evidence = lookup?.vatNumber === customer.vat_number ? lookup : null;
  const suggestion = suggestGeographicVat(customer);
  const applied = suggestion && customer.vat_rate === suggestion.rate
    && (suggestion.rate !== 0 || (customer.vat_exemption_category === MOUNT_ATHOS_VAT_EXEMPTION_CATEGORY
      && customer.vat_exemption_legal_note === MOUNT_ATHOS_VAT_EXEMPTION_NOTE));
  return (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-950" role="status">
      <div className="font-bold">Φορολογικό Προφίλ · {Math.round((customer.vat_rate ?? 0.24) * 100)}%</div>
      {evidence && <p>{evidence.source !== 'aade_registry'
        ? 'VIES / VATComply: ο συντελεστής και η απαλλαγή ΦΠΑ δεν επιβεβαιώθηκαν.'
        : evidence.normalVatRegime === true
          ? 'ΑΑΔΕ: κανονικό καθεστώς ΦΠΑ. Η ένδειξη δεν καθορίζει αν η πώληση υπάγεται σε 24% ή 17%.'
          : evidence.normalVatRegime === false
            ? 'ΑΑΔΕ: εκτός κανονικού καθεστώτος ΦΠΑ. Αυτό δεν σημαίνει ότι ο πελάτης αγοράζει χωρίς ΦΠΑ.'
            : 'ΑΑΔΕ: δεν επιστράφηκε ένδειξη καθεστώτος ΦΠΑ.'}</p>}
      {evidence?.active === false && <p className="font-bold text-red-700">Προσοχή: ανενεργό ΑΦΜ. Απαιτείται έλεγχος πριν από συναλλαγή.</p>}
      {suggestion ? <>
        <p><b>Πρόταση από τη διεύθυνση έδρας: {suggestion.area} · {suggestion.rate === 0 ? '0%' : '17%'}.</b>{' '}
          {suggestion.rate === 0
            ? 'Επιβεβαιώστε την ιδιότητα του δικαιούχου και τα δικαιολογητικά απαλλαγής Αγίου Όρους πριν την εφαρμογή.'
            : 'Επιβεβαιώστε μόνιμη επαγγελματική εγκατάσταση και αποστολή των αγαθών στο δικαιούχο νησί. Ελέγχετε τις προϋποθέσεις σε κάθε πώληση.'}</p>
        {suggestion.rate === 0.17 && <a href={REDUCED_VAT_SOURCE} target="_blank" rel="noreferrer" className="underline">ΑΑΔΕ Ε.2113/2025 · κανόνες από 1/1/2026</a>}
        {applied ? <div className="font-bold">Εφαρμόζεται στο προφίλ ✓</div> : <button
          type="button"
          disabled={evidence?.active === false}
          onClick={() => onChange(applyGeographicVat(customer, suggestion))}
          className="block rounded-lg bg-sky-700 px-3 py-2 font-bold text-white disabled:opacity-50"
        >Επιβεβαίωση προϋποθέσεων & εφαρμογή {suggestion.rate === 0 ? '0%' : '17%'}</button>}
      </> : <p>Η αναζήτηση ΑΦΜ δεν πιστοποιεί συντελεστή πώλησης ή απαλλαγή. Ελέγξτε τον επιλεγμένο συντελεστή· για 0% απαιτείται νόμιμη αιτία απαλλαγής.</p>}
    </div>
  );
}
