// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoldEditor } from '../../components/MoldsPage';
import type { Mold } from '../../types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const mold: Mold = { code: 'L100', location: 'A1', description: 'παλιό', weight_g: 12 };

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
