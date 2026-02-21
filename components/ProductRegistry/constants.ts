import { ProductionType } from '../../types';

export const MAT_TYPE_LABELS: Record<string, string> = {
    'Stone': 'Πέτρα',
    'Cord': 'Κορδόνι',
    'Component': 'Εξάρτημα',
    'Enamel': 'Σμάλτο',
    'Leather': 'Δέρμα'
};

export const getSteps = (type: ProductionType) => {
    if (type === ProductionType.Imported) {
        return [
            { id: 1, title: 'Στοιχεία' },
            { id: 2, title: 'Κοστολόγηση' },
            { id: 3, title: 'Παραλλαγές' },
            { id: 4, title: 'Σύνοψη & Αποθήκευση' }
        ];
    }
    return [
        { id: 1, title: 'Στοιχεία' },
        { id: 2, title: 'Συνταγή' },
        { id: 3, title: 'Εργατικά' },
        { id: 4, title: 'Παραλλαγές' },
        { id: 5, title: 'Σύνοψη & Αποθήκευση' }
    ];
};

export const availableFinishes = [
    { code: '', label: 'Λουστρέ', color: 'bg-slate-100 border-slate-300 text-slate-700' },
    { code: 'P', label: 'Πατίνα', color: 'bg-stone-200 border-stone-400 text-stone-800' },
    { code: 'D', label: 'Δίχρωμο', color: 'bg-orange-100 border-orange-300 text-orange-800' },
    { code: 'X', label: 'Επίχρυσο', color: 'bg-amber-100 border-amber-300 text-amber-800' },
    { code: 'H', label: 'Επιπλατινωμένο', color: 'bg-cyan-100 border-cyan-300 text-cyan-800' }
];
