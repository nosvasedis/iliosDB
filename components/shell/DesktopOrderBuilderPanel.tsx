import React from 'react';
import DesktopOrderBuilder from '../DesktopOrderBuilder';
import IliosLoader from '../ui/IliosLoader';
import { useCustomers } from '../../hooks/api/useOrders';
import { useCollections } from '../../hooks/api/useCollections';
import { Order, Product } from '../../types';

interface Props {
    onBack: () => void;
    initialOrder: Order | null;
    products: Product[];
}

/** The admin desktop order builder in a card, fed with customers/collections only once it opens. */
export default function DesktopOrderBuilderPanel({ onBack, initialOrder, products }: Props) {
    const { data: customers, isLoading } = useCustomers();
    const { data: collections } = useCollections();

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-lg">
            {isLoading && !customers ? (
                <IliosLoader variant="section" detail="Πελάτες" className="h-full" />
            ) : (
                <DesktopOrderBuilder
                    onBack={onBack}
                    initialOrder={initialOrder}
                    products={products}
                    customers={customers || []}
                    collections={collections || []}
                />
            )}
        </div>
    );
}
