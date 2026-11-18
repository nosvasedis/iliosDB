import { describe, expect, it } from 'vitest';
import { buildManualLegalDocument, DEFAULT_LEGAL_SETTINGS, recalculateLegalDocument, SBZ_COURIER_DISPATCH_METHOD, toAthensIsoDate } from '../../utils/legalDocuments';
import { validateSbzDocument } from '../../features/legal/sbz';
import { collectDraftIssues, countIssuesBySection, firstIssueMessage } from '../../components/legal/issue/draftIssues';
import type { LegalDocument } from '../../types';

const settings = {
  ...DEFAULT_LEGAL_SETTINGS,
  issuer: {
    ...DEFAULT_LEGAL_SETTINGS.issuer,
    vat_number: '094019245',
    business_name: 'Εκδότης ΑΕ',
    name: 'Εκδότης ΑΕ',
    activity: 'Χονδρικό εμπόριο',
    doy: 'ΦΑΕ Αθηνών',
    address: { street: 'Ερμού', number: '1', postal_code: '10563', city: 'Αθήνα' },
  },
};

const draft = (kind: LegalDocument['document_kind'] = 'invoice_delivery') => {
  const document = buildManualLegalDocument({ settings, kind });
  return { document, lines: document.lines || [] };
};

describe('field-level issuing checks', () => {
  it('keeps every provider error and places each on a fixable field', () => {
    const { document, lines } = draft();
    const issues = collectDraftIssues(document, lines);
    const errorMessages = new Set(issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message));
    expect([...errorMessages].sort()).toEqual([...validateSbzDocument(document, lines)].sort());
    expect(firstIssueMessage(issues, 'counterpart.vat_number')?.severity).toBe('error');
    expect(firstIssueMessage(issues, 'counterpart.customer_code')?.section).toBe('customer');
    expect(firstIssueMessage(issues, 'counterpart.profession')).not.toBeNull();
    expect(firstIssueMessage(issues, 'counterpart.tax_office')).not.toBeNull();
    expect(firstIssueMessage(issues, 'counterpart.address')).not.toBeNull();
    expect(issues.some((issue) => issue.section === 'issuer')).toBe(false);
  });

  it('splits incomplete delivery addresses into loading and delivery fields', () => {
    const { document, lines } = draft();
    const withAddresses: LegalDocument = {
      ...document,
      delivery: {
        ...document.delivery,
        dispatch_date: toAthensIsoDate(),
        loading_address: { street: 'Ερμού', number: '1', postal_code: '10563', city: 'Αθήνα' },
        delivery_address: { street: 'Αθηνάς', number: '2', postal_code: '', city: '' },
      },
    };
    const issues = collectDraftIssues(withAddresses, lines);
    expect(firstIssueMessage(issues, 'delivery.delivery_address')?.severity).toBe('error');
    expect(firstIssueMessage(issues, 'delivery.loading_address')).toBeNull();
  });

  it('turns a missing courier into a delivery warning, not a blocking error', () => {
    const { document, lines } = draft();
    const courier: LegalDocument = {
      ...document,
      delivery: { ...document.delivery, dispatch_method: SBZ_COURIER_DISPATCH_METHOD, carrier_name: null },
    };
    const issues = collectDraftIssues(courier, lines);
    expect(firstIssueMessage(issues, 'delivery.carrier')?.severity).toBe('warning');
    expect(firstIssueMessage(issues, 'delivery.vehicle')).toBeNull();
    expect(countIssuesBySection(issues).delivery.warnings).toBeGreaterThan(0);
  });

  it('maps line problems onto the line they belong to', () => {
    const { document, lines } = draft('invoice');
    const zeroLine = lines.map((line) => ({ ...line, quantity: 0 }));
    const recalculated = recalculateLegalDocument(document, zeroLine, settings);
    const issues = collectDraftIssues(recalculated.document, recalculated.lines);
    const lineIssue = issues.find((issue) => issue.field === 'line.1');
    expect(lineIssue?.section).toBe('lines');
    expect(lineIssue?.lineNumber).toBe(1);
  });
});
