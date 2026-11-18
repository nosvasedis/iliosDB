import type { LegalDocument, LegalDocumentLine, LegalPartyAddress } from '../../../types';
import { validateLegalDocument } from '../../../utils/legalDocuments';
import { validateSbzDocument } from '../../../features/legal/sbz';

/** Where in the issuing workspace an issue can be fixed. */
export type DraftIssueSection = 'customer' | 'document' | 'delivery' | 'lines' | 'issuer';

export interface DraftIssue {
  /** Stable key: `${field}|${message}`. */
  id: string;
  section: DraftIssueSection;
  /** UI field key, e.g. `counterpart.vat_number`, `delivery.delivery_address`, `line.3`. */
  field: string;
  severity: 'error' | 'warning';
  message: string;
  lineNumber?: number;
}

export const DRAFT_ISSUE_SECTION_LABEL: Record<DraftIssueSection, string> = {
  customer: 'Πελάτης',
  document: 'Παραστατικό & ΦΠΑ',
  delivery: 'Διακίνηση',
  lines: 'Γραμμές',
  issuer: 'Στοιχεία επιχείρησης',
};

const isAddressIncomplete = (address?: LegalPartyAddress | null) =>
  !address?.street?.trim() || !address?.city?.trim() || !address?.postal_code?.trim();

const lineNumberOf = (field: string): number | undefined => {
  const match = /^line\.(\d+)/.exec(field);
  return match ? Number(match[1]) : undefined;
};

/** Maps a `validateLegalDocument` field onto the UI field that fixes it. */
function normalizeLegalField(field: string, document: LegalDocument): string[] {
  if (/^line\.\d+\.vat_exemption$/.test(field)) return ['vat_exemption_category'];
  const lineNumber = lineNumberOf(field);
  if (lineNumber !== undefined) return [`line.${lineNumber}`];
  if (field === 'lines.net_value') return ['lines'];
  if (field === 'issuer.vat_number') return ['issuer'];
  if (field === 'aade_document_type') return ['document'];
  if (field === 'delivery.addresses') {
    const fields: string[] = [];
    if (isAddressIncomplete(document.delivery?.loading_address)) fields.push('delivery.loading_address');
    if (isAddressIncomplete(document.delivery?.delivery_address)) fields.push('delivery.delivery_address');
    return fields.length ? fields : ['delivery.delivery_address'];
  }
  return [field];
}

/** Maps a provider (SBZ) message that has no structured field onto the UI field that fixes it. */
function fieldsForProviderMessage(message: string, document: LegalDocument): string[] {
  const lineMatch = /γραμμή (\d+)/.exec(message);
  if (lineMatch) return [`line.${lineMatch[1]}`];
  if (message.includes('κωδικό ERP')) return ['counterpart.customer_code'];
  if (message.includes('επάγγελμα του πελάτη')) return ['counterpart.profession'];
  if (message.includes('ΔΟΥ του πελάτη')) return ['counterpart.tax_office'];
  if (message.includes('της επιχείρησης')) return ['issuer'];
  if (message.includes('οδό, πόλη και ταχυδρομικό κώδικα')) {
    const fields: string[] = [];
    if (isAddressIncomplete(document.counterpart.address)) fields.push('counterpart.address');
    if (isAddressIncomplete(document.issuer.address)) fields.push('issuer');
    return fields.length ? fields : ['counterpart.address'];
  }
  if (message.startsWith('Συμπληρώστε την επωνυμία')) {
    const fields: string[] = [];
    if (!document.counterpart.name?.trim()) fields.push('counterpart.name');
    if (!document.issuer.business_name?.trim() && !document.issuer.name?.trim()) fields.push('issuer');
    return fields.length ? fields : ['counterpart.name'];
  }
  if (message.includes('σκοπό διακίνησης')) return ['delivery.move_purpose'];
  if (message.includes('POS/IRIS')) return ['payment_method_code'];
  if (message.includes('σύνολα')) return ['totals'];
  if (message.includes('ποσά ή ποσότητες')) return ['lines'];
  return ['document'];
}

export function sectionForField(field: string): DraftIssueSection {
  if (field.startsWith('counterpart.')) return 'customer';
  if (field.startsWith('delivery.')) return 'delivery';
  if (field === 'issuer' || field.startsWith('issuer.')) return 'issuer';
  if (field === 'lines' || field === 'totals' || field.startsWith('line.')) return 'lines';
  return 'document';
}

/**
 * Field-level view of the issuing checks. Errors are exactly the provider checks
 * (`validateSbzDocument`, which already includes every blocking `validateLegalDocument` error);
 * warnings come from `validateLegalDocument`. No check is hidden: anything unrecognised lands
 * on the document section.
 */
export function collectDraftIssues(document: LegalDocument, lines: LegalDocumentLine[]): DraftIssue[] {
  const legalIssues = validateLegalDocument(document, lines);
  const legalFieldsByMessage = new Map<string, string[]>();
  for (const issue of legalIssues) {
    if (issue.severity !== 'error') continue;
    const fields = normalizeLegalField(issue.field, document);
    legalFieldsByMessage.set(issue.message, [...(legalFieldsByMessage.get(issue.message) || []), ...fields]);
  }

  const result: DraftIssue[] = [];
  const seen = new Set<string>();
  const push = (field: string, severity: DraftIssue['severity'], message: string) => {
    const id = `${field}|${message}`;
    if (seen.has(id)) return;
    seen.add(id);
    result.push({ id, section: sectionForField(field), field, severity, message, lineNumber: lineNumberOf(field) });
  };

  for (const message of validateSbzDocument(document, lines)) {
    const fields = legalFieldsByMessage.get(message) || fieldsForProviderMessage(message, document);
    for (const field of fields) push(field, 'error', message);
  }
  for (const issue of legalIssues) {
    if (issue.severity !== 'warning') continue;
    for (const field of normalizeLegalField(issue.field, document)) push(field, 'warning', issue.message);
  }
  return result;
}

/** Issues for one field (or, for `line.N`, one line), errors first. */
export function issuesForField(issues: DraftIssue[], field: string): DraftIssue[] {
  return issues
    .filter((issue) => issue.field === field)
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}

/** First message for a field, for inline display under an input. */
export function firstIssueMessage(issues: DraftIssue[], field: string): DraftIssue | null {
  return issuesForField(issues, field)[0] || null;
}

export function countIssuesBySection(issues: DraftIssue[]): Record<DraftIssueSection, { errors: number; warnings: number }> {
  const counts: Record<DraftIssueSection, { errors: number; warnings: number }> = {
    customer: { errors: 0, warnings: 0 },
    document: { errors: 0, warnings: 0 },
    delivery: { errors: 0, warnings: 0 },
    lines: { errors: 0, warnings: 0 },
    issuer: { errors: 0, warnings: 0 },
  };
  for (const issue of issues) {
    if (issue.severity === 'error') counts[issue.section].errors += 1;
    else counts[issue.section].warnings += 1;
  }
  return counts;
}
