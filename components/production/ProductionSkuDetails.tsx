import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Collection, Material, Product } from '../../types';
import { useSettings } from '../../hooks/api/useSettings';
import { useMolds } from '../../hooks/api/useMolds';
import { usePrint } from '../PrintContext';
import ProductDetails from '../ProductDetails';

interface Props {
    product: Product;
    initialVariantSuffix?: string;
    products: Product[];
    materials: Material[];
    collections: Collection[];
    onClose: () => void;
}

export default function ProductionSkuDetails({ product, initialVariantSuffix, products, materials, collections, onClose }: Props) {
    const settings = useSettings();
    const molds = useMolds();
    const { setPrintItems } = usePrint();

    if (!settings.data || !molds.data) {
        const failed = settings.isError || molds.isError;
        return (
            <div className="fixed inset-0 z-[650] flex items-center justify-center bg-slate-900/60 p-4">
                <div className="rounded-2xl bg-white p-6 text-center shadow-xl" role="status">
                    {!failed && <Loader2 size={24} className="mx-auto mb-3 animate-spin text-slate-500" />}
                    <p className="text-sm font-bold text-slate-700">{failed ? 'Δεν ήταν δυνατή η φόρτωση των στοιχείων SKU.' : 'Φόρτωση στοιχείων SKU…'}</p>
                    {failed && <button type="button" onClick={() => { void settings.refetch(); void molds.refetch(); }} className="mt-4 mr-3 text-sm font-bold text-blue-600">Επανάληψη</button>}
                    <button type="button" onClick={onClose} className="mt-4 text-sm font-bold text-slate-500">Κλείσιμο</button>
                </div>
            </div>
        );
    }

    return (
        <ProductDetails
            product={product}
            initialVariantSuffix={initialVariantSuffix}
            allProducts={products}
            allMaterials={materials}
            collections={collections}
            allMolds={molds.data}
            settings={settings.data}
            setPrintItems={setPrintItems}
            onClose={onClose}
            zIndex={650}
        />
    );
}
