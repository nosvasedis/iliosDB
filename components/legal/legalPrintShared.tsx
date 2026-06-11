import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Calendar, Hash } from 'lucide-react';
import { APP_LOGO } from '../../constants';
import { AADE_VAT_CATEGORY_OPTIONS } from '../../utils/legalDocuments';
import { LegalDeliveryDetails, LegalDocumentLine, LegalParty, LegalIssuerSettings } from '../../types';

/** Same brand block as OrderInvoiceView (Παραγγελία / Προσφορά PDF). */
export const LEGAL_PRINT_BRAND = {
  name: 'ILIOS KOSMIMA',
  address: 'Αβέρωφ 73, Κορυδαλλός, 18120',
  phone: '2104905405',
  email: 'ilioskosmima@gmail.com',
};

export const LEGAL_PRINT_CSS = `
  .legal-print-page {
    background: #fff !important;
    color: #0f172a !important;
  }
  .legal-print-header,
  .legal-print-logo {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
  .legal-print-logo {
    height: 36px !important;
    width: auto !important;
    max-width: 140px !important;
    object-fit: contain !important;
  }
  @media print {
    .legal-print-page {
      width: 210mm !important;
      min-height: 297mm !important;
      box-shadow: none !important;
    }
    .legal-print-break-inside {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .legal-print-header,
    .legal-print-logo {
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

/** Page shell — mirrors OrderInvoiceView layout (no watermark wrapper). */
export function LegalPrintPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-page relative mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-6 font-sans text-black shadow-lg print:p-6 print:shadow-none page-break-after-always">
      <style>{LEGAL_PRINT_CSS}</style>
      {children}
    </div>
  );
}

export function LegalPrintHeader(props: {
  title: string;
  documentNumber: string;
  issueDate?: string | null;
  documentTypeCode?: string | null;
  statusBadge?: React.ReactNode;
}) {
  const { title, documentNumber, issueDate, documentTypeCode, statusBadge } = props;

  return (
    <header className="legal-print-header legal-print-break-inside mb-3 shrink-0 border-b-2 border-slate-900 pb-2">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={APP_LOGO} alt="ILIOS" className="legal-print-logo h-9 w-auto object-contain" />
          <div className="border-l border-slate-300 pl-2 text-[8px] leading-tight text-slate-600">
            <p className="font-bold uppercase tracking-wide text-slate-900">{LEGAL_PRINT_BRAND.name}</p>
            <p>{LEGAL_PRINT_BRAND.address}</p>
            <p>{LEGAL_PRINT_BRAND.email} • {LEGAL_PRINT_BRAND.phone}</p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <h1 className="mb-0.5 text-xl font-black uppercase leading-none tracking-tight text-slate-900">{title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5 text-[10px] font-medium text-slate-700">
            <span className="inline-flex items-center gap-1">
              <Hash size={10} />
              {documentNumber}
            </span>
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
  issuer: LegalIssuerSettings;
  counterpart: LegalParty;
  gross: number;
  currency?: string;
  counterpartTitle?: string;
  extraMeta?: React.ReactNode;
}) {
  const contact = [props.counterpart.phone, props.counterpart.email].filter(Boolean).join(' · ');

  return (
    <section className="legal-print-break-inside mb-3 flex shrink-0 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-0.5 flex items-baseline gap-2">
          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
            {props.counterpartTitle || 'Πελάτης'}
          </span>
          <span className="truncate text-sm font-black leading-none text-slate-900">
            {getPartyName(props.counterpart)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-700">
          {props.counterpart.vat_number && (
            <span className="font-mono text-slate-600">ΑΦΜ: {props.counterpart.vat_number}</span>
          )}
          <span className="truncate">{formatPartyAddress(props.counterpart)}</span>
          {contact && <span>{contact}</span>}
        </div>
        <div className="mt-1 text-[9px] text-slate-500">
          Εκδότης ΑΦΜ{' '}
          <span className="font-mono font-semibold text-slate-700">{props.issuer.vat_number || '-'}</span>
          {props.issuer.branch != null ? ` · Υποκ. ${props.issuer.branch}` : ''}
        </div>
        {props.extraMeta}
      </div>

      <div className="my-0.5 w-px bg-slate-200" />

      <div className="flex min-w-[120px] flex-col items-end justify-center px-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Σύνολο</span>
        <span className="text-xl font-black leading-none text-slate-900">
          {formatPrintMoney(props.gross, props.currency)}
        </span>
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
      issuer={props.issuer}
      counterpart={props.counterpart}
      counterpartTitle={props.counterpartTitle}
      gross={props.gross ?? 0}
      currency={props.currency}
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
      width: 108,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) setQrDataUrl(value);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [props.qrUrl]);

  return (
    <section className="legal-print-break-inside mb-3 overflow-hidden rounded-lg border border-slate-300">
      <div className="bg-slate-900 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.18em] text-white">
        myDATA / ΑΑΔΕ
      </div>
      <div className="grid grid-cols-[108px_1fr] gap-2.5 bg-slate-50 p-2.5">
        <div className="flex h-[108px] w-[108px] items-center justify-center rounded-md border border-slate-200 bg-white p-1">
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
          <div className="grid grid-cols-[72px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">Auth code</span>
            <span className="break-all font-mono text-[8px] text-slate-800">{props.authenticationCode || '-'}</span>
          </div>
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
    <section className="legal-print-break-inside mb-3 min-h-0 flex-1">
      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left text-[8px] font-black uppercase tracking-wider text-slate-800">
            <th className="w-7 px-1 py-1">#</th>
            <th className="w-[4.5rem] px-1 py-1">Κωδ.</th>
            <th className="px-1 py-1">Περιγραφή</th>
            <th className="w-9 px-1 py-1 text-right">Ποσ.</th>
            <th className="w-14 px-1 py-1 text-right">Τιμή</th>
            <th className="w-14 px-1 py-1 text-right">Καθαρή</th>
            <th className="w-11 px-1 py-1 text-right">ΦΠΑ</th>
            <th className="w-14 px-1 py-1 text-right">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="legal-print-break-inside border-b border-slate-100 align-top">
              <td className="px-1 py-1 tabular-nums text-slate-400">{line.line_number}</td>
              <td className="px-1 py-1 font-mono text-[8px] font-bold text-slate-900">
                {line.item_code || `${line.sku}${line.variant_suffix || ''}`}
              </td>
              <td className="px-1 py-1">
                <div className="font-semibold text-slate-800">{line.description}</div>
                <div className="text-[7px] text-slate-500">{getVatCategoryLabel(line.vat_category)}</div>
              </td>
              <td className="px-1 py-1 text-right font-bold tabular-nums text-slate-800">{line.quantity}</td>
              <td className="px-1 py-1 text-right tabular-nums">{formatPrintMoney(line.unit_price, currency)}</td>
              <td className="px-1 py-1 text-right tabular-nums">{formatPrintMoney(line.net_value, currency)}</td>
              <td className="px-1 py-1 text-right tabular-nums">{formatPrintMoney(line.vat_amount, currency)}</td>
              <td className="px-1 py-1 text-right font-black tabular-nums text-slate-900">{formatPrintMoney(line.gross_value, currency)}</td>
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
          <div><span className="font-bold uppercase text-slate-500">Αιτία απαλλαγής ΦΠΑ</span> · {props.vatExemptionCategory}</div>
        )}
        {props.revenueClassificationText && (
          <div><span className="font-bold uppercase text-slate-500">Χαρακτηρισμοί</span> · {props.revenueClassificationText}</div>
        )}
        {props.notes && (
          <div className="italic rounded border border-slate-100 bg-slate-50 p-1.5 leading-snug">
            {props.notes}
          </div>
        )}
      </div>

      <div className="w-48 shrink-0 text-[11px]">
        <div className="mb-0.5 flex justify-between text-slate-600">
          <span>Καθαρή Αξία:</span>
          <span className="font-mono font-bold tabular-nums">{formatPrintMoney(props.net, props.currency)}</span>
        </div>
        {Array.from(vatGroups.entries()).map(([category, totals]) => (
          <div key={category} className="mb-0.5 flex justify-between text-slate-600">
            <span className="truncate pr-2">Φ.Π.Α. · {getVatCategoryLabel(category)}</span>
            <span className="font-mono font-bold tabular-nums">{formatPrintMoney(totals.vat, props.currency)}</span>
          </div>
        ))}
        <div className="mb-1 flex justify-between border-b border-slate-200 pb-1 text-slate-600">
          <span>Σύνολο Φ.Π.Α.:</span>
          <span className="font-mono font-bold tabular-nums">{formatPrintMoney(props.vat, props.currency)}</span>
        </div>
        <div className="flex justify-between text-sm font-black text-slate-900">
          <span className="uppercase">Γενικό Σύνολο:</span>
          <span className="font-mono text-base tabular-nums">{formatPrintMoney(props.gross, props.currency)}</span>
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
    <div className="legal-print-break-inside mt-2 shrink-0 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400">
      <p>ILIOS KOSMIMA ERP</p>
      {children && <p className="mt-1 normal-case font-medium tracking-normal text-slate-500">{children}</p>}
    </div>
  );
}
