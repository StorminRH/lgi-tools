import { beforeEach, expect, test, vi } from 'vitest';
import type { CockpitMarginView } from '../cockpit-kpis-view';

const h = vi.hoisted(() => ({ state: undefined as unknown, set: 0 }));
vi.mock('react', () => ({
  useState: <T>(initial: T) => {
    if (h.state === undefined) h.state = initial;
    return [h.state, (next: T) => { h.state = next; h.set += 1; }];
  },
}));

const { useSettledMargin } = await import('./use-settled-margin');

const view = (showNet: boolean, margin: number): CockpitMarginView => ({
  net: null,
  netAvailable: showNet,
  showNet,
  margin,
  marginPct: null,
  feeSystemName: undefined,
  marginLabel: showNet ? 'Net margin' : 'Gross margin',
});

beforeEach(() => {
  h.state = undefined;
  h.set = 0;
});

test('while fees load for a new profile the settled net stays, marked held, then the new one takes over', () => {
  const before = view(true, -311);
  expect(useSettledMargin(before, false)).toEqual({ view: before, held: false });
  // The new profile has no fees yet, so the live view has fallen back to gross.
  const waiting = view(false, 1_000);
  expect(useSettledMargin(waiting, true)).toEqual({ view: before, held: true });
  expect(h.set).toBe(0);
  const after = view(true, -398);
  expect(useSettledMargin(after, false)).toEqual({ view: after, held: false });
  expect(h.state).toBe(after);
});

test('a gross margin is not held, since fees do not change it', () => {
  const gross = view(false, 1_000);
  useSettledMargin(gross, false);
  const next = view(false, 1_200);
  expect(useSettledMargin(next, true)).toEqual({ view: next, held: false });
});
