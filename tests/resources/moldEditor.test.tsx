// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoldsPage, { MoldEditor } from '../../components/MoldsPage';
import { UIProvider } from '../../components/UIProvider';
import type { Mold } from '../../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mold: Mold = { code: 'L100', location: 'A1', description: 'παλιό', weight_g: 12 };

describe('new mold code suggestion', () => {
  it.each(['L1262', 'L1262A', 'L1262B', 'L1262G', 'L1262Α', 'L1262Β', 'L1262Γ', 'L1262Δ', ' l1262δ ', 'L1262AΓ'])(
    'suggests L1263 when the highest standard number is in %j',
    (highestCode) => {
      const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
      const codes = ['L1261', highestCode, 'LSTX9000', 'X9000', 'L9000-1'];
      client.setQueryData<Mold[]>(['molds'], codes.map(code => ({ ...mold, code })));

      render(
        <QueryClientProvider client={client}>
          <UIProvider><MoldsPage /></UIProvider>
        </QueryClientProvider>,
      );

      fireEvent.click(screen.getAllByRole('button', { name: 'Νέο Λάστιχο' })[0]);
      const codeInput = screen.getByPlaceholderText<HTMLInputElement>('π.χ. L1221 ή LSTX12');
      expect(codeInput.value).toBe('L1263');
    },
  );
});

describe('mold editor code field', () => {
  it('lets you rename an existing λάστιχο from the pencil editor', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MoldEditor
        initial={mold}
        seed={mold}
        existingCodes={new Set(['L100', 'L200'])}
        locations={['A1']}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    const codeInput = screen.getByPlaceholderText('π.χ. L1221 ή LSTX12') as HTMLInputElement;
    expect(codeInput.value).toBe('L100');
    expect(codeInput.disabled).toBe(false);

    fireEvent.change(codeInput, { target: { value: 'L101' } });
    fireEvent.click(screen.getByRole('button', { name: /Αποθήκευση/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { code: 'L101', location: 'A1', description: 'παλιό', weight_g: 12 },
        false,
      );
    });
  });

  it('keeps the original code when only other details change', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <MoldEditor
        initial={mold}
        seed={mold}
        existingCodes={new Set(['L100'])}
        locations={['A1']}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Συρτάρι 1'), { target: { value: 'B2' } });
    fireEvent.click(screen.getByRole('button', { name: /Αποθήκευση/ }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        { code: 'L100', location: 'B2', description: 'παλιό', weight_g: 12 },
        false,
      );
    });
  });

  it('blocks a rename to a code that already exists', () => {
    const onSubmit = vi.fn();
    render(
      <MoldEditor
        initial={mold}
        seed={mold}
        existingCodes={new Set(['L100', 'L200'])}
        locations={['A1']}
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('π.χ. L1221 ή LSTX12'), { target: { value: 'L200' } });
    fireEvent.click(screen.getByRole('button', { name: /Αποθήκευση/ }));

    expect(screen.getByText('Ο κωδικός L200 υπάρχει ήδη.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
