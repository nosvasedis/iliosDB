import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { APP_LOGO } from '../../constants';
import { AADE_VAT_CATEGORY_OPTIONS, formatCountryDisplayName, getAadeVatExemptionCategoryLabel, resolveSbzDispatchMethod, SBZ_DISPATCH_PLACE_FROM } from '../../utils/legalDocuments';
import { LegalDeliveryDetails, LegalDocumentLine, LegalParty, LegalIssuerSettings } from '../../types';

export const LEGAL_PRINT_CSS = `
  @page { size: A4; margin: 0; }
  .legal-print-page {
    background: #fff !important;
    color: #0f172a !important;
    font-size: 10px;
    line-height: 1.3;
    min-height: calc(var(--legal-print-page-count, 1) * 297mm);
    break-after: page;
    page-break-after: always;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .legal-print-header {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .legal-print-final-anchor {
    position: static;
  }
  .legal-print-final-spacer {
    display: block;
    flex: 0 0 auto;
    height: var(--legal-print-final-spacer-height, 0px);
  }
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .legal-print-page {
      width: 210mm !important;
      min-height: calc(var(--legal-print-page-count, 1) * 297mm) !important;
      box-shadow: none !important;
      break-after: page !important;
      page-break-after: always !important;
    }
    .legal-print-page:last-child {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .legal-print-break-inside {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .legal-print-lines-table,
    .legal-print-lines-table table {
      break-inside: auto;
      page-break-inside: auto;
    }
    .legal-print-lines-table thead { display: table-header-group; }
    .legal-print-lines-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .legal-print-final-section {
      break-inside: avoid-page !important;
      page-break-inside: avoid !important;
    }
    .legal-print-final-section tbody,
    .legal-print-final-section tr,
    .legal-print-final-section td {
      break-inside: avoid-page !important;
      page-break-inside: avoid !important;
    }
    .legal-print-final-anchor {
      position: static !important;
      break-inside: avoid-page !important;
      page-break-inside: avoid !important;
    }
    .legal-print-final-spacer {
      display: block !important;
      height: var(--legal-print-final-spacer-height, 0px) !important;
      break-inside: auto !important;
      page-break-inside: auto !important;
    }
  }
`;

export const calculateLegalPrintPageCount = (contentHeight: number, pageHeight: number) => {
  if (!Number.isFinite(contentHeight) || !Number.isFinite(pageHeight) || pageHeight <= 0) return 1;
  return Math.max(1, Math.ceil((contentHeight - 1) / pageHeight));
};

export const calculatePaginatedLegalPrintLayout = (input: {
  pageHeight: number;
  firstPageContentHeight: number;
  tableHeaderHeight: number;
  tableFrameHeight: number;
  rowHeights: number[];
  finalSectionHeight: number;
  finalPageBottomPadding: number;
}) => {
  if (!Number.isFinite(input.pageHeight) || input.pageHeight <= 0) {
    return { pageCount: 1, finalSpacerHeight: 0 };
  }

  const pageHeight = input.pageHeight;
  const tableStartHeight = Math.max(0, input.tableHeaderHeight) + Math.max(0, input.tableFrameHeight);
  let tablePageCount = 1;
  let usedHeight = Math.max(0, input.firstPageContentHeight) + tableStartHeight;

  input.rowHeights.forEach((rowHeight) => {
    const safeRowHeight = Math.max(0, rowHeight);
    if (usedHeight + safeRowHeight > pageHeight + 1) {
      tablePageCount += 1;
      usedHeight = tableStartHeight + safeRowHeight;
    } else {
      usedHeight += safeRowHeight;
    }
  });

  const finalSectionHeight = Math.max(0, input.finalSectionHeight);
  const finalPageBottomPadding = Math.max(0, input.finalPageBottomPadding);
  const finalPageLimit = Math.max(0, pageHeight - finalPageBottomPadding);
  const fitsOnTablePage = usedHeight + finalSectionHeight <= finalPageLimit + 1;
  const pageCount = tablePageCount + (fitsOnTablePage ? 0 : 1);
  const physicalContentEnd = ((tablePageCount - 1) * pageHeight) + usedHeight;
  const finalSectionTop = (pageCount * pageHeight) - finalPageBottomPadding - finalSectionHeight;

  return {
    pageCount,
    finalSpacerHeight: Math.max(0, finalSectionTop - physicalContentEnd),
  };
};

export const calculatePaginatedLegalPrintPageCount = (input: Parameters<typeof calculatePaginatedLegalPrintLayout>[0]) =>
  calculatePaginatedLegalPrintLayout(input).pageCount;

export const formatPrintMoney = (value: number | null | undefined, currency = 'EUR') => {
  const amount = Number(value || 0).toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // Keep the currency attached to the amount in narrow PDF table cells.
  return currency === 'EUR' ? `${amount}\u00a0€` : `${amount}\u00a0${currency}`;
};

export const formatPrintDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatPrintTime = (value?: string | null) => {
  if (!value) return '-';
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleTimeString('el-GR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
};

export const getPartyName = (party: LegalParty | LegalIssuerSettings) =>
  ('business_name' in party ? party.business_name : undefined) || party.name || '-';

export const getCountryPrintName = (country?: string | null) => formatCountryDisplayName(country);

export const formatPartyAddress = (
  party: LegalParty | LegalIssuerSettings,
  includeCountry = false,
) => {
  const address = party.address;
  if (!address) return '-';
  const line = [address.street, address.number].filter(Boolean).join(' ');
  const cityLine = [address.postal_code, address.city].filter(Boolean).join(' ');
  return [line, cityLine, includeCountry ? getCountryPrintName(party.country) : null]
    .filter(Boolean)
    .join(', ') || '-';
};

const formatDeliveryAddress = (
  address?: LegalDeliveryDetails['delivery_address'],
  country?: string | null,
) => {
  if (!address) return '-';
  const street = [address.street, address.number].filter(Boolean).join(' ');
  const city = [address.postal_code, address.city].filter(Boolean).join(' ');
  return [street, city, getCountryPrintName(country)].filter(Boolean).join(', ') || '-';
};

const MOVE_PURPOSE_PRINT_LABELS: Record<number, string> = {
  1: 'Πώληση',
  2: 'Πώληση για λογαριασμό τρίτων',
  3: 'Δειγματισμός',
  4: 'Έκθεση',
  5: 'Επιστροφή',
  7: 'Επεξεργασία / συναρμολόγηση',
  8: 'Μεταξύ εγκαταστάσεων',
  9: 'Αγορά',
  10: 'Εφοδιασμός πλοίων και αεροσκαφών',
  11: 'Δωρεάν διάθεση',
  12: 'Εγγύηση',
  13: 'Χρησιδανεισμός',
  14: 'Αποθήκευση σε τρίτους',
  19: 'Λοιπές διακινήσεις',
  20: 'Μεταφορές / ταχυμεταφορές',
};

export const LEGAL_PRINT_DELIVERY_TERMS = [
  'Τα εμπορεύματα ταξιδεύουν για λογαριασμό και με κίνδυνο του αγοραστή.',
  'Για κάθε διαφορά αρμόδια είναι τα δικαστήρια του Πειραιά.',
  'Η εξόφληση του τιμολογίου πρέπει να γίνεται με την παράδοση.',
];

export const getVatCategoryLabel = (category: number) =>
  AADE_VAT_CATEGORY_OPTIONS.find((option) => option.category === category)?.label || `Κατ. ${category}`;

export const getVatCategoryPrintRate = (category: number) => {
  const option = AADE_VAT_CATEGORY_OPTIONS.find((item) => item.category === category);
  if (!option) return `Κατ. ${category}`;
  if (category === 8) return '—';
  return `${Number(option.value * 100).toLocaleString('el-GR', { maximumFractionDigits: 2 })}%`;
};

export const getMeasurementUnitLabel = (unit: number) => {
  const labels: Record<number, string> = {
    1: 'Τεμάχια',
    2: 'Κιλά',
    3: 'Λίτρα',
    4: 'Μέτρα',
    5: 'Τετραγωνικά μέτρα',
    6: 'Κυβικά μέτρα',
    7: 'Τεμάχια - λοιπές περιπτώσεις',
  };
  return labels[unit] || `Κωδικός ${unit}`;
};

const InfoRow = ({ label, value, mono = false }: { label: string; value?: React.ReactNode; mono?: boolean }) => (
  <div className="grid grid-cols-[35mm_1fr] gap-1 border-b border-slate-100 py-[2px] last:border-b-0">
    <dt className="font-bold uppercase tracking-[0.04em] text-slate-500">{label}:</dt>
    <dd className={`${mono ? 'font-mono' : ''} min-w-0 break-words font-semibold text-slate-800`}>{value === null || value === undefined || value === '' ? '-' : value}</dd>
  </div>
);

export function LegalPrintPage({ children }: { children: React.ReactNode }) {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof window === 'undefined') return undefined;

    let frame = 0;
    const measurePageCount = () => {
        const pageWidth = page.getBoundingClientRect().width;
        if (pageWidth <= 0) return;

        const pageHeight = pageWidth * (297 / 210);
        const pageStyle = window.getComputedStyle(page);
        const paddingTop = Number.parseFloat(pageStyle.paddingTop) || 0;
        const paddingBottom = Number.parseFloat(pageStyle.paddingBottom) || 0;
        let contentHeight = paddingTop + paddingBottom;

        Array.from(page.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return;
          const childStyle = window.getComputedStyle(child);
          const marginTop = child.classList.contains('legal-print-final-anchor')
            ? 0
            : (Number.parseFloat(childStyle.marginTop) || 0);
          const marginBottom = Number.parseFloat(childStyle.marginBottom) || 0;
          contentHeight += child.getBoundingClientRect().height + marginTop + marginBottom;
        });

        const linesSection = page.querySelector<HTMLElement>('.legal-print-lines-table');
        const finalSpacer = page.querySelector<HTMLElement>('.legal-print-final-spacer');
        const finalSection = page.querySelector<HTMLElement>('.legal-print-final-anchor');
        let pageCount = calculateLegalPrintPageCount(contentHeight, pageHeight);
        let finalSpacerHeight = 0;

        if (linesSection && finalSection) {
          const directChildren = Array.from(page.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
          const linesIndex = directChildren.indexOf(linesSection);
          let firstPageContentHeight = 0;
          directChildren.slice(0, Math.max(0, linesIndex)).forEach((child) => {
            const childStyle = window.getComputedStyle(child);
            firstPageContentHeight += child.getBoundingClientRect().height
              + (Number.parseFloat(childStyle.marginTop) || 0)
              + (Number.parseFloat(childStyle.marginBottom) || 0);
          });

          const table = linesSection.querySelector('table');
          const tableHeaderHeight = table?.querySelector('thead')?.getBoundingClientRect().height || 0;
          const rowHeights = Array.from(table?.querySelectorAll('tbody tr') || [])
            .map((row) => row.getBoundingClientRect().height);
          const tableHeight = table?.getBoundingClientRect().height || 0;
          const tableFrameHeight = Math.max(0, linesSection.getBoundingClientRect().height - tableHeight);

          const layout = calculatePaginatedLegalPrintLayout({
            pageHeight,
            firstPageContentHeight: paddingTop + firstPageContentHeight,
            tableHeaderHeight,
            tableFrameHeight,
            rowHeights,
            finalSectionHeight: finalSection.getBoundingClientRect().height,
            finalPageBottomPadding: paddingBottom,
          });
          pageCount = layout.pageCount;
          finalSpacerHeight = layout.finalSpacerHeight;
        }

        page.style.setProperty('--legal-print-page-count', String(pageCount));
        page.style.setProperty('--legal-print-final-spacer-height', `${finalSpacerHeight}px`);
        page.dataset.legalPrintPageCount = String(pageCount);
        if (finalSpacer) finalSpacer.dataset.legalPrintSpacerHeight = String(finalSpacerHeight);
    };

    const schedulePageCountMeasurement = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measurePageCount);
    };

    schedulePageCountMeasurement();
    window.addEventListener('beforeprint', measurePageCount);

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(schedulePageCountMeasurement);
    Array.from(page.children)
      .filter((child) => !child.classList.contains('legal-print-final-spacer'))
      .forEach((child) => observer?.observe(child));
    void document.fonts?.ready.then(schedulePageCountMeasurement);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('beforeprint', measurePageCount);
      observer?.disconnect();
    };
  }, []);

  return (
    <div ref={pageRef} className="legal-print-page relative mx-auto flex w-[210mm] flex-col bg-white px-[8mm] py-[6mm] font-sans text-slate-900 shadow-lg print:shadow-none page-break-after-always">
      <style>{LEGAL_PRINT_CSS}</style>
      {children}
    </div>
  );
}

export function LegalPrintHeader(props: {
  title: string;
  documentNumber: string;
  issuer: LegalIssuerSettings;
  series?: string | null;
  aa?: string | null;
  issueDate?: string | null;
  issueTime?: string | null;
  documentTypeDetail?: React.ReactNode;
  statusBadge?: React.ReactNode;
}) {
  const { title, documentNumber, issuer, series, aa, issueDate, issueTime, documentTypeDetail, statusBadge } = props;
  const issuerName = getPartyName(issuer);

  const metadata = [
    { label: 'Είδος παραστατικού', value: title },
    { label: 'Σειρά', value: series || '0' },
    { label: 'Αριθμός', value: aa || documentNumber || '-' },
    { label: 'Ημερομηνία / Ώρα', value: `${formatPrintDate(issueDate)}${issueTime ? ` · ${formatPrintTime(issueTime)}` : ''}` },
    { label: 'Σελίδα', value: '1' },
  ];

  return (
    <header className="legal-print-header legal-print-break-inside mb-2 shrink-0">
      <div className="mb-2 grid grid-cols-[58mm_1fr] items-center gap-5">
        <div className="flex h-[25mm] items-center justify-start">
          <img src={APP_LOGO} alt="ILIOS" className="legal-print-logo max-h-[20mm] max-w-[52mm] object-contain object-left" />
        </div>
        <div className="border-l-[3px] border-[#b58b47] pl-4 text-[10px] leading-[1.35] text-slate-600">
          <p className="mb-0.5 text-[14px] font-black uppercase tracking-[0.03em] text-slate-950">{issuerName}</p>
          {issuer.trade_name && issuer.trade_name !== issuerName && <p className="font-bold text-slate-700">{issuer.trade_name}</p>}
          {issuer.activity && <p><span className="font-bold text-slate-700">Δραστηριότητα:</span> {issuer.activity}</p>}
          <p><span className="font-bold text-slate-700">ΑΦΜ:</span> <span className="font-mono">{issuer.vat_number || '-'}</span> · <span className="font-bold text-slate-700">ΔΟΥ:</span> {issuer.doy || '-'}{Number(issuer.branch || 0) > 0 && <> · <span className="font-bold text-slate-700">Υποκατάστημα:</span> {issuer.branch}</>}</p>
          <p>{formatPartyAddress(issuer, true)}</p>
          {(issuer.phone || issuer.email) && <p>{[issuer.phone, issuer.email].filter(Boolean).join(' · ')}</p>}
          {(issuer.legal_form || issuer.gemi) && <p>{issuer.legal_form && <><span className="font-bold text-slate-700">Νομική μορφή:</span> {issuer.legal_form}</>} {issuer.legal_form && issuer.gemi ? ' · ' : ''}{issuer.gemi && <><span className="font-bold text-slate-700">ΓΕΜΗ:</span> {issuer.gemi}</>}</p>}
        </div>
      </div>

      <div className="grid grid-cols-[1.35fr_0.7fr_0.8fr_1.2fr_0.55fr] overflow-hidden rounded-md border border-slate-300">
        {metadata.map((item, index) => (
          <div key={item.label} className={index < metadata.length - 1 ? 'border-r border-slate-300' : ''}>
            <div className={`${index === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'} px-1 py-1 text-center text-[8.5px] font-black uppercase tracking-[0.08em]`}>{item.label}</div>
            <div className={`${index === 0 ? 'text-[11px] font-black uppercase text-slate-900' : 'text-[10.5px] font-bold text-slate-800'} min-h-[9mm] px-1 py-1.5 text-center leading-tight`}>
              <div>{item.value}</div>
              {index === 0 && documentTypeDetail && (
                <div className="mt-1 border-t border-slate-200 pt-1 text-[8.5px] font-bold normal-case tracking-normal text-slate-600">
                  {documentTypeDetail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {statusBadge && <div className="mt-1 flex min-h-[5mm] items-center justify-end">{statusBadge}</div>}
    </header>
  );
}

export function LegalPrintCustomerBar(props: {
  counterpart: LegalParty;
  counterpartTitle?: string;
  extraMeta?: React.ReactNode;
}) {
  const counterpartBranch = Number(props.counterpart.branch || 0);

  return (
    <section className="min-w-0">
      {props.counterpart.customer_code && <InfoRow label="Κωδικός" value={props.counterpart.customer_code} mono />}
      <InfoRow label="Επωνυμία" value={getPartyName(props.counterpart)} />
      <InfoRow label="ΑΦΜ" value={props.counterpart.vat_number || '-'} mono />
      {props.counterpart.profession && <InfoRow label="Επάγγελμα" value={props.counterpart.profession} />}
      {props.counterpart.tax_office && <InfoRow label="ΔΟΥ" value={props.counterpart.tax_office} />}
      <InfoRow label="Διεύθυνση" value={formatPartyAddress(props.counterpart, true)} />
      {counterpartBranch > 0 && <InfoRow label="Υποκατάστημα" value={counterpartBranch} />}
      {(props.counterpart.phone || props.counterpart.email) && (
        <InfoRow
          label="Επικοινωνία"
          value={(
            <span className="flex flex-wrap gap-x-2">
              {props.counterpart.phone && <span><span className="font-bold text-slate-500">Τηλ.</span> {props.counterpart.phone}</span>}
              {props.counterpart.email && <span><span className="font-bold text-slate-500">Ηλ. ταχυδρομείο</span> {props.counterpart.email}</span>}
            </span>
          )}
        />
      )}
      {props.extraMeta}
    </section>
  );
}

export function LegalPrintTransactionPanel(props: {
  counterpart: LegalParty;
  delivery?: LegalDeliveryDetails | null;
  paymentMethodLabel?: string | null;
  validUntil?: string | null;
  includesDeliveryNote?: boolean;
}) {
  const includesDeliveryNote = Boolean(props.includesDeliveryNote);
  const movePurpose = props.delivery?.move_purpose_title
    || MOVE_PURPOSE_PRINT_LABELS[Number(props.delivery?.move_purpose || 1)]
    || 'Πώληση';
  const loadingLocation = includesDeliveryNote && props.delivery?.loading_address
    ? formatDeliveryAddress(props.delivery.loading_address)
    : SBZ_DISPATCH_PLACE_FROM;
  const destination = props.delivery?.delivery_address
    ? formatDeliveryAddress(props.delivery.delivery_address, props.counterpart.country)
    : formatPartyAddress(props.counterpart, true);
  const dispatchAt = props.delivery?.dispatch_date
    ? `${formatPrintDate(props.delivery.dispatch_date)}${props.delivery.dispatch_time ? ` · ${formatPrintTime(props.delivery.dispatch_time)}` : ''}`
    : '-';

  return (
    <section className="min-w-0">
      <InfoRow label="Σκοπός διακίνησης" value={movePurpose} />
      <InfoRow label="Τρόπος πληρωμής" value={props.paymentMethodLabel || '-'} />
      <InfoRow label="Τόπος φόρτωσης" value={loadingLocation} />
      <InfoRow label="Τόπος προορισμού" value={destination} />
      <InfoRow label="Τρόπος αποστολής" value={resolveSbzDispatchMethod(props.delivery)} />
      {includesDeliveryNote && <InfoRow label="Ημερ. διακίνησης" value={dispatchAt} />}
      {includesDeliveryNote && <InfoRow label="Μεταφορέας" value={props.delivery?.carrier_name || 'Ίδια μέσα'} />}
      {props.validUntil && <InfoRow label="Ισχύει έως" value={formatPrintDate(props.validUntil)} />}
    </section>
  );
}

export function LegalPrintInfoGrid(props: {
  counterpart: LegalParty;
  counterpartTitle?: string;
  delivery?: LegalDeliveryDetails | null;
  paymentMethodLabel?: string | null;
  validUntil?: string | null;
  extraMeta?: React.ReactNode;
  includesDeliveryNote?: boolean;
}) {
  return (
    <section className="legal-print-break-inside mb-2 grid shrink-0 grid-cols-[1.08fr_0.92fr] gap-2">
      <div className="overflow-hidden rounded-md border border-slate-300">
        <div className="bg-slate-100 px-2.5 py-1.5 text-center text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-800">
          {props.counterpartTitle || 'Στοιχεία πελάτη'}
        </div>
        <div className="px-2.5 py-1.5 text-[10px] leading-[1.3]">
          <LegalPrintCustomerBar counterpart={props.counterpart} extraMeta={props.extraMeta} />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-300">
        <div className="bg-slate-100 px-2.5 py-1.5 text-center text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-800">
          Στοιχεία συναλλαγής & διακίνησης
        </div>
        <div className="px-2.5 py-1.5 text-[10px] leading-[1.3]">
          <LegalPrintTransactionPanel
            counterpart={props.counterpart}
            delivery={props.delivery}
            paymentMethodLabel={props.paymentMethodLabel}
            validUntil={props.validUntil}
            includesDeliveryNote={props.includesDeliveryNote}
          />
        </div>
      </div>
    </section>
  );
}

/** @deprecated Use LegalPrintInfoGrid - kept for compatible external imports. */
export function LegalPrintPartyGrid(props: {
  issuer: LegalIssuerSettings;
  counterpart: LegalParty;
  counterpartTitle?: string;
  gross?: number;
  currency?: string;
}) {
  return <LegalPrintCustomerBar counterpart={props.counterpart} counterpartTitle={props.counterpartTitle} />;
}

export function LegalPrintAadePanel(props: {
  qrUrl?: string | null;
  mark?: string | null;
  uid?: string | null;
  authenticationCode?: string | null;
  provider?: string | null;
  documentTypeCode?: string | null;
  revenueClassificationText?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!props.qrUrl) {
      setQrDataUrl(null);
      return () => { active = false; };
    }
    QRCode.toDataURL(props.qrUrl, {
      margin: 0,
      width: 112,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) setQrDataUrl(value);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [props.qrUrl]);

  return (
    <section className="legal-print-break-inside mt-0.5 shrink-0 border-t border-slate-300 pt-1">
      <div className="grid grid-cols-[27mm_1fr_52mm] gap-3">
        <div className="flex h-[25mm] w-[25mm] items-center justify-center border border-slate-300 bg-white p-1">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="AADE QR" className="h-full w-full object-contain" />
          ) : (
            <span className="px-1 text-center text-[8.5px] font-semibold leading-tight text-slate-400">QR μετά την αποδοχή από την ΑΑΔΕ</span>
          )}
        </div>
        <div className="grid content-center gap-1 text-[9.5px] leading-tight">
          <p className="mb-0.5 font-black uppercase tracking-[0.12em] text-[#946b2d]">Στοιχεία επαλήθευσης</p>
          <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Μ.Αρ.Κ.:</span><span className="font-mono font-bold text-slate-800">{props.mark || '-'}</span></div>
          {props.authenticationCode && <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Υπογραφή:</span><span className="break-all font-mono text-[8.5px] text-slate-700">{props.authenticationCode}</span></div>}
          <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Αναγνωριστικό:</span><span className="break-all font-mono text-[8.5px] text-slate-700">{props.uid || '-'}</span></div>
          {props.provider === 'sbz' && (
            <>
              <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Υ.ΠΑ.Η.Ε.Σ:</span><span className="font-semibold text-slate-700">SBZ IKE - www.sbz.gr</span></div>
              <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Αριθμός Αδειοδότησης:</span><span className="break-all font-mono text-[8.5px] text-slate-700">2023_05_113SBZ IKE_001_EMDI_V1_18052023</span></div>
            </>
          )}
        </div>
        <div className="flex flex-col rounded-md border border-slate-300 bg-slate-50 px-2.5 py-2 text-[9.5px] leading-[1.35] text-slate-600">
          <p className="font-black uppercase tracking-[0.08em] text-slate-800">Εθνική Τράπεζα</p>
          <p className="mt-1.5 whitespace-nowrap"><span className="font-bold">Αρ. Λογαριασμού:</span> <span className="font-mono text-slate-800">088/003361-85</span></p>
          <p className="mt-0.5 whitespace-nowrap"><span className="font-bold">IBAN:</span> <span className="font-mono text-slate-800">GR1401100880000008800336185</span></p>
          <div className="mt-auto border-t border-slate-300 pt-1 text-center text-[8.5px]">Υπογραφή / Σφραγίδα</div>
        </div>
      </div>
      <div className="legal-print-full-width-details mt-0.5 w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 text-[9px] leading-[1.25] text-slate-700">
        <p className="font-black uppercase tracking-[0.08em] text-slate-700">Όροι παράδοσης</p>
        <ol className="mt-0.5 space-y-0.5">
          {LEGAL_PRINT_DELIVERY_TERMS.map((term, index) => <li key={term}><span className="mr-1 font-black text-slate-500">{index + 1}.</span>{term}</li>)}
        </ol>
      </div>
      {(props.documentTypeCode || props.revenueClassificationText) && (
        <div className="legal-print-full-width-details mt-1 w-full space-y-0.5 text-[8.5px] leading-tight text-slate-500">
          {props.documentTypeCode && <p><span className="font-bold uppercase">Τύπος myDATA:</span> <span className="font-mono">{props.documentTypeCode}</span></p>}
          {props.revenueClassificationText && <p><span className="font-bold uppercase">Χαρακτηρισμοί:</span> {props.revenueClassificationText}</p>}
        </div>
      )}
    </section>
  );
}

export function LegalPrintLinesTable({ lines, currency }: { lines: LegalDocumentLine[]; currency?: string }) {
  return (
    <section className="legal-print-lines-table shrink-0 overflow-hidden rounded-md border border-slate-300">
      <table className="w-full table-fixed border-collapse text-[10px] leading-[1.2]">
        <thead>
          <tr className="bg-slate-900 text-left text-[8.5px] font-black uppercase tracking-[0.06em] text-white">
            <th className="w-[18mm] px-1.5 py-1.5">Κωδικός</th>
            <th className="px-1.5 py-1.5">Περιγραφή</th>
            <th className="w-[13mm] px-1 py-1.5 text-right">Ποσ.</th>
            <th className="w-[16mm] px-1 py-1.5 text-center">Μ.Μ.</th>
            <th className="w-[20mm] px-1 py-1.5 text-right">Τιμή μον.</th>
            <th className="w-[14mm] px-1 py-1.5 text-right">Έκπτ.%</th>
            <th className="w-[20mm] px-1 py-1.5 text-right">Αξία</th>
            <th className="w-[13mm] px-1 py-1.5 text-right">ΦΠΑ%</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const originalUnitPrice = line.source_metadata?.original_unit_price ?? line.unit_price;
            const discountPercent = line.source_metadata?.discount_percent ?? 0;
            return (
              <tr key={line.id} className="border-b border-slate-200/80 align-top odd:bg-white even:bg-slate-100/80 last:border-b-0">
                <td className="break-words px-1.5 py-[3px] font-mono text-[9px] font-bold text-slate-800">{line.item_code || `${line.sku}${line.variant_suffix || ''}`}</td>
                <td className="px-1.5 py-[3px]">
                  <div className="font-semibold text-slate-800">{line.description}</div>
                  {line.source_metadata?.line_comments && <div className="mt-0.5 text-[8.5px] italic text-slate-500">{line.source_metadata.line_comments}</div>}
                </td>
                <td className="px-1 py-[3px] text-right font-bold tabular-nums text-slate-800">{line.quantity.toLocaleString('el-GR')}</td>
                <td className="px-1 py-[3px] text-center text-[8.5px] font-semibold text-slate-600">{getMeasurementUnitLabel(line.measurement_unit)}</td>
                <td className="px-1 py-[3px] text-right font-mono tabular-nums">{formatPrintMoney(originalUnitPrice, currency)}</td>
                <td className="px-1 py-[3px] text-right font-mono tabular-nums">{Number(discountPercent).toLocaleString('el-GR', { maximumFractionDigits: 2 })}%</td>
                <td className="px-1 py-[3px] text-right font-mono font-bold tabular-nums text-slate-900">{formatPrintMoney(line.net_value, currency)}</td>
                <td className="whitespace-nowrap px-1 py-[3px] text-right font-bold tabular-nums text-slate-700">{getVatCategoryPrintRate(line.vat_category)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export function LegalPrintTotalsSection(props: {
  lines: LegalDocumentLine[];
  net: number;
  vat: number;
  gross: number;
  currency?: string;
  paymentMethodLabel?: string;
  vatExemptionCategory?: number | null;
  vatExemptionLegalNote?: string | null;
  notes?: React.ReactNode;
  delivery?: LegalDeliveryDetails | null;
  footerText?: React.ReactNode;
}) {
  const totalQuantity = props.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const originalNet = props.lines.reduce((sum, line) => {
    const originalUnitPrice = line.source_metadata?.original_unit_price ?? line.unit_price;
    return sum + (Number(originalUnitPrice || 0) * Number(line.quantity || 0));
  }, 0);
  const discountAmount = Math.max(0, originalNet - props.net);
  const hasDiscount = discountAmount > 0.009;
  const discountPercent = originalNet > 0 ? (discountAmount / originalNet) * 100 : 0;
  const vatRateSummary = [...new Set(props.lines.map((line) => getVatCategoryPrintRate(line.vat_category)))].join(' · ');
  const comment = props.delivery?.notes || props.notes;

  const SummaryMetric = ({
    label,
    value,
    className = '',
    emphasis = false,
  }: {
    label: string;
    value: React.ReactNode;
    className?: string;
    emphasis?: boolean;
  }) => (
    <div className={`${emphasis ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'} grid min-h-[9mm] grid-cols-[1fr_auto] items-center gap-2 border-b border-slate-200 px-2.5 py-1.5 ${className}`}>
      <span className={`${emphasis ? 'font-black' : 'font-semibold'} leading-tight`}>{label}</span>
      <span className={`${emphasis ? 'text-[12px] font-black' : 'font-bold'} whitespace-nowrap font-mono tabular-nums`}>{value}</span>
    </div>
  );

  return (
    <section className="legal-print-break-inside shrink-0">
      <div className="overflow-hidden rounded-md border border-slate-400 text-[10px]">
        <div className="bg-slate-100 px-2 py-1.5 font-black uppercase tracking-[0.08em] text-slate-700">Σύνοψη παραστατικού</div>
        <div className="grid grid-cols-2">
          <SummaryMetric className="border-r border-slate-200" label="Συνολική ποσότητα" value={totalQuantity.toLocaleString('el-GR')} />
          <SummaryMetric label="Συντελεστής ΦΠΑ" value={vatRateSummary || '-'} />

          {hasDiscount && (
            <>
              <SummaryMetric className="border-r border-slate-200" label="Αξία προ έκπτωσης" value={formatPrintMoney(originalNet, props.currency)} />
              <SummaryMetric label="Ποσοστό έκπτωσης" value={`${discountPercent.toLocaleString('el-GR', { maximumFractionDigits: 2 })}%`} />
              <SummaryMetric className="border-r border-slate-200" label="Αξία έκπτωσης" value={formatPrintMoney(discountAmount, props.currency)} />
              <SummaryMetric label="Καθαρή αξία μετά την έκπτωση" value={formatPrintMoney(props.net, props.currency)} />
            </>
          )}

          {!hasDiscount && <SummaryMetric className="border-r border-slate-200" label="Καθαρή αξία" value={formatPrintMoney(props.net, props.currency)} />}
          <SummaryMetric className={hasDiscount ? 'border-r border-slate-200 border-b-0' : ''} label="Αξία ΦΠΑ" value={formatPrintMoney(props.vat, props.currency)} />
          <SummaryMetric
            className={`${hasDiscount ? 'border-b-0' : 'col-span-2 border-b-0'} border-slate-200`}
            emphasis
            label={hasDiscount ? 'Τελική αξία με έκπτωση' : 'Τελική αξία'}
            value={formatPrintMoney(props.gross, props.currency)}
          />
        </div>
        {comment && (
          <div className="border-t border-slate-300 bg-slate-50 px-2.5 py-1 text-[9px] leading-snug text-slate-600">
            <span className="font-bold uppercase text-slate-500">Σχόλιο: </span>{comment}
          </div>
        )}
      </div>

      {(props.vatExemptionCategory || props.vatExemptionLegalNote) && (
        <div className="mt-1.5 space-y-0.5 text-[8.5px] leading-tight text-slate-500">
          {props.vatExemptionCategory && <p><span className="font-bold uppercase">Αιτία απαλλαγής ΦΠΑ:</span> {getAadeVatExemptionCategoryLabel(props.vatExemptionCategory)}</p>}
          {props.vatExemptionLegalNote && <p className="font-black uppercase text-slate-800">{props.vatExemptionLegalNote}</p>}
        </div>
      )}
      {props.footerText && <p className="mt-1 text-[8.5px] leading-tight text-slate-400">{props.footerText}</p>}
    </section>
  );
}

/** @deprecated Shipment details now render inside LegalPrintInfoGrid. */
export function LegalPrintDeliverySection({ delivery }: { delivery: LegalDeliveryDetails }) {
  return (
    <section className="legal-print-break-inside mb-2 rounded-md border border-slate-300 p-2 text-[9.5px]">
      <InfoRow label="Τρόπος αποστολής" value={resolveSbzDispatchMethod(delivery)} />
      <InfoRow label="Παράδοση" value={formatDeliveryAddress(delivery.delivery_address)} />
      <InfoRow label="Ημερ. αποστολής" value={`${formatPrintDate(delivery.dispatch_date)}${delivery.dispatch_time ? ` · ${formatPrintTime(delivery.dispatch_time)}` : ''}`} />
    </section>
  );
}

export function LegalPrintFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-break-inside mt-auto shrink-0 pt-2 text-center text-[8.5px] leading-tight text-slate-400">
      {children && <p className="font-medium text-slate-500">{children}</p>}
      <div className="mx-auto mt-3 w-[45mm] border-t border-slate-300 pt-1">Υπογραφή / Σφραγίδα</div>
    </div>
  );
}
