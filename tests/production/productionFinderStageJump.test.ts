import { describe, expect, it } from 'vitest';
import { ProductionStage } from '../../types';
import {
    getFinderJumpGroupKey,
    getFinderStageJumpTargets,
    resolveActiveJumpGroupIndex,
    resolveNextJumpRowIndex,
    resolvePreviousJumpRowIndex,
} from '../../utils/productionFinderStageJump';

describe('productionFinderStageJump', () => {
    it('splits Τεχνίτης into pending and dispatched jump groups', () => {
        const batches = [
            { current_stage: ProductionStage.Waxing, pending_dispatch: false },
            { current_stage: ProductionStage.Polishing, pending_dispatch: true },
            { current_stage: ProductionStage.Polishing, pending_dispatch: true },
            { current_stage: ProductionStage.Polishing, pending_dispatch: false },
            { current_stage: ProductionStage.Casting, pending_dispatch: false },
        ];

        const targets = getFinderStageJumpTargets(batches);
        expect(targets.map((t) => t.groupKey)).toEqual([
            ProductionStage.Waxing,
            'Polishing:pending',
            'Polishing:dispatched',
            ProductionStage.Casting,
        ]);
        expect(targets[1].label).toContain('Αναμονή');
        expect(targets[2].label).toContain('Στον Τεχν');
        expect(targets[1].index).toBe(1);
        expect(targets[2].index).toBe(3);
    });

    it('resolves next jump from scroll anchor across groups', () => {
        const batches = [
            { current_stage: ProductionStage.AwaitingDelivery },
            { current_stage: ProductionStage.Waxing },
            { current_stage: ProductionStage.Casting },
        ];
        const targets = getFinderStageJumpTargets(batches);

        expect(resolveActiveJumpGroupIndex(targets, 0)).toBe(0);
        expect(resolveNextJumpRowIndex(targets, 0)).toBe(1);
        expect(resolveNextJumpRowIndex(targets, 1)).toBe(2);
        expect(resolveNextJumpRowIndex(targets, 2)).toBe(0);
        expect(resolvePreviousJumpRowIndex(targets, 0)).toBe(2);
        expect(resolvePreviousJumpRowIndex(targets, 1)).toBe(0);
        expect(resolvePreviousJumpRowIndex(targets, 2)).toBe(1);
    });

    it('builds polishing group keys', () => {
        expect(
            getFinderJumpGroupKey({
                current_stage: ProductionStage.Polishing,
                pending_dispatch: true,
            }),
        ).toBe('Polishing:pending');
        expect(
            getFinderJumpGroupKey({
                current_stage: ProductionStage.Polishing,
                pending_dispatch: false,
            }),
        ).toBe('Polishing:dispatched');
    });
});
