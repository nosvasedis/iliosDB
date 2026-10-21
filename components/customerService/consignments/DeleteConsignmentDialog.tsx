import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { Consignment } from '../../../types';
import { formatGreekNumber } from '../../../features/customerService';
import type { ServiceController } from '../useServiceController';
import { ACTION_QUIET, DANGER_BUTTON, Field, SERVICE_INPUT, ServiceModal } from '../shared/serviceUi';

export default function DeleteConsignmentDialog({ ctl, entry }: { ctl: ServiceController; entry: Consignment }) {
  const bundle = ctl.consignmentBundles.find(b => b.entry.id === entry.id);
  const [reason, setReason] = useState('');
  const [returned, setReturned] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = entry.handed_off_at ? bundle?.summary.pending || 0 : 0;
  const blocked = !bundle || bundle.summary.due > 0 || bundle.summary.openReturns > 0;
  const close = () => ctl.setOperation(null);
  const submit = async () => {
    setBusy(true);
    try {
      await ctl.safeAction(() => ctl.actions.deleteConsignment.mutateAsync({ consignmentId: entry.id, reason: reason.trim(), returnToStock: returned }), 'Η Παρακαταθήκη διαγράφηκε.');
    } finally { setBusy(false); }
  };
  return (
    <ServiceModal title={`Διαγραφή ${entry.code}`} subtitle={ctl.customerName(entry.customer_id)} icon={<Trash2 size={18} />} onClose={close} busy={busy} size="sm"
      footer={<>
        <button type="button" className={ACTION_QUIET} onClick={close} disabled={busy}>Άκυρο</button>
        <button type="button" className={DANGER_BUTTON} disabled={busy || blocked || !reason.trim() || (pending > 0 && !returned)} onClick={() => void submit()}>
          {busy && <Loader2 size={15} className="animate-spin" />} Διαγραφή Παρακαταθήκης
        </button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Η Παρακαταθήκη θα αφαιρεθεί από τις λίστες. Το ιστορικό κινήσεων, οι εισπράξεις και τα συνδεδεμένα παραστατικά διατηρούνται.</p>
        {blocked && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Εξοφλήστε ή αντιστρέψτε τις ανεξόφλητες πωλήσεις και τακτοποιήστε τις επιστροφές σε έλεγχο πριν από τη διαγραφή.</p>}
        {pending > 0 && <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <input type="checkbox" className="mt-1" checked={returned} disabled={busy || blocked} onChange={e => setReturned(e.target.checked)} />
          <span>Επιβεβαιώνω ότι τα υπόλοιπα {formatGreekNumber(pending)} τεμάχια έχουν επιστραφεί σε καλή κατάσταση στην αποθήκη προέλευσης. Η διαγραφή θα τα επαναφέρει στο απόθεμά της.</span>
        </label>}
        <Field label="Αιτιολογία διαγραφής *"><textarea aria-label="Αιτιολογία διαγραφής" className={SERVICE_INPUT} value={reason} disabled={busy || blocked} onChange={e => setReason(e.target.value)} autoFocus /></Field>
      </div>
    </ServiceModal>
  );
}
