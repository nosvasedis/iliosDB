import { componentFamilyLabel } from '../../features/resources/componentFamilies';
import { ComponentFamilyFilter } from '../catalog/ProductClassificationFilters';
import React, { memo, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ChevronDown, ChevronLeft, ChevronRight, Download, Gem, Info, Layers, Package, Puzzle, Search, X, type LucideIcon } from 'lucide-react';
import type { ResourceKind, ResourceQuantities, ResourceQuantityRow } from '../../features/finance/resourceQuantities';
import { formatNumber } from '../../utils/numberFormat';
import SkuColorizedText from '../SkuColorizedText';
import { STONE_FAMILIES, stoneFamilyLabel, type StoneFamily } from '../../features/resources/stoneFamilies';

const KINDS: Array<[ResourceKind | 'all', string]> = [['all', 'Όλα'], ['stone', 'Πέτρες'], ['material', 'Υλικά'], ['component', 'STX / Εξαρτήματα']];
const PAGE_SIZE = 25;
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('el');

/** Identity per kind: colour is always paired with an icon and a label. */
const KIND_META: Record<ResourceKind, { label: string; icon: LucideIcon; tile: string; glyph: string; bar: string }> = {
  stone: { label: 'Πέτρες', icon: Gem, tile: 'from-violet-50 ring-violet-200 text-violet-800', glyph: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500' },
  material: { label: 'Υλικά', icon: Layers, tile: 'from-sky-50 ring-sky-200 text-sky-800', glyph: 'bg-sky-100 text-sky-700', bar: 'bg-sky-500' },
  component: { label: 'STX / Εξαρτήματα', icon: Puzzle, tile: 'from-emerald-50 ring-emerald-200 text-emerald-800', glyph: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500' },
};

/** "120 τεμ. · 3,5 m" for rows that mix units. */
function unitTotals(rows: readonly ResourceQuantityRow[]): string {
  const units = new Map<string, number>();
  rows.forEach((row) => units.set(row.unit, (units.get(row.unit) || 0) + row.quantity));
  return [...units].map(([unit, quantity]) => `${formatNumber(quantity)} ${unit}`).join(' · ');
}

function ResourceRow({ row, booked, share }: { row: ResourceQuantityRow; booked: boolean; share: number }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const meta = KIND_META[row.kind];
  const Icon = meta.icon;
  const family = STONE_FAMILIES.find((entry) => entry.id === row.stoneFamily) || (row.componentFamily ? { label: componentFamilyLabel(row.componentFamily), shortLabel: componentFamilyLabel(row.componentFamily), tone: 'bg-indigo-50 text-indigo-700 ring-indigo-100' } : undefined);
  const sourceLabel = booked ? (row.products.length === 1 ? 'εγγραφή' : 'εγγραφές') : (row.products.length === 1 ? 'κωδικός' : 'κωδικοί');
  return (
    <div className={`border-b border-slate-100 last:border-0 ${open ? 'bg-slate-50/60' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
      >
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.glyph}`} aria-hidden="true"><Icon size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="break-words text-sm font-black text-slate-900">{row.name}</span>
            {family && <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ring-1 ring-inset ${family.tone}`}>{family.shortLabel}</span>}
          </span>
          {row.description && <span className="mt-0.5 block break-words text-xs font-medium text-slate-500">{row.description}</span>}
          <span className="mt-1.5 flex items-center gap-2">
            <span className="h-1.5 w-full max-w-[12rem] overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <span className={`block h-full rounded-full ${meta.bar}`} style={{ width: `${Math.max(3, share * 100)}%` }} />
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-slate-400">{formatNumber(row.products.length)} {sourceLabel}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-black tabular-nums text-slate-900">{formatNumber(row.quantity)}</span>
          <span className="block text-[11px] font-bold text-slate-400">{row.unit}</span>
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-300 transition-transform group-hover:text-slate-500 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <ResourceSources row={row} booked={booked} limit={limit} onMore={() => setLimit((value) => value + PAGE_SIZE)} />}
    </div>
  );
}

// Sources mount only on opening a row, keeping large catalogues inexpensive.
function ResourceSources({ row, booked, limit, onMore }: { row: ResourceQuantityRow; booked: boolean; limit: number; onMore: () => void }) {
  const max = Math.max(...row.products.map((source) => source.quantity), 0) || 1;
  return (
    <div className="px-4 pb-3 pl-16">
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
          <span>{booked ? 'Από εγγραφές εξόδων' : 'Από κωδικούς'}</span>
          <span>Ποσότητα</span>
        </div>
        <div className="divide-y divide-slate-50">
          {row.products.slice(0, limit).map((source, index) => (
            <div key={JSON.stringify([source.sku, source.variantSuffix, index])} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="min-w-0 flex-1 break-words">
                {booked ? <span className="font-bold text-slate-700">{source.sku}</span> : (
                  <>
                    <SkuColorizedText sku={source.sku} suffix={source.variantSuffix} />
                    <span className="block text-[11px] text-slate-500">{formatNumber(source.pieces)} τεμ. προϊόντος</span>
                  </>
                )}
              </span>
              <span className="hidden h-1 w-20 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden="true">
                <span className="block h-full rounded-full bg-slate-400" style={{ width: `${Math.max(4, (source.quantity / max) * 100)}%` }} />
              </span>
              <span className="w-20 shrink-0 text-right font-black tabular-nums text-slate-800">{formatNumber(source.quantity)} <span className="font-semibold text-slate-400">{row.unit}</span></span>
            </div>
          ))}
        </div>
        {row.products.length > limit && (
          <button type="button" onClick={onMore} className="w-full border-t border-slate-100 py-2 text-xs font-black text-violet-700 hover:bg-violet-50">
            Περισσότερα ({formatNumber(row.products.length - limit)})
          </button>
        )}
      </div>
    </div>
  );
}

export function ResourceQuantitiesPrint({ report, title = 'Πέτρες, υλικά & STX · Αποσταλμένα' }: { report?: ResourceQuantities; title?: string }) {
  if (!report) return null;
  return <section className="mb-5 rounded-xl border border-slate-200 p-3 text-[10px]">
    <h3 className="mb-2 font-black text-slate-800">{title}</h3>
    <p className="mb-2 text-slate-500">Ποσότητες από τις τρέχουσες συνταγές. Τα εξαρτήματα εμφανίζονται χωριστά από τα υλικά τους.</p>
    <table><thead><tr><th className="text-left">Είδος / περιγραφή</th><th className="text-left">Κατηγορία</th><th className="text-right">Ποσότητα</th></tr></thead><tbody>
      {report.rows.map((row) => <tr key={row.key} className="break-inside-avoid border-t border-slate-100"><td>{row.name}{row.description ? ` · ${row.description}` : ''}</td><td>{stoneFamilyLabel(row.stoneFamily) || componentFamilyLabel(row.componentFamily) || KINDS.find(([kind]) => kind === row.kind)?.[1]}</td><td className="text-right font-bold tabular-nums">{formatNumber(row.quantity)} {row.unit}</td></tr>)}
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
  const [componentFamily, setComponentFamily] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const report = scope === 'backlog' && backlog ? backlog : realized;

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    return report.rows.filter((row) => (kind === 'all' || row.kind === kind) && (stoneFamily === 'all' || row.stoneFamily === stoneFamily) && (componentFamily === 'all' || row.componentFamily === componentFamily) && (!term || normalize(`${row.id} ${row.name} ${row.description} ${stoneFamilyLabel(row.stoneFamily)} ${componentFamilyLabel(row.componentFamily)}`).includes(term) || row.products.some((product) => normalize(`${product.sku}${product.variantSuffix}`).includes(term))));
  }, [report, kind, stoneFamily, componentFamily, search]);

  const kindSummaries = useMemo(() => (Object.keys(KIND_META) as ResourceKind[]).map((key) => {
    const rows = report.rows.filter((row) => row.kind === key);
    const headline = key === 'stone' ? `${formatNumber(report.stonePieces)} τεμ.`
      : key === 'component' ? `${formatNumber(report.componentPieces)} τεμ.`
      : unitTotals(rows) || '0';
    return { key, rows: rows.length, headline, detail: key === 'stone' ? unitTotals(rows.filter((row) => row.unit !== 'τεμ.')) : '' };
  }), [report]);

  const stoneGroups = useMemo(() => STONE_FAMILIES.map((family) => {
    const rows = report.rows.filter((row) => row.stoneFamily === family.id);
    return { ...family, count: rows.length, quantityLabel: unitTotals(rows) };
  }).filter((family) => family.count > 0), [report]);

  // Bar lengths compare like with like: the largest row of the same unit in the current list.
  const maxByUnit = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((row) => map.set(row.unit, Math.max(map.get(row.unit) || 0, row.quantity)));
    return map;
  }, [filtered]);

  const maxPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const resetPage = () => setPage(0);
  const chooseKind = (value: ResourceKind | 'all') => { setKind((current) => (current === value ? 'all' : value)); setStoneFamily('all'); setComponentFamily('all'); resetPage(); };
  const chooseFamily = (value: StoneFamily | 'all') => { setStoneFamily(value); setComponentFamily('all'); if (value !== 'all') setKind('stone'); resetPage(); };
  const filtersActive = componentFamily !== 'all' || kind !== 'all' || stoneFamily !== 'all' || search.trim() !== '';
  const clearFilters = () => { setKind('all'); setStoneFamily('all'); setComponentFamily('all'); setSearch(''); resetPage(); };

  const exportCsv = () => {
    const cells = (values: (string | number)[]) => values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';');
    const scopeLabel = booked ? 'Καταγεγραμμένες αγορές' : scope === 'realized' ? 'Αποσταλμένα' : 'Εκκρεμή (όλα)';
    const basisLabel = booked ? 'Γραμμές εξόδων' : 'Τρέχουσες συνταγές';
    const csv = [
      cells(['Περίοδος', 'Εύρος', 'Είδος', 'Περιγραφή', 'Κατηγορία', 'Ομάδα πέτρας', 'Ομάδα STX', 'Ποσότητα', 'Μονάδα', 'Βάση υπολογισμού']),
      ...filtered.map((row) => cells([periodLabel, scopeLabel, row.name, row.description, KINDS.find(([key]) => key === row.kind)![1], stoneFamilyLabel(row.stoneFamily), componentFamilyLabel(row.componentFamily), formatNumber(row.quantity), row.unit, basisLabel])),
      ...report.warnings.map((warning) => cells([periodLabel, scopeLabel, 'ΕΛΕΓΧΟΣ', warning, '', '', '', '', '', basisLabel])),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `posotites-${booked ? 'agores' : scope}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const subtitle = booked
    ? periodLabel
    : scope === 'realized' ? `Αποσταλμένα · ${periodLabel}` : 'Υπόλοιπο προς αποστολή · όλες οι ανοιχτές παραγγελίες';
  const howItWorks = booked
    ? 'Από τις καταγεγραμμένες γραμμές εξόδων. Χωρίς αναμενόμενα έξοδα, αμοιβές εργασίας ή ανάλυση συνταγών. Οι μονάδες λαμβάνονται από τη γραμμή ή, αν λείπουν, από το τρέχον μητρώο.'
    : 'Υπολογισμός από τις τρέχουσες συνταγές, μαζί με τα υλικά μέσα στα STX. Τα εξαρτήματα και τα υλικά τους εμφανίζονται χωριστά και δεν αθροίζονται μεταξύ τους. Δεν αποτελεί μέτρηση πραγματικής κατανάλωσης εργαστηρίου.';

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm" aria-label="Ποσότητες πετρών, υλικών και STX">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-4 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-sm" aria-hidden="true"><Boxes size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-slate-900">{booked ? 'Αγορές · Πέτρες, υλικά & STX' : 'Πέτρες, υλικά & STX'}</h3>
          <p className="truncate text-xs font-semibold text-slate-500">
            {subtitle}{!booked && <> · <span className="text-slate-700">{formatNumber(report.pieces)} τεμ. προϊόντων</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {backlog && (
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-black" role="group" aria-label="Εύρος">
              {(['realized', 'backlog'] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={scope === value}
                  onClick={() => { setScope(value); resetPage(); }}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition ${scope === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {value === 'realized' ? 'Αποσταλμένα' : 'Εκκρεμή'}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={exportCsv} aria-label="Εξαγωγή ποσοτήτων σε CSV" title="Εξαγωγή CSV" className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-800">
            <Download size={15} />
          </button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* Kind summaries double as the kind filter */}
        <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Κατηγορία υλικών">
          {kindSummaries.map(({ key, rows, headline, detail }) => {
            const meta = KIND_META[key];
            const Icon = meta.icon;
            const active = kind === key;
            return (
              <button
                type="button"
                key={key}
                aria-pressed={active}
                disabled={rows === 0}
                onClick={() => chooseKind(key)}
                className={`flex items-center gap-3 rounded-2xl bg-gradient-to-br to-white p-3 text-left ring-1 transition disabled:cursor-default disabled:opacity-50 ${meta.tile} ${active ? 'ring-2 shadow-sm' : 'ring-slate-100 hover:shadow-sm'}`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.glyph}`} aria-hidden="true"><Icon size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-black uppercase tracking-wide opacity-80">{meta.label}</span>
                  <span className="block truncate text-lg font-black tabular-nums text-slate-900">{headline}</span>
                  <span className="block truncate text-[11px] font-semibold text-slate-500">
                    {formatNumber(rows)} {rows === 1 ? 'είδος' : 'είδη'}{detail ? ` · ${detail}` : ''}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Stone groups */}
        {stoneGroups.length > 0 && kind !== 'material' && kind !== 'component' && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Ποσότητες ανά ομάδα πέτρας">
            <span className="mr-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Ομάδες πέτρας</span>
            {stoneGroups.map((family) => {
              const active = stoneFamily === family.id;
              return (
                <button
                  type="button"
                  key={family.id}
                  title={family.label}
                  aria-pressed={active}
                  onClick={() => chooseFamily(active ? 'all' : family.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset transition ${active ? 'bg-slate-900 text-white ring-slate-900' : family.tone}`}
                >
                  {family.shortLabel}
                  <span className={`tabular-nums ${active ? 'text-white/70' : 'opacity-70'}`}>{family.quantityLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        {report.rows.some(row => row.kind === 'component') && (kind === 'all' || kind === 'component') && <div className="max-w-sm"><ComponentFamilyFilter value={componentFamily} onChange={value => { setComponentFamily(value); if (value !== 'all') setKind('component'); setStoneFamily('all'); resetPage(); }} /></div>}

        {/* Search + active filters */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Αναζήτηση υλικού ή SKU</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); resetPage(); }}
              placeholder="Υλικό, πέτρα ή SKU…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:ring-4 focus:ring-slate-900/5"
            />
          </label>
          {filtersActive && (
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-black text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X size={13} /> Καθαρισμός
            </button>
          )}
        </div>

        {/* Method note and data warnings, out of the way until needed */}
        <div className="flex flex-col gap-2">
          <details className="group rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold text-slate-500 hover:text-slate-700">
              <Info size={13} /> Πώς υπολογίζεται
              <ChevronDown size={13} className="transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1.5 leading-relaxed">{howItWorks}{note ? ` ${note}` : ''}</p>
          </details>
          {report.warnings.length > 0 && (
            <details className="group rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-inset ring-amber-100">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-bold">
                <AlertTriangle size={13} className="text-amber-600" />
                {booked ? 'Έλεγχος μονάδων / αντιστοίχισης' : 'Ελλιπή στοιχεία συνταγών · οι ποσότητες είναι μερικές'}
                <span className="rounded-md bg-amber-100 px-1.5 tabular-nums">{formatNumber(report.warnings.length)}</span>
                <ChevronDown size={13} className="ml-auto transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto pl-5">{report.warnings.map((warning) => <li key={warning} className="list-disc">{warning}</li>)}</ul>
            </details>
          )}
        </div>
      </div>

      {/* Rows */}
      <div className="border-t border-slate-100">
        {filtered.length > 0 && (
          <div className="flex items-center justify-between bg-slate-50/70 px-4 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-400">
            <span>{formatNumber(filtered.length)} {filtered.length === 1 ? 'είδος' : 'είδη'}{filtersActive ? ' · φιλτραρισμένα' : ''}</span>
            <span className="pr-7">Ποσότητα</span>
          </div>
        )}
        <div key={`${scope}:${kind}:${stoneFamily}:${componentFamily}:${search}:${currentPage}`} className="max-h-[28rem] overflow-y-auto overscroll-contain custom-scrollbar">
          {filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((row) => (
            <ResourceRow key={row.key} row={row} booked={booked} share={row.quantity / (maxByUnit.get(row.unit) || 1)} />
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true"><Package size={20} /></span>
              <p className="text-sm font-black text-slate-700">{filtersActive ? 'Τίποτα με αυτά τα φίλτρα' : 'Δεν βρέθηκαν καταγεγραμμένα υλικά'}</p>
              {filtersActive && <button type="button" onClick={clearFilters} className="text-xs font-black text-violet-700 hover:underline">Καθαρισμός φίλτρων</button>}
            </div>
          )}
        </div>
      </div>

      {maxPage > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-500">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronLeft size={14} /> Προηγούμενα
          </button>
          <span className="tabular-nums">{formatNumber(currentPage + 1)} / {formatNumber(maxPage + 1)}</span>
          <button type="button" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent">
            Επόμενα <ChevronRight size={14} />
          </button>
        </div>
      )}
    </section>
  );
});
