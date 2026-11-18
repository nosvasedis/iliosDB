import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Archive, ArrowRight, BadgeCheck, ClipboardCheck, Edit3, Hourglass, Loader2, Plus, Printer, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import type { LegalDocument } from '../../../types';
import { getLegalDocumentDisplayNumber, getLegalDocumentKindLabel } from '../../../utils/legalDocuments';
import { SBZ_UNKNOWN_MESSAGE } from '../../../features/legal/sbz';
import { formatNumber } from '../../../utils/numberFormat';
import { ActionButton, Chip, iconToneClass } from './ui';
import { DRAFT_ISSUE_SECTION_LABEL, type DraftIssue, type DraftIssueSection } from './draftIssues';

const SECTION_ORDER: DraftIssueSection[] = ['customer', 'document', 'delivery', 'lines', 'issuer'];

/** Final check of a draft: issues grouped by where they are fixed, each one a jump to its field. */
export function IssueReviewCard({
  issues,
  editable,
  locked,
  onJump,
  actions,
  onOpenArchive,
}: {
  issues: DraftIssue[];
  editable: boolean;
  /** Text shown instead of the checks when the document is no longer editable. */
  locked?: React.ReactNode;
  onJump: (issue: DraftIssue) => void;
  actions?: React.ReactNode;
  onOpenArchive?: () => void;
}) {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;
  const grouped = SECTION_ORDER
    .map((section) => ({ section, items: issues.filter((issue) => issue.section === section) }))
    .filter((group) => group.items.length > 0);
  const tone = errorCount ? 'red' : warningCount ? 'amber' : 'emerald';

  return (
    <section id="legal-final-check" className="scroll-mt-32 rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconToneClass[tone]}`}><ClipboardCheck size={16} /></span>
          <div>
            <h3 className="text-sm font-black text-slate-900">Έλεγχος & έκδοση</h3>
            <p className="text-xs font-medium text-slate-500">
              {!editable
                ? 'Το παραστατικό δεν είναι πλέον πρόχειρο.'
                : errorCount
                  ? 'Διορθώστε τα σφάλματα για να ενεργοποιηθεί η έκδοση.'
                  : 'Οι υποχρεωτικοί έλεγχοι του παρόχου πέρασαν.'}
            </p>
          </div>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {errorCount > 0 && <Chip tone="red"><XCircle size={11} /> {formatNumber(errorCount)} {errorCount === 1 ? 'σφάλμα' : 'σφάλματα'}</Chip>}
            {warningCount > 0 && <Chip tone="amber"><AlertTriangle size={11} /> {formatNumber(warningCount)} {warningCount === 1 ? 'προειδοποίηση' : 'προειδοποιήσεις'}</Chip>}
          </div>
        ) : null}
      </header>
      <div className="space-y-4 p-4 sm:p-5">
        {!editable ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
              <ShieldCheck size={16} /> {locked || 'Κλειδωμένο παραστατικό'}
            </div>
            {onOpenArchive ? (
              <ActionButton variant="secondary" onClick={onOpenArchive}>
                <Archive size={16} /> Άνοιγμα στο Αρχείο
              </ActionButton>
            ) : null}
          </div>
        ) : issues.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
            <BadgeCheck size={20} className="shrink-0" />
            <div>
              <div className="text-sm font-black">Έτοιμο για έκδοση μέσω SBZ</div>
              <div className="text-xs font-medium text-emerald-700">Η έκδοση αποστέλλει το παραστατικό στον πάροχο και του αποδίδει MARK. Μετά δεν αλλάζει· διορθώνεται μόνο με πιστωτικό.</div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {grouped.map(({ section, items }) => (
              <div key={section} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                  <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{DRAFT_ISSUE_SECTION_LABEL[section]}</span>
                  <span className="text-[11px] font-bold text-slate-400">{formatNumber(items.length)}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {items.map((issue) => (
                    <li key={issue.id}>
                      <button
                        type="button"
                        onClick={() => onJump(issue)}
                        className="group flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-white"
                      >
                        {issue.severity === 'error'
                          ? <XCircle size={15} className="mt-0.5 shrink-0 text-red-600" />
                          : <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />}
                        <span className={`min-w-0 flex-1 text-[13px] font-bold leading-snug ${issue.severity === 'error' ? 'text-red-800' : 'text-amber-900'}`}>{issue.message}</span>
                        <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-black text-slate-400 transition group-hover:text-emerald-700">
                          {section === 'issuer' ? 'Ρυθμίσεις' : 'Διόρθωση'} <ArrowRight size={12} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {editable && actions ? (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-2.5 text-xs font-medium leading-relaxed text-slate-500">
              <Archive size={16} className="mt-0.5 shrink-0 text-sky-600" />
              <div>
                <span className="font-black text-slate-700">Θέλετε να συνεχίσετε αργότερα;</span>{' '}
                Πατήστε «Αποθήκευση πρόχειρου». Θα το βρείτε στο <span className="font-black text-slate-700">Αρχείο → Πρόχειρα</span> και δεν θα σταλεί στον πάροχο.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">{actions}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Full-width overlay while a document is being sent: blocks every other action until the provider answers. */
export function IssuingOverlay({ document }: { document: LegalDocument }) {
  return (
    <div className="fixed inset-0 z-260 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-xs print:hidden" role="alertdialog" aria-modal="true" aria-live="assertive" aria-label="Έκδοση σε εξέλιξη">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <Loader2 size={34} className="mx-auto animate-spin text-emerald-600" />
        <div className="mt-3 text-lg font-black text-slate-950">Αποστολή στον πάροχο…</div>
        <div className="mt-1 text-sm font-medium text-slate-500">
          {getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)} για {document.counterpart.name || 'πελάτη'}.
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          Μην κλείσετε τη σελίδα και μην πατήσετε ξανά έκδοση. Η απάντηση της myDATA έρχεται σε λίγα δευτερόλεπτα.
        </div>
      </div>
    </div>
  );
}

/** What happened after «Έκδοση»: accepted (print next), still being checked, or rejected. */
export function IssueOutcomePanel({
  document,
  onPrint,
  onOpenArchive,
  onNew,
  onReconcile,
  onReopen,
  reconciling,
}: {
  document: LegalDocument;
  onPrint: () => void;
  onOpenArchive: () => void;
  onNew: () => void;
  onReconcile: () => void;
  onReopen: () => void;
  reconciling: boolean;
}) {
  const printRef = useRef<HTMLButtonElement | null>(null);
  const accepted = document.status === 'issued';
  const failed = document.status === 'failed' || document.status === 'draft';
  useEffect(() => {
    if (accepted) printRef.current?.focus();
  }, [accepted]);

  const tone = accepted ? 'emerald' : failed ? 'red' : 'amber';
  const heroClass = accepted
    ? 'from-emerald-600 to-emerald-700'
    : failed ? 'from-red-600 to-red-700' : 'from-amber-500 to-amber-600';
  const Icon = accepted ? BadgeCheck : failed ? XCircle : Hourglass;
  const title = accepted ? 'Αποδεκτό από τη myDATA' : failed ? 'Ο πάροχος δεν δέχθηκε το παραστατικό' : 'Ελέγχεται η έκδοση';

  return (
    <section className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm" aria-live="polite">
      <div className={`bg-linear-to-br ${heroClass} px-6 py-6 text-white`}>
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Icon size={26} /></span>
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-[0.16em] text-white/75">{getLegalDocumentKindLabel(document.document_kind, document.aade_document_type)}</div>
            <h2 className="text-2xl font-black leading-tight">{title}</h2>
            <div className="mt-1 text-sm font-semibold text-white/85">{document.counterpart.name || 'Χωρίς πελάτη'}</div>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {[
          ['Αριθμός', getLegalDocumentDisplayNumber(document)],
          ['MARK', document.aade_mark || '—'],
          ['Σύνολο', Number(document.totals.gross || 0).toLocaleString('el-GR', { style: 'currency', currency: 'EUR' })],
          ['Ημερομηνία', document.issue_date ? document.issue_date.slice(0, 10).split('-').reverse().join('/') : '—'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 bg-white px-4 py-3">
            <dt className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="truncate font-mono text-sm font-black text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-4 p-5 sm:p-6">
        {accepted ? (
          <p className="text-sm font-medium leading-relaxed text-slate-600">
            Το παραστατικό πήρε MARK και κλειδώθηκε. Εκτυπώστε το τώρα για να συνοδεύσει το εμπόρευμα. Για οποιαδήποτε διόρθωση εκδίδεται πιστωτικό από το Αρχείο.
          </p>
        ) : failed ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            {document.last_error || 'Δείτε το μήνυμα του παρόχου, διορθώστε και ξαναστείλτε.'}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
            {document.last_error || SBZ_UNKNOWN_MESSAGE}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {accepted ? (
            <button
              ref={printRef}
              type="button"
              onClick={onPrint}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-base font-black text-white shadow-xs shadow-emerald-900/10 transition hover:bg-emerald-700 focus-visible:ring-4 focus-visible:ring-emerald-200 active:scale-[0.98]"
            >
              <Printer size={18} /> Εκτύπωση
            </button>
          ) : failed ? (
            <ActionButton size="lg" onClick={onReopen}><Edit3 size={18} /> Διόρθωση και νέα αποστολή</ActionButton>
          ) : (
            <ActionButton size="lg" onClick={onReconcile} disabled={reconciling}>
              {reconciling ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Έλεγχος κατάστασης
            </ActionButton>
          )}
          <ActionButton variant="secondary" size="lg" onClick={onOpenArchive}><Archive size={18} /> Αρχείο</ActionButton>
          <ActionButton variant="quiet" size="lg" onClick={onNew}><Plus size={18} /> Νέο παραστατικό</ActionButton>
        </div>
        <div className={`text-[11px] font-bold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-400'}`}>
          {accepted
            ? 'Η έκδοση ολοκληρώθηκε μία φορά. Δεν υπάρχει κουμπί νέας αποστολής για αυτό το παραστατικό.'
            : failed
              ? 'Δεν αποδόθηκε MARK. Το παραστατικό μένει στο Αρχείο ως «Χρειάζεται διόρθωση».'
              : 'Μην εκδώσετε δεύτερο παραστατικό για την ίδια συναλλαγή. Ο έλεγχος κατάστασης δεν ξαναστέλνει.'}
        </div>
      </div>
    </section>
  );
}
