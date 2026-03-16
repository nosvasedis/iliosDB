import React from 'react';
import { Product, Mold } from '../types';
import { compareSkuValues } from '../utils/skuSort';

interface Props {
    products: Product[];
    molds: Mold[];
    title?: string;
    date?: string;
}

const ITEMS_PER_PAGE = 12; // 3 columns × 4 rows

// Build a comma-separated list of mold descriptions for a product.
function getMoldDescriptions(product: Product, allMolds: Mold[]): string {
    if (!product.molds || product.molds.length === 0) return '';
    return product.molds
        .map(pm => {
            const mold = allMolds.find(m => m.code === pm.code);
            return mold?.description || pm.code;
        })
        .filter(Boolean)
        .join(', ');
}

// Chunk array into pages
function chunk<T>(arr: T[], size: number): T[][] {
    const pages: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        pages.push(arr.slice(i, i + size));
    }
    return pages;
}

export default function PhotoCatalogPrintView({ products, molds, title = 'Φωτο-κατάλογος', date }: Props) {
    // Sort by SKU ascending (consistent with all other views in the app)
    const sorted = [...products].sort((a, b) => compareSkuValues(a.sku, b.sku));
    const pages = chunk(sorted, ITEMS_PER_PAGE);
    const printDate = date || new Date().toLocaleDateString('el-GR');

    return (
        <div className="photo-catalog-print">
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm 8mm;
                    }
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }
                    .catalog-page {
                        page-break-after: always;
                        break-after: page;
                    }
                    .catalog-page:last-child {
                        page-break-after: avoid;
                        break-after: avoid;
                    }
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }

                .photo-catalog-print {
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    background: white;
                    color: #1e293b;
                }

                .catalog-page {
                    width: 194mm;
                    height: 277mm;
                    overflow: hidden;
                    padding: 0;
                    background: white;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                }

                .catalog-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 4mm 0 3mm 0;
                    border-bottom: 0.5mm solid #e2e8f0;
                    margin-bottom: 4mm;
                }

                .catalog-header-title {
                    font-size: 11pt;
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: -0.03em;
                    text-transform: uppercase;
                }

                .catalog-header-meta {
                    font-size: 7pt;
                    color: #94a3b8;
                    font-weight: 500;
                }

                .catalog-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 3mm;
                    flex: 1;
                    min-height: 0;
                }

                .catalog-card {
                    border: 0.3mm solid #e2e8f0;
                    border-radius: 3mm;
                    overflow: hidden;
                    background: white;
                    display: flex;
                    flex-direction: column;
                }

                .catalog-img-wrapper {
                    width: 100%;
                    aspect-ratio: 4 / 3;
                    background: #f8fafc;
                    overflow: hidden;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-bottom: 0.3mm solid #f1f5f9;
                }

                .catalog-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .catalog-img-placeholder {
                    width: 100%;
                    height: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
                }

                .catalog-img-placeholder svg {
                    width: 30%;
                    height: 30%;
                    opacity: 0.25;
                }

                .catalog-card-body {
                    padding: 2mm 2.5mm 2.5mm 2.5mm;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 1mm;
                }

                .catalog-sku {
                    font-size: 9.5pt;
                    font-weight: 800;
                    color: #0f172a;
                    letter-spacing: 0.04em;
                    font-family: 'Courier New', 'Courier', monospace;
                    line-height: 1.2;
                }

                .catalog-category {
                    font-size: 6.5pt;
                    font-weight: 600;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .catalog-molds {
                    font-size: 6pt;
                    color: #475569;
                    line-height: 1.4;
                    font-weight: 400;
                    font-style: italic;
                }

                .catalog-footer {
                    border-top: 0.3mm solid #e2e8f0;
                    padding-top: 2mm;
                    margin-top: 3mm;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 6.5pt;
                    color: #94a3b8;
                }
            `}</style>

            {pages.map((pageItems, pageIdx) => (
                <div key={pageIdx} className="catalog-page">
                    {/* Header */}
                    <div className="catalog-header">
                        <div className="catalog-header-title">
                            {title}
                        </div>
                        <div className="catalog-header-meta">
                            {printDate} &nbsp;·&nbsp; {products.length} κωδικοί &nbsp;·&nbsp; σελ. {pageIdx + 1}/{pages.length}
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="catalog-grid">
                        {pageItems.map((product) => {
                            return (
                                <div key={product.sku} className="catalog-card">
                                    {/* Image */}
                                    <div className="catalog-img-wrapper">
                                        {product.image_url ? (
                                            <img
                                                src={product.image_url}
                                                alt={product.sku}
                                                className="catalog-img"
                                                onError={(e) => {
                                                    const target = e.currentTarget;
                                                    target.style.display = 'none';
                                                    const placeholder = target.nextElementSibling as HTMLElement;
                                                    if (placeholder) placeholder.style.display = 'flex';
                                                }}
                                            />
                                        ) : null}
                                        <div
                                            className="catalog-img-placeholder"
                                            style={{ display: product.image_url ? 'none' : 'flex' }}
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" color="#94a3b8">
                                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                                <circle cx="8.5" cy="8.5" r="1.5" />
                                                <polyline points="21 15 16 10 5 21" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="catalog-card-body">
                                        <div className="catalog-sku">{product.sku}</div>
                                        <div className="catalog-category">
                                            {product.category} · {product.gender === 'Women' ? 'Γυναικείο' : product.gender === 'Men' ? 'Ανδρικό' : 'Unisex'}
                                        </div>
                                        {(() => {
                                            const moldDesc = getMoldDescriptions(product, molds);
                                            return moldDesc ? (
                                                <div className="catalog-molds">{moldDesc}</div>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="catalog-footer">
                        <span>Παραχθηκε από το Ilios ERP</span>
                        <span>{printDate}</span>
                    </div>
                </div>
            ))}
        </div>
    );
}
