import React from 'react';
import { AlertOctagon, AlertTriangle } from 'lucide-react';
import type { CustomerVatLookupResult } from '../../types';
import { describeVatRegistryStatus, vatLookupStatus } from '../../features/customers/vatLookup';

/** Prominent notice under the ΑΦΜ field when the registry does not show an active business. */
export default function CustomerVatStatusAlert({ lookup, vatNumber, applied, onApply }: {
  lookup: CustomerVatLookupResult | null;
  vatNumber?: string | null;
  applied: boolean;
  onApply: () => void;
}) {
  if (!lookup || lookup.vatNumber !== vatNumber) return null;
  const status = vatLookupStatus(lookup);
  const show = status.blocking || status.kind === 'non_business'
    || (status.kind === 'unknown' && lookup.source === 'aade_registry');
  if (!show) return null;
  const Icon = status.blocking ? AlertOctagon : AlertTriangle;
  return (
    <div
      role="alert"
      data-vat-status={status.kind}
      className={`mt-3 rounded-xl border-2 p-3 text-xs ${status.blocking
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-amber-300 bg-amber-50 text-amber-900'}`}
    >
      <div className="flex items-start gap-2">
        <Icon size={18} className={`mt-0.5 shrink-0 ${status.blocking ? 'text-red-600' : 'text-amber-600'}`} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-black">{status.label}</div>
          <p>{describeVatRegistryStatus(status)}</p>
          {status.stopDate && <p className="font-bold">Ημερομηνία διακοπής: {status.stopDate}</p>}
          {status.blocking && <p>
            {lookup.source === 'aade_registry' ? 'Πηγή: Μητρώο ΑΑΔΕ.' : 'Πηγή: επωνυμία VIES — επιβεβαιώστε στην ΑΑΔΕ.'}{' '}
            Μην εκδώσετε παραστατικό πριν επιβεβαιώσετε την κατάσταση· η αποθήκευση θα ζητήσει επιβεβαίωση.
          </p>}
          {applied
            ? <p className="font-bold">Τα στοιχεία της αναζήτησης συμπληρώθηκαν στη φόρμα.</p>
            : <button
                type="button"
                onClick={onApply}
                className={`mt-1 rounded-lg px-3 py-1.5 font-bold text-white ${status.blocking ? 'bg-red-700 hover:bg-red-800' : 'bg-amber-700 hover:bg-amber-800'}`}
              >Συμπλήρωση στοιχείων παρ' όλα αυτά</button>}
        </div>
      </div>
    </div>
  );
}
