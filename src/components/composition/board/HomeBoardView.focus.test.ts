import type { ReactElement, ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { buildDemoBoard, FIXTURE_NOW } from '@/composition/board/demo-board';

// Just enough of a renderer for the board's layout effect: refs keep their
// slot across renders, and each render's layout effect is handed back.
const h = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  layoutEffect: null as (() => void) | null,
  params: new URLSearchParams(),
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ViewTransition: ({ children }: { children: unknown }) => children,
  useState: <T>(init: () => T) => [init(), () => undefined],
  useRef: <T>(initial: T) => (h.refs[h.refIndex++] ??= { current: initial }),
  useCallback: <T>(fn: T) => fn,
  useMemo: <T>(factory: () => T) => factory(),
  useEffect: () => undefined,
  useLayoutEffect: (effect: () => void) => {
    h.layoutEffect = effect;
  },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => h.params }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { HomeBoardView } from './HomeBoardView';

const board = buildDemoBoard(FIXTURE_NOW, 'full');

function renderBoard(query: string): () => void {
  h.params = new URLSearchParams(query);
  h.refIndex = 0;
  const pilotBoard = HomeBoardView({ board, now: FIXTURE_NOW }) as ReactElement<object, (props: object) => ReactNode>;
  pilotBoard.type(pilotBoard.props);
  return h.layoutEffect!;
}

function fakeRoot(top: number) {
  const tile = { focus: vi.fn() };
  return {
    tile,
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({ top }),
    querySelector: vi.fn((selector: string) => (selector === '[data-pilot-id="9900000002"]' ? tile : null)),
  };
}

test('moves focus between the sheet back button and the pilot tile it was opened from', () => {
  h.refs.length = 0;
  // Before the root mounts there is nothing to scroll or focus.
  renderBoard('')();
  const [rootRef, backRef] = h.refs;
  const back = { focus: vi.fn() };
  const scrolled = fakeRoot(-120);
  rootRef!.current = scrolled;
  backRef!.current = back;

  // The same view again is not a change.
  renderBoard('')();
  expect(scrolled.scrollIntoView).not.toHaveBeenCalled();

  // Opening a pilot from a scrolled page brings the sheet top into view and
  // focuses its back button.
  renderBoard('?character=9900000002')();
  expect(scrolled.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(back.focus).toHaveBeenCalledWith({ preventScroll: true });

  // Returning to the overview refocuses that pilot's tile without scrolling.
  const inView = fakeRoot(40);
  rootRef!.current = inView;
  renderBoard('')();
  expect(inView.scrollIntoView).not.toHaveBeenCalled();
  expect(inView.tile.focus).toHaveBeenCalledWith({ preventScroll: true });
  expect(back.focus).toHaveBeenCalledTimes(1);
});

test('returns to an overview that was never left from a pilot without moving focus', () => {
  h.refs.length = 0;
  renderBoard('?character=9900000002');
  const [rootRef, , lastOpened] = h.refs;
  const root = fakeRoot(0);
  rootRef!.current = root;
  lastOpened!.current = null;

  renderBoard('')();
  expect(root.querySelector).not.toHaveBeenCalled();
  expect(root.scrollIntoView).not.toHaveBeenCalled();
});
