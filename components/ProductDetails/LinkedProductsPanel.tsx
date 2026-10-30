import React, { useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, Link2, Loader2, Plus, Sparkles, Trash2, X, ZoomIn } from 'lucide-react';
import type { Product } from '../../types';
import { expandSkuRange, findProductByScannedCode, formatCurrency } from '../../utils/pricingEngine';
import { formatNumber } from '../../utils/numberFormat';
import { searchMastersByPrefix } from '../../features/orders/skuPrefixSearch';
import { getLinkedSets, useProductLinkIndex } from '../../features/products/productLinks';
import { useDeleteProductLinkGroup, useSaveProductLinkGroup } from '../../hooks/api/useProducts';
import { useProductQuickViews } from '../products/useProductQuickViews';
import { productToFanItem } from '../products/productFanItems';
import SkuColorizedText from '../SkuColorizedText';
import { DetailsSection } from './detailsUi';

interface Props {
    sku: string;
    allProducts: Product[];
    onOpenProduct?: (product: Product) => void;
    showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    confirm: (options: { title: string; message: string; confirmText?: string; cancelText?: string; isDestructive?: boolean }) => Promise<boolean | null>;
}

/** Resolve typed codes («BR344, SK227», ranges «BR340-BR344», variant codes) to master products. */
function resolveTypedCodes(input: string, products: Product[], productsBySku: Map<string, Product>) {
    const found: Product[] = [];
    const unknown: string[] = [];
    input
        .split(/[\s,;]+/)
        .map((token) => token.trim().toUpperCase())
        .filter(Boolean)
        .flatMap((token) => expandSkuRange(token))
        .forEach((code) => {
            const product = productsBySku.get(code) ?? findProductByScannedCode(code, products)?.product;
            if (product && !product.is_component) found.push(product);
            else unknown.push(code);
        });
    return { found, unknown };
}

function SkuPicker({
    products,
    productsBySku,
    exclude,
    disabled,
    placeholder,
    onPick,
    onUnknown,
}: {
    products: Product[];
    productsBySku: Map<string, Product>;
    exclude: ReadonlySet<string>;
    disabled?: boolean;
    placeholder: string;
    onPick: (products: Product[]) => void;
    onUnknown: (codes: string[]) => void;
}) {
    const [term, setTerm] = useState('');
    const matches = useMemo(() => {
        if (/[\s,;]/.test(term.trim())) return [];
        return (searchMastersByPrefix(products, term, 12)?.products || []).filter((product) => !exclude.has(product.sku));
    }, [products, term, exclude]);

    const commit = () => {
        const { found, unknown } = resolveTypedCodes(term, products, productsBySku);
        const fresh = found.filter((product, index) => !exclude.has(product.sku) && found.findIndex((other) => other.sku === product.sku) === index);
        if (fresh.length > 0) onPick(fresh);
        if (unknown.length > 0) onUnknown(unknown);
        if (fresh.length > 0 || unknown.length === 0) setTerm('');
    };

    return (
        <div className="relative">
            <div className="flex gap-2">
                <input
                    value={term}
                    disabled={disabled}
                    onChange={(event) => setTerm(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') { event.preventDefault(); commit(); }
                        if (event.key === 'Escape') setTerm('');
                    }}
                    placeholder={placeholder}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold uppercase text-slate-800 shadow-sm outline-none transition placeholder:font-sans placeholder:font-medium placeholder:normal-case placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/10 disabled:bg-slate-50"
                />
                <button
                    type="button"
                    onClick={commit}
                    disabled={disabled || !term.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
                >
                    <Plus size={14} strokeWidth={3} /> Προσθήκη
                </button>
            </div>
            {matches.length > 0 && term.trim().length >= 2 && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                    {matches.map((product) => (
                        <button
                            key={product.sku}
                            type="button"
                            onClick={() => { onPick([product]); setTerm(''); }}
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-violet-50"
                        >
                            <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                                {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon size={14} className="m-auto mt-2.5 text-slate-300" />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm"><SkuColorizedText sku={product.sku} suffix="" gender={product.gender} mono /></span>
                                <span className="block truncate text-[11px] font-semibold text-slate-400">{product.category}</span>
                            </span>
                            {product.link_groups && product.link_groups.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-black text-violet-600"><Link2 size={10} /> σε σετ</span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * «Σετ» tab of the SKU card: the curated sets this master SKU belongs to.
 * Changes save immediately (they also change the other members), not with the card draft.
 */
export default function LinkedProductsPanel({ sku, allProducts, onOpenProduct, showToast, confirm }: Props) {
    const linkIndex = useProductLinkIndex(allProducts);
    const productsBySku = useMemo(() => new Map(allProducts.map((product) => [product.sku, product])), [allProducts]);
    const sellable = useMemo(() => allProducts.filter((product) => !product.is_component), [allProducts]);
    const sets = useMemo(() => getLinkedSets(sku, linkIndex), [sku, linkIndex]);
    const saveGroup = useSaveProductLinkGroup();
    const deleteGroup = useDeleteProductLinkGroup();
    const busy = saveGroup.isPending || deleteGroup.isPending;
    const [draft, setDraft] = useState<Product[]>([]);

    const quickViews = useProductQuickViews<Product>({
        index: linkIndex,
        productsBySku,
        toFanItem: productToFanItem,
        onOpenProduct: onOpenProduct,
    });

    const reportUnknown = (codes: string[]) => showToast(`Δεν βρέθηκαν κωδικοί: ${codes.join(', ')}`, 'warning');
    const reportError = (error: unknown) => showToast(`Η αλλαγή του σετ απέτυχε: ${error instanceof Error ? error.message : String(error)}`, 'error');

    const saveMembers = async (groupId: string | null, members: string[], previous: string[], successMessage: string) => {
        try {
            await saveGroup.mutateAsync({ groupId, skus: members, previousSkus: previous });
            showToast(successMessage, 'success');
            return true;
        } catch (error) {
            reportError(error);
            return false;
        }
    };

    const createSet = async () => {
        const members = [sku, ...draft.map((product) => product.sku).filter((member) => member !== sku)];
        if (members.length < 2) return;
        const ok = await saveMembers(null, members, [], `Δημιουργήθηκε σετ: ${members.join(' · ')}`);
        if (ok) setDraft([]);
    };

    const addToSet = (groupId: string, current: string[]) => async (picked: Product[]) => {
        const additions = picked.map((product) => product.sku).filter((member) => !current.includes(member));
        if (additions.length === 0) return;
        await saveMembers(groupId, [...current, ...additions], current, `Προστέθηκαν στο σετ: ${additions.join(', ')}`);
    };

    const removeFromSet = async (groupId: string, current: string[], member: string) => {
        const remaining = current.filter((other) => other !== member);
        const dissolves = remaining.length < 2;
        const confirmed = await confirm({
            title: dissolves ? 'Κατάργηση σετ' : 'Αφαίρεση από σετ',
            message: dissolves
                ? `Με την αφαίρεση του ${member} το σετ μένει με έναν κωδικό και θα καταργηθεί. Συνέχεια;`
                : `Αφαίρεση του ${member} από το σετ ${current.join(' · ')};`,
            confirmText: dissolves ? 'Κατάργηση σετ' : 'Αφαίρεση',
            isDestructive: true,
        });
        if (!confirmed) return;
        await saveMembers(groupId, remaining, current, dissolves ? 'Το σετ καταργήθηκε.' : `Ο ${member} αφαιρέθηκε από το σετ.`);
    };

    const removeSet = async (groupId: string, current: string[]) => {
        const confirmed = await confirm({
            title: 'Διαγραφή σετ',
            message: `Διαγραφή του σετ ${current.join(' · ')}; Οι κωδικοί δεν επηρεάζονται, μόνο η σύνδεσή τους.`,
            confirmText: 'Διαγραφή σετ',
            isDestructive: true,
        });
        if (!confirmed) return;
        try {
            await deleteGroup.mutateAsync({ groupId, skus: current });
            showToast('Το σετ διαγράφηκε.', 'success');
        } catch (error) {
            reportError(error);
        }
    };

    const draftExclude = useMemo(() => new Set([sku, ...draft.map((product) => product.sku)]), [sku, draft]);

    return (
        <div className="space-y-5 animate-in fade-in">
            <DetailsSection
                tone="variants"
                icon={Link2}
                title="Συνδεδεμένα Προϊόντα"
                subtitle="Κωδικοί που πωλούνται μαζί ως σετ. Εμφανίζονται στο Μητρώο, στις Συλλογές, στις παραγγελίες και στις προσφορές."
                actions={sets.length > 0 ? (
                    <button
                        type="button"
                        onClick={(event) => quickViews.openLinks(sku, event.currentTarget)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-700 transition hover:bg-violet-100"
                    >
                        <Sparkles size={13} /> Βεντάλια
                    </button>
                ) : undefined}
            >
                {sets.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                        Ο {sku} δεν ανήκει σε κανένα σετ ακόμη. Δημιουργήστε ένα παρακάτω.
                    </p>
                ) : (
                    <div className="space-y-4">
                        {sets.map((set, setIndex) => {
                            const exclude = new Set(set.skus);
                            return (
                                <div key={set.groupId} className="rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50/60 to-white p-3.5">
                                    <div className="mb-3 flex items-center justify-between gap-2">
                                        <div className="text-[12px] font-black uppercase tracking-wide text-violet-700">
                                            Σετ {formatNumber(setIndex + 1)} · {formatNumber(set.skus.length)} κωδικοί
                                        </div>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => removeSet(set.groupId, set.skus)}
                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                                        >
                                            <Trash2 size={12} /> Διαγραφή σετ
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                                        {set.skus.map((member) => {
                                            const product = productsBySku.get(member);
                                            const isCurrent = member === sku;
                                            return (
                                                <div key={member} className={`group relative overflow-hidden rounded-xl border bg-white shadow-sm ${isCurrent ? 'border-violet-300 ring-2 ring-violet-500/15' : 'border-slate-200'}`}>
                                                    <div className="relative aspect-square bg-slate-50">
                                                        {product?.image_url
                                                            ? <img src={product.image_url} alt={member} loading="lazy" className="h-full w-full object-cover" />
                                                            : <div className="flex h-full items-center justify-center text-slate-300"><ImageIcon size={28} /></div>}
                                                        {isCurrent && <span className="absolute left-2 top-2 rounded-full bg-[#060b00]/80 px-2 py-0.5 text-[9px] font-black uppercase text-white">Τρέχον</span>}
                                                        {product?.image_url && (
                                                            <button
                                                                type="button"
                                                                aria-label={`Μεγέθυνση ${member}`}
                                                                onClick={() => quickViews.openZoom(
                                                                    set.skus.map((other) => ({ sku: other, imageUrl: productsBySku.get(other)?.image_url ?? null, label: productsBySku.get(other)?.category })),
                                                                    set.skus.indexOf(member),
                                                                )}
                                                                className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#060b00]/75 text-white opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                                                            >
                                                                <ZoomIn size={14} />
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            disabled={busy}
                                                            aria-label={`Αφαίρεση ${member} από το σετ`}
                                                            title="Αφαίρεση από το σετ"
                                                            onClick={() => removeFromSet(set.groupId, set.skus, member)}
                                                            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-500 opacity-0 shadow transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 disabled:opacity-30 [@media(hover:none)]:opacity-100"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                    <div className="space-y-0.5 px-2.5 py-2">
                                                        <div className="text-sm"><SkuColorizedText sku={member} suffix="" gender={product?.gender} masterClassName="text-slate-800" /></div>
                                                        <div className="truncate text-[10px] font-semibold text-slate-400">{product?.category || 'Άγνωστος κωδικός'}</div>
                                                        {product && (
                                                            <div className="flex items-center justify-between text-[11px] font-bold">
                                                                <span className="text-slate-700">{product.selling_price > 0 ? formatCurrency(product.selling_price) : '—'}</span>
                                                                {!isCurrent && onOpenProduct && (
                                                                    <button type="button" onClick={() => onOpenProduct(product)} className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800">
                                                                        <ExternalLink size={11} /> Άνοιγμα
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3">
                                        <SkuPicker
                                            products={sellable}
                                            productsBySku={productsBySku}
                                            exclude={exclude}
                                            disabled={busy}
                                            placeholder="Προσθήκη κωδικού στο σετ (π.χ. SK227 ή BR340-BR344)"
                                            onPick={addToSet(set.groupId, set.skus)}
                                            onUnknown={reportUnknown}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </DetailsSection>

            <DetailsSection tone="variants" icon={Plus} title="Νέο σετ" subtitle={`Ο ${sku} μπορεί να ανήκει σε περισσότερα από ένα σετ.`}>
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-[#060b00] px-2.5 py-1 font-mono text-xs font-black text-white">{sku}</span>
                        {draft.map((product) => (
                            <span key={product.sku} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 py-1 pl-2.5 pr-1 font-mono text-xs font-black text-violet-700">
                                {product.sku}
                                <button type="button" aria-label={`Αφαίρεση ${product.sku}`} onClick={() => setDraft((items) => items.filter((item) => item.sku !== product.sku))} className="rounded p-0.5 hover:bg-violet-100">
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                        {draft.length === 0 && <span className="text-xs font-semibold text-slate-400">Προσθέστε τουλάχιστον έναν ακόμη κωδικό.</span>}
                    </div>
                    <SkuPicker
                        products={sellable}
                        productsBySku={productsBySku}
                        exclude={draftExclude}
                        disabled={busy}
                        placeholder="Κωδικοί του σετ (π.χ. BR344, SK227)"
                        onPick={(picked) => setDraft((items) => [...items, ...picked.filter((product) => !items.some((item) => item.sku === product.sku))])}
                        onUnknown={reportUnknown}
                    />
                    <div className="flex justify-end">
                        <button
                            type="button"
                            disabled={busy || draft.length === 0}
                            onClick={createSet}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#060b00] px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-40"
                        >
                            {busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                            Δημιουργία σετ ({formatNumber(draft.length + 1)} κωδικοί)
                        </button>
                    </div>
                </div>
            </DetailsSection>

            {quickViews.element}
        </div>
    );
}
