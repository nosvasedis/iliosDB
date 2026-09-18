import { describe, expect, it } from 'vitest';
import { ProductionStage, type ProductionBatch, type RepairItem } from '../../types';
import {
  countRepairsInProduction,
  findLiveRepairBatch,
  getRepairProductionPresentation,
  isRepairProductionBatch,
  repairReadyConfirmMessage,
} from '../../features/customerService/repairProductionPresentation';
import { PRODUCTION_STAGES, getPolishingSubStageLabel } from '../../utils/productionStages';

function repair(status: RepairItem['status'] = 'in_production'): RepairItem {
  return {
    id: 'repair-1',
    code: 'ΕΠ-2026-000001',
    intake_id: 'intake-1',
    customer_id: 'customer-1',
    origin_type: 'third_party',
    variant_suffix: '',
    size_info: '',
    description: 'Κούμπωμα',
    status,
    current_cycle_number: 1,
    created_at: '2026-09-18T09:00:00.000Z',
    updated_at: '2026-09-18T09:00:00.000Z',
  };
}

function batch(overrides: Partial<ProductionBatch> = {}): ProductionBatch {
  return {
    id: 'ΕΠ-batch1',
    sku: 'SP',
    quantity: 1,
    current_stage: ProductionStage.Waxing,
    created_at: '2026-09-18T09:00:00.000Z',
    updated_at: '2026-09-18T09:00:00.000Z',
    priority: 'Normal',
    requires_setting: false,
    workflow_kind: 'repair',
    repair_item_id: 'repair-1',
    pending_dispatch: false,
    ...overrides,
  };
}

describe('παρουσίαση σταδίου Επισκευής στην Παραγωγή', () => {
  it('δείχνει το πραγματικό στάδιο Παραγωγής αντί για την γενική Στην Παραγωγή', () => {
    for (const stage of PRODUCTION_STAGES) {
      if (stage.id === ProductionStage.Polishing) continue;
      const presentation = getRepairProductionPresentation(
        repair('in_production'),
        batch({ current_stage: stage.id }),
      );
      expect(presentation.label).toBe(stage.label);
      expect(presentation.label).not.toBe('Στην Παραγωγή');
      expect(presentation.kind).toBe('production-stage');
      expect(presentation.className).toMatch(/bg-|text-|border-/);
    }
  });

  it('χωρίζει τα δύο υποστάδια Τεχνίτη με σωστά χρώματα', () => {
    const pending = getRepairProductionPresentation(
      repair('in_production'),
      batch({ current_stage: ProductionStage.Polishing, pending_dispatch: true }),
    );
    const dispatched = getRepairProductionPresentation(
      repair('in_production'),
      batch({ current_stage: ProductionStage.Polishing, pending_dispatch: false }),
    );

    expect(pending.label).toBe(getPolishingSubStageLabel('pending'));
    expect(dispatched.label).toBe(getPolishingSubStageLabel('dispatched'));
    expect(pending.className).toMatch(/teal/);
    expect(dispatched.className).toMatch(/blue/);
    expect(pending.label).not.toBe('Στην Παραγωγή');
    expect(dispatched.label).not.toBe('Τεχνίτης');
  });

  it('χωρίς παρτίδα δείχνει την κατάσταση Επισκευής', () => {
    const quality = getRepairProductionPresentation(repair('quality_check'), null);
    expect(quality.label).toBe('Ποιοτικός έλεγχος');
    expect(quality.kind).toBe('repair-status');

    const generic = getRepairProductionPresentation(repair('in_production'), null);
    expect(generic.label).toBe('Στην Παραγωγή');
  });

  it('βρίσκει την ενεργή παρτίδα από repair_item_id', () => {
    const live = batch({ id: 'ΕΠ-live' });
    const found = findLiveRepairBatch('repair-1', [], [live, batch({ id: 'other', repair_item_id: 'repair-2' })]);
    expect(found?.id).toBe('ΕΠ-live');
  });

  it('μετρά μόνο μη αρχειοθετημένες επισκευές με ενεργή παρτίδα', () => {
    const live = batch();
    expect(countRepairsInProduction([
      repair('in_production'),
      { ...repair('in_production'), id: 'repair-2', is_archived: true },
    ], [live, batch({ id: 'archived-batch', repair_item_id: 'repair-2' })])).toBe(1);
  });

  it('αναγνωρίζει παρτίδα Επισκευής και το μήνυμα Έτοιμα', () => {
    expect(isRepairProductionBatch(batch())).toBe(true);
    expect(isRepairProductionBatch(batch({ workflow_kind: 'order', repair_item_id: undefined }))).toBe(false);
    expect(repairReadyConfirmMessage(['ΕΠ-1', 'ΕΠ-2'])).toContain('2 επισκευές');
    expect(repairReadyConfirmMessage(['ΕΠ-1'])).toContain('ΕΠ-1');
  });
});
