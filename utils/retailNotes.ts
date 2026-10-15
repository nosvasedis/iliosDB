import { RETAIL_NOTE_PREFIX } from './retailConstants';

export interface RetailNotesParseResult {
    retailClientLabel: string;
    cleanNotes: string;
}

/** Read legacy metadata even after notes were prepended, keeping ordinary notes intact. */
export const extractRetailClientFromNotes = (notes?: string | null): RetailNotesParseResult => {
    const lines = (notes || '').replace(/\r\n?/g, '\n').split('\n');
    let retailClientLabel = '';
    const cleanLines = lines.filter(line => {
        const value = line.trimStart();
        if (!value.startsWith(RETAIL_NOTE_PREFIX)) return true;
        retailClientLabel ||= value.slice(RETAIL_NOTE_PREFIX.length).trim();
        return false;
    });
    return { retailClientLabel, cleanNotes: cleanLines.join('\n') };
};

/** Replace existing metadata, rather than accumulating markers on edits or copies. */
export const composeNotesWithRetailClient = (cleanNotes: string, retailClientLabel: string): string => {
    const normalizedNotes = extractRetailClientFromNotes(cleanNotes).cleanNotes;
    const normalizedRetailLabel = (retailClientLabel || '').replace(/[\r\n]+/g, ' ').trim();
    if (!normalizedRetailLabel) return normalizedNotes;
    const retailLine = `${RETAIL_NOTE_PREFIX} ${normalizedRetailLabel}`;
    return normalizedNotes ? `${retailLine}\n${normalizedNotes}` : retailLine;
};
