import React, { createContext, useContext, useState } from 'react';
import { Product, ProductVariant, Order, ProductionBatch, AggregatedData, Offer, SupplierOrder, AssemblyPrintData, StageBatchPrintData, OrderShipment, OrderShipmentItem } from '../types';
import { PriceListPrintData } from './PriceListPrintView';

interface PrintItem {
    product: Product;
    variant?: ProductVariant;
    quantity: number;
    size?: string;
    format?: 'standard' | 'simple' | 'retail';
}

interface PrintContextType {
    printItems: PrintItem[];
    setPrintItems: (items: PrintItem[]) => void;
    orderToPrint: Order | null;
    setOrderToPrint: (order: Order | null) => void;
    remainingOrderToPrint: Order | null;
    setRemainingOrderToPrint: (order: Order | null) => void;
    shipmentToPrint: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null;
    setShipmentToPrint: (shipment: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null) => void;
    offerToPrint: Offer | null;
    setOfferToPrint: (offer: Offer | null) => void;
    supplierOrderToPrint: SupplierOrder | null;
    setSupplierOrderToPrint: (order: SupplierOrder | null) => void;
    batchToPrint: ProductionBatch | null;
    setBatchToPrint: (batch: ProductionBatch | null) => void;
    aggregatedPrintData: AggregatedData | null;
    setAggregatedPrintData: (data: AggregatedData | null) => void;
    preparationPrintData: { batches: ProductionBatch[] } | null;
    setPreparationPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    technicianPrintData: { batches: ProductionBatch[] } | null;
    setTechnicianPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    assemblyPrintData: AssemblyPrintData | null;
    setAssemblyPrintData: (data: AssemblyPrintData | null) => void;
    priceListPrintData: PriceListPrintData | null;
    setPriceListPrintData: (data: PriceListPrintData | null) => void;
    analyticsPrintData: any | null;
    setAnalyticsPrintData: (data: any | null) => void;
    orderAnalyticsData: { stats: any; order: Order } | null;
    setOrderAnalyticsData: (data: { stats: any; order: Order } | null) => void;
    stageBatchPrintData: StageBatchPrintData | null;
    setStageBatchPrintData: (data: StageBatchPrintData | null) => void;
}

const PrintContext = createContext<PrintContextType | undefined>(undefined);

export const usePrint = () => {
    const context = useContext(PrintContext);
    if (!context) {
        throw new Error('usePrint must be used within a PrintProvider');
    }
    return context;
};

export const PrintProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [printItems, setPrintItems] = useState<PrintItem[]>([]);
    const [orderToPrint, setOrderToPrint] = useState<Order | null>(null);
    const [remainingOrderToPrint, setRemainingOrderToPrint] = useState<Order | null>(null);
    const [shipmentToPrint, setShipmentToPrint] = useState<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null>(null);
    const [offerToPrint, setOfferToPrint] = useState<Offer | null>(null);
    const [supplierOrderToPrint, setSupplierOrderToPrint] = useState<SupplierOrder | null>(null);
    const [batchToPrint, setBatchToPrint] = useState<ProductionBatch | null>(null);
    const [aggregatedPrintData, setAggregatedPrintData] = useState<AggregatedData | null>(null);
    const [preparationPrintData, setPreparationPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
    const [technicianPrintData, setTechnicianPrintData] = useState<{ batches: ProductionBatch[] } | null>(null);
    const [assemblyPrintData, setAssemblyPrintData] = useState<AssemblyPrintData | null>(null);
    const [priceListPrintData, setPriceListPrintData] = useState<PriceListPrintData | null>(null);
    const [analyticsPrintData, setAnalyticsPrintData] = useState<any | null>(null);
    const [orderAnalyticsData, setOrderAnalyticsData] = useState<{ stats: any; order: Order } | null>(null);
    const [stageBatchPrintData, setStageBatchPrintData] = useState<StageBatchPrintData | null>(null);

    return (
        <PrintContext.Provider
            value={{
                printItems, setPrintItems,
                orderToPrint, setOrderToPrint,
                remainingOrderToPrint, setRemainingOrderToPrint,
                shipmentToPrint, setShipmentToPrint,
                offerToPrint, setOfferToPrint,
                supplierOrderToPrint, setSupplierOrderToPrint,
                batchToPrint, setBatchToPrint,
                aggregatedPrintData, setAggregatedPrintData,
                preparationPrintData, setPreparationPrintData,
                technicianPrintData, setTechnicianPrintData,
                assemblyPrintData, setAssemblyPrintData,
                priceListPrintData, setPriceListPrintData,
                analyticsPrintData, setAnalyticsPrintData,
                orderAnalyticsData, setOrderAnalyticsData,
                stageBatchPrintData, setStageBatchPrintData,
            }}
        >
            {children}
        </PrintContext.Provider>
    );
};
