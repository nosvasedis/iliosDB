import React from 'react';
import { APP_LOGO } from '../../constants';
import type { LegalFinancialReportData, LegalReportAmounts } from '../../features/legal/financialReport';
import { formatNumber } from '../../utils/numberFormat';
import { formatPrintDate, formatPrintMoney, getPartyName } from './legalPrintShared';

function Kpi({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
      <p className={`text-[8px] font-black uppercase tracking-widest ${strong ? 'text-slate-300' : 'text-slate-400'}`}>{label}</p>
      <p className="mt-0.5 whitespace-nowrap text-[15px] font-black leading-tight">{value}</p>
    </div>
  );
}

function BreakdownTable({
  title,
  heading,
  rows,
  totals,
}: {
  title: string;
  heading: string;
  rows: Array<LegalReportAmounts & { id: string; label: string }>;
  totals: LegalReportAmounts;
}) {
  return (
    <div className="report-keep overflow-hidden rounded-lg border border-slate-200">
      <h3 className="border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-slate-600">{title}</h3>
      <table className="w-full text-[9px]">
        <thead>
          <tr className="border-b border-slate-200 text-[7.5px] uppercase tracking-wider text-slate-400">
            <th className="px-2.5 py-1 text-left">{heading}</th>
            <th className="px-1.5 py-1 text-right">Καθαρό</th>
            <th className="px-1.5 py-1 text-right">ΦΠΑ</th>
            <th className="px-2.5 py-1 text-right">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100">
              <td className="px-2.5 py-1 font-bold text-slate-800">{row.label}</td>
              <td className="whitespace-nowrap px-1.5 py-1 text-right text-slate-700">{formatPrintMoney(row.net)}</td>
              <td className="whitespace-nowrap px-1.5 py-1 text-right text-slate-700">{formatPrintMoney(row.vat)}</td>
              <td className="whitespace-nowrap px-2.5 py-1 text-right font-black text-slate-900">{formatPrintMoney(row.gross)}</td>
            </tr>
          ))}
          <tr className="bg-slate-50">
            <td className="px-2.5 py-1 font-black uppercase text-slate-900">Σύνολο</td>
            <td className="whitespace-nowrap px-1.5 py-1 text-right font-black text-slate-900">{formatPrintMoney(totals.net)}</td>
            <td className="whitespace-nowrap px-1.5 py-1 text-right font-black text-slate-900">{formatPrintMoney(totals.vat)}</td>
            <td className="whitespace-nowrap px-2.5 py-1 text-right font-black text-slate-900">{formatPrintMoney(totals.gross)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LegalFinancialReportPrint({ data }: { data: LegalFinancialReportData }) {
  const hasCredits = data.rows.some((row) => row.type === 'credit' && row.counted);
  return (
    <div className="w-full bg-white font-sans text-slate-900">
      <header className="mb-3 flex items-end justify-between gap-4 border-b-2 border-slate-900 pb-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <img src={APP_LOGO} alt="Ilios" className="h-9 w-auto object-contain" />
          <div className="min-w-0 border-l-2 border-slate-200 pl-3">
            <h1 className="text-[17px] font-black leading-tight tracking-tight text-slate-900">{data.title}</h1>
            {data.issuer && (
              <p className="mt-0.5 truncate text-[9px] font-bold text-slate-500">
                {getPartyName(data.issuer)}{data.issuer.vat_number ? ` · ΑΦΜ ${data.issuer.vat_number}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Περίοδος</p>
          <p className="text-[12px] font-black leading-tight">{data.periodLabel}</p>
          <p className="mt-0.5 text-[8px] font-semibold text-slate-500">Εκτύπωση {formatPrintDate(data.generatedAt)}</p>
        </div>
      </header>

      {data.filterSummary && (
        <p className="mb-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[9px] font-semibold text-slate-600">{data.filterSummary}</p>
      )}

      <section className="report-keep mb-3 grid grid-cols-4 gap-2">
        <Kpi label="Παραστατικά" value={formatNumber(data.totals.count)} />
        <Kpi label="Καθαρό Σύνολο" value={formatPrintMoney(data.totals.net)} />
        <Kpi label="ΦΠΑ" value={formatPrintMoney(data.totals.vat)} />
        <Kpi label="Γενικό Σύνολο" value={formatPrintMoney(data.totals.gross)} strong />
      </section>

      <table className="report-table w-full text-[9px]">
        <thead>
          <tr className="border-y border-slate-900 bg-slate-100 text-[7.5px] font-black uppercase tracking-wider text-slate-600">
            <th className="px-1.5 py-1.5 text-left">Παραστατικό</th>
            <th className="px-1.5 py-1.5 text-left">Ημ/νία</th>
            <th className="px-1.5 py-1.5 text-left">Πελάτης</th>
            <th className="px-1.5 py-1.5 text-left">Τύπος</th>
            <th className="px-1.5 py-1.5 text-right">Καθαρό Σύνολο</th>
            <th className="px-1.5 py-1.5 text-right">Συντ.</th>
            <th className="px-1.5 py-1.5 text-right">ΦΠΑ</th>
            <th className="px-1.5 py-1.5 text-right">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const amountTone = !row.counted
              ? 'text-slate-400 line-through'
              : row.gross < 0
                ? 'text-rose-700'
                : 'text-slate-800';
            return (
              <tr key={row.key} className="border-b border-slate-100">
                <td className="whitespace-nowrap px-1.5 py-1 font-black text-slate-900">{row.number}</td>
                <td className="whitespace-nowrap px-1.5 py-1 text-slate-600">{formatPrintDate(row.issueDate)}</td>
                <td className="px-1.5 py-1">
                  <span className="font-bold text-slate-800">{row.customerName}</span>
                  {row.vatNumber && <span className="block text-[7.5px] text-slate-500">ΑΦΜ {row.vatNumber}</span>}
                </td>
                <td className="px-1.5 py-1 text-slate-600">
                  {row.typeLabel}
                  {row.note && <span className="block text-[7.5px] font-bold text-amber-700">{row.note}</span>}
                </td>
                <td className={`whitespace-nowrap px-1.5 py-1 text-right ${amountTone}`}>{formatPrintMoney(row.net)}</td>
                <td className="whitespace-nowrap px-1.5 py-1 text-right text-slate-500">{row.rateLabel}</td>
                <td className={`whitespace-nowrap px-1.5 py-1 text-right ${amountTone}`}>{formatPrintMoney(row.vat)}</td>
                <td className={`whitespace-nowrap px-1.5 py-1 text-right font-black ${amountTone}`}>{formatPrintMoney(row.gross)}</td>
              </tr>
            );
          })}
          <tr className="border-y-2 border-slate-900 bg-slate-100 text-[10px]">
            <td colSpan={4} className="px-1.5 py-1.5 font-black uppercase text-slate-900">
              Σύνολα · {formatNumber(data.totals.count)} {data.totals.count === 1 ? 'παραστατικό' : 'παραστατικά'}
            </td>
            <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-black text-slate-900">{formatPrintMoney(data.totals.net)}</td>
            <td className="px-1.5 py-1.5" />
            <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-black text-slate-900">{formatPrintMoney(data.totals.vat)}</td>
            <td className="whitespace-nowrap px-1.5 py-1.5 text-right font-black text-slate-900">{formatPrintMoney(data.totals.gross)}</td>
          </tr>
        </tbody>
      </table>

      {data.totals.count > 0 && (
        <section className="mt-4 grid grid-cols-2 items-start gap-3">
          <BreakdownTable
            title="Ανάλυση ανά συντελεστή ΦΠΑ"
            heading="Συντελεστής"
            rows={data.byRate.map((row) => ({ ...row, id: String(row.ratePercent), label: `${row.ratePercent}%` }))}
            totals={data.totals}
          />
          <BreakdownTable
            title="Ανάλυση ανά τύπο παραστατικού"
            heading="Τύπος"
            rows={data.byType.map((row) => ({ ...row, id: row.type, label: `${row.label} (${formatNumber(row.count)})` }))}
            totals={data.totals}
          />
        </section>
      )}

      {(hasCredits || data.uncountedCount > 0 || data.mixesNonRevenue) && (
        <footer className="report-keep mt-3 space-y-0.5 border-t border-slate-200 pt-2 text-[8px] font-semibold leading-snug text-slate-500">
          {hasCredits && <p>Τα πιστωτικά τιμολόγια εμφανίζονται με αρνητικό πρόσημο και αφαιρούνται από τα σύνολα.</p>}
          {data.uncountedCount > 0 && (
            <p>Οι διαγραμμένες εγγραφές ({formatNumber(data.uncountedCount)}) εμφανίζονται για πληροφόρηση και δεν προστίθενται στα σύνολα.</p>
          )}
          {data.mixesNonRevenue && (
            <p>Τα σύνολα περιλαμβάνουν δελτία αποστολής ή προτιμολόγια μαζί με τιμολόγια· η ίδια πώληση μπορεί να μετράει δύο φορές.</p>
          )}
        </footer>
      )}
    </div>
  );
}
