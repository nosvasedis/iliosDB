import { Product, ProductVariant } from '../../types';
import { LabelTextOverrides } from './labelText';

export interface PrintLabelItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  size?: string;
  format?: 'standard' | 'simple' | 'retail';
  showPrice?: boolean;
  priceTier?: 'wholesale' | 'retail';
  labelOverrides?: LabelTextOverrides;
}
