import { RETAIL_NOTE_PREFIX } from '../lib/supabase';

export interface RetailNotesParseResult {
    retailClientLabel: string;
    cleanNotes: string;
}

export const extractRetailClientFromNotes = (notes?: string): RetailNotesParseResult => {
    const rawNotes = notes || '';
    if (!rawNotes) {
        return { retailClientLabel: '', cleanNotes: '' };
    }

    const normalized = rawNotes.replace(/\r\n/g, '\n');
    const lines = normalized.split('\n');
    const firstLine = lines[0] || '';

    if (!firstLine.startsWith(RETAIL_NOTE_PREFIX)) {
        return { retailClientLabel: '', cleanNotes: normalized };
    }

    const retailClientLabel = firstLine.slice(RETAIL_NOTE_PREFIX.length).trim();
    const cleanNotes = lines.slice(1).join('\n');

    return { retailClientLabel, cleanNotes };
};

export const composeNotesWithRetailClient = (cleanNotes: string, retailClientLabel: string): string => {
    const normalizedNotes = (cleanNotes || '').replace(/\r\n/g, '\n');
    const normalizedRetailLabel = (retailClientLabel || '').trim();

    if (!normalizedRetailLabel) {
        return normalizedNotes;
    }

    const retailLine = `${RETAIL_NOTE_PREFIX} ${normalizedRetailLabel}`;
    if (!normalizedNotes) {
        return retailLine;
    }
    return `${retailLine}\n${normalizedNotes}`;
};
