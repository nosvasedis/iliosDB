import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileChartColumn,
  FileDown,
  ListChecks,
  Loader2,
  PackageSearch,
  Search,
  X,
} from 'lucide-react';
import type { LegalArchiveRecord } from '../../types';
import {
  buildLegalFinancialReport,
  DEFAULT_LEGAL_REPORT_TYPES,
  getLegalReportQuickPeriods,
  getLegalReportType,
  isSameLegalReportPeriod,
  LEGAL_REPORT_MONTHS_SHORT,
  LEGAL_REPORT_QUARTERS,
  LEGAL_REPORT_STATUSES,
  LEGAL_REPORT_TYPES,
  narrowLegalReportRecords,
  resolveLegalReportPeriod,
  selectLegalReportRecords,
  type LegalReportPeriod,
  type LegalReportSort,
  type LegalReportStatus,
  type LegalReportType,
} from '../../features/legal/financialReport';
import { useRestartBlocker } from '../../hooks/useRestartBlocker';
import { formatNumber } from '../../utils/numberFormat';
import { formatPrintMoney } from './legalPrintShared';
import { printLegalFinancialReport } from './printLegalFinancialReport';

const ALL_TYPES = LEGAL_REPORT_TYPES.map((type) => type.id);

const typeDotClass: Record<LegalReportType, string> = {
  invoice: 'bg-emerald-500',
  service_invoice: 'bg-indigo-500',
  invoice_delivery: 'bg-teal-500',
  credit: 'bg-rose-500',
  delivery_note: 'bg-sky-400',
  proforma: 'bg-violet-400',
};

const sortOptions: Array<{ id: LegalReportSort; label: string }> = [
  { id: 'date', label: 'Ημερομηνία' },
  { id: 'customer', label: 'Πελάτης' },
  { id: 'type', label: 'Τύπος' },
];

const toggled = <T,>(current: ReadonlySet<T>, value: T) => {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
};

const pillClass = (active: boolean, muted = false) => `rounded-lg border px-2 py-1.5 text-xs font-black transition ${
  active
    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
    : `border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 ${muted ? 'text-slate-300' : 'text-slate-600'}`
}`;

function SectionLabel({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-black uppercase tracking-wide text-slate-500">{children}</h3>
      {action}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`min-w-0 rounded-xl border p-2.5 ${tone}`}>
      <div className="truncate text-[10px] font-black uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-0.5 truncate text-base font-black text-slate-950">{value}</div>
    </div>
  );
}

interface LegalFinancialReportModalProps {
  records: LegalArchiveRecord[];
  /** Rows ticked in the archive. Empty opens the report on this month instead. */
  initialKeys: string[];
  onClose: () => void;
}

export default function LegalFinancialReportModal({ records, initialKeys, onClose }: LegalFinancialReportModalProps) {
  const quickPeriods = useMemo(() => getLegalReportQuickPeriods(), []);
  const [manualKeys, setManualKeys] = useState<ReadonlySet<string> | null>(
    () => (initialKeys.length ? new Set(initialKeys) : null),
  );
  const [period, setPeriod] = useState<LegalReportPeriod>(quickPeriods[0].period);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [types, setTypes] = useState<ReadonlySet<LegalReportType>>(
    () => new Set(initialKeys.length ? ALL_TYPES : DEFAULT_LEGAL_REPORT_TYPES),
  );
  const [statuses, setStatuses] = useState<ReadonlySet<LegalReportStatus>>(() => new Set<LegalReportStatus>(['issued']));
  const [customerQuery, setCustomerQuery] = useState('');
  const [sort, setSort] = useState<LegalReportSort>('date');
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const selectAllRef = useRef<HTMLInputElement>(null);

  useRestartBlocker({ label: 'Εκτύπωση σε εξέλιξη', busy: printing });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const manualRecords = useMemo(
    () => (manualKeys ? records.filter((record) => manualKeys.has(record.key)) : null),
    [records, manualKeys],
  );

  const choosePeriod = (next: LegalReportPeriod) => {
    setPeriod(next);
    setExcluded(new Set());
    if (next.kind === 'month' || next.kind === 'quarter' || next.kind === 'year') setViewYear(next.year);
  };

  const leaveManualMode = () => {
    setManualKeys(null);
    setTypes(new Set(DEFAULT_LEGAL_REPORT_TYPES));
    setExcluded(new Set());
  };

  const candidates = useMemo(
    () => (manualRecords
      ? narrowLegalReportRecords(manualRecords, types, customerQuery)
      : selectLegalReportRecords(records, { period, types, statuses, customerQuery })),
    [manualRecords, records, period, types, statuses, customerQuery],
  );

  const typeCounts = useMemo(() => {
    const everyType = new Set(ALL_TYPES);
    const pool = manualRecords
      ? narrowLegalReportRecords(manualRecords, everyType, customerQuery)
      : selectLegalReportRecords(records, { period, types: everyType, statuses, customerQuery });
    return pool.reduce<Partial<Record<LegalReportType, number>>>((counts, record) => {
      const type = getLegalReportType(record);
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {});
  }, [manualRecords, records, period, statuses, customerQuery]);

  const statusCounts = useMemo(() => {
    const counts: Partial<Record<LegalReportStatus, number>> = {};
    LEGAL_REPORT_STATUSES.forEach(({ id }) => {
      counts[id] = selectLegalReportRecords(records, {
        period, types, statuses: new Set([id]), customerQuery,
      }).length;
    });
    return counts;
  }, [records, period, types, customerQuery]);

  const monthCounts = useMemo(() => {
    const counts = Array.from({ length: 12 }, () => 0);
    selectLegalReportRecords(records, {
      period: { kind: 'year', year: viewYear }, types, statuses, customerQuery,
    }).forEach((record) => {
      counts[Number(record.document.issue_date.slice(5, 7)) - 1] += 1;
    });
    return counts;
  }, [records, viewYear, types, statuses, customerQuery]);

  const periodLabel = useMemo(() => {
    if (!manualRecords) return resolveLegalReportPeriod(period)?.label || 'Όλες οι ημερομηνίες';
    const dates = manualRecords.map((record) => record.document.issue_date.slice(0, 10)).sort();
    if (!dates.length) return 'Επιλεγμένα παραστατικά';
    const format = (value: string) => value.split('-').reverse().join('/');
    const first = format(dates[0]);
    const last = format(dates[dates.length - 1]);
    return first === last ? `Επιλεγμένα · ${first}` : `Επιλεγμένα · ${first} – ${last}`;
  }, [manualRecords, period]);

  const filterSummary = useMemo(() => {
    const parts = [
      types.size === ALL_TYPES.length
        ? 'Όλοι οι τύποι'
        : LEGAL_REPORT_TYPES.filter((type) => types.has(type.id)).map((type) => type.label).join(', '),
    ];
    if (!manualRecords) {
      parts.push(LEGAL_REPORT_STATUSES.filter((status) => statuses.has(status.id)).map((status) => status.label).join(', '));
    }
    if (customerQuery.trim()) parts.push(`Πελάτης: ${customerQuery.trim()}`);
    return parts.filter(Boolean).join(' · ');
  }, [types, statuses, customerQuery, manualRecords]);

  const listRows = useMemo(
    () => buildLegalFinancialReport({ records: candidates, periodLabel, sort }).rows,
    [candidates, periodLabel, sort],
  );
  const report = useMemo(
    () => buildLegalFinancialReport({
      records: candidates.filter((record) => !excluded.has(record.key)),
      periodLabel,
      filterSummary,
      sort,
    }),
    [candidates, excluded, periodLabel, filterSummary, sort],
  );

  const includedCount = report.rows.length;
  const allIncluded = listRows.length > 0 && includedCount === listRows.length;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = includedCount > 0 && !allIncluded;
  }, [includedCount, allIncluded]);

  const customRange = period.kind === 'custom' ? period : null;
  const customRangeInvalid = !!customRange?.from && !!customRange.to && customRange.from > customRange.to;

  const handlePrint = async () => {
    setPrinting(true);
    setPrintError('');
    try {
      await printLegalFinancialReport(report);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Η δημιουργία του PDF απέτυχε.');
    } finally {
      setPrinting(false);
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-700 flex items-center justify-center bg-black/50 backdrop-blur-xs sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-financial-report-title"
        className="flex h-dvh w-full max-w-6xl flex-col overflow-hidden bg-white shadow-xl sm:h-[92vh] sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-linear-to-r from-emerald-50 to-white px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><FileChartColumn size={20} /></div>
            <div className="min-w-0">
              <h2 id="legal-financial-report-title" className="text-lg font-black leading-tight text-slate-950">Οικονομική αναφορά</h2>
              <p className="truncate text-xs font-bold text-slate-500">{periodLabel}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[350px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="space-y-5 border-b border-slate-200 bg-slate-50/70 p-4 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            {manualRecords ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 text-sm font-black text-emerald-900">
                  <ListChecks size={16} /> {formatNumber(manualRecords.length)} επιλεγμένα από το αρχείο
                </div>
                <p className="mt-1 text-xs font-medium leading-5 text-emerald-900/80">
                  Η αναφορά περιλαμβάνει όσα σημειώσατε στη λίστα.
                </p>
                <button type="button" onClick={leaveManualMode} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-800 hover:bg-emerald-100">
                  <CalendarDays size={14} /> Επιλογή με βάση την περίοδο
                </button>
              </div>
            ) : (
              <section>
                <SectionLabel>Περίοδος</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5">
                  {quickPeriods.map((quick) => (
                    <button key={quick.id} type="button" aria-pressed={isSameLegalReportPeriod(period, quick.period)} onClick={() => choosePeriod(quick.period)} className={pillClass(isSameLegalReportPeriod(period, quick.period))}>
                      {quick.label}
                    </button>
                  ))}
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center justify-between">
                    <button type="button" aria-label="Προηγούμενο έτος" onClick={() => setViewYear((year) => year - 1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><ChevronLeft size={16} /></button>
                    <button type="button" aria-pressed={period.kind === 'year' && period.year === viewYear} onClick={() => choosePeriod({ kind: 'year', year: viewYear })} className={`rounded-md px-3 py-1 text-sm font-black transition ${period.kind === 'year' && period.year === viewYear ? 'bg-emerald-600 text-white' : 'text-slate-800 hover:bg-emerald-50'}`}>
                      {viewYear}
                    </button>
                    <button type="button" aria-label="Επόμενο έτος" onClick={() => setViewYear((year) => year + 1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><ChevronRight size={16} /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    {LEGAL_REPORT_QUARTERS.map((label, index) => {
                      const active = period.kind === 'quarter' && period.year === viewYear && period.quarter === index + 1;
                      return (
                        <button key={label} type="button" aria-pressed={active} title={`${label} τρίμηνο ${viewYear}`} onClick={() => choosePeriod({ kind: 'quarter', year: viewYear, quarter: index + 1 })} className={pillClass(active)}>
                          {label} τριμ.
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-1 grid grid-cols-4 gap-1">
                    {LEGAL_REPORT_MONTHS_SHORT.map((label, month) => {
                      const active = period.kind === 'month' && period.year === viewYear && period.month === month;
                      return (
                        <button
                          key={label}
                          type="button"
                          aria-pressed={active}
                          title={`${formatNumber(monthCounts[month])} παραστατικά`}
                          onClick={() => choosePeriod({ kind: 'month', year: viewYear, month })}
                          className={pillClass(active, monthCounts[month] === 0)}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button type="button" aria-pressed={period.kind === 'custom'} onClick={() => choosePeriod({ kind: 'custom', from: '', to: '' })} className={pillClass(period.kind === 'custom')}>
                    Προσαρμοσμένο εύρος
                  </button>
                  <button type="button" aria-pressed={period.kind === 'all'} onClick={() => choosePeriod({ kind: 'all' })} className={pillClass(period.kind === 'all')}>
                    Όλες οι ημερομηνίες
                  </button>
                </div>
                {customRange && (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Από
                      <input type="date" value={customRange.from} onChange={(event) => choosePeriod({ ...customRange, from: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-hidden focus:border-emerald-500" />
                    </label>
                    <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Έως
                      <input type="date" value={customRange.to} onChange={(event) => choosePeriod({ ...customRange, to: event.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-hidden focus:border-emerald-500" />
                    </label>
                    {customRangeInvalid && <p className="col-span-2 text-xs font-bold text-rose-700">Η αρχική ημερομηνία είναι μετά την τελική.</p>}
                  </div>
                )}
              </section>
            )}

            <section>
              <SectionLabel
                action={(
                  <div className="flex gap-2 text-[11px] font-black text-emerald-700">
                    <button type="button" onClick={() => setTypes(new Set(DEFAULT_LEGAL_REPORT_TYPES))} className="hover:underline">Έσοδα</button>
                    <button type="button" onClick={() => setTypes(new Set(ALL_TYPES))} className="hover:underline">Όλοι</button>
                  </div>
                )}
              >
                Τύποι παραστατικών
              </SectionLabel>
              <div className="space-y-1">
                {LEGAL_REPORT_TYPES.map((type) => (
                  <label key={type.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${types.has(type.id) ? 'border-emerald-300 bg-white text-slate-900' : 'border-transparent text-slate-500 hover:bg-white'}`}>
                    <input type="checkbox" checked={types.has(type.id)} onChange={() => setTypes((current) => toggled(current, type.id))} className="h-4 w-4 accent-emerald-600" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${typeDotClass[type.id]}`} />
                    <span className="min-w-0 flex-1 truncate">{type.label}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-500">{formatNumber(typeCounts[type.id] || 0)}</span>
                  </label>
                ))}
              </div>
            </section>

            {!manualRecords && (
              <section>
                <SectionLabel>Κατάσταση</SectionLabel>
                <div className="grid grid-cols-3 gap-1.5">
                  {LEGAL_REPORT_STATUSES.map((status) => (
                    <button key={status.id} type="button" aria-pressed={statuses.has(status.id)} onClick={() => setStatuses((current) => toggled(current, status.id))} className={pillClass(statuses.has(status.id))}>
                      {status.label} ({formatNumber(statusCounts[status.id] || 0)})
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionLabel>Πελάτης</SectionLabel>
              <label className="relative block">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  placeholder="Όνομα ή ΑΦΜ (προαιρετικό)"
                  aria-label="Φίλτρο πελάτη"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm font-semibold text-slate-800 outline-hidden focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </section>
          </aside>

          <section className="flex min-h-0 flex-col">
            <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3 xl:grid-cols-4">
              <Kpi label="Παραστατικά" value={formatNumber(report.totals.count)} tone="border-slate-200 bg-slate-50 text-slate-700" />
              <Kpi label="Καθαρό Σύνολο" value={formatPrintMoney(report.totals.net)} tone="border-sky-200 bg-sky-50 text-sky-700" />
              <Kpi label="ΦΠΑ" value={formatPrintMoney(report.totals.vat)} tone="border-violet-200 bg-violet-50 text-violet-700" />
              <Kpi label="Γενικό Σύνολο" value={formatPrintMoney(report.totals.gross)} tone="border-emerald-200 bg-emerald-50 text-emerald-700" />
            </div>

            {(report.mixesNonRevenue || report.uncountedCount > 0) && (
              <div className="space-y-1 border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
                {report.mixesNonRevenue && (
                  <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Δελτία αποστολής ή προτιμολόγια προστίθενται μαζί με τιμολόγια· η ίδια πώληση μπορεί να μετράει δύο φορές.</p>
                )}
                {report.uncountedCount > 0 && (
                  <p className="flex items-start gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {formatNumber(report.uncountedCount)} εγγραφές εμφανίζονται στην αναφορά αλλά δεν προστίθενται στα σύνολα (ακυρωμένα, πρόχειρα ή μετατραπέντα).</p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allIncluded}
                  disabled={!listRows.length}
                  onChange={() => setExcluded(allIncluded ? new Set(listRows.map((row) => row.key)) : new Set())}
                  className="h-4 w-4 accent-emerald-600"
                />
                {formatNumber(includedCount)} από {formatNumber(listRows.length)} στην αναφορά
              </label>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Ταξινόμηση">
                {sortOptions.map((option) => (
                  <button key={option.id} type="button" aria-pressed={sort === option.id} onClick={() => setSort(option.id)} className={`rounded-md px-2 py-1 text-[11px] font-black transition ${sort === option.id ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-48 lg:flex-1 lg:overflow-y-auto">
              {listRows.length === 0 ? (
                <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 px-5 text-center text-slate-500">
                  <PackageSearch size={28} className="text-slate-300" />
                  <p className="text-sm font-black text-slate-700">Δεν βρέθηκαν παραστατικά</p>
                  <p className="text-xs font-medium">Δοκιμάστε άλλη περίοδο ή προσθέστε τύπους παραστατικών.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {listRows.map((row) => {
                    const included = !excluded.has(row.key);
                    const amountTone = !row.counted ? 'text-slate-400 line-through' : row.gross < 0 ? 'text-rose-700' : 'text-slate-900';
                    return (
                      <li key={row.key}>
                        <label className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-1.5 transition hover:bg-slate-50 sm:grid-cols-[auto_minmax(0,1fr)_88px_58px_78px_92px] ${included ? '' : 'opacity-50'}`}>
                          <input type="checkbox" checked={included} onChange={() => setExcluded((current) => toggled(current, row.key))} aria-label={`Συμπερίληψη ${row.number}`} className="h-4 w-4 accent-emerald-600" />
                          <span className="min-w-0">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${typeDotClass[row.type]}`} title={row.typeLabel} />
                              <span className="whitespace-nowrap text-sm font-black text-slate-900">{row.number}</span>
                              <span className="whitespace-nowrap text-[11px] font-bold text-slate-400">{row.issueDate.slice(0, 10).split('-').reverse().join('/')}</span>
                            </span>
                            <span className="block truncate text-xs font-bold text-slate-600">
                              {row.customerName}
                              {row.note && <span className="ml-1.5 font-black text-amber-700">· {row.note}</span>}
                            </span>
                          </span>
                          <span className={`hidden whitespace-nowrap text-right text-xs font-bold sm:block ${amountTone}`}>{formatPrintMoney(row.net)}</span>
                          <span className="hidden whitespace-nowrap text-right text-[11px] font-bold text-slate-500 sm:block">{row.rateLabel}</span>
                          <span className={`hidden whitespace-nowrap text-right text-xs font-bold sm:block ${amountTone}`}>{formatPrintMoney(row.vat)}</span>
                          <span className={`whitespace-nowrap text-right text-sm font-black ${amountTone}`}>{formatPrintMoney(row.gross)}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
          <p className={`min-w-0 text-xs font-bold ${printError ? 'text-rose-700' : 'text-slate-500'}`}>
            {printError || 'Στο παράθυρο εκτύπωσης επιλέξτε «Αποθήκευση ως PDF».'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-600 hover:bg-slate-50">
              Κλείσιμο
            </button>
            <button
              type="button"
              onClick={() => void handlePrint()}
              disabled={includedCount === 0 || printing}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {printing ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
              Δημιουργία PDF
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
