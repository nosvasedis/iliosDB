import React, { Suspense, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRestartDraft } from '../../hooks/useRestartBlocker';
import { appUpdates } from '../../lib/appUpdates';
import { lazyWithChunkRecovery, recoverFromChunkLoadError } from '../../lib/chunkLoadRecovery';
import { productDraftSnapshot } from '../../lib/editorSnapshots';

const roots: ReturnType<typeof create>[] = [];
afterEach(async () => { await act(async () => { roots.splice(0).forEach(root => root.unmount()); }); vi.restoreAllMocks(); });

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
    await act(async () => { roots.push(create(<Editor />)); });
    expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    await act(async () => edit('unsaved'));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    // Re-rendering, including after an unrelated failed request, isn't a save.
    await act(async () => roots[0].update(<Editor />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => save()); expect(appUpdates.getSnapshot().blockers).toHaveLength(0);
    await act(async () => edit('later edit')); expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
  });
  it('does not clear edits typed during an in-flight save', async () => {
    let edit!: (value: string) => void; let save!: () => void;
    function Editor() { const [value, set] = useState(''); edit = set; const draft = useRestartDraft('Πελάτης', { value }); save = draft.markSaved; return null; }
    await act(async () => { roots.push(create(<Editor />)); });
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
    await act(async () => { roots.push(create(<Parent nested />)); });
    await act(async () => edit());
    expect(appUpdates.getSnapshot().blockers).toHaveLength(2);
    await act(async () => roots[0].update(<Parent nested={false} />));
    expect(appUpdates.getSnapshot().blockers.map(item => item.label)).toEqual(['Παραγγελία']);
  });
  it('treats restored draft data as unsaved and ignores changes while the editor is closed', async () => {
    function Editor({ value, enabled }: { value: string; enabled: boolean }) { useRestartDraft('Παραγγελία', value, { enabled }); return null; }
    await act(async () => { roots.push(create(<Editor value="" enabled />)); });
    await act(async () => roots[0].update(<Editor value="restored" enabled />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    await act(async () => roots[0].update(<Editor value="restored" enabled={false} />));
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(false);
  });
  it('offers retry for a failed lazy screen without resetting a sibling draft or navigating', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const factory = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module')).mockResolvedValue({ default: () => <span>Loaded</span> });
    const Screen = lazyWithChunkRecovery(factory);
    let edit!: (value: string) => void;
    function Workspace() { const [draft, set] = useState(''); edit = set; useRestartDraft('Δοκιμαστικό πρόχειρο', draft); return <><input value={draft} readOnly /><Suspense fallback={<span>Loading</span>}><Screen /></Suspense></>; }
    await act(async () => { roots.push(create(<Workspace />, { unstable_isConcurrent: true } as any)); });
    await act(async () => edit('precious work'));
    expect(roots[0].root.findByType('input').props.value).toBe('precious work');
    const recover = roots[0].root.findAllByType('button').find(button => button.children.includes('Επανεκκίνηση εφαρμογής'))!;
    await act(async () => recover.props.onClick());
    expect(appUpdates.getSnapshot().reason).toBeTruthy();
    expect(appUpdates.shouldWarnBeforeUnload()).toBe(true);
    const retry = roots[0].root.findAllByType('button').find(button => button.children.includes('Δοκιμή ξανά'))!;
    await act(async () => retry.props.onClick());
    expect(roots[0].root.findByType('input').props.value).toBe('precious work');
    expect(roots[0].root.findByType('span').children).toEqual(['Loaded']);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(await recoverFromChunkLoadError('old-build')).toBe(false);
  });
});
