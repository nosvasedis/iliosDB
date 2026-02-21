import React, { useEffect, useRef } from 'react';
import { Product, ProductVariant, Order, ProductionBatch, AggregatedData, PriceListPrintData, Offer, SupplierOrder } from '../types';
import { GlobalSettings } from '../types';
import OrderInvoiceView from './OrderInvoiceView';
import OfferPrintView from './OfferPrintView';
import SupplierOrderPrintView from './SupplierOrderPrintView';
import ProductionWorkerView from './ProductionWorkerView';
import AggregatedProductionView from './AggregatedProductionView';
import PreparationView from './PreparationView';
import TechnicianView from './TechnicianView';
import PriceListPrintView from './PriceListPrintView';
import AnalyticsPrintReport from './AnalyticsPrintReport';
import OrderFinancialReport from './OrderFinancialReport';
import BarcodeView from './BarcodeView';
import { transliterateForBarcode } from '../utils/pricingEngine';

interface PrintManagerProps {
    settings: GlobalSettings | undefined;
    products: Product[] | undefined;
    materials: any[] | undefined;
    molds: any[] | undefined;
    printItems: { product: Product, variant?: ProductVariant, quantity: number, size?: string, format?: 'standard' | 'simple' | 'retail' }[];
    orderToPrint: Order | null;
    offerToPrint: Offer | null;
    supplierOrderToPrint: SupplierOrder | null;
    batchToPrint: ProductionBatch | null;
    aggregatedPrintData: AggregatedData | null;
    preparationPrintData: { batches: ProductionBatch[] } | null;
    technicianPrintData: { batches: ProductionBatch[] } | null;
    priceListPrintData: PriceListPrintData | null;
    analyticsPrintData: any | null;
    orderAnalyticsData: { stats: any, order: Order } | null;
    setPrintItems: (items: []) => void;
    setOrderToPrint: (order: Order | null) => void;
    setOfferToPrint: (offer: Offer | null) => void;
    setSupplierOrderToPrint: (order: SupplierOrder | null) => void;
    setBatchToPrint: (batch: ProductionBatch | null) => void;
    setAggregatedPrintData: (data: AggregatedData | null) => void;
    setPreparationPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    setTechnicianPrintData: (data: { batches: ProductionBatch[] } | null) => void;
    setPriceListPrintData: (data: PriceListPrintData | null) => void;
    setAnalyticsPrintData: (data: any | null) => void;
    setOrderAnalyticsData: (data: { stats: any, order: Order } | null) => void;
}

export const PrintManager: React.FC<PrintManagerProps> = ({
    settings, products, materials, molds,
    printItems, orderToPrint, offerToPrint, supplierOrderToPrint,
    batchToPrint, aggregatedPrintData, preparationPrintData,
    technicianPrintData, priceListPrintData, analyticsPrintData,
    orderAnalyticsData,
    setPrintItems, setOrderToPrint, setOfferToPrint, setSupplierOrderToPrint,
    setBatchToPrint, setAggregatedPrintData, setPreparationPrintData,
    setTechnicianPrintData, setPriceListPrintData, setAnalyticsPrintData,
    setOrderAnalyticsData
}) => {
    const printContainerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const shouldPrint = printItems.length > 0 || orderToPrint || offerToPrint || batchToPrint || aggregatedPrintData || preparationPrintData || technicianPrintData || priceListPrintData || analyticsPrintData || orderAnalyticsData || supplierOrderToPrint;
        if (shouldPrint && settings && products && materials) {
            const timer = setTimeout(() => {
                const printContent = printContainerRef.current;
                const iframe = iframeRef.current;
                if (!printContent || !iframe) return;

                const iframeDoc = iframe.contentWindow?.document;
                if (!iframeDoc) return;

                let docTitle = 'Ilios_Print_Job';
                const dateStr = new Date().toISOString().split('T')[0];

                if (priceListPrintData) {
                    docTitle = priceListPrintData.title;
                } else if (orderAnalyticsData) {
                    docTitle = `Analytics_Order_${orderAnalyticsData.order.id.slice(0, 6)}`;
                } else if (analyticsPrintData) {
                    docTitle = `Economics_${dateStr}`;
                } else if (orderToPrint) {
                    const safeName = transliterateForBarcode(orderToPrint.customer_name).replace(/[\s\W]+/g, '_');
                    docTitle = `Order_${safeName}_${dateStr}_${orderToPrint.id.slice(0, 6)}`;
                } else if (offerToPrint) {
                    const safeName = transliterateForBarcode(offerToPrint.customer_name).replace(/[\s\W]+/g, '_');
                    docTitle = `Offer_${safeName}_${dateStr}_${offerToPrint.id.slice(0, 6)}`;
                } else if (supplierOrderToPrint) {
                    docTitle = `PO_${supplierOrderToPrint.supplier_name.replace(/[\s\W]+/g, '_')}_${supplierOrderToPrint.id.slice(0, 6)}`;
                } else if (batchToPrint) {
                    docTitle = `Batch_${batchToPrint.sku}_${batchToPrint.id.slice(0, 6)}`;
                } else if (aggregatedPrintData) {
                    if (aggregatedPrintData.orderId) {
                        const safeName = aggregatedPrintData.customerName ? transliterateForBarcode(aggregatedPrintData.customerName).replace(/[\s\W]+/g, '_') : '';
                        docTitle = `Production_${safeName}_${aggregatedPrintData.orderId.slice(0, 8)}`;
                    } else {
                        docTitle = `Production_Summary_${dateStr}`;
                    }
                } else if (preparationPrintData) {
                    docTitle = `Preparation_Sheet_${dateStr}`;
                } else if (technicianPrintData) {
                    docTitle = `Technician_Sheet_${dateStr}`;
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
                }

                docTitle = docTitle.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_');

                const cleanup = () => {
                    setPrintItems([]); setOrderToPrint(null); setBatchToPrint(null); setOfferToPrint(null);
                    setAggregatedPrintData(null); setPreparationPrintData(null);
                    setTechnicianPrintData(null); setPriceListPrintData(null);
                    setAnalyticsPrintData(null); setOrderAnalyticsData(null);
                    setSupplierOrderToPrint(null);
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
                setTimeout(cleanup, 5000);

            }, 800);

            return () => clearTimeout(timer);
        }
    }, [printItems, orderToPrint, batchToPrint, aggregatedPrintData, preparationPrintData, technicianPrintData, priceListPrintData, analyticsPrintData, offerToPrint, orderAnalyticsData, supplierOrderToPrint, settings, products, materials]);

    if (!settings || !products || !materials || !molds) return null;

    return (
        <>
            <div ref={printContainerRef} className="print-view" aria-hidden="true" style={{ display: 'none' }}>
                {orderToPrint && <OrderInvoiceView order={orderToPrint} />}
                {offerToPrint && <OfferPrintView offer={offerToPrint} />}
                {supplierOrderToPrint && <SupplierOrderPrintView order={supplierOrderToPrint} products={products} />}
                {batchToPrint && <ProductionWorkerView batch={batchToPrint} allMolds={molds} allProducts={products} allMaterials={materials} />}
                {aggregatedPrintData && <AggregatedProductionView data={aggregatedPrintData} settings={settings} />}
                {preparationPrintData && <PreparationView batches={preparationPrintData.batches} allMaterials={materials} allProducts={products} allMolds={molds} />}
                {technicianPrintData && <TechnicianView batches={technicianPrintData.batches} />}
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
