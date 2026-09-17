import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LegalDocumentPrintView from '../../components/LegalDocumentPrintView';
import {
  getMeasurementUnitLabel,
  getVatCategoryPrintRate,
  calculateLegalPrintPageCount,
  formatPrintTime,
  LEGAL_PRINT_CSS,
  LegalPrintCustomerBar,
  LegalPrintHeader,
  LegalPrintLinesTable,
  paginateLegalPrintRows,
} from '../../components/legal/legalPrintShared';
import type { LegalDocument, LegalDocumentLine } from '../../types';

const issuer = {
  business_name: 'ΕΚΔΟΤΗΣ Α.Ε.',
  trade_name: 'ΕΚΔΟΤΗΣ',
  vat_number: '094259216',
  branch: 0,
  address: {
    street: 'Οδός Δοκιμής',
    number: '10',
    postal_code: '18120',
    city: 'Κορυδαλλός',
  },
  phone: '2100000000',
  email: 'issuer@example.test',
  doy: 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
  activity: 'Εμπόριο κοσμημάτων',
  legal_form: 'Α.Ε.',
  gemi: '123456789000',
};

const counterpart = {
  name: 'ΠΕΛΑΤΗΣ Α.Ε.',
  vat_number: '099999999',
  country: 'GR',
  branch: 0,
  address: {
    street: 'Λεωφόρος Πελάτη',
    number: '20',
    postal_code: '11526',
    city: 'Αθήνα',
  },
  phone: '2101111111',
  email: 'customer@example.test',
};

const lines: LegalDocumentLine[] = [{
  id: 'line-1',
  document_id: 'document-1',
  line_number: 1,
  sku: 'RNG001',
  item_code: 'RNG001',
  description: 'Ασημένιο δαχτυλίδι',
  quantity: 2,
  measurement_unit: 1,
  unit_price: 100,
  net_value: 200,
  vat_category: 1,
  vat_amount: 48,
  gross_value: 248,
  income_classification: {
    classification_category: 'category1_1',
    classification_type: 'E3_561_001',
    amount: 200,
  },
  source_metadata: {
    line_comments: 'Ειδική συσκευασία',
    original_unit_price: 125,
    discount_percent: 20,
  },
}];

const document: LegalDocument = {
  id: 'document-1',
  source_kind: 'manual',
  document_kind: 'invoice',
  aade_document_type: '1.1',
  status: 'issued',
  provider: 'sbz',
  series: 'ΤΙΜ',
  aa: '42',
  issue_date: '2026-07-29',
  issuer,
  counterpart,
  payment_method_code: 5,
  currency: 'EUR',
  revenue_classification: [{
    classification_category: 'category1_1',
    classification_type: 'E3_561_001',
    amount: 200,
  }],
  totals: {
    net: 200,
    vat: 48,
    gross: 248,
    quantity: 2,
  },
  aade_mark: '40000000000042',
  aade_uid: 'UID-DOCUMENT-42',
  authentication_code: 'SIGNATURE-DOCUMENT-42',
  qr_url: 'https://example.test/aade/document-42',
  created_at: '2026-07-29T10:00:00.000Z',
  updated_at: '2026-07-29T10:00:00.000Z',
};

describe('legal print semantics', () => {
  it('prints every timestamp with a 24-hour clock', () => {
    expect(formatPrintTime('2026-07-29T13:05:00')).toBe('13:05');
    expect(formatPrintTime('2026-07-29T00:05:00')).toBe('00:05');
    expect(formatPrintTime('18:40:00')).toBe('18:40');
    expect(formatPrintTime('invalid')).toBe('-');
  });

  it('keeps the shared PDF typography readable without the previous extra-small sizes', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView document={document} lines={lines} />,
    );

    expect(LEGAL_PRINT_CSS).toContain('font-size: 10px;');
    expect(LEGAL_PRINT_CSS).toContain('line-height: 1.3;');
    expect(LEGAL_PRINT_CSS).toContain('.legal-print-final-section');
    expect(LEGAL_PRINT_CSS).toContain('.legal-print-physical-page');
    expect(LEGAL_PRINT_CSS).toContain('height: 297mm;');
    expect(LEGAL_PRINT_CSS).toContain('max-height: 297mm;');
    expect(LEGAL_PRINT_CSS).toContain('break-inside: avoid-page !important;');
    expect(LEGAL_PRINT_CSS).not.toContain('break-before: avoid-page');
    expect(LEGAL_PRINT_CSS).not.toContain('break-after: avoid-page');
    expect(html).toContain('legal-print-lines-table shrink-0');
    expect(html).not.toContain('legal-print-lines-table min-h-[78mm] grow');
    expect(LEGAL_PRINT_CSS).not.toContain('position: absolute;');
    expect(html).not.toContain('legal-print-final-spacer');
    expect(html).toContain('legal-print-final-anchor mt-auto shrink-0');
    expect(html).toContain('data-legal-print-last-page="true"');
    expect(html).not.toContain('text-[6.25px]');
    expect(html).not.toContain('text-[6.5px]');
  });

  it('splits rows into real A4 page slices and reserves the final footer before placing rows', () => {
    expect(paginateLegalPrintRows({
      rowHeights: Array.from({ length: 20 }, () => 20),
      pageContentHeight: 1000,
      firstPageFixedHeight: 300,
      continuationPageFixedHeight: 50,
      finalSectionHeight: 250,
      safetyGap: 0,
    })).toEqual([{ startIndex: 0, endIndex: 20 }]);

    expect(paginateLegalPrintRows({
      rowHeights: Array.from({ length: 40 }, () => 20),
      pageContentHeight: 1000,
      firstPageFixedHeight: 300,
      continuationPageFixedHeight: 50,
      finalSectionHeight: 250,
      safetyGap: 0,
    })).toEqual([
      { startIndex: 0, endIndex: 35 },
      { startIndex: 35, endIndex: 40 },
    ]);

    expect(paginateLegalPrintRows({
      rowHeights: Array.from({ length: 90 }, () => 20),
      pageContentHeight: 1000,
      firstPageFixedHeight: 300,
      continuationPageFixedHeight: 50,
      finalSectionHeight: 250,
      safetyGap: 0,
    })).toEqual([
      { startIndex: 0, endIndex: 35 },
      { startIndex: 35, endIndex: 82 },
      { startIndex: 82, endIndex: 90 },
    ]);
  });

  it('keeps zebra striping continuous when a later physical page starts on an odd row', () => {
    const html = renderToStaticMarkup(
      <LegalPrintLinesTable lines={lines} startIndex={1} currency="EUR" />,
    );

    expect(html).toContain('data-legal-print-line-index="1"');
    expect(html).toContain('bg-slate-100/80');
    expect(html).not.toContain('odd:bg-white');
  });

  it('rounds the measured print content up to complete A4 pages', () => {
    expect(calculateLegalPrintPageCount(900, 1000)).toBe(1);
    expect(calculateLegalPrintPageCount(1000, 1000)).toBe(1);
    expect(calculateLegalPrintPageCount(1001, 1000)).toBe(1);
    expect(calculateLegalPrintPageCount(1002, 1000)).toBe(2);
    expect(calculateLegalPrintPageCount(2500, 1000)).toBe(3);
    expect(calculateLegalPrintPageCount(Number.NaN, 1000)).toBe(1);
  });

  it('maps every myDATA 8.13 measurement-unit code to its official Greek label', () => {
    expect([
      getMeasurementUnitLabel(1),
      getMeasurementUnitLabel(2),
      getMeasurementUnitLabel(3),
      getMeasurementUnitLabel(4),
      getMeasurementUnitLabel(5),
      getMeasurementUnitLabel(6),
      getMeasurementUnitLabel(7),
    ]).toEqual([
      'Τεμάχια',
      'Κιλά',
      'Λίτρα',
      'Μέτρα',
      'Τετραγωνικά μέτρα',
      'Κυβικά μέτρα',
      'Τεμάχια - λοιπές περιπτώσεις',
    ]);
  });

  it('uses compact VAT rates and non-breaking currency amounts in narrow PDF cells', () => {
    expect(getVatCategoryPrintRate(7)).toBe('0%');
    expect(getVatCategoryPrintRate(1)).toBe('24%');
  });

  it('keeps the customer section focused on identity and never duplicates the amount due', () => {
    const html = renderToStaticMarkup(
      <LegalPrintCustomerBar counterpart={counterpart} />,
    );

    expect(html).toContain('ΠΕΛΑΤΗΣ Α.Ε.');
    expect(html).toContain('ΑΦΜ:');
    expect(html).toContain('099999999');
    expect(html).toContain('Λεωφόρος Πελάτη');
    expect(html).toContain('20');
    expect(html).toContain('11526');
    expect(html).toContain('Αθήνα');
    expect(html).toContain('Ελλάδα');
    expect(html).not.toContain('Χώρα:');
    expect(html).not.toContain('Υποκατάστημα:');
    expect(html).toContain('Τηλ.');
    expect(html).toContain('2101111111');
    expect(html).toContain('Ηλ. ταχυδρομείο');
    expect(html).toContain('customer@example.test');
    expect(html).not.toContain('Σύνολο');
    expect(html).not.toContain('248,00');
  });

  it('keeps meaningful non-zero customer branches while hiding branch zero', () => {
    const html = renderToStaticMarkup(
      <LegalPrintCustomerBar counterpart={{ ...counterpart, branch: 2 }} />,
    );

    expect(html).toContain('Υποκατάστημα:');
    expect(html).toContain('>2<');
  });

  it('prints foreign counterpart countries with localized names instead of ISO codes', () => {
    const html = renderToStaticMarkup(
      <LegalPrintCustomerBar counterpart={{ ...counterpart, country: 'DE' }} />,
    );
    expect(html).toContain('Γερμανία');
    expect(html).not.toContain(', DE');
  });

  it('prints issuer VAT and tax office together without a useless zero branch', () => {
    const html = renderToStaticMarkup(
      <LegalPrintHeader
        title="Τιμολόγιο Πώλησης"
        documentNumber="ΤΙΜ-42"
        issuer={issuer}
      />,
    );
    const plainText = html.replace(/<[^>]+>/g, '');

    expect(plainText).toContain('ΑΦΜ: 094259216 · ΔΟΥ: ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ');
    expect(plainText).not.toContain('Υποκατάστημα: 0');
    expect(html.match(/ΔΟΥ:/g)).toHaveLength(1);
    expect(html).toContain('Οδός Δοκιμής');
    expect(html).toContain('18120');
    expect(html).toContain('2100000000');
    expect(html).toContain('issuer@example.test');
    expect(html).toContain('Κορυδαλλός');
    expect(html).toContain('Ελλάδα');
    expect(html).toContain('Δραστηριότητα:');
    expect(html).toContain('Νομική μορφή:');
    expect(html).toContain('ΓΕΜΗ:');
  });

  it('prints the Ilios logo, one final total, and all core fiscal information', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView document={document} lines={lines} />,
    );

    expect(html).toContain('legal-print-logo');
    expect(html).toContain('alt="ILIOS"');
    expect(html.match(/Τελική αξία/g)).toHaveLength(1);

    expect(html).toContain('ΕΚΔΟΤΗΣ Α.Ε.');
    expect(html).toContain('Οδός Δοκιμής');
    expect(html).toContain('ΔΟΥ:');
    expect(html).toContain('ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ');
    expect(html).toContain('ΠΕΛΑΤΗΣ Α.Ε.');
    expect(html).toContain('Λεωφόρος Πελάτη');
    expect(html).toContain('Αθήνα, Ελλάδα');
    expect(html).not.toContain('Χώρα:');
    expect(html).not.toContain('Υποκατάστημα: 0');
    expect(html).toContain('ΤΙΜ');
    expect(html).toContain('42');
    expect(html).toContain('29/07/2026');
    expect(html).toContain('Τύπος myDATA:');
    expect(html.indexOf('Όροι παράδοσης')).toBeLessThan(html.indexOf('Τύπος myDATA:'));
    expect(html.indexOf('Τύπος myDATA:')).toBeLessThan(html.indexOf('Χαρακτηρισμοί:'));
    expect(html).toContain('40000000000042');
    expect(html).toContain('UID-DOCUMENT-42');
    expect(html).toContain('SIGNATURE-DOCUMENT-42');
    expect(html).toContain('Στοιχεία επαλήθευσης');
    expect(html).not.toContain('Στοιχεία επαλήθευσης myDATA / ΑΑΔΕ');
    expect(html).not.toContain('Πάροχος ηλεκτρονικής τιμολόγησης:');
    expect(html).not.toContain('SBZ Systems');
    expect(html).toContain('Μ.Αρ.Κ.:');
    expect(html).toContain('Υπογραφή:');
    expect(html).toContain('Αναγνωριστικό:');
    expect(html).toContain('Υ.ΠΑ.Η.Ε.Σ:');
    expect(html).toContain('SBZ IKE - www.sbz.gr');
    expect(html).toContain('Αριθμός Αδειοδότησης:');
    expect(html).toContain('2023_05_113SBZ IKE_001_EMDI_V1_18052023');
    expect(html.indexOf('SBZ IKE - www.sbz.gr')).toBeLessThan(html.indexOf('2023_05_113SBZ IKE_001_EMDI_V1_18052023'));
    expect(html).toContain('Εθνική Τράπεζα');
    expect(html).toContain('Αρ. Λογαριασμού:');
    expect(html).toContain('088/003361-85');
    expect(html).toContain('IBAN:');
    expect(html).toContain('GR1401100880000008800336185');
    expect(html).toContain('Όροι παράδοσης');
    expect(html.match(/legal-print-full-width-details/g)).toHaveLength(2);
    expect(html).not.toContain('ml-[30mm]');
    expect(html).toContain('Τα εμπορεύματα ταξιδεύουν για λογαριασμό και με κίνδυνο του αγοραστή.');
    expect(html).toContain('Για κάθε διαφορά αρμόδια είναι τα δικαστήρια του Πειραιά.');
    expect(html).toContain('Η εξόφληση του τιμολογίου πρέπει να γίνεται με την παράδοση.');
    expect(html.match(/Σύνοψη παραστατικού/g)).toHaveLength(1);
    expect(html).toContain('Συνολική ποσότητα');
    expect(html).not.toContain('Συν. ποσότητα');
    expect(html.indexOf('Συνολική ποσότητα')).toBeLessThan(html.indexOf('Συντελεστής ΦΠΑ'));
    expect(html.indexOf('Συντελεστής ΦΠΑ')).toBeLessThan(html.indexOf('Αξία προ έκπτωσης'));
    expect(html.indexOf('Αξία προ έκπτωσης')).toBeLessThan(html.indexOf('Ποσοστό έκπτωσης'));
    expect(html.indexOf('Ποσοστό έκπτωσης')).toBeLessThan(html.indexOf('Αξία έκπτωσης'));
    expect(html.indexOf('Αξία έκπτωσης')).toBeLessThan(html.indexOf('Καθαρή αξία μετά την έκπτωση'));
    expect(html.indexOf('Καθαρή αξία μετά την έκπτωση')).toBeLessThan(html.indexOf('Αξία ΦΠΑ'));
    expect(html.indexOf('Αξία ΦΠΑ')).toBeLessThan(html.indexOf('Τελική αξία με έκπτωση'));
    expect(html).toContain('250,00 €');
    expect(html).toContain('Ποσοστό έκπτωσης</span><span');
    expect(html).toContain('>20%</span>');
    expect(html).toContain('50,00 €');
    expect(html).toContain('legal-print-final-section');
    expect(html.indexOf('legal-print-final-section')).toBeLessThan(html.indexOf('Σύνοψη παραστατικού'));
    expect(html.indexOf('Σύνοψη παραστατικού')).toBeLessThan(html.indexOf('Στοιχεία επαλήθευσης'));
    expect(html).not.toContain('Σχόλιο:');
    expect(html).not.toContain('Αντίγραφο παραστατικού');
    expect(html).not.toContain('Το παρόν εκτυπώνεται από το αποθηκευμένο παραστατικό του IliosERP.');
    expect(html).toContain('RNG001');
    expect(html).toContain('Ασημένιο δαχτυλίδι');
    expect(html).toContain('Ειδική συσκευασία');
    expect(html).toContain('Μ.Μ.');
    expect(html).toContain('Τεμάχια');
    expect(html).toContain('Τιμή μον.');
    expect(html).toContain('Έκπτ.%');
    expect(html).toContain('data-legal-print-line-index="0"');
    expect(html).toContain('bg-white');
    expect(html).toContain('py-[3px]');
    expect(html).toContain('125,00 €');
    expect(html).toContain('20%');
    expect(html).toContain('24%');
    expect(html).not.toContain('απαιτεί αιτία');
    expect(html).toContain('Στοιχεία συναλλαγής &amp; διακίνησης');
    expect(html).toContain('Σκοπός διακίνησης');
    expect(html).toContain('Πώληση');
    expect(html).toContain('Τρόπος πληρωμής');
    expect(html).toContain('Τόπος φόρτωσης');
    expect(html).toContain('Έδρα μας');
    expect(html).toContain('Τόπος προορισμού');
    expect(html).toContain('Τρόπος αποστολής');
    expect(html).toContain('Μεταφορική');
    expect(html).not.toContain('Ανάλυση υπολογισμού ΦΠΑ');
    expect(html).not.toContain('Όχημα');
  });

  it('uses the actual delivery-note purpose and locations without duplicating generic defaults', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView
        document={{
          ...document,
          document_kind: 'invoice_delivery',
          delivery: {
            dispatch_date: '2026-07-29',
            dispatch_time: '12:30:00',
            move_purpose: 5,
            loading_address: { street: 'Αποθήκη', number: '8', postal_code: '18233', city: 'Ρέντης' },
            delivery_address: { street: 'Σημείο Παράδοσης', number: '4', postal_code: '11527', city: 'Αθήνα' },
            carrier_name: 'Μεταφορική Δοκιμής',
            notes: 'Παράδοση στην πίσω είσοδο',
          },
        }}
        lines={lines}
      />,
    );

    expect(html).toContain('Επιστροφή');
    expect(html).toContain('Αποθήκη 8, 18233 Ρέντης, Ελλάδα');
    expect(html).toContain('Σημείο Παράδοσης 4, 11527 Αθήνα, Ελλάδα');
    expect(html).toContain('29/07/2026 · 12:30');
    expect(html).toContain('Μεταφορική Δοκιμής');
    expect(html).toContain('Σχόλιο:');
    expect(html).toContain('Παράδοση στην πίσω είσοδο');
    expect(html.match(/Σχόλιο:/g)).toHaveLength(1);
    expect(html).not.toContain('Έδρα μας');
    expect(html).not.toContain('Παράδοση:');
  });

  it('places a correlated credit MARK inside the document-type cell and never above the logo', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView
        document={{
          ...document,
          document_kind: 'credit',
          aade_document_type: '5.1',
          credited_document_id: 'original-document-1',
          correlated_mark: '40000000000123',
        }}
        lines={lines}
      />,
    );

    expect(html).toContain('ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ');
    expect(html).toContain('MARK αρχικού: 40000000000123');
    expect(html.match(/MARK αρχικού:/g)).toHaveLength(1);
    expect(html).not.toContain('Πιστωτικό για το αρχικό παραστατικό');
    expect(html.indexOf('legal-print-logo')).toBeLessThan(html.indexOf('MARK αρχικού:'));
    expect(html.indexOf('ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ')).toBeLessThan(html.indexOf('MARK αρχικού:'));
  });

  it('omits every discount-only summary field when the document has no discount', () => {
    const noDiscountLines = [{
      ...lines[0],
      source_metadata: { line_comments: 'Ειδική συσκευασία' },
    }];
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView document={document} lines={noDiscountLines} />,
    );

    expect(html).toContain('Συνολική ποσότητα');
    expect(html).toContain('Καθαρή αξία');
    expect(html).toContain('Αξία ΦΠΑ');
    expect(html).toContain('Τελική αξία');
    expect(html).not.toContain('Αξία προ έκπτωσης');
    expect(html).not.toContain('Ποσοστό έκπτωσης');
    expect(html).not.toContain('Αξία έκπτωσης');
    expect(html).not.toContain('Καθαρή αξία μετά την έκπτωση');
    expect(html).not.toContain('Τελική αξία με έκπτωση');
  });

  it('prints the persisted legal exemption wording for Mount Athos', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView
        document={{ ...document, vat_rate: 0, vat_exemption_category: 1, vat_exemption_legal_note: 'ΧΩΡΙΣ ΦΠΑ ΩΣ Α.Υ.Ο. Π.7395/4269/5.11.1987' }}
        lines={[{ ...lines[0], vat_category: 7, vat_amount: 0, gross_value: 200 }]}
      />,
    );
    expect(html).toContain('ΧΩΡΙΣ ΦΠΑ ΩΣ Α.Υ.Ο. Π.7395/4269/5.11.1987');
  });
});
