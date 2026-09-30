import type { ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';

// A tiny hook runtime: state, refs and effect deps persist by call order, and
// an effect re-runs (after its cleanup) only when its deps change.
const h = vi.hoisted(() => {
  const slots: { value: unknown }[] = [];
  const runtime = {
    index: 0,
    flow: { nodes: [] as { id: string; selected: boolean }[], userSelectionActive: false },
    slot<T>(init: () => T): { value: T } {
      const index = runtime.index++;
      slots[index] ??= { value: init() };
      return slots[index] as { value: T };
    },
    effect(effect: () => void | (() => void), deps?: readonly unknown[]) {
      const state = runtime.slot(() => ({ deps: undefined as readonly unknown[] | undefined, cleanup: undefined as void | (() => void) })).value;
      if (state.deps && deps?.every((dep, i) => Object.is(dep, state.deps?.[i]))) return;
      state.cleanup?.();
      state.cleanup = effect();
      state.deps = deps;
    },
  };
  return runtime;
});

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: <T>(initial: T) => {
    const state = h.slot(() => initial);
    const set = (next: T | ((current: T) => T)) => {
      state.value = typeof next === 'function' ? (next as (current: T) => T)(state.value) : next;
    };
    return [state.value, set];
  },
  useRef: <T>(initial: T) => h.slot(() => ({ current: initial })).value,
  useMemo: <T>(factory: () => T) => factory(),
  useCallback: <T>(callback: T) => callback,
  useEffect: h.effect,
  useLayoutEffect: h.effect,
}));
vi.mock('@xyflow/react', () => ({
  useStore: (selector: (state: typeof h.flow) => unknown) => selector(h.flow),
  useStoreApi: () => ({ getState: () => h.flow, subscribe: () => () => undefined }),
}));
vi.mock('@/lib/use-client-committed', () => ({ useClientCommitted: () => true }));
vi.mock('./use-system-label', () => ({
  useSystemLabel: (id: number | null) => (id === null ? null : { name: `J${id}` }),
}));

import { MapWindowLayer } from './MapWindowLayer';

interface SummaryProps {
  readonly summaryId: number | null;
  readonly closing: boolean;
  readonly title: string | undefined;
}

const onDeselect = vi.fn();

function select(...ids: number[]) {
  h.flow.nodes = ids.map((id) => ({ id: String(id), selected: true }));
}

function card(): SummaryProps {
  h.index = 0;
  const outer = MapWindowLayer({ dockSystemId: null, onDeselect }) as ReactElement<object, (props: object) => ReactElement<{ children: ReactNode[] }>>;
  const layer = outer.type(outer.props);
  const summary = layer.props.children.find((child) => {
    const { type } = child as ReactElement;
    return typeof type === 'function' && type.name === 'SummarySurface';
  }) as ReactElement<SummaryProps>;
  const leader = layer.props.children[0] as ReactElement<{ closing: boolean }>;
  expect(leader.props.closing).toBe(summary.props.closing);
  const { summaryId, closing, title } = summary.props;
  return { summaryId, closing, title };
}

test('a deselected card lingers for its exit animation, and a new selection replaces it at once', () => {
  vi.useFakeTimers();
  vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  try {
    expect(card()).toEqual({ summaryId: null, closing: false, title: undefined });

    select(5);
    expect(card()).toEqual({ summaryId: 5, closing: false, title: 'J5' });

    // Deselecting keeps the card up, marked closing, until the exit timing ends.
    select();
    expect(card()).toEqual({ summaryId: 5, closing: true, title: 'J5' });
    vi.advanceTimersByTime(179);
    expect(card()).toEqual({ summaryId: 5, closing: true, title: 'J5' });
    vi.advanceTimersByTime(1);
    expect(card()).toEqual({ summaryId: null, closing: false, title: undefined });

    // A multi-select shows no card, same as none.
    select(5, 6);
    expect(card().summaryId).toBeNull();

    // Selecting another system mid-exit swaps the card and cancels the removal.
    select(5);
    card();
    select();
    expect(card().closing).toBe(true);
    select(8);
    expect(card()).toEqual({ summaryId: 8, closing: false, title: 'J8' });
    vi.advanceTimersByTime(500);
    expect(card()).toEqual({ summaryId: 8, closing: false, title: 'J8' });
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
