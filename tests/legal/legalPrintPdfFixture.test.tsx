import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Customer, LegalDocument, LegalDocumentKind, LegalDocumentLine, Order, Product } from '../../types';
import LegalDocumentPrintView from '../../components/LegalDocumentPrintView';
import {
  buildLegalDocumentFromOrder,
  DEFAULT_LEGAL_SETTINGS,
  recalculateLegalDocument,
} from '../../utils/legalDocuments';

const fixtureDirectory = process.env.LEGAL_PRINT_FIXTURE_DIR;

describe.skipIf(!fixtureDirectory)('legal PDF rendering fixtures', () => {
  it('writes representative print-only HTML without opening the ERP application', () => {
    const issuer = {
      ...DEFAULT_LEGAL_SETTINGS.issuer,
      business_name: 'ΗΛΙΟΣ ΚΟΣΜΗΜΑ ΜΟΝΟΠΡΟΣΩΠΗ ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ',
      name: 'ΗΛΙΟΣ ΚΟΣΜΗΜΑ ΜΟΝΟΠΡΟΣΩΠΗ ΙΔΙΩΤΙΚΗ ΚΕΦΑΛΑΙΟΥΧΙΚΗ ΕΤΑΙΡΕΙΑ',
      trade_name: 'ILIOS KOSMIMA',
      vat_number: '094259216',
      branch: 0,
      address: { street: 'Αβέρωφ', number: '73', postal_code: '18120', city: 'Κορυδαλλός' },
      phone: '2104905405',
      email: 'ilioskosmima@example.test',
      doy: 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
      activity: 'Λιανικό και χονδρικό εμπόριο κοσμημάτων',
      legal_form: 'ΙΚΕ',
      gemi: '123456789000',
    };
    const settings = {
      ...DEFAULT_LEGAL_SETTINGS,
      issuer,
      loading_address: issuer.address,
    };
    const customer = {
      id: 'pdf-customer',
      full_name: 'ΠΑΡΑΔΕΙΓΜΑ ΠΕΛΑΤΗ ΑΝΩΝΥΜΗ ΕΜΠΟΡΙΚΗ ΚΑΙ ΕΙΣΑΓΩΓΙΚΗ ΕΤΑΙΡΕΙΑ',
      vat_number: '987654324',
      address: 'Λεωφόρος Κηφισίας 100 11526 Αθήνα',
      phone: '2100000000',
      email: 'customer@example.test',
      created_at: '2026-07-29T00:00:00.000Z',
    } as Customer;
    const product = {
      sku: 'RNG001',
      category: 'Δαχτυλίδι',
      description: 'Ασημένιο δαχτυλίδι με λεπτομερή περιγραφή προϊόντος και παραλλαγής',
      selling_price: 100,
      active_price: 100,
    } as Product;
    const order = {
      id: 'pdf-order',
      customer_id: customer.id,
      customer_name: customer.full_name,
      created_at: '2026-07-29T00:00:00.000Z',
      status: 'Pending',
      total_price: 124,
      vat_rate: 0.24,
      discount_percent: 0,
      items: [{ sku: product.sku, quantity: 1, price_at_order: 100, line_id: 'pdf-line' }],
    } as Order;

    const buildFixture = (
      id: string,
      kind: LegalDocumentKind,
      lineCount: number,
      status: LegalDocument['status'] = 'issued',
    ): { document: LegalDocument; lines: LegalDocumentLine[] } => {
      const base = buildLegalDocumentFromOrder({ order, customer, products: [product], settings, kind });
      const lines = Array.from({ length: lineCount }, (_, index) => ({
        ...base.lines![0],
        id: `${id}-line-${index + 1}`,
        document_id: id,
        line_number: index + 1,
        description: `${base.lines![0].description} · γραμμή ${index + 1}`,
        item_code: `${base.lines![0].item_code}-${index + 1}`,
      }));
      const recalculated = recalculateLegalDocument({
        ...base,
        id,
        status,
        series: kind === 'credit' ? 'ΠΙΣ' : kind === 'delivery_note' ? 'ΔΑ' : kind === 'invoice_delivery' ? 'ΤΔΑ' : 'ΤΙΜ',
        aa: String(100 + lineCount),
        issuer,
        aade_mark: status === 'draft' ? null : `400000000000${lineCount}`,
        aade_uid: status === 'draft' ? null : `UID-${id}`,
        qr_url: status === 'draft' ? null : `https://example.test/qr/${id}`,
        cancellation_mark: status === 'cancelled' ? `500000000000${lineCount}` : null,
      }, lines, settings);
      return recalculated;
    };

    const fixtures = [
      buildFixture('invoice-1', 'invoice', 1),
      buildFixture('invoice-20', 'invoice', 20),
      buildFixture('invoice-60', 'invoice', 60),
      buildFixture('invoice-delivery', 'invoice_delivery', 3),
      buildFixture('delivery-note', 'delivery_note', 3),
      buildFixture('credit', 'credit', 3),
      buildFixture('cancelled', 'invoice', 3, 'cancelled'),
      buildFixture('draft', 'invoice', 3, 'draft'),
    ];
    fixtures[1].document.counterpart = {
      ...fixtures[1].document.counterpart,
      country: 'CY',
      branch: 2,
      name: 'LONG FOREIGN CUSTOMER TRADING AND DISTRIBUTION LIMITED',
      address: { street: 'Arch. Makariou III', number: '100', postal_code: '1065', city: 'Nicosia' },
    };

    const body = renderToStaticMarkup(
      <main>{fixtures.map(({ document, lines }) => (
        <LegalDocumentPrintView key={document.id} document={document} lines={lines} />
      ))}</main>,
    );
    const html = [
      '<!doctype html><html lang="el"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<script src="https://cdn.tailwindcss.com"></script>',
      '<style>@page{size:A4;margin:0}body{margin:0;background:white;font-family:Arial,sans-serif}</style>',
      '</head><body>',
      body,
      '</body></html>',
    ].join('');

    const outputDirectory = resolve(fixtureDirectory!);
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = join(outputDirectory, 'legal-print-representative.html');
    writeFileSync(outputPath, html, 'utf8');
    expect(outputPath).toContain('legal-print-representative.html');
  });
});
