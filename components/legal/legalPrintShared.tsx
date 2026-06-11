import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { APP_LOGO } from '../../constants';
import { AADE_VAT_CATEGORY_OPTIONS } from '../../utils/legalDocuments';
import { LegalDeliveryDetails, LegalDocumentLine, LegalParty, LegalIssuerSettings } from '../../types';

export const LEGAL_PRINT_CSS = `
  @media print {
    .legal-print-page { width: 210mm !important; min-height: 297mm !important; }
    .legal-print-break-inside { break-inside: avoid; page-break-inside: avoid; }
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

export function LegalPrintPage({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="legal-print-page relative mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white p-6 font-sans text-slate-900 print:p-6 print:shadow-none"
      style={{ color: '#0f172a' }}
    >
      <style>{LEGAL_PRINT_CSS}</style>
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-[0.03]">
        <img src={APP_LOGO} alt="" className="w-[110mm]" />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export function LegalPrintHeader(props: {
  title: string;
  subtitle?: string;
  issuer: LegalIssuerSettings;
  series?: string | null;
  aa?: string | null;
  issueDate?: string | null;
  documentTypeCode?: string | null;
  statusBadge?: React.ReactNode;
}) {
  const { title, subtitle, issuer, series, aa, issueDate, documentTypeCode, statusBadge } = props;
  return (
    <header className="legal-print-break-inside mb-4 border-b-2 border-slate-900 pb-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <img src={APP_LOGO} alt="ILIOS" className="h-10 w-auto shrink-0 object-contain" />
          <div className="min-w-0 border-l border-slate-200 pl-3 text-[9px] leading-snug text-slate-600">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-900">{getPartyName(issuer)}</p>
            <p>{formatPartyAddress(issuer)}</p>
            <p>
              ΑΦΜ {issuer.vat_number || '-'}
              {issuer.branch != null ? ` · Υποκ. ${issuer.branch}` : ''}
            </p>
            {(issuer.phone || issuer.email) && (
              <p>
                {[issuer.phone, issuer.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">IliosERP</div>
          <h1 className="mt-0.5 text-xl font-black uppercase leading-none tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="mt-1 text-[10px] font-semibold text-slate-500">{subtitle}</div>}
          <div className="mt-2 inline-grid min-w-[168px] grid-cols-[auto_1fr] gap-x-2 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-[10px]">
            <span className="font-bold uppercase tracking-wide text-slate-400">Σειρά</span>
            <span className="font-mono font-bold text-slate-900">{series || '-'}</span>
            <span className="font-bold uppercase tracking-wide text-slate-400">Α/Α</span>
            <span className="font-mono font-bold text-slate-900">{aa || '-'}</span>
            <span className="font-bold uppercase tracking-wide text-slate-400">Ημ/νία</span>
            <span className="font-mono font-semibold text-slate-800">{formatPrintDate(issueDate)}</span>
            {documentTypeCode && (
              <>
                <span className="font-bold uppercase tracking-wide text-slate-400">Τύπος</span>
                <span className="font-mono font-semibold text-slate-800">{documentTypeCode}</span>
              </>
            )}
          </div>
          {statusBadge && <div className="mt-2 flex justify-end">{statusBadge}</div>}
        </div>
      </div>
    </header>
  );
}

function PartyCard(props: { title: string; party: LegalParty | LegalIssuerSettings }) {
  const { title, party } = props;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">{title}</div>
      <div className="space-y-1 text-[10px] leading-snug">
        <div className="grid grid-cols-[72px_1fr] gap-1">
          <span className="font-bold text-slate-500">Επωνυμία</span>
          <span className="font-black text-slate-900">{getPartyName(party)}</span>
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-1">
          <span className="font-bold text-slate-500">ΑΦΜ</span>
          <span className="font-mono font-semibold text-slate-800">{party.vat_number || '-'}</span>
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-1">
          <span className="font-bold text-slate-500">Χώρα / Υποκ.</span>
          <span>{party.country || 'GR'} · {party.branch ?? 0}</span>
        </div>
        <div className="grid grid-cols-[72px_1fr] gap-1">
          <span className="font-bold text-slate-500">Διεύθυνση</span>
          <span>{formatPartyAddress(party)}</span>
        </div>
        {(party.phone || party.email) && (
          <div className="grid grid-cols-[72px_1fr] gap-1">
            <span className="font-bold text-slate-500">Επικοινωνία</span>
            <span>{[party.phone, party.email].filter(Boolean).join(' · ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LegalPrintPartyGrid(props: {
  issuer: LegalIssuerSettings;
  counterpart: LegalParty;
  counterpartTitle?: string;
}) {
  return (
    <section className="legal-print-break-inside mb-4 grid grid-cols-2 gap-3">
      <PartyCard title="Εκδότης" party={props.issuer} />
      <PartyCard title={props.counterpartTitle || 'Λήπτης / Πελάτης'} party={props.counterpart} />
    </section>
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
      width: 132,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((value) => {
      if (active) setQrDataUrl(value);
    }).catch(() => {
      if (active) setQrDataUrl(null);
    });
    return () => { active = false; };
  }, [props.qrUrl]);

  return (
    <section className="legal-print-break-inside mb-4 overflow-hidden rounded-lg border border-slate-300">
      <div className="bg-slate-900 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white">
        myDATA / ΑΑΔΕ
      </div>
      <div className="grid grid-cols-[132px_1fr] gap-3 bg-slate-50 p-3">
        <div className="flex h-[132px] w-[132px] items-center justify-center rounded-md border border-slate-200 bg-white p-1">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="AADE QR" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[9px] font-semibold leading-tight text-slate-400">
              QR διαθέσιμο μετά την αποδοχή από την ΑΑΔΕ
            </span>
          )}
        </div>
        <div className="grid content-center gap-1.5 text-[10px]">
          <div className="grid grid-cols-[88px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">MARK</span>
            <span className="font-mono font-bold text-slate-900">{props.mark || '-'}</span>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">UID</span>
            <span className="break-all font-mono text-[9px] text-slate-800">{props.uid || '-'}</span>
          </div>
          <div className="grid grid-cols-[88px_1fr] gap-1">
            <span className="font-bold uppercase tracking-wide text-slate-500">Auth code</span>
            <span className="break-all font-mono text-[9px] text-slate-800">{props.authenticationCode || '-'}</span>
          </div>
          {props.documentType && (
            <div className="grid grid-cols-[88px_1fr] gap-1">
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
    <section className="legal-print-break-inside mb-4">
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-y border-slate-800 bg-slate-100 text-left text-[9px] font-black uppercase tracking-wide text-slate-600">
            <th className="w-8 px-1.5 py-1.5">#</th>
            <th className="w-24 px-1.5 py-1.5">Κωδικός</th>
            <th className="px-1.5 py-1.5">Περιγραφή</th>
            <th className="w-10 px-1.5 py-1.5 text-right">Ποσ.</th>
            <th className="w-16 px-1.5 py-1.5 text-right">Τιμή</th>
            <th className="w-16 px-1.5 py-1.5 text-right">Καθαρή</th>
            <th className="w-12 px-1.5 py-1.5 text-right">ΦΠΑ</th>
            <th className="w-16 px-1.5 py-1.5 text-right">Σύνολο</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="legal-print-break-inside border-b border-slate-200 align-top">
              <td className="px-1.5 py-1.5 tabular-nums text-slate-500">{line.line_number}</td>
              <td className="px-1.5 py-1.5 font-mono text-[9px] font-bold text-slate-900">
                {line.item_code || `${line.sku}${line.variant_suffix || ''}`}
              </td>
              <td className="px-1.5 py-1.5">
                <div className="font-medium text-slate-800">{line.description}</div>
                <div className="text-[8px] text-slate-500">{getVatCategoryLabel(line.vat_category)}</div>
              </td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{line.quantity}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{formatPrintMoney(line.unit_price, currency)}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{formatPrintMoney(line.net_value, currency)}</td>
              <td className="px-1.5 py-1.5 text-right tabular-nums">{formatPrintMoney(line.vat_amount, currency)}</td>
              <td className="px-1.5 py-1.5 text-right font-bold tabular-nums">{formatPrintMoney(line.gross_value, currency)}</td>
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
    <section className="legal-print-break-inside mt-auto flex items-start justify-between gap-4 border-t border-slate-200 pt-4">
      <div className="max-w-md space-y-1.5 text-[10px] leading-snug text-slate-700">
        {props.paymentMethodLabel && (
          <div><span className="font-bold text-slate-900">Τρόπος πληρωμής:</span> {props.paymentMethodLabel}</div>
        )}
        {props.vatExemptionCategory && (
          <div><span className="font-bold text-slate-900">Αιτία απαλλαγής ΦΠΑ:</span> {props.vatExemptionCategory}</div>
        )}
        {props.revenueClassificationText && (
          <div><span className="font-bold text-slate-900">Χαρακτηρισμοί εσόδων:</span> {props.revenueClassificationText}</div>
        )}
        {props.notes}
      </div>

      <div className="w-[220px] shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px]">
        {Array.from(vatGroups.entries()).map(([category, totals]) => (
          <div key={category} className="flex justify-between border-b border-slate-200 py-1 tabular-nums">
            <span className="text-slate-600">{getVatCategoryLabel(category)}</span>
            <span className="font-semibold">{formatPrintMoney(totals.vat, props.currency)}</span>
          </div>
        ))}
        <div className="flex justify-between py-1.5 tabular-nums">
          <span className="text-slate-600">Καθαρή αξία</span>
          <span className="font-semibold">{formatPrintMoney(props.net, props.currency)}</span>
        </div>
        <div className="flex justify-between py-1.5 tabular-nums">
          <span className="text-slate-600">Σύνολο ΦΠΑ</span>
          <span className="font-semibold">{formatPrintMoney(props.vat, props.currency)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t-2 border-slate-900 pt-2 text-[13px] font-black tabular-nums">
          <span>Πληρωτέο</span>
          <span>{formatPrintMoney(props.gross, props.currency)}</span>
        </div>
      </div>
    </section>
  );
}

export function LegalPrintDeliverySection({ delivery }: { delivery: LegalDeliveryDetails }) {
  const formatAddress = (address?: LegalDeliveryDetails['loading_address']) =>
    [address?.street, address?.number, address?.postal_code, address?.city].filter(Boolean).join(' ') || '-';

  return (
    <section className="legal-print-break-inside mb-4 rounded-lg border border-slate-200 p-3">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Στοιχεία διακίνησης</div>
      <div className="grid grid-cols-3 gap-3 text-[10px] leading-snug">
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
    <footer className="legal-print-break-inside mt-4 border-t border-slate-200 pt-2 text-[9px] leading-snug text-slate-500">
      {children}
    </footer>
  );
}
