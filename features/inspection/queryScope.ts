import { isInspectionModeActive } from '../../lib/inspectionMode';

let owner: string | null = null;
export function setInspectionQueryOwner(value: string | null): void { owner = value; }

// Keep the normal root for existing prefix invalidation; isolate the actual entries.
export function inspectionQueryKey<T extends readonly unknown[]>(key: T): readonly unknown[] {
  return isInspectionModeActive() ? [key[0], 'inspection', owner, ...key.slice(1)] : key;
}
