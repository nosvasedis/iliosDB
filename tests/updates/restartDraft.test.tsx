// @vitest-environment jsdom
import React, { Suspense, useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { appUpdates } from '../../lib/appUpdates';
import { lazyWithChunkRecovery, recoverFromChunkLoadError } from '../../lib/chunkLoadRecovery';
import { productDraftSnapshot } from '../../lib/editorSnapshots';

const roots: ReturnType<typeof render>[] = [];
afterEach(() => { roots.splice(0); cleanup(); vi.restoreAllMocks(); });

describe('restart protection at editor state owners', () => {
  it('ignores automatic variant costs and stock refreshes but tracks manual prices and weights', () => {
    const product = { sku: 'RN001', weight_g: 2, labor: { casting_cost: 1 }, variants: [{ suffix: 'X', active_price: 5, selling_price: 10, stock_qty: 1 }] } as any;
    const refreshed = { ...product, stock_qty: 9, labor: { casting_cost: 2 }, variants: [{ ...product.variants[0], active_price: 7, stock_qty: 5 }] };
    expect(productDraftSnapshot(refreshed)).toEqual(productDraftSnapshot(product));
    expect(productDraftSnapshot({ ...refreshed, weight_g: 3 })).not.toEqual(productDraftSnapshot(product));
    expect(productDraftSnapshot({ ...refreshed, variants: [{ ...refreshed.variants[0], selling_price: 11 }] })).not.toEqual(productDraftSnapshot(product));
  });
  it('blocks changed drafts, preserves the block on failure, and clears only after saving', async () => {
    let edit!: (value: string) => void; let save!: () => void;
    function Editor() {
      const [value, setValue] = useState('saved'); edit = setValue;
      const draft = useRestartDraft('Παραγγελία', { value }); save = draft.markSaved;
      return <input value={value} readOnly />;
    }
    await act(async () => { roots.push(render(<Editor />)); });
    expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    await act(async () => edit('unsaved'));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    // Re-rendering, including after an unrelated failed request, isn't a save.
    await act(async () => roots[0].rerender(<Editor />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => save()); expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    await act(async () => edit('later edit')); expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
  });
  it('does not clear edits typed during an in-flight save', async () => {
    let edit!: (value: string) => void; let save!: () => void;
    function Editor() { const [value, set] = useState(''); edit = set; const draft = useRestartDraft('Πελάτης', { value }); save = draft.markSaved; return null; }
    await act(async () => { roots.push(render(<Editor />)); });
    await act(async () => edit('submitted'));
    const completeSave = save;
    await act(async () => edit('typed during save'));
    await act(async () => completeSave());
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
  });
  it('cleans up closed nested editors without removing their parent protection', async () => {
    let edit!: () => void;
    function Parent({ nested }: { nested: boolean }) { const [value, set] = useState(''); edit = () => set('changed'); useRestartDraft('Παραγγελία', value); return nested ? <Child /> : null; }
    function Child() { useRestartDraft('Πελάτης', {}, { initiallyDirty: true }); return null; }
    await act(async () => { roots.push(render(<Parent nested />)); });
    await act(async () => edit());
    expect(appUpdates.getSnapshot().blockers).toHaveLength(2);
    await act(async () => roots[0].rerender(<Parent nested={false} />));
    expect(appUpdates.getSnapshot().blockers.map(item => item.label)).toEqual(['Παραγγελία']);
  });
  it('treats restored draft data as unsaved and ignores changes while the editor is closed', async () => {
    function Editor({ value, enabled }: { value: string; enabled: boolean }) { useRestartDraft('Παραγγελία', value, { enabled }); return null; }
    await act(async () => { roots.push(render(<Editor value="" enabled />)); });
    await act(async () => roots[0].rerender(<Editor value="restored" enabled />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => roots[0].rerender(<Editor value="restored" enabled={false} />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(false);
  });
  it('offers retry for a failed lazy screen without resetting a sibling draft or navigating', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValue({ default: () => <span>Loaded</span> });
    const Screen = lazyWithChunkRecovery(factory);
    let edit!: (value: string) => void;
    function Workspace() { const [draft, set] = useState(''); edit = set; useRestartDraft('Δοκιμαστικό πρόχειρο', draft); return <><input value={draft} readOnly /><Suspense fallback={<span>Loading</span>}><Screen /></Suspense></>; }
    await act(async () => { roots.push(render(<Workspace />)); });
    await act(async () => edit('precious work'));
    expect((roots[0].container.querySelector('input') as HTMLInputElement).value).toBe('precious work');
    await act(async () => { roots[0].getByRole('button', { name: 'Επανεκκίνηση εφαρμογής' }).click(); });
    expect(appUpdates.getSnapshot().reason).toBeTruthy();
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => { roots[0].getByRole('button', { name: 'Δοκιμή ξανά' }).click(); });
    expect((roots[0].container.querySelector('input') as HTMLInputElement).value).toBe('precious work');
    expect(roots[0].getByText('Loaded').tagName).toBe('SPAN');
    expect(factory).toHaveBeenCalledTimes(2);
    expect(await recoverFromChunkLoadError('old-build')).toBe(false);
  });
});
