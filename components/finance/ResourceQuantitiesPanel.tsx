import React, { memo, useMemo, useState } from 'react';
import { Boxes, Download, Search } from 'lucide-react';
import type { ResourceKind, ResourceQuantities, ResourceQuantityRow } from '../../features/finance/resourceQuantities';
import { formatNumber } from '../../utils/numberFormat';
import SkuColorizedText from '../SkuColorizedText';
import { STONE_FAMILIES, stoneFamilyLabel, type StoneFamily } from '../../features/resources/stoneFamilies';

const KINDS: Array<[ResourceKind | 'all', string]> = [['all', 'Όλα'], ['stone', 'Πέτρες'], ['material', 'Υλικά'], ['component', 'STX / Εξαρτήματα']];
const PAGE_SIZE = 25;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el');

function ResourceRow({ row, booked }: { row: ResourceQuantityRow; booked: boolean }) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)} className="border-b border-slate-100 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
        <span className="min-w-0">
          <span className="block break-words text-sm font-bold text-slate-800">{row.name}</span>
          {row.description && <span className="block break-words text-xs text-slate-500">{row.description}</span>}
          {row.stoneFamily && <span className="block text-[11px] font-semibold text-violet-700">{stoneFamilyLabel(row.stoneFamily)}</span>}
          <span className="text-[11px] text-slate-400">{KINDS.find(([kind]) => kind === row.kind)?.[1]} · {formatNumber(row.products.length)} {booked ? (row.products.length === 1 ? 'εγγραφή' : 'εγγραφές') : 'SKU'} · Ανάλυση ▾</span>
        </span>
        <span className="shrink-0 text-right text-sm font-black tabular-nums text-blue-700">{formatNumber(row.quantity)} <span className="text-xs font-semibold">{row.unit}</span></span>
      </summary>
      {open && <ResourceSources row={row} booked={booked} limit={limit} onMore={() => setLimit((value) => value + PAGE_SIZE)} />}
    </details>
  );
}

// Sources mount only on opening a row, keeping large catalogues inexpensive.
function ResourceSources({ row, booked, limit, onMore }: { row: ResourceQuantityRow; booked: boolean; limit: number; onMore: () => void }) {
  return <div className="space-y-2 bg-slate-50 px-4 py-3">
      {row.products.slice(0, limit).map((source, index) => <div key={JSON.stringify([source.sku, source.variantSuffix, index])} className="flex items-start justify-between gap-3 text-xs">
        <span className="min-w-0 break-words">{booked ? source.sku : <><SkuColorizedText sku={source.sku} suffix={source.variantSuffix} /><span className="block text-[11px] text-slate-500">{formatNumber(source.pieces)} τεμ. προϊόντος</span></>}</span>
        <span className="shrink-0 font-bold tabular-nums text-slate-700">{formatNumber(source.quantity)} {row.unit}</span>
      </div>)}
      {row.products.length > limit && <button type="button" onClick={onMore} className="text-xs font-bold text-blue-700">Περισσότερα</button>}
  </div>;
}

export function ResourceQuantitiesPrint({ report, title = 'Πέτρες, υλικά & STX · Αποσταλμένα' }: { report?: ResourceQuantities; title?: string }) {
  if (!report) return null;
  return <section className="mb-5 rounded-xl border border-slate-200 p-3 text-[10px]">
    <h3 className="mb-2 font-black text-slate-800">{title}</h3>
    <p className="mb-2 text-slate-500">Ποσότητες από τις τρέχουσες συνταγές. Τα εξαρτήματα εμφανίζονται χωριστά από τα υλικά τους.</p>
    <table><thead><tr><th className="text-left">Είδος / περιγραφή</th><th className="text-left">Κατηγορία</th><th className="text-right">Ποσότητα</th></tr></thead><tbody>
      {report.rows.map((row) => <tr key={row.key} className="break-inside-avoid border-t border-slate-100"><td>{row.name}{row.description ? ` · ${row.description}` : ''}</td><td>{stoneFamilyLabel(row.stoneFamily) || KINDS.find(([kind]) => kind === row.kind)?.[1]}</td><td className="text-right font-bold tabular-nums">{formatNumber(row.quantity)} {row.unit}</td></tr>)}
    </tbody></table>
    {report.rows.length === 0 && <p>Δεν βρέθηκαν καταγεγραμμένα υλικά.</p>}
    {report.warnings.length > 0 && <p className="mt-2 text-amber-800">Ελλιπή στοιχεία: {report.warnings.join(' · ')}</p>}
  </section>;
}

export default memo(function ResourceQuantitiesPanel({ realized, backlog, periodLabel, note, basis = 'recipe' }: { realized: ResourceQuantities; backlog?: ResourceQuantities; periodLabel: string; note?: string; basis?: 'recipe' | 'booked' }) {
  const booked = basis === 'booked';
  const [scope, setScope] = useState<'realized' | 'backlog'>('realized');
  const [kind, setKind] = useState<ResourceKind | 'all'>('all');
  const [stoneFamily, setStoneFamily] = useState<StoneFamily | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const report = scope === 'backlog' && backlog ? backlog : realized;
  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return report.rows.filter((row) => (kind === 'all' || row.kind === kind) && (stoneFamily === 'all' || row.stoneFamily === stoneFamily) && (!term || normalize(`${row.id} ${row.name} ${row.description} ${stoneFamilyLabel(row.stoneFamily)}`).includes(term) || row.products.some((product) => normalize(`${product.sku}${product.variantSuffix}`).includes(term))));
  }, [report, kind, stoneFamily, search]);
  const stoneGroups = useMemo(() => STONE_FAMILIES.map((family) => {
    const rows = report.rows.filter((row) => row.stoneFamily === family.id);
    const units = new Map<string, number>();
    rows.forEach((row) => units.set(row.unit, (units.get(row.unit) || 0) + row.quantity));
    return { ...family, count: rows.length, quantityLabel: [...units].map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`).join(' · ') };
  }).filter((family) => family.count > 0), [report]);
  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const exportCsv = () => {
    const cells = (values: (string | number)[]) => values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';');
    const scopeLabel = booked ? 'Καταγεγραμμένες αγορές' : scope === 'realized' ? 'Αποσταλμένα' : 'Εκκρεμή (όλα)';
    const basisLabel = booked ? 'Γραμμές εξόδων' : 'Τρέχουσες συνταγές';
    const csv = [
      cells(['Περίοδος', 'Εύρος', 'Είδος', 'Περιγραφή', 'Κατηγορία', 'Ομάδα πέτρας', 'Ποσότητα', 'Μονάδα', 'Βάση υπολογισμού']),
      ...filtered.map((row) => cells([periodLabel, scopeLabel, row.name, row.description, KINDS.find(([key]) => key === row.kind)![1], stoneFamilyLabel(row.stoneFamily), formatNumber(row.quantity), row.unit, basisLabel])),
      ...report.warnings.map((warning) => cells([periodLabel, scopeLabel, 'ΕΛΕΓΧΟΣ', warning, '', '', '', '', basisLabel])),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `posotites-${booked ? 'agores' : scope}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Ποσότητες πετρών, υλικών και STX">
    <div className="space-y-3 border-b border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Boxes size={17} className="shrink-0 text-violet-600" /> {booked ? 'Αγορές · Πέτρες, υλικά & STX' : 'Πέτρες, υλικά & STX'}</h3><p className="mt-1 text-xs text-slate-500">{booked ? periodLabel : scope === 'realized' ? `Αποσταλμένα · ${periodLabel}` : 'Υπόλοιπο προς αποστολή · όλες οι ανοιχτές παραγγελίες'}{!booked && ` · ${formatNumber(report.pieces)} τεμ. προϊόντων`}</p></div><button type="button" onClick={exportCsv} aria-label="Εξαγωγή ποσοτήτων σε CSV" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><Download size={15} /></button></div>
      <p className="text-[11px] leading-relaxed text-slate-500">{booked ? 'Από τις καταγεγραμμένες γραμμές εξόδων. Χωρίς αναμενόμενα έξοδα, αμοιβές εργασίας ή ανάλυση συνταγών. Οι μονάδες λαμβάνονται από τη γραμμή ή, αν λείπουν, από το τρέχον μητρώο.' : 'Υπολογισμός από τις τρέχουσες συνταγές, μαζί με τα υλικά μέσα στα STX. Τα εξαρτήματα και τα υλικά τους εμφανίζονται χωριστά και δεν αθροίζονται μεταξύ τους. Δεν αποτελεί μέτρηση πραγματικής κατανάλωσης εργαστηρίου.'}{note ? ` ${note}` : ''}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-700"><span>Πέτρες σε τεμάχια: {formatNumber(report.stonePieces)}</span><span>STX / Εξαρτήματα σε τεμάχια: {formatNumber(report.componentPieces)}</span></div>
      {backlog && <div className="flex flex-wrap gap-2">{(['realized', 'backlog'] as const).map((value) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setPage(0); }} className={`rounded-lg px-3 py-2 text-xs font-bold ${scope === value ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{value === 'realized' ? 'Αποσταλμένα' : 'Εκκρεμή (όλα)'}</button>)}</div>}
      <div className="flex flex-wrap gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">Αναζήτηση υλικού ή SKU</span><Search size={14} className="absolute left-2.5 top-3 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Υλικό, πέτρα ή SKU…" className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-2 text-sm" /></label><select aria-label="Κατηγορία υλικών" value={kind} onChange={(event) => { setKind(event.target.value as ResourceKind | 'all'); setStoneFamily('all'); setPage(0); }} className="max-w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold">{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {report.warnings.length > 0 && <details className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800"><summary className="cursor-pointer font-bold">{booked ? 'Έλεγχος μονάδων / αντιστοίχισης' : 'Ελλιπή στοιχεία συνταγών — οι ποσότητες είναι μερικές'} ({formatNumber(report.warnings.length)})</summary><ul className="mt-2 max-h-40 space-y-1 overflow-auto">{report.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>}
    </div>
    {stoneGroups.length > 0 && <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-3" role="group" aria-label="Ποσότητες ανά ομάδα πέτρας">
      <button type="button" aria-pressed={stoneFamily === 'all'} onClick={() => { setStoneFamily('all'); setPage(0); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600">Όλες οι ομάδες</button>
      {stoneGroups.map((family) => <button type="button" key={family.id} title={family.label} aria-pressed={stoneFamily === family.id} onClick={() => { setKind('stone'); setStoneFamily(family.id); setPage(0); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-inset ${stoneFamily === family.id ? 'bg-slate-900 text-white' : family.tone}`}>
        {family.shortLabel} · {family.quantityLabel}
      </button>)}
    </div>}
    <div key={`${scope}:${kind}:${stoneFamily}:${search}:${currentPage}`} className="max-h-[26rem] overflow-y-auto overscroll-contain">
      {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((row) => <ResourceRow key={row.key} row={row} booked={booked} />)}
      {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Δεν βρέθηκαν καταγεγραμμένα υλικά.</p>}
    </div>
    {maxPage > 0 && <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-lg p-2 font-bold disabled:opacity-30">Προηγούμενα</button><span>{formatNumber(currentPage + 1)} / {formatNumber(maxPage + 1)}</span><button type="button" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)} className="rounded-lg p-2 font-bold disabled:opacity-30">Επόμενα</button></div>}
  </section>;
});
