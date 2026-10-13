import React from 'react';
import type { InspectionEvidenceSource } from '../../features/inspection/types';

export const evidenceCategories: Record<string, string> = {
  books: 'Βιβλία και δηλώσεις', purchases: 'Αγορές', materials: 'Υλικά', subcontracting: 'Αποστολές προς τεχνίτες',
  inventory: 'Απογραφή / απαλλαγή απογραφής', provider: 'Σύμβαση και δήλωση παρόχου', other: 'Άλλη πηγή',
};

export default function EvidenceSourcesEditor({ value, onChange }: { value: InspectionEvidenceSource[]; onChange: (value: InspectionEvidenceSource[]) => void }) {
  const update = (id: string, patch: Partial<InspectionEvidenceSource>) => onChange(value.map((row) => row.id === id
    ? { ...row, ...patch, confirmed: false, verifiedAt: null } : row));
  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
    <h3 className="font-black text-slate-900">Πηγές στοιχείων για έλεγχο</h3>
    <p className="text-sm text-slate-600">Καταγράψτε πού βρίσκονται τα βιβλία, οι αγορές, τα στοιχεία υλικών/τεχνιτών και η τεκμηρίωση απογραφής ή απαλλαγής. Η επιβεβαίωση αφορά τη διαθεσιμότητα του αρχείου.</p>
    {value.map((source) => <fieldset key={source.id} className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
      <legend className="px-1 text-sm font-bold">{source.title || 'Πηγή στοιχείων'}</legend>
      <label className="text-xs font-bold">Κατηγορία<select className="mt-1 w-full rounded-lg border p-2" value={source.category} onChange={(e) => update(source.id, { category: e.target.value })}>{Object.entries(evidenceCategories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {([['title','Αρχείο / τίτλος'],['location','Θέση φύλαξης / σύστημα'],['responsible','Υπεύθυνος διάθεσης'],['periodFrom','Περίοδος από'],['periodTo','Περίοδος έως']] as const).map(([key, label]) =>
        <label key={key} className="text-xs font-bold">{label}<input type={key.startsWith('period') ? 'date' : 'text'} className="mt-1 w-full rounded-lg border p-2" value={source[key]} onChange={(e) => update(source.id, { [key]: e.target.value })} /></label>)}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={source.confirmed} disabled={!source.title.trim() || !source.location.trim() || !source.responsible.trim() || !source.periodFrom || !source.periodTo || source.periodFrom > source.periodTo}
        onChange={(e) => onChange(value.map((row) => row.id === source.id ? { ...row, confirmed: e.target.checked, verifiedAt: e.target.checked ? new Date().toISOString() : null } : row))} />Επιβεβαιώθηκε ότι το αρχείο είναι διαθέσιμο</label>
      <button type="button" className="text-left text-sm font-bold text-red-700" onClick={() => onChange(value.filter((row) => row.id !== source.id))}>Αφαίρεση πηγής</button>
    </fieldset>)}
    <button type="button" className="rounded-xl border px-3 py-2 text-sm font-bold" disabled={value.length >= 100} onClick={() => onChange([...value, { id: crypto.randomUUID(), category: 'books', title: '', periodFrom: '', periodTo: '', location: '', responsible: '', confirmed: false, verifiedAt: null }])}>Προσθήκη πηγής</button>
    <p className="text-xs text-slate-500">Οι αλλαγές αποθηκεύονται με την αποθήκευση ρυθμίσεων παραστατικών.</p>
  </section>;
}
