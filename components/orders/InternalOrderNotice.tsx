import React from 'react';
import { Warehouse } from 'lucide-react';

/** Shown in the order builders when the order is for our own stock. */
export default function InternalOrderNotice() {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-950" role="note">
            <Warehouse size={15} className="mt-0.5 shrink-0 text-teal-600" />
            <span>
                <b>Εσωτερική παραγγελία</b> — για δικό μας απόθεμα. Περνάει από την παραγωγή κανονικά, αλλά δεν μετράει σε πωλήσεις,
                στατιστικά, προμήθειες πλασιέ και δεν τιμολογείται. Για αλλαγή πελάτη γράψτε άλλο όνομα στο πεδίο.
            </span>
        </div>
    );
}
