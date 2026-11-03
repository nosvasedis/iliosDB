import React, { useEffect, useState } from 'react';
import { Loader2, Paperclip } from 'lucide-react';
import { fetchFinanceAttachmentUrl } from '../../features/finance/attachments';
import { FinanceModal } from './financeUi';

/** Private receipt photo: fetched with the admin session and shown from a local object URL. */
export default function AttachmentViewer({ attachmentKey, onClose }: { attachmentKey: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchFinanceAttachmentUrl(attachmentKey)
      .then((value) => {
        objectUrl = value;
        if (cancelled) URL.revokeObjectURL(value);
        else setUrl(value);
      })
      .catch((reason) => !cancelled && setError((reason as Error).message));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentKey]);

  return (
    <FinanceModal icon={Paperclip} eyebrow="Παραστατικό" title="Συνημμένο" onClose={onClose} size="lg">
      {error ? (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p>
      ) : url ? (
        <img src={url} alt="Παραστατικό" className="mx-auto max-h-[75vh] rounded-2xl object-contain shadow-sm" />
      ) : (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
      )}
    </FinanceModal>
  );
}
