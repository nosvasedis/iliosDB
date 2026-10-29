import { formatDecimal, formatNumber } from '../../utils/numberFormat';
import React from 'react';
import { ImageIcon, Tag, Users, Palette, Box, PieChart, TrendingUp, Wand2, Info, Globe, Scale, Puzzle, Hand, CircleDollarSign } from 'lucide-react';
import { ProductionType, Gender } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { formatCurrency } from '../../utils/pricingEngine';
import { Panel, StepHeader, StatPill, VariantSuffixBadge } from './wizardUi';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    settings?: any;
    materials: any[];
    products: any[];
}

const marginTone = (margin: number) =>
    margin < 30 ? { bar: 'bg-rose-500', text: 'text-rose-600' } : margin < 50 ? { bar: 'bg-amber-400', text: 'text-amber-600' } : { bar: 'bg-emerald-500', text: 'text-emerald-700' };

export const StepReview: React.FC<Props> = ({ formState, settings, materials, products }) => {
    const { state, setters, actions } = formState;
    const gender = (state.gender || Gender.Unisex) as Gender;
    const masterSku = state.detectedMasterSku || state.sku;

    const silver = state.costBreakdown?.silver || 0;
    const labor = state.costBreakdown?.labor || 0;
    const mats = state.costBreakdown?.materials || 0;
    const costTotal = Math.max(silver + labor + mats, 0.0001);
    const segments = [
        { label: `Ασήμι (${formatDecimal(settings?.silver_price_gram)}€/g)`, value: silver, color: 'bg-slate-400' },
        { label: 'Εργατικά', value: labor, color: 'bg-blue-400' },
        { label: 'Υλικά / Πέτρες', value: mats, color: 'bg-violet-400' },
    ];

    const rows = state.costedVariants.map((v) => {
        const cost = v.active_price ?? 0;
        const price = v.selling_price || state.sellingPrice;
        const profit = price - cost;
        return { v, cost, price, profit, margin: price > 0 ? (profit / price) * 100 : 0 };
    });
    const avgMargin = rows.length > 0 ? rows.reduce((s, r) => s + r.margin, 0) / rows.length : state.masterMargin;

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <StepHeader
                step={state.finalStepId}
                icon={CircleDollarSign}
                title="Τιμολόγηση & Αποθήκευση"
                subtitle="Ελέγξτε κόστος και περιθώρια πριν την αποθήκευση."
                aside={<>
                    <StatPill label="Κόστος" value={formatCurrency(state.masterEstimatedCost)} />
                    {!state.isSTX && <StatPill label="Μ.Ο. περιθ." value={`${formatDecimal(avgMargin, 0)}%`} tone={avgMargin < 30 ? 'rose' : avgMargin < 50 ? 'amber' : 'emerald'} />}
                </>}
            />

            {/* Identity card */}
            <div className="mb-6 flex flex-col gap-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-emerald-50/50 p-5 shadow-sm sm:flex-row sm:items-center">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
                    {state.imagePreview ? <img src={state.imagePreview} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full w-full place-items-center text-slate-300"><ImageIcon size={28} /></div>}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-mono text-3xl font-black tracking-tight text-slate-900">{masterSku || '—'}</h2>
                        {state.isSTX && <span className="rounded-md bg-indigo-100 px-2 py-1 text-[10px] font-black uppercase text-indigo-700">Εξάρτημα</span>}
                        {state.isAssembly && <span className="flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 text-[10px] font-black uppercase text-violet-700"><Puzzle size={11} /> Συναρμολόγηση</span>}
                        {state.productionType === ProductionType.Imported && <span className="flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-[10px] font-black uppercase text-purple-700"><Globe size={11} /> Εισαγόμενο</span>}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2 text-xs font-bold text-slate-600">
                        <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1"><Tag size={12} className="text-slate-400" /> {state.category || '—'}</span>
                        <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1"><Users size={12} className="text-slate-400" /> {state.genderLabel || '—'}</span>
                        <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1"><Palette size={12} className="text-slate-400" /> {state.platingMasterLabel}</span>
                        <span className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1"><Scale size={12} className="text-slate-400" /> {formatNumber(state.weight + state.secondaryWeight)}g</span>
                    </div>
                    {state.variants.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {state.variants.slice(0, 18).map((v) => <VariantSuffixBadge key={v.suffix || 'base'} suffix={v.suffix} gender={gender} size="sm" />)}
                            {state.variants.length > 18 && <span className="self-center text-[11px] font-bold text-slate-400">+{formatNumber(state.variants.length - 18)}</span>}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left column */}
                <div className="space-y-6 lg:col-span-4">
                    <Panel title="Ανάλυση κόστους" icon={PieChart} tone="blue" bodyClassName="space-y-5">
                        <div>
                            <div className="flex items-end justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Βασικό κόστος</span>
                                <span className="font-mono text-2xl font-black text-slate-900">{formatCurrency(state.masterEstimatedCost)}</span>
                            </div>
                            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100">
                                {segments.map((s) => <div key={s.label} className={`${s.color} transition-all`} style={{ width: `${(s.value / costTotal) * 100}%` }} title={`${s.label}: ${formatCurrency(s.value)}`} />)}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {segments.map((s) => (
                                <div key={s.label} className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2 font-medium text-slate-600"><span className={`h-2.5 w-2.5 rounded-full ${s.color}`} />{s.label}</span>
                                    <span className="font-mono font-bold text-slate-800">{formatCurrency(s.value)}</span>
                                </div>
                            ))}
                            {state.labor.plating_cost_x > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2 font-medium text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Επιμετάλλωση X/H</span>
                                    <span className="font-mono font-bold text-slate-800">+{formatCurrency(state.labor.plating_cost_x)}</span>
                                </div>
                            )}
                            {state.labor.plating_cost_d > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-2 font-medium text-slate-600"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" />Επιμετάλλωση D</span>
                                    <span className="font-mono font-bold text-slate-800">+{formatCurrency(state.labor.plating_cost_d)}</span>
                                </div>
                            )}
                        </div>

                        {state.finalStacks.length > 0 && (
                            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                                {state.finalStacks.map((stack) => (
                                    <div key={stack.label} className={`rounded-xl border p-3 ${stack.borderClass} bg-white`}>
                                        <div className={`mb-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${stack.colorClass}`}>{stack.label}</div>
                                        <div className="font-mono text-lg font-black text-emerald-600">{formatCurrency(stack.total)}</div>
                                        {stack.platingCost > 0 && <div className="text-[10px] font-bold text-slate-400">+{formatCurrency(stack.platingCost)} επιμετάλλωση</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>

                    <Panel title="Λεπτομέρειες" icon={Box} tone="slate" bodyClassName="space-y-4">
                        <div>
                            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Υλικά & Εξαρτήματα</div>
                            {state.recipe.length > 0 ? (
                                <ul className="space-y-1">
                                    {state.recipe.map((r, idx) => {
                                        const name = r.type === 'raw'
                                            ? materials.find(m => m.id === r.id)?.name
                                            : products.find(p => p.sku === r.sku)?.category || r.sku;
                                        return (
                                            <li key={idx} className="flex items-center justify-between gap-2 text-xs font-medium text-slate-700">
                                                <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /><span className="truncate">{name}</span></span>
                                                <span className="shrink-0 font-mono text-slate-400">×{formatNumber(r.quantity)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : <span className="text-xs italic text-slate-400">Κανένα υλικό</span>}
                        </div>

                        <div>
                            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Λάστιχα</div>
                            {state.selectedMolds.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {state.selectedMolds.map((m) => (
                                        <span key={m.code} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-800">
                                            {m.code}{m.quantity > 1 ? ` ×${formatNumber(m.quantity)}` : ''}
                                        </span>
                                    ))}
                                </div>
                            ) : <span className="text-xs italic text-slate-400">Κανένα λάστιχο</span>}
                        </div>

                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-bold uppercase text-slate-400">Βάρος παραστατικού</span>
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${state.invoiceTotalWeightResult.source === 'manual' ? 'bg-blue-100 text-blue-700' : state.invoiceTotalWeightResult.source === 'automatic' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {state.invoiceTotalWeightResult.source === 'manual' ? 'Χειροκίνητο' : state.invoiceTotalWeightResult.source === 'automatic' ? 'Αυτόματο' : 'Ελλιπές'}
                                </span>
                            </div>
                            <span className="mt-1 block font-mono text-sm font-bold text-slate-800">
                                {state.invoiceTotalWeightResult.value === null
                                    ? '—'
                                    : `${state.invoiceTotalWeightResult.value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}gr`}
                            </span>
                        </div>
                    </Panel>
                </div>

                {/* Right column */}
                <div className="space-y-6 lg:col-span-8">
                    {!state.isSTX ? (
                        <Panel
                            title="Τιμολόγηση"
                            icon={state.useIliosFormula ? Wand2 : Hand}
                            tone={state.useIliosFormula ? 'violet' : 'emerald'}
                            actions={
                                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setters.setUseIliosFormula(true)}
                                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${state.useIliosFormula ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <Wand2 size={12} /> Τύπος Ilios
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setters.setUseIliosFormula(false)}
                                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black transition-all ${!state.useIliosFormula ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <Hand size={12} /> Χειροκίνητη
                                    </button>
                                </div>
                            }
                        >
                            {state.useIliosFormula ? (
                                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4">
                                    <p className="text-xs font-medium text-violet-800">Οι τιμές χονδρικής υπολογίζονται αυτόματα με τον Τύπο Ilios κατά την αποθήκευση.</p>
                                    <button
                                        type="button"
                                        onClick={actions.handleApplyIliosFormula}
                                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[11px] font-black text-violet-700 shadow-sm transition-colors hover:bg-violet-100"
                                    >
                                        <Wand2 size={13} /> Εφαρμογή Τύπου Ilios
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div className="min-w-[200px] flex-1">
                                            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-emerald-800">Master χονδρική</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={state.sellingPrice || 0}
                                                    onChange={e => {
                                                        setters.setUseIliosFormula(false);
                                                        setters.setSellingPrice(parseFloat(e.target.value) || 0);
                                                    }}
                                                    className="w-full rounded-xl border border-emerald-200 bg-white p-3 pr-8 font-mono text-lg font-black outline-none focus:ring-4 focus:ring-emerald-500/20"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-600">€</span>
                                            </div>
                                        </div>
                                        {state.variants.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={actions.applyManualPriceToVariants}
                                                className="h-[50px] rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100"
                                            >
                                                Αντιγραφή Master σε όλες
                                            </button>
                                        )}
                                    </div>
                                    {state.variants.length > 0 && (
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                            {state.variants.map((v, idx) => (
                                                <div key={`${v.suffix}-${idx}`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 transition-colors focus-within:border-emerald-300">
                                                    <VariantSuffixBadge suffix={v.suffix} gender={gender} size="sm" />
                                                    <div className="relative flex-1">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={v.selling_price ?? state.sellingPrice ?? 0}
                                                            onChange={e => actions.updateVariant(idx, 'selling_price', parseFloat(e.target.value) || 0)}
                                                            className="w-full rounded-lg bg-slate-50 py-1.5 pl-2 pr-6 text-right font-mono text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
                                                            aria-label={`Χονδρική ${v.suffix || 'βασικής'}`}
                                                        />
                                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">€</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </Panel>
                    ) : (
                        <div className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs font-medium text-indigo-800">
                            <Info size={15} /> Το προϊόν είναι εξάρτημα (STX) και αποθηκεύεται χωρίς τιμή πώλησης.
                        </div>
                    )}

                    <Panel
                        title="Κερδοφορία παραλλαγών"
                        icon={TrendingUp}
                        tone="emerald"
                        bodyClassName="!p-0"
                        actions={<span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-600">{formatNumber(state.variants.length)} παραλλαγές</span>}
                    >
                        <div className="max-h-[480px] overflow-auto custom-scrollbar">
                            <table className="w-full text-left text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50/95 text-[10px] font-black uppercase tracking-wider text-slate-400 backdrop-blur">
                                    <tr>
                                        <th className="p-3 pl-5">Παραλλαγή</th>
                                        <th className="p-3 text-right">Κόστος</th>
                                        <th className="p-3 text-right">Χονδρική</th>
                                        <th className="p-3 text-right">Κέρδος</th>
                                        <th className="w-1/4 p-3 pr-5">Περιθώριο</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.length > 0 ? rows.map(({ v, cost, price, profit, margin }, idx) => {
                                        const tone = marginTone(margin);
                                        return (
                                            <tr key={`${v.suffix}-${idx}`} className="transition-colors hover:bg-slate-50/70">
                                                <td className="p-3 pl-5">
                                                    <div className="flex items-center gap-3">
                                                        <VariantSuffixBadge suffix={v.suffix} gender={gender} size="sm" />
                                                        <span className="max-w-[180px] truncate text-xs font-semibold text-slate-600" title={v.description}>{v.description}</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold text-slate-600">{formatCurrency(cost)}</td>
                                                <td className="p-3 text-right">
                                                    {state.isSTX ? <span className="text-xs italic text-slate-300">—</span> : <span className="font-mono text-base font-black text-slate-900">{formatCurrency(price)}</span>}
                                                </td>
                                                <td className="p-3 text-right font-mono font-bold text-emerald-600">{state.isSTX ? '—' : formatCurrency(profit)}</td>
                                                <td className="p-3 pr-5">
                                                    {!state.isSTX && (
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                                <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, Math.max(0, margin))}%` }} />
                                                            </div>
                                                            <span className={`w-10 text-right text-xs font-black ${tone.text}`}>{formatDecimal(margin, 0)}%</span>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center">
                                                <div className="inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">
                                                    <Info size={14} /> Θα δημιουργηθεί μόνο το Master προϊόν (χωρίς παραλλαγές).
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </div>
            </div>
        </div>
    );
};
