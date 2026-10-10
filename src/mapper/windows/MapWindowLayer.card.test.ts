import type { ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  flow: { nodes: [] as { id: string; selected: boolean }[], userSelectionActive: false },
}));
// State, refs and effect deps persist by call order, and an effect re-runs
// (after its cleanup) only when its deps change.
const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
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
  const layer = rt.render(() => {
    const outer = MapWindowLayer({ dockSystemId: null, onDeselect }) as ReactElement<object, (props: object) => ReactElement<{ children: ReactNode[] }>>;
    return outer.type(outer.props);
  });
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
