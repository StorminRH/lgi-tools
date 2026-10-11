import { expect, test, vi } from 'vitest';

// One useCallback slot that keeps its function while the deps hold, as React does between renders.
const slot = vi.hoisted(() => ({ kept: null as null | { fn: unknown; deps: readonly unknown[] } }));
vi.mock('react', () => ({
  useCallback: <T>(fn: T, deps: readonly unknown[]): T => {
    const kept = slot.kept;
    const same = kept !== null && kept.deps.length === deps.length && kept.deps.every((dep, i) => Object.is(dep, deps[i]));
    if (same) return kept.fn as T;
    slot.kept = { fn, deps };
    return fn;
  },
}));

import { useStyleProperties, useStyleProperty } from './use-style-ref';

function fakeHost() {
  const setProperty = vi.fn();
  return { node: { style: { setProperty } } as unknown as HTMLElement, setProperty };
}

test('a property is written as the host attaches, and a changed value comes with a new ref that writes it', () => {
  slot.kept = null;
  const { node, setProperty } = fakeHost();
  const first = useStyleProperty('--pct', '40%');
  first(node);
  expect(setProperty.mock.calls).toEqual([['--pct', '40%']]);

  // Same value on the next render: the ref keeps its identity, so React does not call it again.
  expect(useStyleProperty('--pct', '40%')).toBe(first);

  // A new value: React hands the old ref null and the new one the node in the same commit.
  const next = useStyleProperty('--pct', '60%');
  expect(next).not.toBe(first);
  first(null);
  next(node);
  expect(setProperty.mock.calls).toEqual([
    ['--pct', '40%'],
    ['--pct', '60%'],
  ]);
});

test('a forwarded function or object ref receives the node on attach and null on detach', () => {
  slot.kept = null;
  const { node, setProperty } = fakeHost();
  const forward = vi.fn();
  const viaFunction = useStyleProperty('--map-window-z', '3', forward);
  viaFunction(node);
  viaFunction(null);
  expect(forward.mock.calls).toEqual([[node], [null]]);
  expect(setProperty.mock.calls).toEqual([['--map-window-z', '3']]);

  slot.kept = null;
  const holder = { current: null as HTMLElement | null };
  const viaObject = useStyleProperty('--map-window-z', '4', holder);
  viaObject(node);
  expect(holder.current).toBe(node);
  viaObject(null);
  expect(holder.current).toBeNull();
});

test('a record writes each property on attach, keeps its ref while the record holds, and a missing record writes nothing', () => {
  slot.kept = null;
  const { node, setProperty } = fakeHost();
  const record = { '--map-motion-fast': '250ms', '--map-motion-mid': '1000ms' };
  const ref = useStyleProperties(record);
  ref(node);
  expect(setProperty.mock.calls).toEqual([
    ['--map-motion-fast', '250ms'],
    ['--map-motion-mid', '1000ms'],
  ]);
  expect(useStyleProperties(record)).toBe(ref);
  expect(useStyleProperties({ ...record })).not.toBe(ref);

  slot.kept = null;
  const bare = fakeHost();
  const forward = vi.fn();
  useStyleProperties(null, forward)(bare.node);
  useStyleProperties(undefined)(bare.node);
  expect(bare.setProperty).not.toHaveBeenCalled();
  expect(forward).toHaveBeenCalledWith(bare.node);
});
