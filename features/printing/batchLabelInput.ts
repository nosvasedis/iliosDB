import { ProductSizingInfo } from '../../utils/sizing';
import { matchSkuSize, splitSkuSizeInput } from '../../utils/skuSizeInput';

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

export function parseBatchLabelInputLine(
  line: string,
  sizing?: Pick<ProductSizingInfo, 'sizes'> | null,
): ParsedBatchLabelInputLine | null {
  const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ').trim();
  if (!cleanLine) return null;

  const parts = cleanLine.split(/\s+/);
  const rawToken = parts[0].toUpperCase();
  const inline = splitSkuSizeInput(rawToken);
  const size = matchSkuSize(inline.sizeToken || parts[1], sizing);
  const quantity = parsePositiveInt(!inline.sizeToken && size ? parts[2] : parts[1]) ?? 1;

  return { rawToken, quantity, size };
}
