import React from 'react';
import ReactDOM from 'react-dom';
import { ArrowRight, CheckCircle2, Copy, FileCheck2, Loader2, X } from 'lucide-react';
import { LegalDocument, ProformaDocument, ProformaDocumentLine } from '../../types';
import { getLegalDocumentDisplayNumber } from '../../utils/legalDocuments';

type ConvertStep = 'preview' | 'converting' | 'success';

interface ProformaConvertModalProps {
  isOpen: boolean;
  step: ConvertStep;
  proforma: ProformaDocument | null;
  lines: ProformaDocumentLine[];
  createdDocument: LegalDocument | null;
  errorMessage?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  onOpenInvoice: () => void;
  money: (value: number) => string;
}

export default function ProformaConvertModal({
  isOpen,
  step,
  proforma,
  lines,
  createdDocument,
  errorMessage,
  onConfirm,
  onClose,
  onOpenInvoice,
  money,
}: ProformaConvertModalProps) {
  if (!isOpen || !proforma) return null;

  const proformaNumber = getLegalDocumentDisplayNumber(proforma as LegalDocument);
  const invoiceNumber = createdDocument ? getLegalDocumentDisplayNumber(createdDocument) : '—';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[700] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-sky-50 to-white px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-sky-100 p-2.5 text-sky-700">
              {step === 'success' ? <CheckCircle2 size={22} /> : <Copy size={22} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">
                {step === 'success' ? 'Μετατροπή ολοκληρώθηκε' : 'Μετατροπή σε τιμολόγιο'}
              </h2>
              <p className="text-xs font-medium text-slate-500">
                {step === 'preview' && 'Ελέγξτε τα στοιχεία πριν δημιουργήσετε πρόχειρο τιμολόγιο'}
                {step === 'converting' && 'Δημιουργία πρόχειρου τιμολογίου…'}
                {step === 'success' && 'Το προτιμολόγιο σημειώθηκε ως μετατραπέν'}
              </p>
            </div>
          </div>
          {step !== 'converting' && (
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'preview' && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Από προτιμολόγιο</div>
                  <div className="mt-1 text-lg font-black text-slate-900">{proformaNumber}</div>
                  <div className="mt-2 text-sm font-bold text-slate-700">{proforma.counterpart.name || '—'}</div>
                  <div className="text-xs font-mono text-slate-500">ΑΦΜ {proforma.counterpart.vat_number || '—'}</div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">Θα δημιουργηθεί</div>
                  <div className="mt-1 flex items-center gap-2 text-lg font-black text-emerald-800">
                    <FileCheck2 size={18} /> Πρόχειρο τιμολόγιο 1.1
                  </div>
                  <div className="mt-2 text-sm font-medium text-emerald-700">Δεν αποστέλλεται αυτόματα στη myDATA</div>
                  <div className="text-xs text-emerald-600">Θα ανοίξει στην καρτέλα «Δημιουργία» για έλεγχο και υποβολή</div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
                  Γραμμές ({lines.length})
                </div>
                <div className="max-h-48 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2">Περιγραφή</th>
                        <th className="px-4 py-2 text-right">Ποσ.</th>
                        <th className="px-4 py-2 text-right">Σύνολο</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line) => (
                        <tr key={line.id} className="border-t border-slate-100">
                          <td className="px-4 py-2">
                            <div className="font-semibold text-slate-800">{line.description}</div>
                            {line.item_code && <div className="font-mono text-xs text-slate-500">{line.item_code}</div>}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{line.quantity}</td>
                          <td className="px-4 py-2 text-right font-black">{money(line.gross_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-3">
                  <span className="text-sm font-bold text-slate-600">Συνολική αξία</span>
                  <span className="text-lg font-black text-slate-900">{money(proforma.totals.gross)}</span>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                Το προτιμολόγιο θα σημειωθεί ως «Μετατράπηκε» και θα συνδεθεί με το νέο τιμολόγιο. Μπορείτε να το εκτυπώσετε μόνο για αρχείο.
              </div>
            </div>
          )}

          {step === 'converting' && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Loader2 size={40} className="animate-spin text-sky-600" />
              <div className="text-lg font-black text-slate-900">Δημιουργία πρόχειρου τιμολογίου…</div>
              <div className="max-w-sm text-sm font-medium text-slate-500">
                Αντιγραφή γραμμών και στοιχείων πελάτη από {proformaNumber}
              </div>
            </div>
          )}

          {step === 'success' && createdDocument && (
            <div className="space-y-5">
              <div className="flex items-center justify-center gap-4 py-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-center">
                  <div className="text-[10px] font-black uppercase text-slate-500">Προτιμολόγιο</div>
                  <div className="mt-1 font-black text-slate-800">{proformaNumber}</div>
                </div>
                <ArrowRight className="text-emerald-500" size={24} />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center">
                  <div className="text-[10px] font-black uppercase text-emerald-700">Τιμολόγιο</div>
                  <div className="mt-1 font-black text-emerald-800">{invoiceNumber}</div>
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
                Το πρόχειρο τιμολόγιο είναι έτοιμο. Ελέγξτε τα στοιχεία και υποβάλετε στη myDATA όταν είστε έτοιμοι.
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {step === 'preview' && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-100">
                Ακύρωση
              </button>
              <button type="button" onClick={onConfirm} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-black text-white hover:bg-sky-700">
                <Copy size={16} /> Δημιουργία τιμολογίου
              </button>
            </>
          )}
          {step === 'success' && (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-100">
                Κλείσιμο
              </button>
              <button type="button" onClick={onOpenInvoice} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">
                <FileCheck2 size={16} /> Άνοιγμα τιμολογίου
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
