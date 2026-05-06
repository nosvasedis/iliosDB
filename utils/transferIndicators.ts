export interface OrderTransferIndicator {
  direction: 'received' | 'sent';
  label: string;
  detail: string;
}

const TRANSFER_LINE_RE = /\[ΜΕΤΑΦΟΡΑ[^\]]*\]\s*([^\n]+)/g;

export function getOrderTransferIndicators(notes?: string | null): OrderTransferIndicator[] {
  if (!notes) return [];

  const indicators: OrderTransferIndicator[] = [];
  for (const match of notes.matchAll(TRANSFER_LINE_RE)) {
    const detail = match[0].trim();
    const text = match[1] || '';
    if (text.includes('Ελήφθησαν')) {
      indicators.push({
        direction: 'received',
        label: 'Περιέχει μεταφερμένο υπόλοιπο',
        detail,
      });
    } else if (text.includes('μεταφέρθηκε')) {
      indicators.push({
        direction: 'sent',
        label: 'Υπόλοιπο μεταφέρθηκε αλλού',
        detail,
      });
    }
  }

  return indicators;
}

export function hasOrderTransferIndicator(notes?: string | null): boolean {
  return getOrderTransferIndicators(notes).length > 0;
}

