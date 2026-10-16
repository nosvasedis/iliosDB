import { useState, type Dispatch, type SetStateAction } from 'react';
import type { CustomerVatLookupResult } from '../../types';
import { useUI } from '../UIProvider';
import {
  applyCustomerVatLookup, describeCustomerVatLookup, describeVatRegistryStatus, lookupCustomerVat, vatLookupStatus,
} from '../../features/customers/vatLookup';

type VatLookupTarget = Parameters<typeof applyCustomerVatLookup>[0];

/**
 * ΑΦΜ lookup shared by the desktop and mobile customer forms. Data of an ΑΦΜ
 * under liquidation, bankrupt, closed or deactivated is applied only after
 * confirmation, and saving such a customer asks again.
 */
export function useCustomerVatLookup<T extends VatLookupTarget>(
  setForm: Dispatch<SetStateAction<T>>,
  options: { onApplied?: (result: CustomerVatLookupResult) => void } = {},
) {
  const { showToast, confirm } = useUI();
  const [isSearching, setIsSearching] = useState(false);
  const [evidence, setEvidence] = useState<CustomerVatLookupResult | null>(null);
  const [appliedVat, setAppliedVat] = useState<string | null>(null);

  const apply = (result: CustomerVatLookupResult) => {
    setForm(prev => applyCustomerVatLookup(prev, result));
    setAppliedVat(result.vatNumber ?? '');
    options.onApplied?.(result);
  };

  const lookup = async (vatNumber?: string | null) => {
    if (!vatNumber || vatNumber.length < 9) {
      showToast('Μη έγκυρο ΑΦΜ.', 'error');
      return;
    }
    setIsSearching(true);
    setEvidence(null);
    setAppliedVat(null);
    let result: CustomerVatLookupResult;
    try {
      result = await lookupCustomerVat(vatNumber);
    } catch (e: unknown) {
      showToast((e as Error)?.message || 'Σφάλμα αναζήτησης.', 'error');
      return;
    } finally {
      setIsSearching(false);
    }
    setEvidence(result);
    const status = vatLookupStatus(result);
    if (status.blocking) {
      const accepted = await confirm({
        title: `Προσοχή: ${status.label}`,
        message: `${describeVatRegistryStatus(status)} Να συμπληρωθούν παρ' όλα αυτά τα στοιχεία στην καρτέλα του πελάτη;`,
        confirmText: 'Συμπλήρωση στοιχείων',
        cancelText: 'Όχι, μόνο ενημέρωση',
        isDestructive: true,
      });
      if (accepted !== true) {
        showToast(`Τα στοιχεία δεν συμπληρώθηκαν (${status.label}).`, 'warning');
        return;
      }
    }
    apply(result);
    showToast(describeCustomerVatLookup(result), status.blocking ? 'error' : status.kind === 'non_business' ? 'warning' : 'success');
  };

  /** Resolves false when the user cancels saving a customer with a non-active ΑΦΜ. */
  const confirmSave = async (vatNumber?: string | null): Promise<boolean> => {
    if (!evidence || evidence.vatNumber !== vatNumber) return true;
    const status = vatLookupStatus(evidence);
    if (!status.blocking) return true;
    return (await confirm({
      title: `Αποθήκευση με ${status.label}`,
      message: `${describeVatRegistryStatus(status)} Βεβαιωθείτε ότι επιτρέπεται η συναλλαγή και η έκδοση παραστατικού πριν συνεχίσετε.`,
      confirmText: 'Αποθήκευση',
      isDestructive: true,
    })) === true;
  };

  return {
    isSearching,
    evidence,
    applied: !!evidence && appliedVat === (evidence.vatNumber ?? ''),
    lookup,
    applyEvidence: () => { if (evidence) apply(evidence); },
    confirmSave,
  };
}
