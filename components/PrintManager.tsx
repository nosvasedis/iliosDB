import React, { useEffect, useRef } from 'react';
import { Product, ProductVariant, Order, ProductionBatch, AggregatedData, Offer, SupplierOrder, GlobalSettings, AssemblyPrintData, StageBatchPrintData, AssemblyPrintRow, OrderShipment, OrderShipmentItem } from '../types';
import OrderInvoiceView from './OrderInvoiceView';
import ShipmentInvoiceView from './ShipmentInvoiceView';
import OfferPrintView from './OfferPrintView';
import SupplierOrderPrintView from './SupplierOrderPrintView';
import AggregatedProductionView from './AggregatedProductionView';
import PreparationView from './PreparationView';
import TechnicianView from './TechnicianView';
import AssemblyPrintView from './AssemblyPrintView';
import PriceListPrintView, { PriceListPrintData } from './PriceListPrintView';
import AnalyticsPrintReport from './AnalyticsPrintReport';
import OrderFinancialReport from './OrderFinancialReport';
import BarcodeView from './BarcodeView';
import PhotoCatalogPrintView from './PhotoCatalogPrintView';
import StageBatchPrintView from './StageBatchPrintView';
import { transliterateForBarcode } from '../utils/pricingEngine';

interface PrintManagerProps {
    settings: GlobalSettings | undefined;
    products: Product[] | undefined;
    materials: any[] | undefined;
    molds: any[] | undefined;
    printItems: { product: Product, variant?: ProductVariant, quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[];
    orderToPrint: Order | null;
    remainingOrderToPrint: Order | null;
    shipmentToPrint: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null;
    shipmentsToPrint: Array<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }> | null;
    offerToPrint: Offer | null;
    supplierOrderToPrint: SupplierOrder | null;
    aggregatedPrintData: AggregatedData | null;
    preparationPrintData: { batches: ProductionBatch[] } | null;
    technicianPrintData: { batches: ProductionBatch[] } | null;
    assemblyPrintData: AssemblyPrintData | null;
    priceListPrintData: PriceListPrintData | null;
    analyticsPrintData: any | null;
    orderAnalyticsData: { stats: any, order: Order } | null;
    photoCatalogPrintData: Product[] | null;
    stageBatchPrintData: StageBatchPrintData | null;
    setPrintItems: (items: []) => void;
    setOrderToPrint: (order: Order | null) => void;
    setRemainingOrderToPrint: (order: Order | null) => void;
    setShipmentToPrint: (shipment: { order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] } | null) => void;
    setShipmentsToPrint: (shipments: Array<{ order: Order; shipment: OrderShipment; shipmentItems: OrderShipmentItem[] }> | null) => void;
    setOfferToPrint: (offer: Offer | null) => void;
    setSupplierOrderToPrint: (order: SupplierOrder | null) => void;
    setAggregatedPrintData: (data: AggregatedData | null) => void;
    setPreparationPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    setTechnicianPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    setAssemblyPrintData: (data: AssemblyPrintData | null) => void;
    setPriceListPrintData: (data: PriceListPrintData | null) => void;
    setAnalyticsPrintData: (data: any | null) => void;
    setOrderAnalyticsData: (data: { stats: any, order: Order } | null) => void;
    setPhotoCatalogPrintData: (data: Product[] | null) => void;
    setStageBatchPrintData: (data: StageBatchPrintData | null) => void;
}

export const PrintManager: React.FC<PrintManagerProps> = ({
    settings, products, materials, molds,
    printItems, orderToPrint, remainingOrderToPrint, shipmentToPrint, shipmentsToPrint, offerToPrint, supplierOrderToPrint,
    aggregatedPrintData, preparationPrintData,
    technicianPrintData, assemblyPrintData, priceListPrintData, analyticsPrintData,
    orderAnalyticsData, photoCatalogPrintData, stageBatchPrintData,
    setPrintItems, setOrderToPrint, setRemainingOrderToPrint, setShipmentToPrint, setShipmentsToPrint, setOfferToPrint, setSupplierOrderToPrint,
    setAggregatedPrintData, setPreparationPrintData,
    setTechnicianPrintData, setAssemblyPrintData, setPriceListPrintData, setAnalyticsPrintData,
    setOrderAnalyticsData, setPhotoCatalogPrintData, setStageBatchPrintData
}) => {
    const printContainerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const sanitizeFilename = (value: string) => value
        .replace(/[\s\W]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const getSafeClientName = (name?: string) => {
        if (!name) return '';
        return sanitizeFilename(transliterateForBarcode(name).trim());
    };

    const getSingleOrderFromBatches = (batches: ProductionBatch[]) => {
        const orderIds = [...new Set(batches.map(b => b.order_id).filter(Boolean))] as string[];
        if (orderIds.length !== 1) return null;
        const enriched = batches as Array<ProductionBatch & { customer_name?: string }>;
        const customerName = enriched.find(b => b.customer_name)?.customer_name;
        return { orderId: orderIds[0], customerName };
    };

    const getSingleOrderFromAssemblyRows = (rows: AssemblyPrintRow[]) => {
        const orderIds = [...new Set(rows.map(r => r.order_id).filter(Boolean))];
        if (orderIds.length !== 1) return null;
        const orderId = orderIds[0];
        const customerName = rows.find(r => r.order_id === orderId)?.customer_name;
        return { orderId, customerName };
    };

    useEffect(() => {
        const shouldPrint = printItems.length > 0 || orderToPrint || remainingOrderToPrint || shipmentToPrint || (shipmentsToPrint && shipmentsToPrint.length > 0) || offerToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData || assemblyPrintData || priceListPrintData || analyticsPrintData || orderAnalyticsData || supplierOrderToPrint || (photoCatalogPrintData && photoCatalogPrintData.length > 0) || stageBatchPrintData;
        if (shouldPrint && settings && products && materials) {
            const timer = setTimeout(() => {
                const printContent = printContainerRef.current;
                const iframe = iframeRef.current;
                if (!printContent || !iframe) return;

                const iframeDoc = iframe.contentWindow?.document;
                if (!iframeDoc) return;

                let docTitle = 'Ilios_Print_Job';
                const dateStr = new Date().toISOString().split('T')[0];
                const previousWindowTitle = document.title;
                let titleRestored = false;
                const restoreWindowTitle = () => {
                    if (!titleRestored) {
                        document.title = previousWindowTitle;
                        titleRestored = true;
                    }
                };

                if (photoCatalogPrintData && photoCatalogPrintData.length > 0) {
                    const dateStr = new Date().toISOString().split('T')[0];
                    docTitle = `Photo_Catalog_${dateStr}_${photoCatalogPrintData.length}items`;
                } else if (priceListPrintData) {
                    docTitle = priceListPrintData.title;
                } else if (orderAnalyticsData) {
                    const safeName = getSafeClientName(orderAnalyticsData.order.customer_name);
                    docTitle = `Analytics_${safeName || 'Order'}_${orderAnalyticsData.order.id}`;
                } else if (analyticsPrintData) {
                    docTitle = `Economics_${dateStr}`;
                } else if (remainingOrderToPrint) {
                    const safeName = getSafeClientName(remainingOrderToPrint.customer_name);
                    docTitle = `Remaining_Items_${safeName || 'Client'}_${remainingOrderToPrint.id}`;
                } else if (shipmentsToPrint && shipmentsToPrint.length > 0) {
                    const safeName = getSafeClientName(shipmentsToPrint[0].order.customer_name);
                    const orderId = shipmentsToPrint[0].order.id;
                    const numbers = shipmentsToPrint.map(s => s.shipment.shipment_number).join('-');
                    docTitle = `Shipments_${safeName || 'Client'}_${orderId}_${numbers}`;
                } else if (shipmentToPrint) {
                    const safeName = getSafeClientName(shipmentToPrint.order.customer_name);
                    docTitle = `Shipment_${safeName || 'Client'}_${shipmentToPrint.order.id}_${shipmentToPrint.shipment.shipment_number}`;
                } else if (orderToPrint) {
                    const safeName = getSafeClientName(orderToPrint.customer_name);
                    docTitle = `Order_${safeName || 'Client'}_${orderToPrint.id}`;
                } else if (offerToPrint) {
                    const safeName = getSafeClientName(offerToPrint.customer_name);
                    docTitle = `Offer_${safeName || 'Client'}_${offerToPrint.id}`;
                } else if (supplierOrderToPrint) {
                    docTitle = `PO_${supplierOrderToPrint.supplier_name.replace(/[\s\W]+/g, '_')}_${supplierOrderToPrint.id.slice(0, 6)}`;
                } else if (aggregatedPrintData) {
                    if (aggregatedPrintData.orderId) {
                        const safeName = getSafeClientName(aggregatedPrintData.customerName);
                        docTitle = `Production_${safeName || 'Order'}_${aggregatedPrintData.orderId}`;
                    } else {
                        docTitle = `Production_Summary_${dateStr}`;
                    }
                } else if (preparationPrintData) {
                    const singleOrder = getSingleOrderFromBatches(preparationPrintData.batches);
                    if (singleOrder) {
                        const safeName = getSafeClientName(singleOrder.customerName);
                        docTitle = `Preparation_${safeName || 'Order'}_${singleOrder.orderId}`;
                    } else {
                        docTitle = `Preparation_Sheet_${dateStr}`;
                    }
                } else if (technicianPrintData) {
                    const singleOrder = getSingleOrderFromBatches(technicianPrintData.batches);
                    if (singleOrder) {
                        const safeName = getSafeClientName(singleOrder.customerName);
                        docTitle = `Technician_${safeName || 'Order'}_${singleOrder.orderId}`;
                    } else {
                        docTitle = `Technician_Sheet_${dateStr}`;
                    }
                } else if (assemblyPrintData) {
                    const singleOrder = getSingleOrderFromAssemblyRows(assemblyPrintData.rows);
                    if (singleOrder) {
                        const safeName = getSafeClientName(singleOrder.customerName);
                        docTitle = `Synarmologisi_${safeName || 'Paraggelia'}_${singleOrder.orderId}`;
                    } else {
                        docTitle = `Synarmologisi_Fyllo_${dateStr}`;
                    }
                } else if (printItems.length > 0) {
                    const format = printItems[0].format || 'standard';
                    const totalQty = printItems.reduce((acc, item) => acc + item.quantity, 0);

                    if (printItems.length === 1) {
                        const item = printItems[0];
                        const sku = item.variant ? item.product.sku + item.variant.suffix : item.product.sku;
                        docTitle = `Label_${sku}_${format}`;
                    } else {
                        const firstSku = printItems[0].product.sku;
                        const allSameProduct = printItems.every(i => i.product.sku === firstSku);
                        if (allSameProduct) {
                            docTitle = `Labels_${firstSku}_Variants_${format}_${totalQty}qty`;
                        } else {
                            docTitle = `Labels_Batch_${format}_${totalQty}qty_${dateStr}`;
                        }
                    }
                } else if (stageBatchPrintData) {
                    const safeName = getSafeClientName(stageBatchPrintData.customerName);
                    docTitle = `Stage_${stageBatchPrintData.stageId}_${safeName || 'Order'}_${dateStr}`;
                }

                docTitle = sanitizeFilename(docTitle) || 'Ilios_Print_Job';
                document.title = docTitle;

                const cleanup = () => {
                    setPrintItems([]); setOrderToPrint(null); setRemainingOrderToPrint(null); setShipmentToPrint(null); setOfferToPrint(null);
                    setAggregatedPrintData(null); setPreparationPrintData(null);
                    setTechnicianPrintData(null); setAssemblyPrintData(null); setPriceListPrintData(null);
                    setAnalyticsPrintData(null); setOrderAnalyticsData(null);
                    setSupplierOrderToPrint(null); setPhotoCatalogPrintData(null);
                    setStageBatchPrintData(null);
                    setShipmentsToPrint(null);
                    restoreWindowTitle();
                };

                iframeDoc.open();

                let styles = '';
                document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
                    styles += el.outerHTML;
                });

                iframeDoc.write(`
                  <html>
                    <head>
                      <title>${docTitle}</title>
                      ${styles}
                      <style>
                        body { background: white !important; margin: 0; padding: 0; }
                        .print-view { display: block !important; }
                        .print-area { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; }
                        .label-container { 
                            page-break-after: always !important; 
                            break-after: page !important;
                            margin: 0 !important;
                            display: flex !important;
                        }
                        @media print {
                          @page { size: auto; margin: 0; }
                          html, body { height: 100%; margin: 0 !important; padding: 0 !important; }
                          .label-container { display: flex !important; }
                        }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                      </style>
                    </head>
                    <body>
                      <div class="print-view">
                        ${printContent.innerHTML}
                      </div>
                      <script>
                        window.onload = function() {
                          setTimeout(function() {
                            window.focus();
                            window.print();
                          }, 500);
                        };
                      </script>
                    </body>
                  </html>
                `);
                iframeDoc.close();

                const handleAfterPrint = () => {
                    cleanup();
                    window.removeEventListener('focus', handleAfterPrint);
                };
                window.addEventListener('focus', handleAfterPrint, { once: true });
                setTimeout(cleanup, 30000);

            }, 800);

            return () => clearTimeout(timer);
        }
}, [printItems, orderToPrint, remainingOrderToPrint, shipmentToPrint, shipmentsToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, assemblyPrintData, priceListPrintData, analyticsPrintData, offerToPrint, orderAnalyticsData, supplierOrderToPrint, photoCatalogPrintData, stageBatchPrintData, settings, products, materials]);

    if (!settings || !products || !materials || !molds) return null;

    return (
        <>
            <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
                {orderToPrint && <OrderInvoiceView order={orderToPrint} revisionSuffix={(orderToPrint as any)._revisionSuffix} />}
                {remainingOrderToPrint && <OrderInvoiceView order={remainingOrderToPrint} title="Υπόλοιπα Είδη Παραγγελίας" />}
                {shipmentsToPrint && shipmentsToPrint.length > 0 && shipmentsToPrint.map((s, idx) => (
                    <ShipmentInvoiceView
                        key={`${s.shipment.id}-${idx}`}
                        order={s.order}
                        shipment={s.shipment}
                        shipmentItems={s.shipmentItems}
                        products={products}
                    />
                ))}
                {shipmentToPrint && <ShipmentInvoiceView order={shipmentToPrint.order} shipment={shipmentToPrint.shipment} shipmentItems={shipmentToPrint.shipmentItems} products={products} />}
                {offerToPrint && <OfferPrintView offer={offerToPrint} />}
                {supplierOrderToPrint && <SupplierOrderPrintView order={supplierOrderToPrint} products={products} />}
                {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
                {preparationPrintData && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
                {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
                {assemblyPrintData && <AssemblyPrintView rows={assemblyPrintData.rows} allProducts={products} allMaterials={materials} />}
                {priceListPrintData && <PriceListPrintView data={priceListPrintData} />}
                {analyticsPrintData && <AnalyticsPrintReport stats={analyticsPrintData} title={analyticsPrintData.title} />}
                {orderAnalyticsData && (
                    <OrderFinancialReport
                        stats={orderAnalyticsData.stats}
                        orderId={orderAnalyticsData.order.id}
                        customerName={orderAnalyticsData.order.customer_name}
                        date={new Date().toLocaleDateString('el-GR')}
                        silverPrice={orderAnalyticsData.order.custom_silver_rate || settings.silver_price_gram}
                    />
                )}
                {printItems.length > 0 && (
                    <div className="print-area">
                        {printItems.flatMap(item => Array.from({ length: item.quantity }, () => ({ product: item.product, variant: item.variant, size: item.size, format: item.format || 'standard' }))).map((item, idx) => (
                            <BarcodeView
                                key={`${idx}`}
                                product={item.product}
                                variant={item.variant}
                                width={item.format === 'retail' ? (settings.retail_barcode_width_mm || 40) : settings.barcode_width_mm}
                                height={item.format === 'retail' ? (settings.retail_barcode_height_mm || 20) : settings.barcode_height_mm}
                                format={item.format}
                                size={item.size}
                            />
                        ))}
                    </div>
                )}
                {photoCatalogPrintData && photoCatalogPrintData.length > 0 && (
                    <PhotoCatalogPrintView
                        products={photoCatalogPrintData}
                        molds={molds}
                        date={new Date().toLocaleDateString('el-GR')}
                    />
                )}
                {stageBatchPrintData && products && (
                    <StageBatchPrintView data={stageBatchPrintData} allProducts={products} />
                )}
            </div>
            <iframe
                ref={iframeRef}
                id="print-iframe"
                style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }}
                title="Print Bridge"
            ></iframe>
        </>
    );
};
