import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { APP_LOGO } from '../../constants';
import { AADE_VAT_CATEGORY_OPTIONS, getAadeVatExemptionCategoryLabel } from '../../utils/legalDocuments';
import { LegalDeliveryDetails, LegalDocumentLine, LegalParty, LegalIssuerSettings } from '../../types';

export const LEGAL_PRINT_CSS = `
  @page { size: A4; margin: 0; }
  .legal-print-page {
    background: #fff !important;
    color: #0f172a !important;
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
  @media print {
    html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
    .legal-print-page {
      width: 210mm !important;
      min-height: 297mm !important;
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
  }
`;

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
  return parsed.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
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

const formatDeliveryAddress = (address?: LegalDeliveryDetails['delivery_address']) => {
  if (!address) return '-';
  const street = [address.street, address.number].filter(Boolean).join(' ');
  const city = [address.postal_code, address.city].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || '-';
};

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
  <div className="grid grid-cols-[28mm_1fr] gap-1 border-b border-slate-100 py-[2px] last:border-b-0">
    <dt className="font-bold uppercase tracking-[0.04em] text-slate-500">{label}:</dt>
    <dd className={`${mono ? 'font-mono' : ''} min-w-0 break-words font-semibold text-slate-800`}>{value === null || value === undefined || value === '' ? '-' : value}</dd>
  </div>
);

export function LegalPrintPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-page relative mx-auto flex min-h-[297mm] w-[210mm] flex-col bg-white px-[8mm] py-[7mm] font-sans text-slate-900 shadow-lg print:shadow-none page-break-after-always">
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
  statusBadge?: React.ReactNode;
}) {
  const { title, documentNumber, issuer, series, aa, issueDate, issueTime, statusBadge } = props;
  const issuerName = getPartyName(issuer);

  const metadata = [
    { label: 'Είδος παραστατικού', value: title },
    { label: 'Σειρά', value: series || '0' },
    { label: 'Αριθμός', value: aa || documentNumber || '-' },
    { label: 'Ημερομηνία / Ώρα', value: `${formatPrintDate(issueDate)}${issueTime ? ` · ${formatPrintTime(issueTime)}` : ''}` },
    { label: 'Σελίδα', value: '1' },
  ];

  return (
    <header className="legal-print-header legal-print-break-inside mb-2.5 shrink-0">
      <div className="mb-2.5 grid grid-cols-[58mm_1fr] items-center gap-5">
        <div className="flex h-[25mm] items-center justify-start">
          <img src={APP_LOGO} alt="ILIOS" className="legal-print-logo max-h-[20mm] max-w-[52mm] object-contain object-left" />
        </div>
        <div className="border-l-[3px] border-[#b58b47] pl-4 text-[8.5px] leading-[1.35] text-slate-600">
          <p className="mb-0.5 text-[13px] font-black uppercase tracking-[0.03em] text-slate-950">{issuerName}</p>
          {issuer.trade_name && issuer.trade_name !== issuerName && <p className="font-bold text-slate-700">{issuer.trade_name}</p>}
          {issuer.activity && <p><span className="font-bold text-slate-700">Δραστηριότητα:</span> {issuer.activity}</p>}
          <p><span className="font-bold text-slate-700">ΑΦΜ:</span> <span className="font-mono">{issuer.vat_number || '-'}</span> · <span className="font-bold text-slate-700">ΔΟΥ:</span> {issuer.doy || '-'} · <span className="font-bold text-slate-700">Υποκ.:</span> {issuer.branch ?? 0}</p>
          <p>{formatPartyAddress(issuer)}</p>
          {(issuer.phone || issuer.email) && <p>{[issuer.phone, issuer.email].filter(Boolean).join(' · ')}</p>}
          {(issuer.legal_form || issuer.gemi) && <p>{issuer.legal_form && <><span className="font-bold text-slate-700">Νομική μορφή:</span> {issuer.legal_form}</>} {issuer.legal_form && issuer.gemi ? ' · ' : ''}{issuer.gemi && <><span className="font-bold text-slate-700">ΓΕΜΗ:</span> {issuer.gemi}</>}</p>}
        </div>
      </div>

      <div className="grid grid-cols-[1.35fr_0.7fr_0.8fr_1.2fr_0.55fr] overflow-hidden rounded-md border border-slate-300">
        {metadata.map((item, index) => (
          <div key={item.label} className={index < metadata.length - 1 ? 'border-r border-slate-300' : ''}>
            <div className={`${index === 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'} px-1 py-1 text-center text-[7px] font-black uppercase tracking-[0.08em]`}>{item.label}</div>
            <div className={`${index === 0 ? 'text-[10px] font-black uppercase text-slate-900' : 'text-[9.5px] font-bold text-slate-800'} min-h-[9mm] px-1 py-1.5 text-center leading-tight`}>{item.value}</div>
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
  const counterpartCountry = (props.counterpart.country || 'GR').toUpperCase();
  const counterpartBranch = Number(props.counterpart.branch || 0);

  return (
    <section className="min-w-0">
      {props.counterpart.customer_code && <InfoRow label="Κωδικός" value={props.counterpart.customer_code} mono />}
      <InfoRow label="Επωνυμία" value={getPartyName(props.counterpart)} />
      <InfoRow label="ΑΦΜ" value={props.counterpart.vat_number || '-'} mono />
      {props.counterpart.profession && <InfoRow label="Επάγγελμα" value={props.counterpart.profession} />}
      {props.counterpart.tax_office && <InfoRow label="ΔΟΥ" value={props.counterpart.tax_office} />}
      <InfoRow label="Διεύθυνση" value={formatPartyAddress(props.counterpart)} />
      <InfoRow label="Χώρα" value={counterpartCountry} />
      <InfoRow label="Υποκ." value={counterpartBranch} />
      {(props.counterpart.phone || props.counterpart.email) && (
        <InfoRow label="Επικοινωνία" value={[props.counterpart.phone, props.counterpart.email].filter(Boolean).join(' · ')} />
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
}) {
  const hasDelivery = Boolean(props.delivery);
  const deliveryAddress = props.delivery?.delivery_address
    ? formatDeliveryAddress(props.delivery.delivery_address)
    : formatPartyAddress(props.counterpart);
  const dispatchAt = props.delivery?.dispatch_date
    ? `${formatPrintDate(props.delivery.dispatch_date)}${props.delivery.dispatch_time ? ` · ${formatPrintTime(props.delivery.dispatch_time)}` : ''}`
    : '-';

  return (
    <section className="min-w-0">
      {hasDelivery && <InfoRow label="Τρόπος αποστολής" value={props.delivery?.carrier_name || 'Courier'} />}
      {hasDelivery && <InfoRow label="Παράδοση" value={deliveryAddress} />}
      {hasDelivery && <InfoRow label="Ημερ. αποστολής" value={dispatchAt} />}
      <InfoRow label="Τρόπος πληρωμής" value={props.paymentMethodLabel || '-'} />
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
}) {
  return (
    <section className="legal-print-break-inside mb-2.5 grid shrink-0 grid-cols-[1.08fr_0.92fr] gap-2">
      <div className="overflow-hidden rounded-md border border-slate-300">
        <div className="bg-slate-100 px-2.5 py-1.5 text-center text-[8px] font-black uppercase tracking-[0.12em] text-slate-800">
          {props.counterpartTitle || 'Στοιχεία πελάτη'}
        </div>
        <div className="px-2.5 py-1.5 text-[8.5px] leading-[1.3]">
          <LegalPrintCustomerBar counterpart={props.counterpart} extraMeta={props.extraMeta} />
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-slate-300">
        <div className="bg-slate-100 px-2.5 py-1.5 text-center text-[8px] font-black uppercase tracking-[0.12em] text-slate-800">
          {props.delivery ? 'Στοιχεία αποστολής & πληρωμής' : 'Στοιχεία συναλλαγής'}
        </div>
        <div className="px-2.5 py-1.5 text-[8.5px] leading-[1.3]">
          <LegalPrintTransactionPanel
            counterpart={props.counterpart}
            delivery={props.delivery}
            paymentMethodLabel={props.paymentMethodLabel}
            validUntil={props.validUntil}
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
    <section className="legal-print-break-inside mt-2.5 grid shrink-0 grid-cols-[27mm_1fr_40mm] gap-3 border-t border-slate-300 pt-2.5">
      <div className="flex h-[25mm] w-[25mm] items-center justify-center border border-slate-300 bg-white p-1">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="AADE QR" className="h-full w-full object-contain" />
        ) : (
          <span className="px-1 text-center text-[7px] font-semibold leading-tight text-slate-400">QR μετά την αποδοχή από την ΑΑΔΕ</span>
        )}
      </div>
      <div className="grid content-center gap-1 text-[8px] leading-tight">
        <p className="mb-0.5 font-black uppercase tracking-[0.12em] text-[#946b2d]">Στοιχεία επαλήθευσης</p>
        <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Μ.Αρ.Κ.:</span><span className="font-mono font-bold text-slate-800">{props.mark || '-'}</span></div>
        {props.authenticationCode && <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Υπογραφή:</span><span className="break-all font-mono text-[7px] text-slate-700">{props.authenticationCode}</span></div>}
        <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Αναγνωριστικό:</span><span className="break-all font-mono text-[7px] text-slate-700">{props.uid || '-'}</span></div>
        {props.provider === 'sbz' && (
          <>
            <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Υ.ΠΑ.Η.Ε.Σ:</span><span className="font-semibold text-slate-700">SBZ IKE - www.sbz.gr</span></div>
            <div className="grid grid-cols-[25mm_1fr] gap-1"><span className="font-bold text-slate-500">Αριθμός Αδειοδότησης:</span><span className="break-all font-mono text-[7px] text-slate-700">2023_05_113SBZ IKE_001_EMDI_V1_18052023</span></div>
          </>
        )}
      </div>
      <div className="flex flex-col items-center justify-center text-center text-[7px] text-slate-500">
        <p className="font-black uppercase tracking-[0.12em] text-slate-700">Αντίγραφο παραστατικού</p>
        <div className="mt-8 w-full border-t border-slate-300 pt-1">Υπογραφή / Σφραγίδα</div>
      </div>
    </section>
  );
}

export function LegalPrintLinesTable({ lines, currency }: { lines: LegalDocumentLine[]; currency?: string }) {
  return (
    <section className="legal-print-lines-table min-h-[78mm] grow overflow-hidden rounded-md border border-slate-300">
      <table className="w-full table-fixed border-collapse text-[8.5px] leading-[1.2]">
        <thead>
          <tr className="bg-slate-900 text-left text-[7px] font-black uppercase tracking-[0.06em] text-white">
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
              <tr key={line.id} className="border-b border-slate-100 align-top last:border-b-0 even:bg-slate-50/60">
                <td className="break-words px-1.5 py-1.5 font-mono text-[7.5px] font-bold text-slate-800">{line.item_code || `${line.sku}${line.variant_suffix || ''}`}</td>
                <td className="px-1.5 py-1.5">
                  <div className="font-semibold text-slate-800">{line.description}</div>
                  {line.source_metadata?.line_comments && <div className="mt-0.5 text-[7px] italic text-slate-500">{line.source_metadata.line_comments}</div>}
                </td>
                <td className="px-1 py-1.5 text-right font-bold tabular-nums text-slate-800">{line.quantity.toLocaleString('el-GR')}</td>
                <td className="px-1 py-1.5 text-center text-[7px] font-semibold text-slate-600">{getMeasurementUnitLabel(line.measurement_unit)}</td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums">{formatPrintMoney(originalUnitPrice, currency)}</td>
                <td className="px-1 py-1.5 text-right font-mono tabular-nums">{Number(discountPercent).toLocaleString('el-GR', { maximumFractionDigits: 2 })}%</td>
                <td className="px-1 py-1.5 text-right font-mono font-bold tabular-nums text-slate-900">{formatPrintMoney(line.net_value, currency)}</td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right font-bold tabular-nums text-slate-700">{getVatCategoryPrintRate(line.vat_category)}</td>
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
  documentTypeCode?: string | null;
  revenueClassificationText?: string;
  notes?: React.ReactNode;
  delivery?: LegalDeliveryDetails | null;
  footerText?: React.ReactNode;
}) {
  const vatGroups = useMemo(() => {
    const groups = new Map<number, { net: number; vat: number }>();
    props.lines.forEach((line) => {
      const current = groups.get(line.vat_category) || { net: 0, vat: 0 };
      current.net += line.net_value;
      current.vat += line.vat_amount;
      groups.set(line.vat_category, current);
    });
    return groups;
  }, [props.lines]);

  const totalQuantity = props.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const originalNet = props.lines.reduce((sum, line) => {
    const originalUnitPrice = line.source_metadata?.original_unit_price ?? line.unit_price;
    return sum + (Number(originalUnitPrice || 0) * Number(line.quantity || 0));
  }, 0);
  const discountAmount = Math.max(0, originalNet - props.net);
  const dispatchAt = props.delivery?.dispatch_date
    ? `${formatPrintDate(props.delivery.dispatch_date)}${props.delivery.dispatch_time ? ` · ${formatPrintTime(props.delivery.dispatch_time)}` : ''}`
    : '-';

  return (
    <section className="legal-print-break-inside mt-2.5 shrink-0">
      <div className="grid grid-cols-[0.78fr_1.42fr_0.95fr] items-start gap-2">
        <div className="overflow-hidden rounded-md border border-slate-300 text-[8px]">
          <div className="bg-slate-100 px-2 py-1 font-black uppercase tracking-[0.08em] text-slate-700">Σύνοψη</div>
          <div className="px-2 py-1.5">
            <InfoRow label="Συν. ποσότητα" value={totalQuantity.toLocaleString('el-GR')} />
            {props.delivery && <InfoRow label="Αποστολή" value={dispatchAt} />}
            <div className="mt-1 min-h-[15mm] rounded border border-slate-100 bg-slate-50 p-1.5 leading-snug text-slate-600">
              <span className="font-bold uppercase text-slate-500">Σχόλιο: </span>
              {props.delivery?.notes || props.notes || '-'}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-300 text-[7px] leading-tight">
          <div className="bg-slate-100 px-1.5 py-1 text-center text-[7px] font-black uppercase tracking-[0.055em] text-slate-700">Ανάλυση υπολογισμού ΦΠΑ</div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[6.25px] font-bold uppercase tracking-tight text-slate-500">
                <th className="px-0.5 py-0.5 text-right">Καθαρή αξία</th>
                <th className="px-0.5 py-0.5 text-center">ΦΠΑ</th>
                <th className="px-0.5 py-0.5 text-right">Αξία ΦΠΑ</th>
                <th className="px-0.5 py-0.5 text-right">Σύνολο</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(vatGroups.entries()).map(([category, totals]) => (
                <tr key={category} className="border-b border-slate-100 last:border-b-0">
                  <td className="whitespace-nowrap px-0.5 py-1 text-right font-mono tabular-nums">{formatPrintMoney(totals.net, props.currency)}</td>
                  <td className="whitespace-nowrap px-0.5 py-1 text-center font-bold">{getVatCategoryPrintRate(category)}</td>
                  <td className="whitespace-nowrap px-0.5 py-1 text-right font-mono tabular-nums">{formatPrintMoney(totals.vat, props.currency)}</td>
                  <td className="whitespace-nowrap px-0.5 py-1 text-right font-mono font-bold tabular-nums">{formatPrintMoney(totals.net + totals.vat, props.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-400 text-[8.5px]">
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 px-2 py-1"><span>Αξία</span><span className="font-mono font-bold">{formatPrintMoney(originalNet, props.currency)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 px-2 py-1"><span>Έκπτωση</span><span className="font-mono font-bold">{formatPrintMoney(discountAmount, props.currency)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 px-2 py-1"><span>Καθαρή αξία</span><span className="font-mono font-bold">{formatPrintMoney(props.net, props.currency)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-2 px-2 py-1"><span>Αξία ΦΠΑ</span><span className="font-mono font-bold">{formatPrintMoney(props.vat, props.currency)}</span></div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-2 bg-slate-900 px-2 py-1.5 text-[10px] font-black uppercase text-white"><span>Τελική αξία</span><span className="font-mono text-[11px]">{formatPrintMoney(props.gross, props.currency)}</span></div>
        </div>
      </div>

      {(props.vatExemptionCategory || props.documentTypeCode || props.revenueClassificationText) && (
        <div className="mt-1.5 space-y-0.5 text-[7px] leading-tight text-slate-500">
          {props.vatExemptionCategory && <p><span className="font-bold uppercase">Αιτία απαλλαγής ΦΠΑ:</span> {getAadeVatExemptionCategoryLabel(props.vatExemptionCategory)}</p>}
          {props.documentTypeCode && <p><span className="font-bold uppercase">Τύπος myDATA:</span> <span className="font-mono">{props.documentTypeCode}</span></p>}
          {props.revenueClassificationText && <p><span className="font-bold uppercase">Χαρακτηρισμοί:</span> {props.revenueClassificationText}</p>}
        </div>
      )}
      {props.footerText && <p className="mt-1 text-[6.5px] leading-tight text-slate-400">{props.footerText}</p>}
    </section>
  );
}

/** @deprecated Shipment details now render inside LegalPrintInfoGrid. */
export function LegalPrintDeliverySection({ delivery }: { delivery: LegalDeliveryDetails }) {
  return (
    <section className="legal-print-break-inside mb-2 rounded-md border border-slate-300 p-2 text-[8px]">
      <InfoRow label="Τρόπος αποστολής" value={delivery.carrier_name || 'Courier'} />
      <InfoRow label="Παράδοση" value={formatDeliveryAddress(delivery.delivery_address)} />
      <InfoRow label="Ημερ. αποστολής" value={`${formatPrintDate(delivery.dispatch_date)}${delivery.dispatch_time ? ` · ${formatPrintTime(delivery.dispatch_time)}` : ''}`} />
    </section>
  );
}

export function LegalPrintFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal-print-break-inside mt-auto shrink-0 pt-2 text-center text-[7px] leading-tight text-slate-400">
      <p className="font-black uppercase tracking-[0.16em] text-slate-500">Αντίγραφο παραστατικού · IliosERP</p>
      {children && <p className="mt-1 font-medium text-slate-500">{children}</p>}
      <div className="mx-auto mt-3 w-[45mm] border-t border-slate-300 pt-1">Υπογραφή / Σφραγίδα</div>
    </div>
  );
}
