import React from 'react';
import { Check } from 'lucide-react';

export const ORDER_BULK_SELECTED_ROW_CLASS =
    'ring-2 ring-blue-400 ring-offset-1 border-blue-300 bg-blue-50/20';

export function CircularSelectButton({
    selected,
    someSelected = false,
    onToggle,
    title,
    className = '',
}: {
    selected: boolean;
    someSelected?: boolean;
    onToggle: () => void;
    title?: string;
    className?: string;
}) {
    const filled = selected || someSelected;
    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onToggle();
            }}
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                selected
                    ? 'bg-blue-500 border-blue-500 shadow-sm shadow-blue-200'
                    : someSelected
                      ? 'bg-blue-300 border-blue-300'
                      : 'bg-white border-slate-300 hover:border-blue-400 hover:shadow-sm'
            } ${className}`}
            title={title ?? (selected ? 'Αποεπιλογή' : 'Επιλογή παραγγελίας')}
            aria-pressed={selected}
        >
            {filled && <Check size={11} className="text-white" />}
        </button>
    );
}
