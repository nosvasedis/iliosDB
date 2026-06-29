import { ProductSizingInfo } from '../../utils/sizing';

export type ParsedBatchLabelInputLine = {
  rawToken: string;
  quantity: number;
  size?: string;
};

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findMatchingSize(token: string | undefined, sizing?: Pick<ProductSizingInfo, 'sizes'> | null): string | undefined {
  if (!token || !sizing) return undefined;
  const normalized = token.trim().toUpperCase();
  return sizing.sizes.find((size) => size.toUpperCase() === normalized);
}

export function parseBatchLabelInputLine(
  line: string,
  sizing?: Pick<ProductSizingInfo, 'sizes'> | null,
): ParsedBatchLabelInputLine | null {
  const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
  if (!cleanLine) return null;

  const parts = cleanLine.split(/\s+/);
  const rawToken = parts[0].toUpperCase();
  const size = findMatchingSize(parts[1], sizing);
  const quantity = parsePositiveInt(size ? parts[2] : parts[1]) ?? 1;

  return { rawToken, quantity, size };
}
