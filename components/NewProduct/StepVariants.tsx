import { formatNumber } from '../../utils/numberFormat';
import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Layers, Wand2, Gem, Check, Search, X, CheckCheck, Sparkles, ChevronDown, Keyboard, Eraser } from 'lucide-react';
import { ProductionType, Gender } from '../../types';
import { useNewProductState } from '../../hooks/useNewProductState';
import { estimateVariantCost, formatCurrency } from '../../utils/pricingEngine';
import { availableFinishes } from '../ProductRegistry/constants';
import { getStoneChipStyle } from '../../features/products/registryStoneChipStyles';
import { getStoneCatalogForGender, StoneCatalogEntry } from '../../features/products/variantSmartAdd';
import StoneCodeText from '../StoneCodeText';
import SkuColorizedText from '../SkuColorizedText';
import { Panel, StepHeader, StatPill, VariantSuffixBadge, npInputClass, npMonoInputClass, npLabelClass } from './wizardUi';

interface Props {
    formState: ReturnType<typeof useNewProductState>;
    settings?: any;
    materials: any[];
    products: any[];
}

const FINISH_CHIP_COLORS: Record<string, string> = {
    '': 'bg-emerald-100 text-emerald-700 border-emerald-300',
    P: 'bg-stone-100 text-stone-700 border-stone-300',
    D: 'bg-orange-100 text-orange-700 border-orange-300',
    X: 'bg-amber-100 text-amber-700 border-amber-300',
    H: 'bg-cyan-100 text-cyan-700 border-cyan-300',
};

const FINISH_DOT: Record<string, string> = {
    '': 'bg-slate-300',
    P: 'bg-stone-500',
    D: 'bg-gradient-to-r from-amber-400 to-slate-300',
    X: 'bg-amber-400',
    H: 'bg-cyan-400',
};

// Stone families derived from catalogue names, so new codes fall into a group automatically.
const STONE_GROUPS: { id: string; label: string; match: (stone: StoneCatalogEntry) => boolean }[] = [
    { id: 'zircon', label: 'Ζιργκόν', match: (s) => s.name.includes('Ζιργκόν') },
    { id: 'copper', label: 'Κόπερ', match: (s) => s.name.includes('Κόπερ') },
    { id: 'agate', label: 'Αχάτες', match: (s) => s.name.includes('Αχάτης') },
    { id: 'triplet', label: 'Τριπλέτες', match: (s) => s.name.includes('Τριπλέτα') },
    { id: 'suleman', label: 'Σουλεμάνηδες', match: (s) => s.name.includes('Σουλεμάνης') },
];

const getStoneGroupId = (stone: StoneCatalogEntry) => STONE_GROUPS.find((g) => g.match(stone))?.id ?? 'natural';

export const StepVariants: React.FC<Props> = ({ formState, settings, materials, products }) => {
    const { state, setters, actions } = formState;
    const gender = (state.gender || Gender.Unisex) as Gender;
    const masterSku = (state.detectedMasterSku || state.sku || '').toUpperCase();
    const stepNumber = state.productionType === ProductionType.Imported ? 3 : 4;

    const [finishes, setFinishes] = useState<string[]>(() => (state.selectedFinishes.length > 0 ? state.selectedFinishes : ['']));
    const [selectedStones, setSelectedStones] = useState<string[]>([]);
    const [includePlain, setIncludePlain] = useState(true);
    const [groupId, setGroupId] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [customCode, setCustomCode] = useState('');
    const [showManual, setShowManual] = useState(false);

    const stoneCatalog = useMemo(() => getStoneCatalogForGender(gender), [gender]);
    const stoneNames = useMemo(() => new Map(stoneCatalog.map((s) => [s.code, s.name])), [stoneCatalog]);

    const groups = useMemo(() => {
        const counts = new Map<string, number>();
        stoneCatalog.forEach((s) => counts.set(getStoneGroupId(s), (counts.get(getStoneGroupId(s)) || 0) + 1));
        const list = [{ id: 'all', label: 'Όλες', count: stoneCatalog.length }];
        STONE_GROUPS.forEach((g) => { if (counts.get(g.id)) list.push({ id: g.id, label: g.label, count: counts.get(g.id)! }); });
        if (counts.get('natural')) list.push({ id: 'natural', label: 'Ημιπολύτιμοι', count: counts.get('natural')! });
        return list;
    }, [stoneCatalog]);

    const visibleStones = useMemo(() => {
        const term = search.trim().toUpperCase();
        return stoneCatalog.filter((s) =>
            (groupId === 'all' || getStoneGroupId(s) === groupId) &&
            (!term || s.code.includes(term) || s.name.toUpperCase().includes(term)),
        );
    }, [stoneCatalog, groupId, search]);

    const activeGroupLabel = groups.find((g) => g.id === groupId)?.label ?? 'Όλες';
    const allVisibleSelected = visibleStones.length > 0 && visibleStones.every((s) => selectedStones.includes(s.code));

    const stoneTargets = useMemo(() => [...(includePlain ? [''] : []), ...selectedStones], [includePlain, selectedStones]);
    const plan = useMemo(
        () => (finishes.length > 0 && stoneTargets.length > 0 ? actions.planVariantBatch(finishes, stoneTargets) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [finishes, stoneTargets, state.variants, state.plating],
    );
    const newCount = plan.filter((p) => p.status === 'new').length;

    const toggleFinish = (code: string) =>
        setFinishes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    const toggleStone = (code: string) =>
        setSelectedStones((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
    const selectAllVisible = () => {
        if (allVisibleSelected) {
            const visible = new Set(visibleStones.map((s) => s.code));
            setSelectedStones((prev) => prev.filter((c) => !visible.has(c)));
        } else {
            setSelectedStones((prev) => [...prev, ...visibleStones.map((s) => s.code).filter((c) => !prev.includes(c))]);
        }
    };
    const addCustomCode = () => {
        const code = customCode.trim().toUpperCase();
        if (!code) return;
        if (!selectedStones.includes(code)) setSelectedStones((prev) => [...prev, code]);
        setCustomCode('');
    };

    const handleCreate = () => {
        const added = actions.addVariantsBatch(finishes, stoneTargets);
        if (added > 0) setSelectedStones([]);
    };

    const handleManualAdd = (e: React.FormEvent) => {
        e.preventDefault();
        actions.handleAddVariant();
    };

    return (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <StepHeader
                step={stepNumber}
                icon={Layers}
                title="Παραλλαγές"
                subtitle="Επιλέξτε φινιρίσματα και πέτρες — δημιουργούνται μόνο οι συνδυασμοί που λείπουν."
                aside={<>
                    <StatPill label="Βάση" value={formatCurrency(state.masterEstimatedCost)} tone="emerald" />
                    <StatPill label="Παραλλαγές" value={formatNumber(state.variants.length)} />
                </>}
            />

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                {/* Builder */}
                <Panel title="Έξυπνη προσθήκη" subtitle="Κάντε κλικ για επιλογή — πολλαπλές πέτρες μαζί" icon={Wand2} tone="amber" bodyClassName="space-y-6">
                    {/* Finishes */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className={npLabelClass}>Φινίρισμα</span>
                            <button type="button" onClick={() => setFinishes(availableFinishes.map((f) => f.code))} className="text-[11px] font-bold text-slate-400 transition-colors hover:text-emerald-600">
                                Όλα
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {availableFinishes.map((finish) => {
                                const isSelected = finishes.includes(finish.code);
                                return (
                                    <button
                                        key={finish.code || 'lustre'}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => toggleFinish(finish.code)}
                                        className={`inline-flex h-9 select-none items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition-all duration-150 active:scale-95 ${isSelected
                                            ? `${FINISH_CHIP_COLORS[finish.code]} shadow-sm`
                                            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                                            }`}
                                    >
                                        {isSelected ? <Check size={13} strokeWidth={3} /> : <span className={`h-2.5 w-2.5 rounded-full ${FINISH_DOT[finish.code]}`} />}
                                        {finish.label}
                                        {finish.code && <span className="font-mono text-[10px] opacity-50">{finish.code}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Stones */}
                    <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className={`${npLabelClass} !mb-0 flex items-center gap-1.5`}>
                                <Gem size={12} /> Πέτρες
                                <span className="font-medium normal-case tracking-normal text-slate-400">
                                    ({gender === Gender.Men ? 'Ανδρικές' : gender === Gender.Women ? 'Γυναικείες' : 'Όλες'})
                                </span>
                            </span>
                            {selectedStones.length > 0 && (
                                <button type="button" onClick={() => setSelectedStones([])} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500">
                                    <Eraser size={12} /> Καθαρισμός ({formatNumber(selectedStones.length)})
                                </button>
                            )}
                        </div>

                        {/* Group tabs */}
                        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                            {groups.map((g) => (
                                <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => setGroupId(g.id)}
                                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${groupId === g.id
                                        ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15'
                                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                                        }`}
                                >
                                    {g.label}
                                    <span className={`rounded-full px-1.5 text-[10px] ${groupId === g.id ? 'bg-white/20' : 'bg-white text-slate-400'}`}>{g.count}</span>
                                </button>
                            ))}
                        </div>

                        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                            <div className="relative flex-1">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Αναζήτηση πέτρας ή κωδικού…"
                                    className={`${npInputClass} pl-9`}
                                />
                                {search && (
                                    <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100">
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={selectAllVisible}
                                disabled={visibleStones.length === 0}
                                className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-black transition-all active:scale-95 disabled:opacity-40 ${allVisibleSelected
                                    ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                    : 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-800 hover:from-amber-100 hover:to-orange-100'
                                    }`}
                                title={`Επιλογή όλων των πετρών: ${activeGroupLabel}`}
                            >
                                <CheckCheck size={15} />
                                {allVisibleSelected ? 'Αποεπιλογή' : 'Όλες'} {groupId === 'all' ? 'οι πέτρες' : `· ${activeGroupLabel}`}
                                <span className="rounded-full bg-white/80 px-1.5 text-[10px]">{formatNumber(visibleStones.length)}</span>
                            </button>
                        </div>

                        <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 custom-scrollbar">
                            <button
                                type="button"
                                aria-pressed={includePlain}
                                onClick={() => setIncludePlain((v) => !v)}
                                className={`inline-flex h-8 select-none items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all active:scale-95 ${includePlain
                                    ? 'border-slate-400 bg-white text-slate-800 shadow-sm'
                                    : 'border-dashed border-slate-300 bg-transparent text-slate-400 hover:text-slate-600'
                                    }`}
                            >
                                {includePlain ? <Check size={12} strokeWidth={3} /> : <span className="h-2 w-2 rounded-full border border-slate-400" />}
                                Σκέτο μέταλλο
                            </button>
                            {visibleStones.map((stone) => {
                                const style = getStoneChipStyle(stone.code);
                                const isActive = selectedStones.includes(stone.code);
                                return (
                                    <button
                                        key={stone.code}
                                        type="button"
                                        aria-pressed={isActive}
                                        onClick={() => toggleStone(stone.code)}
                                        className={`inline-flex h-8 select-none items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-all duration-150 active:scale-95 ${style.bg} ${style.text} ${isActive
                                            ? 'border-current shadow-md'
                                            : 'border-transparent opacity-75 hover:opacity-100 hover:shadow-sm'
                                            }`}
                                    >
                                        {isActive ? <Check size={12} strokeWidth={3} className="shrink-0" /> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />}
                                        {stone.name}
                                        <span className="font-mono text-[10px] opacity-60"><StoneCodeText code={stone.code} /></span>
                                    </button>
                                );
                            })}
                            {visibleStones.length === 0 && <p className="px-2 py-1.5 text-xs font-medium text-slate-400">Δεν βρέθηκαν πέτρες.</p>}
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                            <input
                                ref={formState.refs.stoneSuffixRef}
                                type="text"
                                value={customCode}
                                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCode(); } }}
                                placeholder="Άλλος κωδικός πέτρας + Enter"
                                className={`${npMonoInputClass} !py-2 text-xs`}
                            />
                            <button type="button" onClick={addCustomCode} disabled={!customCode.trim()} className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40">
                                <Plus size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                <Sparkles size={13} className="text-amber-500" /> Προεπισκόπηση
                            </span>
                            <span className="text-[11px] font-bold text-slate-400">
                                {formatNumber(newCount)} νέες{plan.length - newCount > 0 ? ` · ${formatNumber(plan.length - newCount)} παραλείπονται` : ''}
                            </span>
                        </div>
                        {plan.length > 0 ? (
                            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto custom-scrollbar">
                                {plan.map((entry) => (
                                    <span
                                        key={`${entry.finishCode}-${entry.stoneCode}`}
                                        title={entry.status === 'exists' ? 'Υπάρχει ήδη' : entry.status === 'incompatible' ? 'Μη συμβατό με το φινίρισμα του Master' : stoneNames.get(entry.stoneCode) || ''}
                                        className={`inline-flex items-center rounded-lg border bg-white px-2 py-1 text-xs shadow-sm ${entry.status === 'new' ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-40 line-through'}`}
                                    >
                                        <SkuColorizedText sku={masterSku} suffix={entry.suffix} gender={gender} mono />
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs font-medium text-slate-400">Επιλέξτε τουλάχιστον ένα φινίρισμα και μια πέτρα (ή «Σκέτο μέταλλο»).</p>
                        )}
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={newCount === 0}
                            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-black text-white shadow-lg shadow-slate-900/20 transition-all hover:bg-black active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                        >
                            <Plus size={18} />
                            {newCount > 0 ? `Δημιουργία ${formatNumber(newCount)} ${newCount === 1 ? 'παραλλαγής' : 'παραλλαγών'}` : 'Δημιουργία'}
                        </button>
                    </div>

                    {/* Manual suffix */}
                    <div className="border-t border-slate-100 pt-4">
                        <button type="button" onClick={() => setShowManual((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800">
                            <Keyboard size={14} /> Χειροκίνητη προσθήκη πλήρους suffix
                            <ChevronDown size={14} className={`transition-transform ${showManual ? 'rotate-180' : ''}`} />
                        </button>
                        {showManual && (
                            <form onSubmit={handleManualAdd} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto] animate-in fade-in slide-in-from-top-1">
                                <input
                                    ref={formState.refs.suffixInputRef}
                                    type="text"
                                    value={state.newVariantSuffix}
                                    onChange={(e) => setters.setNewVariantSuffix(e.target.value.toUpperCase())}
                                    placeholder="π.χ. XBSU"
                                    className={npMonoInputClass}
                                />
                                <input
                                    type="text"
                                    value={state.newVariantDesc}
                                    onChange={(e) => setters.setNewVariantDesc(e.target.value)}
                                    placeholder="Περιγραφή"
                                    className={npInputClass}
                                />
                                <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600">
                                    <Plus size={15} /> Προσθήκη
                                </button>
                            </form>
                        )}
                    </div>
                </Panel>

                {/* Variant list */}
                <Panel
                    title="Λίστα παραλλαγών"
                    subtitle="Η χονδρική ορίζεται στο τελευταίο βήμα"
                    icon={Layers}
                    tone="emerald"
                    className="flex flex-col xl:max-h-[calc(100vh-260px)]"
                    bodyClassName="flex-1 overflow-y-auto custom-scrollbar space-y-2"
                    actions={state.variants.length > 0 ? (
                        <button type="button" onClick={actions.clearVariants} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 size={12} /> Όλες
                        </button>
                    ) : undefined}
                >
                    {state.costedVariants.map((variant, index) => {
                        const breakdown = estimateVariantCost(state.currentTempProduct, variant.suffix, settings, materials, products);
                        const liveCost = variant.active_price ?? breakdown.total;
                        const diff = liveCost - state.masterEstimatedCost;
                        const details = breakdown.breakdown.details;
                        const platingCost = details.plating_cost || 0;
                        const stoneDiff = details.stone_diff || 0;

                        return (
                            <div key={`${variant.suffix}-${index}`} className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition-all hover:border-emerald-200 hover:shadow-md animate-in fade-in slide-in-from-bottom-1">
                                <VariantSuffixBadge suffix={variant.suffix} gender={gender} size="md" />
                                <div className="min-w-0 flex-1">
                                    <input
                                        type="text"
                                        value={variant.description}
                                        onChange={(e) => actions.updateVariant(index, 'description', e.target.value)}
                                        className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-sm font-bold text-slate-800 outline-none transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:ring-2 focus:ring-emerald-500/20"
                                    />
                                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-1">
                                        <span className="font-mono text-[11px] font-bold text-slate-500">{formatCurrency(liveCost)}</span>
                                        {platingCost > 0 && <span className="rounded-md bg-amber-50 px-1.5 py-px text-[10px] font-bold text-amber-700">+{formatCurrency(platingCost)} επιμ.</span>}
                                        {Math.abs(stoneDiff) > 0.01 && <span className="rounded-md bg-violet-50 px-1.5 py-px text-[10px] font-bold text-violet-700">{stoneDiff > 0 ? '+' : ''}{formatCurrency(stoneDiff)} υλικά</span>}
                                        {platingCost === 0 && Math.abs(stoneDiff) <= 0.01 && Math.abs(diff) > 0.01 && (
                                            <span className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => actions.removeVariant(index)}
                                    className="rounded-lg p-2 text-slate-300 transition-all hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                                    aria-label={`Διαγραφή ${variant.suffix || 'βασικής'}`}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        );
                    })}
                    {state.variants.length === 0 && (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-14 text-center">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-50 text-slate-300"><Layers size={28} /></div>
                            <p className="text-sm font-bold text-slate-500">Δεν υπάρχουν παραλλαγές</p>
                            <p className="max-w-xs text-xs text-slate-400">Το προϊόν θα αποθηκευτεί μόνο στην αρχική του μορφή. Χρησιμοποιήστε την έξυπνη προσθήκη για να δημιουργήσετε συνδυασμούς.</p>
                        </div>
                    )}
                </Panel>
            </div>
        </div>
    );
};
