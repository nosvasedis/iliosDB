import { CatalogPrepareFailedError } from './imageHelpers';

export type CatalogPrepareChoice = 'keep-original' | 'retry' | 'discard';

export const CATALOG_PREPARE_FAILURE_CONFIRM = {
  title: 'Η επεξεργασία απέτυχε',
  message: 'Η αυτόματη προετοιμασία δεν ολοκληρώθηκε. Δεν αποθηκεύτηκε φωτογραφία. Θέλετε να κρατήσετε την αρχική, να δοκιμάσετε ξανά, ή να ακυρώσετε;',
  confirmText: 'Κρατήστε την αρχική',
  thirdOptionText: 'Δοκιμή ξανά',
  cancelText: 'Όχι',
};

type ConfirmFn = (options: typeof CATALOG_PREPARE_FAILURE_CONFIRM) => Promise<boolean | null>;

export const catalogPrepareChoiceFromConfirm = (result: boolean | null): CatalogPrepareChoice => {
  if (result === true) return 'keep-original';
  if (result === false) return 'retry';
  return 'discard';
};

export async function runCatalogPhotoUpload(
  upload: (prepare: boolean) => Promise<string | null>,
  confirm: ConfirmFn,
): Promise<string | null> {
  while (true) {
    try {
      return await upload(true);
    } catch (err) {
      if (!(err instanceof CatalogPrepareFailedError)) throw err;
      const choice = catalogPrepareChoiceFromConfirm(await confirm(CATALOG_PREPARE_FAILURE_CONFIRM));
      if (choice === 'keep-original') return await upload(false);
      if (choice === 'retry') continue;
      return null;
    }
  }
}

export async function uploadCatalogPhotoWithChoice(
  file: Blob,
  sku: string,
  confirm: ConfirmFn,
): Promise<string | null> {
  const { uploadProductImage } = await import('../lib/supabase');
  return runCatalogPhotoUpload(
    (prepare) => uploadProductImage(file, sku, { prepare }),
    confirm,
  );
}
