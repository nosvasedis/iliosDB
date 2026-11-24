export const SILVER_QUOTE_PATH = '/market/silver/quote';
export const SILVER_HISTORY_PATH = '/market/silver/history';

export type SilverRange = '24h' | '7d' | '30d' | '90d';

export interface SilverMarketPoint {
  quotedAt: string;
  priceEurPerGram: number;
}

export interface SilverMarketQuote extends SilverMarketPoint {
  stale: boolean;
}

export interface SilverMarketHistory {
  range: SilverRange;
  interval: '15m' | '1h' | '4h' | '1d';
  points: SilverMarketPoint[];
  stale: boolean;
}
