// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import SkuProductPicker from '../../components/legal/SkuProductPicker';
import { getLegalDocumentCatalogProducts } from '../../utils/legalDocuments';

vi.mock('../../components/UIProvider', () => ({ useUI: () => ({ showToast: vi.fn() }) }));

afterEach(cleanup);

it('shows each reserved item icon in the legal SKU picker', () => {
  render(<SkuProductPicker sku="" products={getLegalDocumentCatalogProducts([])} onSelect={vi.fn()} legalDocument />);
  fireEvent.focus(screen.getByRole('textbox'));

  const options = screen.getByRole('listbox');
  expect(within(options).getByRole('img', { name: 'Μεταφορικά' })).toBeTruthy();
  expect(within(options).getByRole('img', { name: 'Επισκευή' })).toBeTruthy();
});

it('shows the icon for a saved item code even if no product is loaded', () => {
  render(<SkuProductPicker sku="" itemCode="001" products={[]} onSelect={vi.fn()} compact />);
  expect(screen.getByRole('img', { name: 'Επισκευή' })).toBeTruthy();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '000' } });
  expect(screen.getByRole('img', { name: 'Μεταφορικά' })).toBeTruthy();
});
