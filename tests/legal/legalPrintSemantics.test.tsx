import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LegalDocumentPrintView from '../../components/LegalDocumentPrintView';
import {
  getMeasurementUnitLabel,
  LegalPrintCustomerBar,
  LegalPrintHeader,
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
  },
}];

const document: LegalDocument = {
  id: 'document-1',
  source_kind: 'manual',
  document_kind: 'invoice',
  aade_document_type: '1.1',
  status: 'issued',
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
  qr_url: 'https://example.test/aade/document-42',
  created_at: '2026-07-29T10:00:00.000Z',
  updated_at: '2026-07-29T10:00:00.000Z',
};

describe('legal print semantics', () => {
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
    expect(html).toContain('Χώρα:');
    expect(html).toContain('GR');
    expect(html).toContain('Υποκ.:');
    expect(html).toContain('2101111111');
    expect(html).toContain('customer@example.test');
    expect(html).not.toContain('Σύνολο');
    expect(html).not.toContain('248,00');
  });

  it('prints issuer VAT, tax office and branch together, with the tax office immediately after VAT', () => {
    const html = renderToStaticMarkup(
      <LegalPrintHeader
        title="Τιμολόγιο Πώλησης"
        documentNumber="ΤΙΜ-42"
        issuer={issuer}
      />,
    );
    const plainText = html.replace(/<[^>]+>/g, '');

    expect(plainText).toContain('ΑΦΜ: 094259216 · ΔΟΥ: ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ · Υποκ.: 0');
    expect(html.match(/ΔΟΥ:/g)).toHaveLength(1);
    expect(html).toContain('Οδός Δοκιμής');
    expect(html).toContain('18120');
    expect(html).toContain('2100000000');
    expect(html).toContain('issuer@example.test');
    expect(html).toContain('Δραστηριότητα:');
    expect(html).toContain('Νομική μορφή:');
    expect(html).toContain('ΓΕΜΗ:');
  });

  it('prints one grand total, no application logo, and all core fiscal information', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentPrintView document={document} lines={lines} />,
    );

    expect(html).not.toContain('legal-print-logo');
    expect(html).not.toContain('alt="ILIOS"');
    expect(html.match(/Γενικό Σύνολο/g)).toHaveLength(1);

    expect(html).toContain('ΕΚΔΟΤΗΣ Α.Ε.');
    expect(html).toContain('Οδός Δοκιμής');
    expect(html).toContain('ΔΟΥ:');
    expect(html).toContain('ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ');
    expect(html).toContain('ΠΕΛΑΤΗΣ Α.Ε.');
    expect(html).toContain('Λεωφόρος Πελάτη');
    expect(html).toContain('Χώρα:');
    expect(html).toContain('Υποκ.:');
    expect(html).toContain('ΤΙΜ');
    expect(html).toContain('42');
    expect(html).toContain('29/07/2026');
    expect(html).toContain('ΑΑΔΕ 1.1');
    expect(html).toContain('40000000000042');
    expect(html).toContain('UID-DOCUMENT-42');
    expect(html).toContain('RNG001');
    expect(html).toContain('Ασημένιο δαχτυλίδι');
    expect(html).toContain('Ειδική συσκευασία');
    expect(html).toContain('Μ.Μ.');
    expect(html).toContain('Τεμάχια');
    expect(html).toContain('24%');
    expect(html).toContain('Τρόπος πληρωμής');
  });
});
