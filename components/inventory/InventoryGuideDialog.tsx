import React from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Palette,
  PencilLine,
  ScanBarcode,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEscapeToClose } from '../../hooks/useEscapeToClose';
import { INVENTORY_TERMS } from '../../features/inventory';
import { BTN_PRIMARY } from '../ui/designTokens';

interface InventoryGuideDialogProps {
  isAdmin: boolean;
  canOperate: boolean;
  onClose: () => void;
}

const steps = [
  {
    icon: Search,
    title: '1. Άμεση εύρεση SKU',
    body: 'Χρησιμοποιήστε τη μόνιμη γραμμή «Αναζήτηση SKU ή παραλλαγής…». Το ακριβές πλήρες SKU εμφανίζεται πρώτο και μπορείτε να χρησιμοποιήσετε βέλη, Enter ή Σάρωση.',
  },
  {
    icon: BookOpen,
    title: '2. Άνοιγμα παραλλαγών',
    body: 'Κάθε κύριο SKU εμφανίζεται μία φορά. Επιλέξτε «Παραλλαγές» για να δείτε οργανωμένα τις παραλλαγές, τα μεγέθη και τις αποθήκες του.',
  },
  {
    icon: ShieldCheck,
    title: '3. Έξυπνη καταχώριση',
    body: 'Επιλέξτε «Καταχώριση Αποθέματος», συμπληρώστε μαζί όσα μεγέθη μετρήθηκαν και επιλέξτε απευθείας μία ή περισσότερες αποθήκες.',
  },
];

export default function InventoryGuideDialog({ isAdmin, canOperate, onClose }: InventoryGuideDialogProps) {
  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-guide-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <BookOpen size={21} aria-hidden="true" />
            </div>
            <div>
              <h2 id="inventory-guide-title" className="text-xl font-black text-slate-900">Οδηγός Αποθήκης & Αποθέματος</h2>
              <p className="mt-1 text-sm text-slate-500">Γρήγορη, ασφαλής εργασία σε κατάλογο χιλιάδων κύριων κωδικών.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο οδηγού" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-6 p-5">
          <section aria-labelledby="guide-navigation-title">
            <h3 id="guide-navigation-title" className="font-black text-slate-900">Καθημερινή πλοήγηση</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {steps.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <Icon size={18} className="text-emerald-700" aria-hidden="true" />
                  <h4 className="mt-3 text-sm font-black text-slate-900">{title}</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2" aria-label="Επεξήγηση κωδικών και ποσοτήτων">
            <article className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
              <div className="flex items-center gap-2 text-violet-800">
                <Palette size={18} aria-hidden="true" />
                <h3 className="font-black">Χρωματικός κώδικας SKU</h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-violet-900/80">
                Ο κύριος κωδικός παραμένει σταθερός και τα τμήματα της παραλλαγής χρωματίζονται με τον καθιερωμένο κώδικα φινιρίσματος και πέτρας. Το χρώμα βοηθά στην αναγνώριση· η πλήρης γραπτή τιμή του SKU παραμένει πάντα ο επιχειρησιακός κωδικός αναφοράς.
              </p>
            </article>
            <article className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <h3 className="font-black text-blue-900">Πώς διαβάζονται οι ποσότητες</h3>
              <dl className="mt-2 space-y-2 text-sm text-blue-900/80">
                <div><dt className="inline font-black">{INVENTORY_TERMS.onHand}:</dt> <dd className="inline">ό,τι υπάρχει πραγματικά στη θέση.</dd></div>
                <div><dt className="inline font-black">{INVENTORY_TERMS.reserved}:</dt> <dd className="inline">ό,τι έχει δεσμευτεί από παραγγελίες.</dd></div>
                <div><dt className="inline font-black">{INVENTORY_TERMS.available}:</dt> <dd className="inline">φυσικό μείον δεσμευμένο.</dd></div>
                <div><dt className="inline font-black">{INVENTORY_TERMS.projectedAvailable}:</dt> <dd className="inline">διαθέσιμο μαζί με αναμενόμενα και ανεκτέλεστη ζήτηση.</dd></div>
              </dl>
            </article>
          </section>

          <section aria-labelledby="guide-actions-title">
            <h3 id="guide-actions-title" className="font-black text-slate-900">Ενέργειες αποθέματος</h3>
            <div className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
              <div className="flex gap-3 p-4">
                <PencilLine size={18} className="mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-black text-slate-900">{INVENTORY_TERMS.adjustment}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    Η «Απογραφή» ορίζει το ακριβές Φυσικό Απόθεμα, ενώ η «Προσθήκη Ποσότητας» αυξάνει το υπάρχον. Και οι δύο ροές απαιτούν αιτιολογία και καταγράφονται στο Ιστορικό Κινήσεων.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-4">
                <ArrowLeftRight size={18} className="mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-black text-slate-900">{INVENTORY_TERMS.transfer}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    Μετακινεί διαθέσιμη ποσότητα από την επιλεγμένη Αποθήκη Προέλευσης σε Αποθήκη Προορισμού. Η αφαίρεση και η προσθήκη καταχωρίζονται μαζί.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-4">
                <Settings2 size={18} className="mt-0.5 shrink-0 text-slate-600" aria-hidden="true" />
                <div>
                  <h4 className="text-sm font-black text-slate-900">{INVENTORY_TERMS.reorderPoint}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    Καθορίζει πότε το είδος εμφανίζεται ως χαμηλό απόθεμα στη συγκεκριμένη παραλλαγή, μέγεθος και αποθήκη.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {isAdmin && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="guide-initial-count-title">
              <div className="flex items-center gap-2 text-amber-900">
                <CheckCircle2 size={18} aria-hidden="true" />
                <h3 id="guide-initial-count-title" className="font-black">Πρώτη φυσική απογραφή σε κενό σύστημα</h3>
              </div>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-amber-900/85">
                <li>1. Επιλέξτε «Καταχώριση Αποθέματος» και σαρώστε ή αναζητήστε το πλήρες SKU της παραλλαγής.</li>
                <li>2. Διατηρήστε τον τρόπο «Απογραφή» και επιλέξτε απευθείας την αποθήκη όπου μετρήθηκε το είδος, ακόμη και το Δειγματολόγιο.</li>
                <li>3. Συμπληρώστε μαζί όλα τα μεγέθη που μετρήθηκαν. Κενό σημαίνει «δεν καταμετρήθηκε», ενώ ρητό 0 σημαίνει «καταμετρήθηκε μηδενικό».</li>
                <li>4. Ελέγξτε τη σύνοψη, καταχωρίστε αιτιολογία όπως «Αρχική φυσική απογραφή ΗΗ/ΜΜ/ΕΕΕΕ» και επιλέξτε «Καταχώριση & επόμενο SKU» για συνεχή εργασία.</li>
              </ol>
            </section>
          )}
          {!isAdmin && (
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Δικαιώματα χειριστή">
              <h3 className="font-black text-slate-900">Δικαιώματα του ρόλου σας</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {canOperate
                  ? 'Μπορείτε να εκτελείτε Ενδοδιακίνηση. Η Διόρθωση Αποθέματος και το Σημείο Αναπαραγγελίας απαιτούν διαχειριστή.'
                  : 'Η πρόσβασή σας είναι μόνο για προβολή διαθεσιμότητας. Οι κινήσεις και οι ρυθμίσεις αποθέματος δεν είναι διαθέσιμες για τον ρόλο σας.'}
              </p>
            </section>
          )}

          <section className="rounded-xl border border-emerald-100 bg-emerald-50 p-4" aria-label="Συμβουλές ταχύτητας">
            <div className="flex items-center gap-2 text-emerald-900">
              <ScanBarcode size={18} aria-hidden="true" />
              <h3 className="font-black">Για ταχύτητα σε 7.000+ SKU</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-emerald-900/80">
              Προτιμήστε τη σάρωση για φυσική απογραφή, χρησιμοποιήστε φίλτρο αποθήκης πριν από μαζική εργασία και κρατήστε 25 ή 50 κύριους κωδικούς ανά σελίδα. Η αναζήτηση ακριβούς SKU ανοίγει αυτόματα τη μοναδική αντιστοίχιση.
            </p>
          </section>
        </div>

        <footer className="sticky bottom-0 flex justify-end border-t border-slate-100 bg-white p-5">
          <button type="button" onClick={onClose} className={`${BTN_PRIMARY} justify-center`}>
            Κατάλαβα, έναρξη εργασίας
          </button>
        </footer>
      </section>
    </div>
  );
}
