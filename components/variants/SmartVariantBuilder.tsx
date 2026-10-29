import React, { useMemo, useState } from 'react';
import { Check, CheckCheck, ChevronDown, Eraser, Gem, Keyboard, Plus, Search, Sparkles, X } from 'lucide-react';
import { Gender } from '../../types';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { formatNumber } from '../../utils/numberFormat';
import { formatCurrency } from '../../utils/pricingEngine';
import { availableFinishes } from '../ProductRegistry/constants';
import { getStoneChipStyle } from '../../features/products/registryStoneChipStyles';
import { getStoneCatalogForGender, StoneCatalogEntry } from '../../features/products/variantSmartAdd';
import StoneCodeText from '../StoneCodeText';
import SkuColorizedText from '../SkuColorizedText';

export type SmartVariantPlanStatus = 'new' | 'exists' | 'incompatible';

export interface SmartVariantPlanEntry {
    suffix: string;
    finishCode: string;
    stoneCode: string;
    status: SmartVariantPlanStatus;
}

interface Props {
    masterSku: string;
    gender?: Gender | '';
    /** Finishes selected when the builder mounts. */
    initialFinishes?: string[];
    /** Resolves finish × stone combinations ('' stone = plain metal) against the existing variants. */
    plan: (finishCodes: string[], stoneCodes: string[]) => SmartVariantPlanEntry[];
    /** Creates the planned variants; returns how many were added. */
    onCreate: (finishCodes: string[], stoneCodes: string[]) => number;
    /** Adds one variant from a fully typed suffix; returns true when it was added. */
    onManualAdd: (suffix: string, description: string) => boolean;
    /** Optional cost estimate shown on preview chips. */
    estimateCost?: (suffix: string) => number;
    /** Registers the in-progress selection as an unsaved draft (restart blocker). */
    draft?: { label: string; identity?: string };
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

const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 outline-none transition-all placeholder:font-medium placeholder:text-slate-300 hover:border-slate-300 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10';
const monoInputClass = `${inputClass} font-mono uppercase tracking-wide`;
const labelClass = 'flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500';

const ALL_FINISH_CODES = availableFinishes.map((f) => f.code);

export default function SmartVariantBuilder({ masterSku, gender, initialFinishes = [], plan, onCreate, onManualAdd, estimateCost, draft }: Props) {
    const resolvedGender = (gender || Gender.Unisex) as Gender;

    const [finishes, setFinishes] = useState<string[]>(initialFinishes);
    const [selectedStones, setSelectedStones] = useState<string[]>([]);
    const [includePlain, setIncludePlain] = useState(true);
    const [groupId, setGroupId] = useState('all');
    const [search, setSearch] = useState('');
    const [customCode, setCustomCode] = useState('');
    const [showManual, setShowManual] = useState(false);
    const [manualSuffix, setManualSuffix] = useState('');
    const [manualDesc, setManualDesc] = useState('');

    useRestartDraft(draft?.label ?? '', { finishes, selectedStones, includePlain, customCode, manualSuffix, manualDesc }, { enabled: !!draft, identity: draft?.identity });

    const stoneCatalog = useMemo(() => getStoneCatalogForGender(resolvedGender), [resolvedGender]);
    const stoneNames = useMemo(() => new Map(stoneCatalog.map((s) => [s.code, s.name])), [stoneCatalog]);

    // A stone is offered while at least one of the relevant finishes still lacks it.
    const finishesForAvailability = finishes.length > 0 ? finishes : ALL_FINISH_CODES;
    const availableCatalog = useMemo(
        () => stoneCatalog.filter((s) => selectedStones.includes(s.code) || plan(finishesForAvailability, [s.code]).some((e) => e.status === 'new')),
        [stoneCatalog, plan, finishesForAvailability, selectedStones],
    );

    const groups = useMemo(() => {
        const counts = new Map<string, number>();
        availableCatalog.forEach((s) => counts.set(getStoneGroupId(s), (counts.get(getStoneGroupId(s)) || 0) + 1));
        const list = [{ id: 'all', label: 'Όλες', count: availableCatalog.length }];
        STONE_GROUPS.forEach((g) => { if (counts.get(g.id)) list.push({ id: g.id, label: g.label, count: counts.get(g.id)! }); });
        if (counts.get('natural')) list.push({ id: 'natural', label: 'Ημιπολύτιμοι', count: counts.get('natural')! });
        return list;
    }, [availableCatalog]);

    const activeGroupId = groups.some((g) => g.id === groupId) ? groupId : 'all';

    const visibleStones = useMemo(() => {
        const term = search.trim().toUpperCase();
        return availableCatalog.filter((s) =>
            (activeGroupId === 'all' || getStoneGroupId(s) === activeGroupId) &&
            (!term || s.code.includes(term) || s.name.toUpperCase().includes(term)),
        );
    }, [availableCatalog, activeGroupId, search]);

    const activeGroupLabel = groups.find((g) => g.id === activeGroupId)?.label ?? 'Όλες';
    const allVisibleSelected = visibleStones.length > 0 && visibleStones.every((s) => selectedStones.includes(s.code));

    const stoneTargets = useMemo(() => [...(includePlain ? [''] : []), ...selectedStones], [includePlain, selectedStones]);
    const entries = useMemo(
        () => (finishes.length > 0 && stoneTargets.length > 0 ? plan(finishes, stoneTargets) : []),
        [finishes, stoneTargets, plan],
    );
    const newEntries = entries.filter((e) => e.status === 'new');
    const newCount = newEntries.length;
    const totalCost = estimateCost ? newEntries.reduce((sum, e) => sum + estimateCost(e.suffix), 0) : 0;

    // A finish is "complete" when every target combination for it already exists.
    const isFinishComplete = (code: string) =>
        stoneTargets.length > 0 && plan([code], stoneTargets).every((e) => e.status !== 'new');

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
        const added = onCreate(finishes, stoneTargets);
        if (added > 0) setSelectedStones([]);
    };

    const handleManualAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (onManualAdd(manualSuffix.trim().toUpperCase(), manualDesc.trim())) {
            setManualSuffix('');
            setManualDesc('');
        }
    };

    return (
        <div className="space-y-6">
            {/* Finishes */}
            <div>
                <div className="mb-2 flex items-center justify-between">
                    <span className={labelClass}>Φινίρισμα</span>
                    <button type="button" onClick={() => setFinishes(ALL_FINISH_CODES)} className="text-[11px] font-bold text-slate-400 transition-colors hover:text-emerald-600">
                        Όλα
                    </button>
                </div>
                <div className="flex flex-wrap gap-2">
                    {availableFinishes.map((finish) => {
                        const isSelected = finishes.includes(finish.code);
                        const isComplete = isFinishComplete(finish.code);
                        return (
                            <button
                                key={finish.code || 'lustre'}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleFinish(finish.code)}
                                title={isComplete ? 'Όλοι οι επιλεγμένοι συνδυασμοί υπάρχουν ήδη' : undefined}
                                className={`inline-flex h-9 select-none items-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition-all duration-150 active:scale-95 ${isSelected
                                    ? `${FINISH_CHIP_COLORS[finish.code]} shadow-sm`
                                    : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-800'
                                    } ${isComplete ? 'opacity-50' : ''}`}
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
                    <span className={labelClass}>
                        <Gem size={12} /> Πέτρες
                        <span className="font-medium normal-case tracking-normal text-slate-400">
                            ({resolvedGender === Gender.Men ? 'Ανδρικές' : resolvedGender === Gender.Women ? 'Γυναικείες' : 'Όλες'})
                        </span>
                    </span>
                    {selectedStones.length > 0 && (
                        <button type="button" onClick={() => setSelectedStones([])} className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-500">
                            <Eraser size={12} /> Καθαρισμός ({formatNumber(selectedStones.length)})
                        </button>
                    )}
                </div>

                <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                    {groups.map((g) => (
                        <button
                            key={g.id}
                            type="button"
                            onClick={() => setGroupId(g.id)}
                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${activeGroupId === g.id
                                ? 'bg-slate-900 text-white shadow-md shadow-slate-900/15'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                                }`}
                        >
                            {g.label}
                            <span className={`rounded-full px-1.5 text-[10px] ${activeGroupId === g.id ? 'bg-white/20' : 'bg-white text-slate-400'}`}>{g.count}</span>
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
                            className={`${inputClass} pl-9`}
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Καθαρισμός αναζήτησης">
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
                        {allVisibleSelected ? 'Αποεπιλογή' : 'Όλες'} {activeGroupId === 'all' ? 'οι πέτρες' : `· ${activeGroupLabel}`}
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
                                aria-label={`Πέτρα ${stone.name}`}
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
                    {selectedStones.filter((code) => !stoneNames.has(code)).map((code) => (
                        <button
                            key={code}
                            type="button"
                            aria-pressed
                            onClick={() => toggleStone(code)}
                            className="inline-flex h-8 select-none items-center gap-1.5 rounded-full border border-slate-400 bg-white px-3 font-mono text-[11px] font-bold text-slate-700 shadow-sm"
                        >
                            <Check size={12} strokeWidth={3} /> {code}
                        </button>
                    ))}
                    {visibleStones.length === 0 && <p className="px-2 py-1.5 text-xs font-medium text-slate-400">Δεν υπάρχουν άλλες πέτρες για νέους συνδυασμούς.</p>}
                </div>

                <div className="mt-2 flex items-center gap-2">
                    <input
                        type="text"
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCode(); } }}
                        placeholder="Άλλος κωδικός πέτρας + Enter"
                        className={`${monoInputClass} !py-2 text-xs`}
                    />
                    <button type="button" onClick={addCustomCode} disabled={!customCode.trim()} className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40" aria-label="Προσθήκη κωδικού πέτρας">
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
                        {formatNumber(newCount)} νέες{entries.length - newCount > 0 ? ` · ${formatNumber(entries.length - newCount)} παραλείπονται` : ''}
                        {estimateCost && newCount > 0 ? ` · ${formatCurrency(totalCost / newCount)} μ.ό. κόστος` : ''}
                    </span>
                </div>
                {entries.length > 0 ? (
                    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto custom-scrollbar">
                        {entries.map((entry) => (
                            <span
                                key={`${entry.finishCode}-${entry.stoneCode}`}
                                title={entry.status === 'exists'
                                    ? 'Υπάρχει ήδη'
                                    : entry.status === 'incompatible'
                                        ? 'Μη συμβατό με το φινίρισμα του Master'
                                        : [stoneNames.get(entry.stoneCode), estimateCost ? formatCurrency(estimateCost(entry.suffix)) : null].filter(Boolean).join(' · ')}
                                className={`inline-flex items-center rounded-lg border bg-white px-2 py-1 text-xs shadow-sm ${entry.status === 'new' ? 'border-slate-200' : 'border-dashed border-slate-200 opacity-40 line-through'}`}
                            >
                                <SkuColorizedText sku={masterSku} suffix={entry.suffix} gender={resolvedGender} mono />
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
                    <form onSubmit={handleManualAdd} className="mt-3 grid grid-cols-1 gap-2 animate-in fade-in slide-in-from-top-1 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
                        <input
                            type="text"
                            value={manualSuffix}
                            onChange={(e) => setManualSuffix(e.target.value.toUpperCase())}
                            placeholder="π.χ. XBSU"
                            aria-label="Πλήρες suffix"
                            className={monoInputClass}
                        />
                        <input
                            type="text"
                            value={manualDesc}
                            onChange={(e) => setManualDesc(e.target.value)}
                            placeholder="Περιγραφή (αυτόματη αν μείνει κενή)"
                            aria-label="Περιγραφή παραλλαγής"
                            className={inputClass}
                        />
                        <button type="submit" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-600">
                            <Plus size={15} /> Προσθήκη
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
