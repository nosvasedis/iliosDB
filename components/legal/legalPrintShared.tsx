import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Calendar, Hash } from 'lucide-react';
import { AADE_VAT_CATEGORY_OPTIONS, getAadeVatExemptionCategoryLabel } from '../../utils/legalDocuments';
import { LegalDeliveryDetails, LegalDocumentLine, LegalParty, LegalIssuerSettings } from '../../types';

export const LEGAL_PRINT_CSS = `
  .legal-print-page {
    background: #fff !important;
    color: #0f172a !important;
    break-after: page;
    page-break-after: always;
  }
  .legal-print-header {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  @media print {
    .legal-print-page {
      width: 210mm !important;
      min-height: auto !important;
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
    .legal-print-lines-table {
      break-inside: auto;
      page-break-inside: auto;
    }
    .legal-print-lines-table table {
      break-inside: auto;
      page-break-inside: auto;
    }
    .legal-print-lines-table thead {
      display: table-header-group;
    }
    .legal-print-lines-table tbody tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .legal-print-header {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

export const formatPrintMoney = (value: number | null | undefined, currency = 'EUR') => {
  const amount = Number(value || 0).toLocaleString('el-GR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency === 'EUR' ? `${amount} €` : `${amount} ${currency}`;
};

export const formatPrintDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const getPartyName = (party: LegalParty | LegalIssuerSettings) =>
  ('business_name' in party ? party.business_name : undefined) || party.name || '-';

export const formatPartyAddress = (party: LegalParty | LegalIssuerSettings) => {
  const address = party.address;
  if (!address) return '-';
  const line = [address.street, address.number].filter(Boolean).join(' ');
  const cityLine = [address.postal_code, address.city].filter(Boolean).join(' ');
  return [line, cityLine].filter(Boolean).join(', ') || '-';
};

export const getVatCategoryLabel = (category: number) =>
  AADE_VAT_CATEGORY_OPTIONS.find((option) => option.category === category)?.label || `Κατ. ${category}`;

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

/** Page shell — mirrors OrderInvoiceView layout (no watermark wrapper). */
export function LegalPrintPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-page relative mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-6 font-sans text-black shadow-lg print:min-h-0 print:px-6 print:py-4 print:shadow-none page-break-after-always">
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
  documentTypeCode?: string | null;
  statusBadge?: React.ReactNode;
}) {
  const { title, documentNumber, issuer, series, aa, issueDate, documentTypeCode, statusBadge } = props;
  const issuerContact = [issuer.phone, issuer.email].filter(Boolean).join(' · ');
  const optionalLegalIdentity = [
    issuer.activity ? `Δραστηριότητα: ${issuer.activity}` : '',
    issuer.legal_form ? `Νομική μορφή: ${issuer.legal_form}` : '',
    issuer.gemi ? `ΓΕΜΗ: ${issuer.gemi}` : '',
  ].filter(Boolean);

  return (
    <header className="legal-print-header legal-print-break-inside mb-2 shrink-0 border-b-2 border-slate-900 pb-2">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 text-[8px] leading-[1.25] text-slate-600">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-900">{getPartyName(issuer)}</p>
          {issuer.trade_name && issuer.trade_name !== getPartyName(issuer) && (
            <p className="font-semibold text-slate-700">{issuer.trade_name}</p>
          )}
          <p>{formatPartyAddress(issuer)}</p>
          <p>
            <span className="font-mono font-semibold">ΑΦΜ: {issuer.vat_number || '-'}</span>
            {' · '}<span><span className="font-semibold">ΔΟΥ:</span> {issuer.doy || '-'}</span>
            {' · '}Υποκ.: {issuer.branch ?? 0}
          </p>
          {issuerContact && <p>{issuerContact}</p>}
          {optionalLegalIdentity.length > 0 && <p>{optionalLegalIdentity.join(' · ')}</p>}
        </div>

        <div className="max-w-[46%] shrink-0 text-right">
          <h1 className="mb-0.5 text-xl font-black uppercase leading-none tracking-tight text-slate-900">{title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[9px] font-medium text-slate-700">
            <span className="inline-flex items-center gap-1">
              <Hash size={10} />
              {documentNumber}
            </span>
            {(series || aa) && (
              <>
                <span className="text-slate-300">|</span>
                <span>Σειρά <span className="font-mono font-bold">{series || '0'}</span> · Α/Α <span className="font-mono font-bold">{aa || '-'}</span></span>
              </>
            )}
            <span className="text-slate-300">|</span>
            <span className="inline-flex items-center gap-1">
              <Calendar size={10} />
              {formatPrintDate(issueDate)}
            </span>
            {documentTypeCode && (
              <>
                <span className="text-slate-300">|</span>
                <span className="font-mono">ΑΑΔΕ {documentTypeCode}</span>
              </>
            )}
          </div>
          {statusBadge && <div className="mt-1 flex justify-end">{statusBadge}</div>}
        </div>
      </div>
    </header>
  );
}

/** Compact customer / issuer bar — mirrors OrderInvoiceView info strip. */
export function LegalPrintCustomerBar(props: {
  counterpart: LegalParty;
  counterpartTitle?: string;
  extraMeta?: React.ReactNode;
}) {
  const contact = [props.counterpart.phone, props.counterpart.email].filter(Boolean).join(' · ');
  const counterpartCountry = (props.counterpart.country || 'GR').toUpperCase();
  const counterpartBranch = Number(props.counterpart.branch || 0);

  return (
    <section className="legal-print-break-inside mb-2 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {props.counterpartTitle || 'Πελάτης'}
          </span>
          <span className="min-w-0 break-words text-sm font-black leading-tight text-slate-900">
            {getPartyName(props.counterpart)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700">
          <span className="font-mono text-slate-600">ΑΦΜ: {props.counterpart.vat_number || '-'}</span>
          <span className="min-w-0 break-words">{formatPartyAddress(props.counterpart)}</span>
          <span>Χώρα: {counterpartCountry}</span>
          <span>Υποκ.: {counterpartBranch}</span>
          {contact && <span>{contact}</span>}
        </div>
        {props.extraMeta}
      </div>
    </section>
  );
}

/** @deprecated Use LegalPrintCustomerBar — kept as alias for any external imports. */
export function LegalPrintPartyGrid(props: {
  issuer: LegalIssuerSettings;
  counterpart: LegalParty;
  counterpartTitle?: string;
  gross?: number;
  currency?: string;
}) {
  return (
    <LegalPrintCustomerBar
      counterpart={props.counterpart}
      counterpartTitle={props.counterpartTitle}
    />
  );
}

export function LegalPrintAadePanel(props: {
  qrUrl?: string | null;
  mark?: string | null;
  uid?: string | null;
  authenticationCode?: string | null;
  documentType?: string | null;
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
      width: 96,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) setQrDataUrl(value);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [props.qrUrl]);

  return (
    <section className="legal-print-break-inside mb-2 overflow-hidden rounded-lg border border-slate-300">
      <div className="bg-slate-900 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-white">
        myDATA / ΑΑΔΕ
      </div>
      <div className="grid grid-cols-[96px_1fr] gap-2.5 bg-slate-50 p-2">
        <div className="flex h-[96px] w-[96px] items-center justify-center rounded-md border border-slate-200 bg-white p-1">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="AADE QR" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[9px] font-semibold leading-tight text-slate-400">
              QR διαθέσιμο μετά την αποδοχή από την ΑΑΔΕ
            </span>
          )}
        </div>
        <div className="grid content-center gap-1 text-[9px]">
          <div className="grid grid-cols-[72px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">MARK</span>
            <span className="font-mono font-bold text-slate-900">{props.mark || '-'}</span>
          </div>
          <div className="grid grid-cols-[72px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">UID</span>
            <span className="break-all font-mono text-[8px] text-slate-800">{props.uid || '-'}</span>
          </div>
          {props.authenticationCode && (
            <div className="grid grid-cols-[72px_1fr] gap-1">
              <span className="font-bold uppercase tracking-wide text-slate-500">Auth code</span>
              <span className="break-all font-mono text-[8px] text-slate-800">{props.authenticationCode}</span>
            </div>
          )}
          {props.documentType && (
            <div className="grid grid-cols-[72px_1fr] gap-1">
              <span className="font-bold uppercase tracking-wide text-slate-500">Τύπος ΑΑΔΕ</span>
              <span className="font-mono font-semibold text-slate-800">{props.documentType}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function LegalPrintLinesTable({ lines, currency }: { lines: LegalDocumentLine[]; currency?: string }) {
  return (
    <section className="legal-print-lines-table mb-2">
      <table className="w-full border-collapse text-[9px] leading-[1.15]">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left text-[8px] font-black uppercase tracking-wider text-slate-800">
            <th className="w-7 px-1 py-1">#</th>
            <th className="w-[4.5rem] px-1 py-1">Κωδ.</th>
            <th className="px-1 py-1">Περιγραφή</th>
            <th className="w-9 px-1 py-1 text-right">Ποσ.</th>
            <th className="w-14 px-1 py-1 text-center">Μ.Μ.</th>
            <th className="w-14 px-1 py-1 text-right">Τιμή</th>
            <th className="w-14 px-1 py-1 text-right">Καθαρή</th>
            <th className="w-14 px-1 py-1 text-right">ΦΠΑ</th>
            <th className="w-14 px-1 py-1 text-right">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="border-b border-slate-100 align-top">
              <td className="px-1 py-0.5 tabular-nums text-slate-400">{line.line_number}</td>
              <td className="px-1 py-0.5 font-mono text-[8px] font-bold text-slate-900">
                {line.item_code || `${line.sku}${line.variant_suffix || ''}`}
              </td>
              <td className="px-1 py-0.5">
                <div className="font-semibold text-slate-800">{line.description}</div>
                {line.source_metadata?.line_comments && (
                  <div className="mt-0.5 text-[7px] italic leading-tight text-slate-500">
                    Σχόλιο: {line.source_metadata.line_comments}
                  </div>
                )}
              </td>
              <td className="px-1 py-0.5 text-right font-bold tabular-nums text-slate-800">{line.quantity}</td>
              <td
                className="px-1 py-0.5 text-center text-[7px] font-semibold leading-tight text-slate-600"
                title={`Κωδικός μονάδας myDATA: ${line.measurement_unit}`}
              >
                {getMeasurementUnitLabel(line.measurement_unit)}
              </td>
              <td className="px-1 py-0.5 text-right tabular-nums">{formatPrintMoney(line.unit_price, currency)}</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{formatPrintMoney(line.net_value, currency)}</td>
              <td className="px-1 py-0.5 text-right tabular-nums">
                <div className="text-[7px] font-semibold text-slate-500">{getVatCategoryLabel(line.vat_category)}</div>
                <div>{formatPrintMoney(line.vat_amount, currency)}</div>
              </td>
              <td className="px-1 py-0.5 text-right font-black tabular-nums text-slate-900">{formatPrintMoney(line.gross_value, currency)}</td>
            </tr>
          ))}
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
  revenueClassificationText?: string;
  notes?: React.ReactNode;
  footerText?: React.ReactNode;
}) {
  const vatGroups = new Map<number, { net: number; vat: number }>();
  props.lines.forEach((line) => {
    const current = vatGroups.get(line.vat_category) || { net: 0, vat: 0 };
    current.net += line.net_value;
    current.vat += line.vat_amount;
    vatGroups.set(line.vat_category, current);
  });

  return (
    <footer className="legal-print-break-inside mt-2 flex shrink-0 items-start justify-between border-t-2 border-slate-900 pt-2">
      <div className="max-w-md space-y-1 text-[9px] leading-snug text-slate-600">
        {props.paymentMethodLabel && (
          <div><span className="font-bold uppercase text-slate-500">Τρόπος πληρωμής</span> · {props.paymentMethodLabel}</div>
        )}
        {props.vatExemptionCategory && (
          <div><span className="font-bold uppercase text-slate-500">Αιτία απαλλαγής ΦΠΑ</span> · {getAadeVatExemptionCategoryLabel(props.vatExemptionCategory)}</div>
        )}
        {props.revenueClassificationText && (
          <div><span className="font-bold uppercase text-slate-500">Χαρακτηρισμοί</span> · {props.revenueClassificationText}</div>
        )}
        {props.notes && (
          <div className="italic rounded border border-slate-100 bg-slate-50 p-1.5 leading-snug">
            {props.notes}
          </div>
        )}
        {props.footerText && (
          <div className="pt-1 text-[7px] font-medium leading-tight text-slate-400">
            <p className="font-bold uppercase tracking-widest">ILIOS KOSMIMA ERP</p>
            <p className="mt-0.5">{props.footerText}</p>
          </div>
        )}
      </div>

      <div className="w-60 shrink-0 text-[11px]">
        <div className="mb-0.5 flex justify-between gap-3 text-slate-600">
          <span className="whitespace-nowrap">Καθαρή Αξία:</span>
          <span className="whitespace-nowrap text-right font-mono font-bold tabular-nums">{formatPrintMoney(props.net, props.currency)}</span>
        </div>
        {Array.from(vatGroups.entries()).map(([category, totals]) => (
          <div key={category} className="mb-0.5 flex justify-between gap-3 text-slate-600">
            <span className="truncate pr-2">Φ.Π.Α. · {getVatCategoryLabel(category)}</span>
            <span className="whitespace-nowrap text-right font-mono font-bold tabular-nums">{formatPrintMoney(totals.vat, props.currency)}</span>
          </div>
        ))}
        <div className="mb-1 flex justify-between gap-3 border-b border-slate-200 pb-1 text-slate-600">
          <span className="whitespace-nowrap">Σύνολο Φ.Π.Α.:</span>
          <span className="whitespace-nowrap text-right font-mono font-bold tabular-nums">{formatPrintMoney(props.vat, props.currency)}</span>
        </div>
        <div className="flex justify-between gap-3 text-sm font-black text-slate-900">
          <span className="whitespace-nowrap uppercase">Γενικό Σύνολο:</span>
          <span className="whitespace-nowrap text-right font-mono text-base tabular-nums">{formatPrintMoney(props.gross, props.currency)}</span>
        </div>
      </div>
    </footer>
  );
}

export function LegalPrintDeliverySection({ delivery }: { delivery: LegalDeliveryDetails }) {
  const formatAddress = (address?: LegalDeliveryDetails['loading_address']) =>
    [address?.street, address?.number, address?.postal_code, address?.city].filter(Boolean).join(' ') || '-';

  return (
    <section className="legal-print-break-inside mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-400">Στοιχεία διακίνησης</div>
      <div className="grid grid-cols-3 gap-2 text-[9px] leading-snug">
        <div><span className="font-bold text-slate-600">Έναρξη:</span> {formatPrintDate(delivery.dispatch_date)} {delivery.dispatch_time || ''}</div>
        <div><span className="font-bold text-slate-600">Σκοπός:</span> {delivery.move_purpose ?? '-'}{delivery.move_purpose === 19 && delivery.move_purpose_title ? ` (${delivery.move_purpose_title})` : ''}</div>
        <div><span className="font-bold text-slate-600">Όχημα:</span> {delivery.vehicle_number || delivery.carrier_vehicle_number || '-'}</div>
        <div><span className="font-bold text-slate-600">Φόρτωση:</span> {formatAddress(delivery.loading_address)}</div>
        <div><span className="font-bold text-slate-600">Παράδοση:</span> {formatAddress(delivery.delivery_address)}</div>
        <div><span className="font-bold text-slate-600">Μεταφορέας:</span> {delivery.carrier_name || 'Ίδια μέσα'}</div>
      </div>
    </section>
  );
}

export function LegalPrintFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-break-inside mt-1 shrink-0 text-center text-[7px] font-bold uppercase leading-tight tracking-widest text-slate-400">
      <p>ILIOS KOSMIMA ERP</p>
      {children && <p className="mt-0.5 normal-case font-medium tracking-normal text-slate-500">{children}</p>}
    </div>
  );
}
