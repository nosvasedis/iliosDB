import React, { useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { GlobalSettings } from '../types';
import { useUI } from './UIProvider';
import { getPricingCatalogSnapshot, applyCatalogueRepricing } from '../lib/pricingRecalculation';
import { buildCatalogueRepricing, type PricingCatalogSnapshot } from '../utils/catalogRepricing';
import { pricingRulesMatch, validatePricingRules } from '../utils/pricingRules';
import { formatCurrency } from '../utils/pricingEngine';
import { invalidateProductsAndCatalog } from '../lib/queryInvalidation';
import { downloadBlob } from '../utils/exportUtils';

export default function CatalogueRepricingPanel({ settings }: { settings: GlobalSettings }) {
  const { showToast, confirm } = useUI();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [replaceManualSelling, setReplaceManualSelling] = useState(false);
  const [preview, setPreview] = useState<{ snapshot: PricingCatalogSnapshot; plan: ReturnType<typeof buildCatalogueRepricing> } | null>(null);
  const policyMatches = (snapshot: PricingCatalogSnapshot) =>
    !validatePricingRules(settings.pricing_rules || {}) &&
    pricingRulesMatch(settings.pricing_rules, snapshot.settings.pricing_rules) &&
    settings.silver_price_gram === Number(snapshot.settings.silver_price_gram);
  const loadPreview = async () => {
    setBusy(true); setPreview(null);
    try {
      const snapshot = await getPricingCatalogSnapshot();
      if (!policyMatches(snapshot)) throw new Error('Αποθηκεύστε πρώτα τις αλλαγές στις ρυθμίσεις.');
      setPreview({ snapshot, plan: buildCatalogueRepricing(snapshot, { replaceManualSelling }) });
    } catch (error: any) { showToast(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || !policyMatches(preview.snapshot)) { showToast('Αποθηκεύστε τις ρυθμίσεις και δημιουργήστε νέα προεπισκόπηση.', 'info'); return; }
    const { snapshot, plan } = preview;
    const manualMessage = replaceManualSelling ? `${plan.manualCount} σημειωμένες χειροκίνητες τιμές θα αντικατασταθούν και θα επιστρέψουν στον τύπο Ilios.` : `${plan.manualCount} χειροκίνητες τιμές χονδρικής προστατεύονται.`;
    const yes = await confirm({ title: 'Ενημέρωση όλων των τιμών καταλόγου', message: `Θα ενημερωθούν κόστος και χονδρική για ${plan.masterCount} βασικούς κωδικούς και ${plan.variantCount} παραλλαγές. ${manualMessage} Θα κρατηθεί αντίγραφο των προηγούμενων τιμών στη βάση.`, confirmText: 'Εφαρμογή νέων τιμών' });
    if (!yes) return;
    setBusy(true);
    try {
      const result = await applyCatalogueRepricing(snapshot, plan.rows, replaceManualSelling);
      await invalidateProductsAndCatalog(queryClient);
      showToast(`Επαληθεύτηκαν ${result.masters} βασικοί κωδικοί και ${result.variants} παραλλαγές. Αντίγραφο #${result.run_id}.`, 'success');
    } catch (error: any) { showToast(error.message, 'error'); }
    finally { setBusy(false); setPreview(null); }
  };
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 md:p-8 space-y-4">
      <h3 className="font-bold text-slate-800">Ενημέρωση τιμών σε όλο τον κατάλογο</h3>
      <p className="text-xs leading-relaxed text-slate-500">Προεπισκόπηση με τις αποθηκευμένες ρυθμίσεις για βασικούς κωδικούς και όλες τις παραλλαγές. Οι χειροκίνητες τιμές χονδρικής διατηρούνται, εκτός αν επιλέξετε αντικατάσταση παρακάτω. Διατηρούνται πάντα τα χειροκίνητα εργατικά. Τα εξαρτήματα STX ενημερώνονται ως προς το κόστος τους. Οι κωδικοί υπηρεσιών εξαιρούνται.</p>
      <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" disabled={busy} checked={replaceManualSelling} onChange={event => { setReplaceManualSelling(event.target.checked); setPreview(null); }} className="mt-1" /><span>Αντικατάσταση και των χειροκίνητων τιμών χονδρικής με τον τύπο Ilios. Οι τιμές αυτές θα επιστρέψουν σε αυτόματο υπολογισμό.</span></label>
      <button type="button" disabled={busy} onClick={loadPreview} className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Προεπισκόπηση νέων τιμών</button>
      {preview && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Αλλαγές: {preview.plan.masterCount} βασικοί κωδικοί · {preview.plan.variantCount} παραλλαγές. Χειροκίνητες τιμές {replaceManualSelling ? 'προς αντικατάσταση' : 'που προστατεύονται'}: {preview.plan.manualCount}. Εξαιρούμενες υπηρεσίες: {preview.plan.serviceCount}.</p>
          <div className="max-h-80 overflow-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr><th className="p-3">Κωδικός</th><th className="p-3">Κόστος</th><th className="p-3">Χονδρική</th></tr></thead><tbody>
              {preview.plan.rows.slice(0, 200).map(row => <tr key={JSON.stringify([row.sku, row.suffix])} className="border-t border-slate-100"><td className="p-3 font-mono">{row.sku}{row.suffix === null ? ' (βασικός)' : row.suffix === '' ? ' (λουστρέ)' : row.suffix}</td><td className="p-3">{row.values.active_price !== undefined ? `${formatCurrency(row.before.active_price)} → ${formatCurrency(row.values.active_price)}` : 'Αμετάβλητο'}</td><td className="p-3">{row.manualSelling && !replaceManualSelling ? 'Χειροκίνητη — διατηρείται' : row.values.selling_price !== undefined ? `${formatCurrency(row.before.selling_price)} → ${formatCurrency(row.values.selling_price)}${row.manualSelling ? ' (τύπος Ilios)' : ''}` : 'Αμετάβλητη'}</td></tr>)}
            </tbody></table>
          </div>
          {preview.plan.rows.length > 200 && <p className="text-xs text-slate-500">Εμφανίζονται οι πρώτες 200 αλλαγές. Το αρχείο περιλαμβάνει όλες τις εγγραφές.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => downloadBlob(new Blob([JSON.stringify(preview, null, 2)], { type: 'application/json' }), `ilios-pricing-preview-${new Date().toISOString().slice(0, 10)}.json`)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Download size={14} /> Λήψη προεπισκόπησης</button>
            <button type="button" disabled={busy || preview.plan.rows.length === 0 || !policyMatches(preview.snapshot)} onClick={apply} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-40">Εφαρμογή σε όλους τους κωδικούς</button>
          </div>
        </div>
      )}
    </section>
  );
}
