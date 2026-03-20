import { getVariantComponents } from './pricingEngine';
import { Material, Mold, Product, ProductionBatch, RecipeItem } from '../types';

export type BatchBuildData = {
    molds: Array<{
        code: string;
        quantity: number;
        location: string;
        description?: string;
    }>;
    recipe: Array<{
        type: RecipeItem['type'];
        name: string;
        description: string;
        unit: string;
        qtyPerUnit: number;
        totalQtyRequired: number;
    }>;
    description: string;
    totalSilverWeight: number;
};

export function buildBatchBuildData(
    batch: ProductionBatch,
    product: Product,
    allMaterials: Material[],
    allMolds: Mold[],
    allProducts: Product[]
): BatchBuildData {
    // 1. Molds
    const requiredMolds = product.molds.map(pm => {
        const details = allMolds.find(m => m.code === pm.code);
        return {
            code: pm.code,
            quantity: pm.quantity,
            location: details?.location || '-',
            description: details?.description
        };
    });

    // 2. Recipe (With Totals and Descriptions)
    const recipeItems = product.recipe.map(item => {
        let name = '';
        let description = '';
        let unit = 'τεμ';

        if (item.type === 'raw') {
            const mat = allMaterials.find(m => m.id === item.id);
            name = mat?.name || `Material #${item.id}`;
            description = mat?.description || '';
            unit = mat?.unit || 'τεμ';
        } else {
            const comp = allProducts.find(p => p.sku === item.sku);
            name = item.sku;
            description = comp?.description || comp?.category || '';
        }

        return {
            type: item.type,
            name,
            description,
            unit,
            qtyPerUnit: item.quantity,
            totalQtyRequired: item.quantity * batch.quantity
        };
    });

    // 3. Variant Info
    const { finish, stone } = getVariantComponents(batch.variant_suffix || '', product.gender);
    const fullDescription = [product.category, finish.name, stone.name].filter(Boolean).join(' • ');

    return {
        molds: requiredMolds,
        recipe: recipeItems,
        description: fullDescription,
        totalSilverWeight: (product.weight_g + (product.secondary_weight_g || 0)) * batch.quantity
    };
}

