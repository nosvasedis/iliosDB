import { describe, expect, it } from 'vitest';
import { Gender, PlatingType, ProductionType } from '../../types';
import {
  buildProductLinkIndex,
  findMissingSetMates,
  getLinkedCount,
  getLinkedSets,
  getLinkedSkus,
  resolveLinkedVariantSuffix,
  type LinkableProduct,
} from '../../features/products/productLinks';
import { mapProductsWithRelations } from '../../features/products/mappers';

const SET_A = '11111111-1111-4111-8111-111111111111';
const SET_B = '22222222-2222-4222-8222-222222222222';

const catalogue: LinkableProduct[] = [
  { sku: 'KL255', link_groups: [{ group_id: SET_A, position: 0 }], variants: [{ suffix: 'P' }, { suffix: 'X' }] },
  { sku: 'BR344', link_groups: [{ group_id: SET_A, position: 1 }], variants: [{ suffix: 'P' }] },
  { sku: 'SK227', link_groups: [{ group_id: SET_A, position: 2 }, { group_id: SET_B, position: 1 }], variants: [{ suffix: 'P' }, { suffix: 'X' }] },
  { sku: 'KL300', link_groups: [{ group_id: SET_B, position: 0 }], variants: [] },
  { sku: 'RN1', link_groups: [{ group_id: '33333333-3333-4333-8333-333333333333', position: 0 }] },
  { sku: 'PN9' },
];

describe('product link index', () => {
  const index = buildProductLinkIndex(catalogue);

  it('groups members by set in position order and drops single-member sets', () => {
    expect(index.groups.get(SET_A)).toEqual(['KL255', 'BR344', 'SK227']);
    expect(index.groups.get(SET_B)).toEqual(['KL300', 'SK227']);
    expect(index.groups.size).toBe(2);
    expect(index.bySku.has('RN1')).toBe(false);
  });

  it('lets one SKU belong to several sets', () => {
    expect(getLinkedSets('SK227', index).map((set) => set.groupId)).toEqual([SET_A, SET_B]);
    expect(getLinkedSkus('SK227', index)).toEqual(['KL255', 'BR344', 'KL300']);
    expect(getLinkedCount('SK227', index)).toBe(3);
    expect(getLinkedSkus('KL255', index)).toEqual(['BR344', 'SK227']);
    expect(getLinkedCount('PN9', index)).toBe(0);
  });

  it('matches variants of a set by suffix', () => {
    expect(resolveLinkedVariantSuffix(catalogue[1], 'P')).toBe('P');
    expect(resolveLinkedVariantSuffix(catalogue[1], 'X')).toBeNull();
    expect(resolveLinkedVariantSuffix(catalogue[3], '')).toBe('');
    expect(resolveLinkedVariantSuffix(catalogue[0], '')).toBeNull();
  });

  it('reports set-mates missing from a document', () => {
    const bySku = new Map(catalogue.map((product) => [product.sku, product]));
    const missing = findMissingSetMates('KL255', 'X', new Set(['KL255', 'BR344']), index, bySku);
    expect(missing.map((mate) => [mate.product.sku, mate.suffix])).toEqual([['SK227', 'X']]);
    const missingBase = findMissingSetMates('KL255', 'X', new Set(['KL255']), index, bySku);
    expect(missingBase.map((mate) => [mate.product.sku, mate.suffix])).toEqual([['BR344', null], ['SK227', 'X']]);
  });

  it('returns an empty index for products without sets', () => {
    expect(buildProductLinkIndex([{ sku: 'A' }]).groups.size).toBe(0);
  });
});

describe('product link mapping', () => {
  it('maps product_link_members rows onto link_groups', () => {
    const [product, other] = mapProductsWithRelations(
      [
        { sku: 'KL255', prefix: 'KL', category: 'Κολιέ', gender: Gender.Women, weight_g: 1, plating_type: PlatingType.None, production_type: ProductionType.InHouse },
        { sku: 'BR344', prefix: 'BR', category: 'Βραχιόλι', gender: Gender.Women, weight_g: 1, plating_type: PlatingType.None, production_type: ProductionType.InHouse },
      ],
      { links: [{ group_id: SET_A, product_sku: 'KL255', position: 0 }, { group_id: SET_A, product_sku: 'BR344', position: 1 }] },
      { publicImageBaseUrl: 'https://cdn.example.com', centralWarehouseId: 'c', showroomWarehouseId: 's' },
    );
    expect(product.link_groups).toEqual([{ group_id: SET_A, position: 0 }]);
    expect(getLinkedSkus('KL255', buildProductLinkIndex([product, other]))).toEqual(['BR344']);
  });
});
