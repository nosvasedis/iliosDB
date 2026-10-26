import { useRestartDraft } from '../../../hooks/useRestartBlocker';
import React, { useState } from 'react';
import { Loader2, Tag } from 'lucide-react';
import type { Consignment } from '../../../types';
import { formatGreekMoney } from '../../../features/customerService';
import type { ServiceController } from '../useServiceController';
import { ACTION_PRIMARY, ACTION_QUIET, Field, SERVICE_INPUT, ServiceModal } from '../shared/serviceUi';

export default function ConsignmentOfferDialog({ ctl, entry }: { ctl: ServiceController; entry: Consignment }) {
  const bundle = ctl.consignmentBundles.find(b => b.entry.id === entry.id);
  const original = (bundle?.lines || []).reduce((sum, l) => sum + l.pending_quantity * Number(l.locked_unit_price), 0);
  const [total, setTotal] = useState(String(entry.offer_total ?? Math.round(original * 100) / 100));
  const [reason, setReason] = useState(entry.offer_reason || '');
  const [busy, setBusy] = useState(false);
    useRestartDraft('Προσφορά παρακαταθήκης', { total, reason }, { busy });

  const normalized = total.trim().replace(',', '.');
  const amount = Number(normalized);
  const blocked = !bundle || bundle.lines.some(l => l.sold_quantity > 0) || !bundle.lines.some(l => l.pending_quantity > 0);
  const invalid = !/^\d+(?:\.\d{1,2})?$/.test(normalized) || !Number.isFinite(amount) || amount >= 1e12;
  const close = () => ctl.setOperation(null);
  const save = async (value: number | null) => {
    setBusy(true);
    try {
      await ctl.safeAction(() => ctl.actions.setConsignmentOffer.mutateAsync({ consignmentId: entry.id, total: value, reason: reason.trim() }),
        value === null ? 'Η προσφορά αφαιρέθηκε.' : 'Η συνολική προσφορά αποθηκεύτηκε.');
    } finally { setBusy(false); }
  };
  return (
    <ServiceModal title={`Συνολική προσφορά · ${entry.code}`} subtitle={ctl.customerName(entry.customer_id)} icon={<Tag size={18} />} onClose={close} busy={busy} size="sm"
      footer={<>
        {entry.offer_total != null && <button type="button" className={ACTION_QUIET} disabled={busy || blocked || !reason.trim()} onClick={() => void save(null)}>Αφαίρεση προσφοράς</button>}
        <button type="button" className={ACTION_PRIMARY} disabled={busy || blocked || invalid || !reason.trim()} onClick={() => void save(amount)}>
          {busy && <Loader2 size={15} className="animate-spin" />} Αποθήκευση
        </button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Αρχική αξία εκκρεμών τεμαχίων: <strong>{formatGreekMoney(original)}</strong>. Ορίστε τη συμφωνημένη αξία για όλα τα εκκρεμή τεμάχια, π.χ. 300 €. Ίδια βάση με τις τιμές τεμαχίων, πριν από τυχόν ΦΠΑ παραστατικού.</p>
        {blocked && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Η προσφορά απαιτεί εκκρεμή τεμάχια και κλειδώνει μετά την πρώτη πώληση. Αντιστρέψτε πρώτα τις πωλήσεις για να την αλλάξετε.</p>}
        <Field label="Συνολικό ποσό προσφοράς (€)" error={invalid ? 'Ορίστε ποσό από 0 € με έως δύο δεκαδικά.' : null}>
          <input aria-label="Συνολικό ποσό προσφοράς (€)" inputMode="decimal" className={SERVICE_INPUT} value={total} disabled={busy || blocked} onChange={e => setTotal(e.target.value)} autoFocus />
        </Field>
        <Field label="Αιτιολογία / συμφωνία *">
          <textarea aria-label="Αιτιολογία προσφοράς" className={SERVICE_INPUT} value={reason} disabled={busy || blocked} onChange={e => setReason(e.target.value)} placeholder="π.χ. Συμφωνία με πελάτη για 300 €" />
        </Field>
        <p className="text-xs text-slate-500">Οι προηγούμενες επιστροφές εξαιρούνται. Το ποσό κατανέμεται αναλογικά στα υπόλοιπα τεμάχια. Αν επιστραφεί μέρος τους αργότερα, χρεώνεται μόνο το μέρος που πωλήθηκε. Οι αρχικές τιμές και το κόστος διατηρούνται.</p>
      </div>
    </ServiceModal>
  );
}
