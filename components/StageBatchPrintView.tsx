import React from 'react';
import { ProductionBatch, Product, Gender } from '../types';
import { APP_LOGO } from '../constants';
import { getVariantComponents } from '../utils/pricingEngine';
import { formatOrderId } from '../utils/orderUtils';

export interface StageBatchPrintData {
    stageName: string;
    stageId: string;
    customerName: string;
    orderId: string;
    batches: ProductionBatch[];
    generatedAt: string;
}

// Inline print-safe hex colors per stage
const STAGE_PRINT_COLORS: Record<string, { headerBg: string; lightBg: string; lightBorder: string; accentText: string }> = {
    'AwaitingDelivery': { headerBg: '#4338ca', lightBg: '#eef2ff', lightBorder: '#c7d2fe', accentText: '#3730a3' },
    'Waxing':           { headerBg: '#475569', lightBg: '#f8fafc', lightBorder: '#e2e8f0', accentText: '#334155' },
    'Casting':          { headerBg: '#ea580c', lightBg: '#fff7ed', lightBorder: '#fed7aa', accentText: '#c2410c' },
    'Setting':          { headerBg: '#7c3aed', lightBg: '#faf5ff', lightBorder: '#e9d5ff', accentText: '#6d28d9' },
    'Polishing':        { headerBg: '#1d4ed8', lightBg: '#eff6ff', lightBorder: '#bfdbfe', accentText: '#1e40af' },
    'Assembly':         { headerBg: '#be185d', lightBg: '#fdf2f8', lightBorder: '#fbcfe8', accentText: '#9d174d' },
    'Labeling':         { headerBg: '#a16207', lightBg: '#fefce8', lightBorder: '#fef08a', accentText: '#854d0e' },
    'Ready':            { headerBg: '#059669', lightBg: '#ecfdf5', lightBorder: '#a7f3d0', accentText: '#065f46' },
};

const FINISH_COLORS_PRINT: Record<string, string> = {
    'X': '#d97706', 'P': '#6b7280', 'D': '#ea580c', 'H': '#06b6d4', '': '#94a3b8',
};

const STONE_COLORS_PRINT: Record<string, string> = {
    'KR': '#e11d48', 'QN': '#0f172a', 'LA': '#2563eb', 'TY': '#14b8a6',
    'TG': '#c2410c', 'IA': '#991b1b', 'BSU': '#1e293b', 'GSU': '#166534',
    'RSU': '#9f1239', 'MA': '#059669', 'FI': '#94a3b8', 'OP': '#4f46e5',
    'NF': '#15803d', 'CO': '#0d9488', 'TPR': '#10b981', 'TKO': '#e11d48',
    'TMP': '#2563eb', 'PCO': '#34d399', 'MCO': '#a855f7', 'PAX': '#16a34a',
    'MAX': '#1d4ed8', 'KAX': '#b91c1c', 'AI': '#64748b', 'AP': '#06b6d4',
    'AM': '#0f766e', 'LR': '#3730a3', 'BST': '#38bdf8', 'MP': '#60a5fa',
    'LE': '#94a3b8', 'PR': '#22c55e', 'KO': '#ef4444', 'MV': '#c084fc',
    'RZ': '#f472b6', 'AK': '#67e8f9', 'XAL': '#78716c', 'SD': '#1e3a8a',
    'AX': '#047857',
};

const SkuColoredPrint: React.FC<{ sku: string; suffix?: string; gender?: Gender }> = ({ sku, suffix, gender }) => {
    const { finish, stone } = getVariantComponents(suffix || '', gender);
    const fColor = FINISH_COLORS_PRINT[finish.code] ?? '#94a3b8';
    const sColor = STONE_COLORS_PRINT[stone.code] ?? '#10b981';

    return (
        <span style={{ fontWeight: 900, fontSize: '13px', letterSpacing: '-0.01em' }}>
            <span style={{ color: '#1e293b' }}>{sku}</span>
            <span style={{ color: fColor }}>{finish.code}</span>
            <span style={{ color: sColor }}>{stone.code}</span>
        </span>
    );
};

interface Props {
    data: StageBatchPrintData;
    allProducts: Product[];
}

export default function StageBatchPrintView({ data, allProducts }: Props) {
    const colors = STAGE_PRINT_COLORS[data.stageId] ?? STAGE_PRINT_COLORS['Casting'];

    const totalQty = data.batches.reduce((s, b) => s + b.quantity, 0);
    const onHoldCount = data.batches.filter(b => b.on_hold).length;

    const generatedAt = new Date(data.generatedAt).toLocaleString('el-GR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    // Sort: active first, held last; within each group sort by SKU
    const sorted = [...data.batches].sort((a, b) => {
        const holdCmp = (a.on_hold ? 1 : 0) - (b.on_hold ? 1 : 0);
        if (holdCmp !== 0) return holdCmp;
        return `${a.sku}${a.variant_suffix || ''}`.localeCompare(
            `${b.sku}${b.variant_suffix || ''}`,
            undefined, { numeric: true, sensitivity: 'base' }
        );
    });

    return (
        <div style={{
            fontFamily: 'Arial, Helvetica, sans-serif',
            color: '#1e293b',
            background: '#fff',
            width: '210mm',
            minHeight: '297mm',
            padding: '10mm 12mm',
            boxSizing: 'border-box',
            margin: '0 auto',
        }}>
            {/* ── Page header ── */}
            <div style={{
                border: `2px solid ${colors.lightBorder}`,
                borderRadius: '8px',
                overflow: 'hidden',
                marginBottom: '10px',
            }}>
                {/* Colored band */}
                <div style={{
                    background: colors.headerBg,
                    color: '#fff',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <img
                            src={APP_LOGO}
                            alt="ILIOS"
                            style={{ width: '38px', height: 'auto', filter: 'brightness(0) invert(1)', opacity: 0.9 }}
                        />
                        <div>
                            <div style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.1 }}>
                                {data.stageName}
                            </div>
                            <div style={{ fontSize: '9px', fontWeight: 700, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '2px' }}>
                                Φύλλο Σταδίου Παραγωγής
                            </div>
                        </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, opacity: 0.85 }}>{generatedAt}</div>
                    </div>
                </div>

                {/* Meta strip */}
                <div style={{
                    background: colors.lightBg,
                    borderTop: `1px solid ${colors.lightBorder}`,
                    padding: '7px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: 900, fontSize: '14px', color: '#1e293b' }}>{data.customerName}</span>
                        {data.orderId ? (
                            <span style={{
                                fontSize: '11px', fontWeight: 700, color: '#64748b',
                                fontFamily: 'monospace', background: '#fff',
                                border: `1px solid ${colors.lightBorder}`,
                                padding: '1px 7px', borderRadius: '4px',
                            }}>#{formatOrderId(data.orderId)}</span>
                        ) : null}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{
                            background: '#fff', border: `1px solid ${colors.lightBorder}`,
                            color: colors.accentText, padding: '2px 10px',
                            borderRadius: '20px', fontSize: '11px', fontWeight: 900,
                        }}>
                            {sorted.length} παρτίδες
                        </span>
                        <span style={{
                            background: colors.headerBg, color: '#fff',
                            padding: '2px 10px', borderRadius: '20px',
                            fontSize: '11px', fontWeight: 900,
                        }}>
                            {totalQty} τεμ.
                        </span>
                        {onHoldCount > 0 && (
                            <span style={{
                                background: '#fef3c7', border: '1px solid #fcd34d',
                                color: '#92400e', padding: '2px 10px',
                                borderRadius: '20px', fontSize: '11px', fontWeight: 900,
                            }}>
                                {onHoldCount} σε αναμονή
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Batch table ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                    <tr style={{ background: colors.lightBg, borderBottom: `2px solid ${colors.lightBorder}` }}>
                        <th style={{ ...thStyleBase, width: '28px', textAlign: 'center' }}>
                            <span style={{ color: '#94a3b8', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>#</span>
                        </th>
                        <th style={{ ...thStyleBase, width: '46px' }} />
                        <th style={{...thStyleBase, textAlign: 'left', paddingLeft: '8px' }}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Κωδικός</span>
                        </th>
                        <th style={{ ...thStyleBase, width: '70px', textAlign: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Νούμερο</span>
                        </th>
                        <th style={{ ...thStyleBase, width: '55px', textAlign: 'center' }}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ποσ.</span>
                        </th>
                        <th style={{ ...thStyleBase, textAlign: 'left', paddingLeft: '8px' }}>
                            <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Σημειώσεις</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sorted.map((batch, index) => {
                        const isOnHold = !!batch.on_hold;
                        const rowBg = isOnHold ? '#fffbeb' : (index % 2 === 0 ? '#ffffff' : '#f8fafc');
                        const product = allProducts.find(p => p.sku === batch.sku);

                        return (
                            <tr
                                key={batch.id}
                                style={{
                                    background: rowBg,
                                    borderBottom: '1px solid #f1f5f9',
                                    borderLeft: isOnHold ? '3px solid #fbbf24' : '3px solid transparent',
                                    // @ts-ignore - print-specific CSS
                                    breakInside: 'avoid',
                                    pageBreakInside: 'avoid',
                                }}
                            >
                                {/* Index */}
                                <td style={{ padding: '7px 4px', textAlign: 'center', color: '#94a3b8', fontSize: '11px', fontWeight: 700, width: '28px' }}>
                                    {index + 1}
                                </td>

                                {/* Thumbnail */}
                                <td style={{ padding: '5px 4px', width: '46px' }}>
                                    {product?.image_url ? (
                                        <img
                                            src={product.image_url}
                                            alt={batch.sku}
                                            style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '5px', border: '1px solid #e2e8f0', display: 'block' }}
                                        />
                                    ) : (
                                        <div style={{ width: '42px', height: '42px', background: '#f1f5f9', borderRadius: '5px', border: '1px solid #e2e8f0' }} />
                                    )}
                                </td>

                                {/* SKU + client + on-hold tag */}
                                <td style={{ padding: '7px 8px', verticalAlign: 'middle' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                        <SkuColoredPrint sku={batch.sku} suffix={batch.variant_suffix} gender={product?.gender} />
                                        {batch.customer_name?.trim() && (
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>
                                                · {batch.customer_name.trim()}
                                            </span>
                                        )}
                                        {isOnHold && (
                                            <span style={{
                                                background: '#fef3c7', border: '1px solid #fcd34d',
                                                color: '#92400e', padding: '1px 5px',
                                                borderRadius: '3px', fontSize: '9px', fontWeight: 900,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                ⏸ ΑΝΑΜΟΝΗ{batch.on_hold_reason ? ` · ${batch.on_hold_reason}` : ''}
                                            </span>
                                        )}
                                    </div>
                                    {product?.category && (
                                        <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px' }}>{product.category}</div>
                                    )}
                                </td>

                                {/* Size */}
                                <td style={{ padding: '7px 8px', textAlign: 'center', color: '#475569', fontSize: '12px', fontWeight: 700, width: '70px' }}>
                                    {batch.size_info || <span style={{ color: '#cbd5e1' }}>—</span>}
                                </td>

                                {/* Quantity badge */}
                                <td style={{ padding: '7px 8px', textAlign: 'center', width: '55px' }}>
                                    <span style={{
                                        background: colors.headerBg, color: '#fff',
                                        padding: '3px 12px', borderRadius: '12px',
                                        fontWeight: 900, fontSize: '14px',
                                        letterSpacing: '-0.02em',
                                        display: 'inline-block',
                                    }}>
                                        {batch.quantity}
                                    </span>
                                </td>

                                {/* Notes */}
                                <td style={{ padding: '7px 8px', color: '#92400e', fontSize: '11px', fontStyle: 'italic', lineHeight: 1.35 }}>
                                    {batch.notes || ''}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* ── Footer totals ── */}
            <div style={{
                marginTop: '14px',
                borderTop: `2px solid ${colors.lightBorder}`,
                paddingTop: '8px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '20px',
                alignItems: 'center',
            }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>
                    Παρτίδες: <strong>{sorted.length}</strong>
                </span>
                <span style={{ fontSize: '13px', fontWeight: 900, color: colors.accentText }}>
                    Σύνολο: {totalQty} τεμ.
                </span>
            </div>
        </div>
    );
}

// ── Style helpers ──────────────────────────────────────────────────────────

const thStyleBase: React.CSSProperties = {
    padding: '6px 4px',
    fontWeight: 700,
    textAlign: 'left',
};
