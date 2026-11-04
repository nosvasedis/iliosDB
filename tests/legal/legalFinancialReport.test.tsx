import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LegalFinancialReportPrint from '../../components/legal/LegalFinancialReportPrint';
import {
  buildLegalFinancialReport,
  DEFAULT_LEGAL_REPORT_TYPES,
  getLegalReportQuickPeriods,
  getLegalReportStatus,
  getLegalReportType,
  narrowLegalReportRecords,
  resolveLegalReportPeriod,
  selectLegalReportRecords,
  type LegalReportStatus,
  type LegalReportType,
} from '../../features/legal/financialReport';
import type { LegalArchiveRecord } from '../../types';

type RecordInput = {
  id: string;
  aa?: string;
  series?: string;
  date?: string;
  kind?: string;
  aadeType?: string;
  status?: string;
  source?: 'legal' | 'proforma';
  net?: number;
  vat?: number;
  gross?: number;
  name?: string;
  vatNumber?: string;
  lines?: Array<{ vat_category: number; net_value: number; vat_amount: number; gross_value: number }>;
};

const record = ({
  id,
  aa = id,
  series = 'ΤΙΜ',
  date = '2026-11-02',
  kind = 'invoice',
  aadeType = '1.1',
  status = 'issued',
  source = 'legal',
  net = 100,
  vat = 24,
  gross = 124,
  name = 'Πελάτης Α',
  vatNumber = '123456789',
  lines = [],
}: RecordInput) => ({
  id,
  key: `${source}:${id}`,
  source,
  document: {
    id,
    series,
    aa,
    issue_date: date,
    document_kind: kind,
    aade_document_type: aadeType,
    status,
    provider_state: 'idle',
    issuer: { name: 'Ilios', vat_number: '999999999' },
    counterpart: { name, vat_number: vatNumber },
    totals: { net, vat, gross, quantity: 1 },
  },
  lines,
  customerMatch: { state: 'unmatched', candidates: [], method: 'none' },
}) as unknown as LegalArchiveRecord;

const allTypes = new Set<LegalReportType>(['invoice', 'service_invoice', 'invoice_delivery', 'credit', 'delivery_note', 'proforma']);
const report = (records: LegalArchiveRecord[]) => buildLegalFinancialReport({ records, periodLabel: 'Νοέμβριος 2026' });

describe('legal financial report periods', () => {
  it('resolves month, quarter and year boundaries', () => {
    expect(resolveLegalReportPeriod({ kind: 'month', year: 2024, month: 1 })).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
    expect(resolveLegalReportPeriod({ kind: 'quarter', year: 2026, quarter: 4 })).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(resolveLegalReportPeriod({ kind: 'year', year: 2026 })).toMatchObject({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolveLegalReportPeriod({ kind: 'all' })).toBeNull();
  });

  it('rolls quick periods back across the year boundary', () => {
    const quick = Object.fromEntries(getLegalReportQuickPeriods(new Date(2026, 0, 15)).map((item) => [item.id, item.period]));
    expect(quick.this_quarter).toEqual({ kind: 'quarter', year: 2026, quarter: 1 });
    expect(quick.previous_month).toEqual({ kind: 'month', year: 2025, month: 11 });
    expect(quick.previous_quarter).toEqual({ kind: 'quarter', year: 2025, quarter: 4 });
    expect(quick.previous_year).toEqual({ kind: 'year', year: 2025 });
  });
});

describe('legal financial report selection', () => {
  const records = [
    record({ id: '1', date: '2026-11-02' }),
    record({ id: '2', date: '2026-10-31' }),
    record({ id: '3', date: '2026-11-03', status: 'cancelled' }),
    record({ id: '4', date: '2026-11-04', kind: 'delivery_note', aadeType: '9.3' }),
    record({ id: '5', date: '2026-11-04', status: 'draft' }),
    record({ id: '6', date: '2026-11-04', name: 'Αλλος Πελατης', vatNumber: '555555555' }),
  ];
  const november = { kind: 'month', year: 2026, month: 10 } as const;
  const issued = new Set<LegalReportStatus>(['issued']);

  it('defaults to issued revenue documents inside the period', () => {
    const selected = selectLegalReportRecords(records, {
      period: november, types: new Set(DEFAULT_LEGAL_REPORT_TYPES), statuses: issued, customerQuery: '',
    });
    expect(selected.map((item) => item.id)).toEqual(['1', '6']);
  });

  it('matches customers by accent-free name or VAT number', () => {
    const select = (customerQuery: string) => selectLegalReportRecords(records, {
      period: november, types: allTypes, statuses: issued, customerQuery,
    }).map((item) => item.id);
    expect(select('άλλος')).toEqual(['6']);
    expect(select('555555555')).toEqual(['6']);
  });

  it('keeps hand-picked documents regardless of status', () => {
    const narrowed = narrowLegalReportRecords([records[2], records[4]], allTypes, '');
    expect(narrowed).toHaveLength(2);
  });

  it('classifies service invoices and pending provider states', () => {
    expect(getLegalReportType(record({ id: '7', aadeType: '2.1' }))).toBe('service_invoice');
    expect(getLegalReportStatus(record({ id: '8', status: 'submitted' }))).toBe('pending');
    expect(getLegalReportType(record({ id: '9', source: 'proforma', kind: 'proforma', status: 'draft' }))).toBe('proforma');
    expect(getLegalReportStatus(record({ id: '10', source: 'proforma', kind: 'proforma', status: 'void' }))).toBe('cancelled');
  });
});

describe('legal financial report totals', () => {
  it('subtracts credit notes and leaves cancelled documents out of the totals', () => {
    const data = report([
      record({ id: '1' }),
      record({ id: '2', kind: 'credit', aadeType: '5.1', net: 10, vat: 2.4, gross: 12.4 }),
      record({ id: '3', status: 'cancelled', net: 500, vat: 120, gross: 620 }),
    ]);
    expect(data.totals).toEqual({ count: 2, net: 90, vat: 21.6, gross: 111.6 });
    expect(data.uncountedCount).toBe(1);
    expect(data.rows.find((row) => row.key === 'legal:2')?.gross).toBe(-12.4);
    expect(data.rows.find((row) => row.key === 'legal:3')).toMatchObject({ counted: false, note: 'Ακυρωμένο' });
  });

  it('negates credit notes stored with negative totals only once', () => {
    const data = report([record({ id: '1', kind: 'credit', aadeType: '5.1', net: -10, vat: -2.4, gross: -12.4 })]);
    expect(data.totals.gross).toBe(-12.4);
    expect(data.byRate[0].gross).toBe(-12.4);
  });

  it('does not count a proforma already converted to an invoice', () => {
    const data = report([record({ id: '1', source: 'proforma', kind: 'proforma', status: 'converted' })]);
    expect(data.totals.count).toBe(0);
    expect(data.rows[0].note).toBe('Μετατράπηκε σε τιμολόγιο');
  });

  it('adds floating point amounts in cents', () => {
    const data = report([
      record({ id: '1', net: 0.1, vat: 0.02, gross: 0.12 }),
      record({ id: '2', net: 0.2, vat: 0.05, gross: 0.25 }),
    ]);
    expect(data.totals.net).toBe(0.3);
    expect(data.totals.gross).toBe(0.37);
  });

  it('splits mixed-rate documents and reconciles rounding to the document totals', () => {
    const data = report([record({
      id: '1',
      net: 300.01,
      vat: 61,
      gross: 361.01,
      lines: [
        { vat_category: 1, net_value: 200, vat_amount: 48, gross_value: 248 },
        { vat_category: 2, net_value: 100, vat_amount: 13, gross_value: 113 },
      ],
    })]);
    expect(data.rows[0].rateLabel).toBe('24% / 13%');
    expect(data.byRate).toMatchObject([
      { ratePercent: 24, net: 200.01, vat: 48, gross: 248.01 },
      { ratePercent: 13, net: 100, vat: 13, gross: 113 },
    ]);
    const sum = data.byRate.reduce((total, row) => total + Math.round(row.gross * 100), 0);
    expect(sum / 100).toBe(data.totals.gross);
  });

  it('derives the rate from the amounts when a document has no stored lines', () => {
    const data = report([record({ id: '1', net: 100, vat: 13, gross: 113 })]);
    expect(data.rows[0].rateLabel).toBe('13%');
    expect(data.byRate[0].ratePercent).toBe(13);
  });

  it('sorts naturally by date then number and flags double-counting mixes', () => {
    const data = report([
      record({ id: '1', aa: '10', date: '2026-11-02' }),
      record({ id: '2', aa: '9', date: '2026-11-02' }),
      record({ id: '3', aa: '1', date: '2026-11-03', kind: 'delivery_note', aadeType: '9.3' }),
    ]);
    expect(data.rows.map((row) => row.number)).toEqual(['ΤΙΜ-9', 'ΤΙΜ-10', 'ΤΙΜ-1']);
    expect(data.mixesNonRevenue).toBe(true);
    expect(report([record({ id: '1' })]).mixesNonRevenue).toBe(false);
  });
});

describe('legal financial report print view', () => {
  it('prints each document with the totals row after the last one', () => {
    const html = renderToStaticMarkup(<LegalFinancialReportPrint data={report([
      record({ id: '1', aa: '01' }),
      record({ id: '2', aa: '02', kind: 'credit', aadeType: '5.1', net: 10, vat: 2.4, gross: 12.4 }),
    ])} />);
    expect(html).toContain('ΤΙΜ-01');
    expect(html).toContain('Πελάτης Α');
    expect(html).toContain('24%');
    expect(html).toContain('Ανάλυση ανά συντελεστή ΦΠΑ');
    expect(html).toContain('αρνητικό πρόσημο');
    expect(html.indexOf('ΤΙΜ-02')).toBeLessThan(html.lastIndexOf('Σύνολα'));
  });
});
