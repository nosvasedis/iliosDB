import React, { useEffect, useState } from 'react';
import { Loader2, Lock, X } from 'lucide-react';
import { api } from '../lib/supabase';
import { exitInspectionMode } from '../lib/inspectionMode';

interface InspectionExitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const InspectionExitModal: React.FC<InspectionExitModalProps> = ({ isOpen, onClose }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinConfigured, setPinConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPin('');
      setError(null);
      setPinConfigured(null);
      return;
    }

    let cancelled = false;
    void api.hasInspectionExitPin()
      .then((configured) => {
        if (!cancelled) setPinConfigured(configured);
      })
      .catch(() => {
        if (!cancelled) setPinConfigured(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pinConfigured === false) {
      setError('Δεν έχει οριστεί κωδικός εξόδου. Ρυθμίστε τον από τις Τεχνικές ρυθμίσεις παραστατικών.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const valid = await api.verifyInspectionExitPin(pin);
      if (!valid) {
        setError('Λανθασμένος κωδικός.');
        return;
      }
      await exitInspectionMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Αποτυχία εξόδου.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#060b00]/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Lock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Επαλήθευση πρόσβασης</h2>
              <p className="text-sm text-slate-500">Εισάγετε τον κωδικό εξόδου για πλήρη λειτουργία.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Κλείσιμο"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Κωδικός εξόδου
            </label>
            <input
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
              autoFocus
              autoComplete="off"
            />
          </div>

          {pinConfigured === false && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              Δεν έχει οριστεί κωδικός εξόδου.
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !pin.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#060b00] px-4 py-3 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            Επιβεβαίωση
          </button>
        </form>
      </div>
    </div>
  );
};

export default InspectionExitModal;
