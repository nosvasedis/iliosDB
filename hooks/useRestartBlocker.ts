import { useLayoutEffect, useRef, useState } from 'react';
import { appUpdates, type RestartBlocker } from '../lib/appUpdates';

export function useRestartBlocker({ label, dirty = false, busy = false }: RestartBlocker) {
  const id = useRef({});
  useLayoutEffect(() => {
    appUpdates.setBlocker(id.current, { label, dirty, busy });
  }, [label, dirty, busy]);
  useLayoutEffect(() => () => appUpdates.setBlocker(id.current), []);
}

/** Compare saveable data, never DOM input events or unrelated query successes. */
export function useRestartDraft(label: string, value: unknown, options: {
  enabled?: boolean; busy?: boolean; identity?: unknown; initiallyDirty?: boolean;
} = {}) {
  const enabled = options.enabled !== false;
  const signature = enabled ? (JSON.stringify(value) ?? 'null') : '';
  const baseline = useRef({ signature, identity: options.identity, enabled, unsaved: !!options.initiallyDirty });
  const [, render] = useState(0);
  // Identity changes open a different editor; normal background refetches don't.
  if (baseline.current.identity !== options.identity || (!baseline.current.enabled && enabled)) {
    baseline.current = { signature, identity: options.identity, enabled, unsaved: !!options.initiallyDirty };
  }
  baseline.current.enabled = enabled;
  const dirty = enabled && (baseline.current.unsaved || signature !== baseline.current.signature);
  useRestartBlocker({ label, dirty, busy: options.busy });
  return {
    dirty,
    markSaved: (savedValue: unknown = value) => {
      const next = typeof savedValue === 'function' ? savedValue(JSON.parse(baseline.current.signature || 'null')) : savedValue;
      baseline.current.signature = JSON.stringify(next) ?? 'null';
      baseline.current.unsaved = false;
      render(n => n + 1);
    },
  };
}
