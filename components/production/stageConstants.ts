import { ProductionStage } from '../../types';
import { PRODUCTION_STAGES, getProductionStageShortLabel } from '../../utils/productionStages';
import { getStageColorKey } from '../../features/production/selectors';

export const STAGES = PRODUCTION_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    color:
        stage.id === ProductionStage.AwaitingDelivery ? 'bg-indigo-100/60 border-indigo-200 text-indigo-800' :
        stage.id === ProductionStage.Waxing ? 'bg-slate-100 border-slate-200 text-slate-800' :
        stage.id === ProductionStage.Casting ? 'bg-orange-100/60 border-orange-200 text-orange-800' :
        stage.id === ProductionStage.Setting ? 'bg-purple-100/60 border-purple-200 text-purple-800' :
        stage.id === ProductionStage.Polishing ? 'bg-blue-100/60 border-blue-200 text-blue-800' :
        stage.id === ProductionStage.Assembly ? 'bg-pink-100/60 border-pink-200 text-pink-800' :
        stage.id === ProductionStage.Labeling ? 'bg-yellow-100/60 border-yellow-200 text-yellow-800' :
        'bg-emerald-100/60 border-emerald-200 text-emerald-800'
}));

export const STAGE_SHORT_LABELS: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: getProductionStageShortLabel(ProductionStage.AwaitingDelivery),
    [ProductionStage.Waxing]: getProductionStageShortLabel(ProductionStage.Waxing),
    [ProductionStage.Casting]: getProductionStageShortLabel(ProductionStage.Casting),
    [ProductionStage.Setting]: getProductionStageShortLabel(ProductionStage.Setting),
    [ProductionStage.Polishing]: getProductionStageShortLabel(ProductionStage.Polishing),
    [ProductionStage.Assembly]: getProductionStageShortLabel(ProductionStage.Assembly),
    [ProductionStage.Labeling]: getProductionStageShortLabel(ProductionStage.Labeling),
    [ProductionStage.Ready]: getProductionStageShortLabel(ProductionStage.Ready)
};

export const STAGE_BUTTON_COLORS: Record<string, { bg: string, text: string, border: string }> = {
    'AwaitingDelivery': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
    'Waxing': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
    'Casting': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    'Setting': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
    'Polishing': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    'Assembly': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    'Labeling': { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
    'Ready': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

export const VIBRANT_STAGES: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-500',
    [ProductionStage.Waxing]: 'bg-slate-500',
    [ProductionStage.Casting]: 'bg-orange-500',
    [ProductionStage.Setting]: 'bg-purple-500',
    [ProductionStage.Polishing]: 'bg-blue-500',
    [ProductionStage.Assembly]: 'bg-pink-500',
    [ProductionStage.Labeling]: 'bg-yellow-500',
    [ProductionStage.Ready]: 'bg-emerald-500'
};

export const VIBRANT_STAGES_600: Record<string, string> = {
    [ProductionStage.AwaitingDelivery]: 'bg-indigo-600',
    [ProductionStage.Waxing]: 'bg-slate-600',
    [ProductionStage.Casting]: 'bg-orange-600',
    [ProductionStage.Setting]: 'bg-purple-600',
    [ProductionStage.Polishing]: 'bg-blue-600',
    [ProductionStage.Assembly]: 'bg-pink-600',
    [ProductionStage.Labeling]: 'bg-yellow-600',
    [ProductionStage.Ready]: 'bg-emerald-600'
};

export { getStageColorKey };
