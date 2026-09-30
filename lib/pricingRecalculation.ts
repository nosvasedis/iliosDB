import { isLocalMode, supabase } from './supabase';
import { offlineDb } from './offlineDb';
import type { CataloguePriceChange, PricingCatalogSnapshot } from '../utils/catalogRepricing';

export async function getPricingCatalogSnapshot(): Promise<PricingCatalogSnapshot> {
  if (isLocalMode || !navigator.onLine) throw new Error('Η μαζική ενημέρωση τιμών απαιτεί σύνδεση με τη βάση δεδομένων.');
  const { data, error } = await supabase.rpc('pricing_catalog_snapshot_v1');
  if (error) throw new Error(`Δεν φορτώθηκε η προεπισκόπηση: ${error.message}`);
  if (!data?.fingerprint || !data?.settings || !Array.isArray(data.products) || !Array.isArray(data.variants) || !Array.isArray(data.recipes) || !Array.isArray(data.materials)) throw new Error('Ελλιπή δεδομένα τιμολόγησης.');
  return data;
}

export async function applyCatalogueRepricing(snapshot: PricingCatalogSnapshot, rows: CataloguePriceChange[], replaceManualSelling = false) {
  if (isLocalMode || !navigator.onLine) throw new Error('Η ενημέρωση απαιτεί σύνδεση με τη βάση δεδομένων.');
  const { data, error } = await supabase.rpc('apply_pricing_recalculation_v2', {
    expected_fingerprint: snapshot.fingerprint,
    price_rows: rows.map(({ sku, suffix, values }) => ({ sku, suffix, values })),
    replace_manual_selling: replaceManualSelling,
  });
  if (error) throw new Error(`Η ενημέρωση δεν εφαρμόστηκε: ${error.message}`);
  // A read-back failure must never be reported as a successful verification.
  const updated = await getPricingCatalogSnapshot().catch(() => { throw new Error('Οι τιμές αποθηκεύτηκαν, αλλά ο επανέλεγχος απέτυχε. Φορτώστε νέα προεπισκόπηση.'); });
  for (const row of rows) {
    const stored = row.suffix === null ? updated.products.find(p => p.sku === row.sku) : updated.variants.find(v => v.product_sku === row.sku && v.suffix === row.suffix);
    if (!stored || Object.entries(row.values).some(([key, value]) => stored[key] == null || Math.abs(Number(stored[key]) - value) > 0.000001)) throw new Error('Οι τιμές αποθηκεύτηκαν, αλλά εντοπίστηκε μεταγενέστερη αλλαγή. Φορτώστε νέα προεπισκόπηση.');
    if (replaceManualSelling && row.values.selling_price !== undefined && stored.selling_price_manual_override) throw new Error('Οι τιμές αποθηκεύτηκαν, αλλά δεν επαληθεύτηκε η επαναφορά στον τύπο Ilios. Φορτώστε νέα προεπισκόπηση.');
  }
  await Promise.all([
    offlineDb.saveTable('products', updated.products),
    offlineDb.saveTable('product_variants', updated.variants),
  ]);
  return data as { run_id: number; masters: number; variants: number };
}
