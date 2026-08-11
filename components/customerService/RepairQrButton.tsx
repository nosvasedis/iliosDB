import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer, QrCode, X } from 'lucide-react';

export default function RepairQrButton({ code, customerName }: { code: string; customerName: string }) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    QRCode.toDataURL(`ilios:repair:${code}`, { width: 360, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setImageUrl(url); })
      .catch(() => { if (active) setImageUrl(''); });
    return () => { active = false; };
  }, [open, code]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50">
        <QrCode size={14} /> QR
      </button>
      {open && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm print:bg-white" role="dialog" aria-modal="true" aria-label={`Ετικέτα Επισκευής ${code}`}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl print:shadow-none">
            <div className="mb-4 flex items-center justify-between print:hidden"><h2 className="font-black text-slate-900">Ετικέτα Επισκευής</h2><button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Κλείσιμο"><X size={18} /></button></div>
            {imageUrl ? <img src={imageUrl} alt={`QR Επισκευής ${code}`} className="mx-auto h-64 w-64" /> : <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-400">Δημιουργία QR…</div>}
            <div className="mt-3 font-mono text-2xl font-black tracking-wider text-slate-950">{code}</div>
            <div className="mt-1 text-sm font-bold text-slate-600">{customerName}</div>
            <button onClick={() => window.print()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-black text-white print:hidden"><Printer size={17} /> Εκτύπωση ετικέτας</button>
          </div>
        </div>
      )}
    </>
  );
}
