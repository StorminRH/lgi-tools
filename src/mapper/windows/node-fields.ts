'use client';

// The one owner of "read a node's display field from the React Flow store".
// Window chrome (title bars) and the intelligence body both consume this
// selector, so the equality-stable lookup strategy (select a primitive from
// state.nodeLookup, never the hot array — the 4.0.3.3 window-layer rule) lives in
// exactly one place.
import { useStore } from '@xyflow/react';

/** One node-data string field, identity-stable across position-only updates. */
export function useNodeDataString(
  systemId: number | null,
  field: 'name',
): string | null {
  return useStore((state) => {
    if (systemId === null) return null;
    const node = state.nodeLookup.get(String(systemId));
    const value = node?.data[field];
    return typeof value === 'string' ? value : null;
  });
}

/** One node-data number field, stable across position-only updates. */
export function useNodeDataNumber(
  systemId: number | null,
  field: 'security' | 'whClassId',
): number | null {
  return useStore((state) => {
    if (systemId === null) return null;
    const node = state.nodeLookup.get(String(systemId));
    const value = node?.data[field];
    return typeof value === 'number' ? value : null;
  });
}
