import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Customer, Order, Product } from '../../types';
import {
  buildAadeInvoiceXml,
  buildLegalDocumentFromOrder,
  DEFAULT_LEGAL_SETTINGS,
} from '../../utils/legalDocuments';

const xsdDirectory = process.env.AADE_XSD_DIR;
const pythonExecutable = process.env.CODEX_PYTHON;

describe.skipIf(!xsdDirectory || !pythonExecutable)('official myDATA v2.0.1 XSD contract', () => {
  it('validates an invoice-delivery XML against the official InvoicesDoc schema', () => {
    const customer = {
      id: 'xsd-customer',
      full_name: 'XSD CUSTOMER',
      vat_number: '987654324',
      address: 'Ερμού 1 10563 Αθήνα',
      created_at: '2026-07-29T00:00:00.000Z',
    } as Customer;
    const product = {
      sku: 'RNG001',
      category: 'Δαχτυλίδι',
      description: 'Δαχτυλίδι δοκιμής XSD',
      selling_price: 100,
      active_price: 100,
    } as Product;
    const order = {
      id: 'xsd-order',
      customer_id: customer.id,
      customer_name: customer.full_name,
      created_at: '2026-07-29T00:00:00.000Z',
      status: 'Pending',
      total_price: 124,
      vat_rate: 0.24,
      discount_percent: 0,
      items: [{
        sku: product.sku,
        quantity: 1,
        price_at_order: 100,
        line_id: 'xsd-line',
      }],
    } as Order;
    const settings = {
      ...DEFAULT_LEGAL_SETTINGS,
      issuer: {
        ...DEFAULT_LEGAL_SETTINGS.issuer,
        business_name: 'ILIOS XSD TEST',
        name: 'ILIOS XSD TEST',
        vat_number: '094259216',
        address: { street: 'Αβέρωφ', number: '73', postal_code: '18120', city: 'Κορυδαλλός' },
      },
      loading_address: { street: 'Αβέρωφ', number: '73', postal_code: '18120', city: 'Κορυδαλλός' },
    };
    const document = buildLegalDocumentFromOrder({
      order,
      customer,
      products: [product],
      settings,
      kind: 'invoice_delivery',
    });
    const xml = buildAadeInvoiceXml({
      ...document,
      series: 'ΤΔΑ',
      aa: '1',
    }, document.lines);

    const outputDirectory = resolve('tmp', 'mydata-xsd-validation');
    mkdirSync(outputDirectory, { recursive: true });
    const xmlPath = join(outputDirectory, 'invoice-delivery.xml');
    writeFileSync(xmlPath, xml, 'utf8');

    const script = [
      'import sys',
      'from lxml import etree',
      'schema = etree.XMLSchema(etree.parse(sys.argv[1]))',
      'document = etree.parse(sys.argv[2])',
      'schema.assertValid(document)',
    ].join('; ');
    const result = spawnSync(pythonExecutable!, [
      '-c',
      script,
      join(xsdDirectory!, 'InvoicesDoc-v2.0.1.xsd'),
      xmlPath,
    ], { encoding: 'utf8' });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
