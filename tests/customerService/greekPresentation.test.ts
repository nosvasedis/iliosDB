import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSIGNMENT_EVENT_LABELS,
  CONSIGNMENT_RETURN_STATUS_LABELS,
  CONSIGNMENT_STATUS_LABELS,
  FINANCIAL_STATUS_LABELS,
  FULFILLMENT_MODE_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  REPAIR_QUALITY_STATUS_LABELS,
  REPAIR_ATTACHMENT_TYPE_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  WORKFLOW_KIND_LABELS,
} from '../../features/customerService/greek';

const dictionaries = [
  CONSIGNMENT_STATUS_LABELS,
  CONSIGNMENT_EVENT_LABELS,
  FINANCIAL_STATUS_LABELS,
  SETTLEMENT_STATUS_LABELS,
  CONSIGNMENT_RETURN_STATUS_LABELS,
  REPAIR_STATUS_LABELS,
  REPAIR_ORIGIN_LABELS,
  REPAIR_EVENT_LABELS,
  REPAIR_ATTACHMENT_TYPE_LABELS,
  REPAIR_QUALITY_STATUS_LABELS,
  REPAIR_CHARGE_TYPE_LABELS,
  REPAIR_COST_TYPE_LABELS,
  WORKFLOW_KIND_LABELS,
  FULFILLMENT_MODE_LABELS,
];

const forbiddenVisibleLiterals = [
  '>Repair<', '>Order<', '>Stock<', '>Component<', '>Manual<', '>No Img<',
  '>Unisex<', '>Auth code<', '>Cloud<', '>Local<', '>Email<', '>Master<',
];

const guardedFiles = [
  'components/CustomerServiceWorkspace.tsx',
  'components/customerService/BulkConsignmentWorkbench.tsx',
  'components/customerService/ConsignmentBadge.tsx',
  'components/customerService/FulfillmentModeToggle.tsx',
  'components/customerService/RepairBadge.tsx',
  'components/customerService/RepairIntakeWorkbench.tsx',
  'components/customerService/RepairDetailModal.tsx',
  'components/customerService/CustomerSearchSelect.tsx',
  'components/CustomerDetailsModal.tsx',
  'components/production/ProductionFinderResultRow.tsx',
  'components/ProductionBatchCard.tsx',
  'components/ProductionPage.tsx',
  'components/OrderBuilder/OrderItemsPanel.tsx',
  'components/mobile/MobileOrderBuilder.tsx',
  'components/mobile/MobileSetupScreen.tsx',
  'components/legal/legalPrintShared.tsx',
];

describe('ελληνική παρουσίαση Παρακαταθηκών και Επισκευών', () => {
  it('έχει ελληνική ετικέτα για κάθε δηλωμένη κατάσταση', () => {
    for (const dictionary of dictionaries) {
      expect(Object.keys(dictionary).length).toBeGreaterThan(0);
      for (const label of Object.values(dictionary)) {
        expect(label.trim()).not.toBe('');
        expect(label).toMatch(/[Α-Ωα-ωΆ-Ώά-ώ]/);
      }
    }
  });

  it('απορρίπτει γνωστές αγγλικές ορατές ετικέτες στις κρίσιμες οθόνες', () => {
    const source = guardedFiles
      .map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .join('\n');

    for (const literal of forbiddenVisibleLiterals) {
      expect(source, `Βρέθηκε μη εγκεκριμένη ορατή ετικέτα ${literal}`).not.toContain(literal);
    }
  });
});
