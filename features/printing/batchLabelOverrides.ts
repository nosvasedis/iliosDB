export interface BatchLabelOverrideKeyInput {
  lineIndex: number;
  rawSku: string;
  quantity: number;
  size?: string;
}

export function buildBatchLabelOverrideKey({
  lineIndex,
  rawSku,
  quantity,
  size,
}: BatchLabelOverrideKeyInput): string {
  return [
    lineIndex,
    rawSku.trim().toUpperCase(),
    size?.trim().toUpperCase() || '',
    quantity,
  ].join('|');
}
