import React from 'react';
import {
    CheckCircle,
    Flame,
    Gem,
    Globe,
    Hammer,
    Layers,
    Package,
    Tag,
} from 'lucide-react';
import { ProductionStage } from '../../types';
import { PRODUCTION_STAGES } from '../../utils/productionStages';
import type { FinderStageMeta } from './ProductionFinderResultRow';

const STAGE_ICONS: Record<ProductionStage, React.ReactNode> = {
    [ProductionStage.AwaitingDelivery]: <Globe size={20} />,
    [ProductionStage.Waxing]: <Package size={20} />,
    [ProductionStage.Casting]: <Flame size={20} />,
    [ProductionStage.Setting]: <Gem size={20} />,
    [ProductionStage.Polishing]: <Hammer size={20} />,
    [ProductionStage.Assembly]: <Layers size={20} />,
    [ProductionStage.Labeling]: <Tag size={20} />,
    [ProductionStage.Ready]: <CheckCircle size={20} />,
};

export const FINDER_STAGE_META_BY_ID = new Map<ProductionStage, FinderStageMeta>(
    PRODUCTION_STAGES.map((stage) => [
        stage.id,
        {
            id: stage.id,
            label: stage.label,
            color: stage.colorKey,
            icon: STAGE_ICONS[stage.id],
        },
    ]),
);
