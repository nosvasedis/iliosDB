import React from 'react';
import { AlertTriangle, ClipboardList, PackageSearch } from 'lucide-react';
import { formatNumber } from '../../utils/numberFormat';
import type { MissingCostRow } from '../../features/dashboard/dashboardCommandViewModels';
import { isSpecialCreationSku } from '../../utils/specialCreationSku';
import { DashboardDialog, EmptyNote, Money } from './DashboardKit';

interface Props {
  rows: MissingCostRow[];
  periodLabel: string;
  onOpenRegistry: (sku: string) => void;
  onOpenOrders: () => void;
  onClose: () => void;
}

export default function MissingCostsModal({ rows, periodLabel, onOpenRegistry, onOpenOrders, onClose }: Props) {
  const totalRealized = rows.reduce((sum, row) => sum + row.realizedNet, 0);
  const totalBacklog = rows.reduce((sum, row) => sum + row.backlogNet, 0);

  return (
    <DashboardDialog
      title="Ελλιπή κόστη"
      subtitle={`${formatNumber(rows.length)} ${rows.length === 1 ? 'κωδικός' : 'κωδικοί'} · ${periodLabel} και ανοιχτές παραγγελίες`}
      icon={AlertTriangle}
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <p className="font-bold">Γιατί εμφανίζεται;</p>
          <p className="mt-1 font-medium text-amber-800/90">
            Αυτοί οι κωδικοί πουλήθηκαν (ή είναι σε ανοιχτές παραγγελίες) αλλά το κόστος τους δεν μπορεί να υπολογιστεί —
            συνήθως επειδή ο κωδικός δεν υπάρχει πλέον στο Μητρώο. Το κόστος τους μετράει ως 0 €, οπότε το μικτό κέρδος
            εμφανίζεται μεγαλύτερο από το πραγματικό. Δημιουργήστε ή επαναφέρετε τον κωδικό στο Μητρώο για να διορθωθεί.
          </p>
        </div>

        {rows.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200/70">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Έσοδα χωρίς κόστος</p>
              <Money value={totalRealized} className="text-lg font-black text-slate-900" />
            </div>
            <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200/70">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Σε ανοιχτές παραγγελίες</p>
              <Money value={totalBacklog} className="text-lg font-black text-slate-900" />
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <EmptyNote message="Όλες οι πωλήσεις έχουν υπολογισμένο κόστος." />
          ) : (
            rows.map((row) => (
              <article key={row.sku} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-base font-black tracking-tight text-slate-900">{row.sku}</p>
                    <p className="mt-0.5 text-xs font-medium text-rose-600">{row.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isSpecialCreationSku(row.sku) ? (
                      <button
                        type="button"
                        onClick={() => onOpenRegistry(row.sku)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-black"
                      >
                        <PackageSearch size={14} />
                        Άνοιγμα στο Μητρώο
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={onOpenOrders}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <ClipboardList size={14} />
                      Παραγγελίες
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
                  {[
                    { label: 'Τεμ. πωλήθηκαν', value: formatNumber(row.realizedQuantity) },
                    { label: 'Έσοδα', value: <Money value={row.realizedNet} /> },
                    { label: 'Τεμ. σε εκκρεμότητα', value: formatNumber(row.backlogQuantity) },
                    { label: 'Αξία εκκρεμότητας', value: <Money value={row.backlogNet} /> },
                  ].map((cell) => (
                    <div key={cell.label} className="bg-white px-4 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{cell.label}</p>
                      <p className="text-sm font-black tabular-nums text-slate-800">{cell.value}</p>
                    </div>
                  ))}
                </div>
                <ul className="divide-y divide-slate-50">
                  {row.orders.slice(0, 8).map((order) => (
                    <li key={`${order.orderId}-${order.stage}`} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-700">{order.customerName}</p>
                        <p className="font-mono text-[10px] text-slate-400">#{order.orderId.slice(-8)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                            order.stage === 'realized' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                          }`}
                        >
                          {order.stage === 'realized' ? 'Στάλθηκε' : 'Εκκρεμεί'}
                        </span>
                        <span className="w-12 text-right font-bold tabular-nums text-slate-600">{formatNumber(order.quantity)} τεμ.</span>
                        <Money value={order.net} className="w-20 text-right font-black text-slate-800" />
                      </div>
                    </li>
                  ))}
                  {row.orders.length > 8 ? (
                    <li className="px-4 py-2 text-center text-[11px] font-bold text-slate-400">
                      +{formatNumber(row.orders.length - 8)} ακόμη παραγγελίες
                    </li>
                  ) : null}
                </ul>
              </article>
            ))
          )}
        </div>
      </div>
    </DashboardDialog>
  );
}
