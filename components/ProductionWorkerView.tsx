





import React from 'react';
import { ProductionBatch, Mold, Product, Material, RecipeItem, ProductionType } from '../types';
import { APP_LOGO } from '../constants';
import { Box, MapPin, ImageIcon, Tag, Factory, RefreshCcw, Globe } from 'lucide-react';

interface Props {
    batch: ProductionBatch;
    allMolds: Mold[];
    allProducts: Product[];
    allMaterials: Material[];
}

export default function ProductionWorkerView({ batch, allMolds, allProducts, allMaterials }: Props) {
    const product = batch.product_details;
    if (!product) {
        return <div className="p-8 text-center text-red-500">Product details not found for this batch.</div>;
    }

    const fullSku = product.sku + (batch.variant_suffix || '');
    const variant = product.variants?.find(v => v.suffix === batch.variant_suffix);
    const description = variant?.description || product.category;

    const requiredMolds = product.molds
        .map(pm => {
            const details = allMolds.find(m => m.code === pm.code);
            return details ? { ...details, quantity: pm.quantity } : null;
        })
        .filter((m): m is (Mold & { quantity: number }) => !!m);

    const recipeItems = product.recipe.map(item => {
        if (item.type === 'raw') {
            const details = allMaterials.find(m => m.id === item.id);
            return {
                name: details?.name || `Υλικό #${item.id}`,
                quantity: item.quantity,
                unit: details?.unit || 'τεμ'
            };
        } else { // component
            const details = allProducts.find(p => p.sku === item.sku);
            return {
                name: details?.sku || item.sku,
                quantity: item.quantity,
                unit: 'τεμ'
            };
        }
    });

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('el-GR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    return (
        <div className="w-full bg-white text-slate-900 p-8 font-sans text-sm leading-normal h-full flex flex