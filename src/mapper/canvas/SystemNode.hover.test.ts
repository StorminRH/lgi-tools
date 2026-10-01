import type { ReactElement } from 'react';
import type { NodeProps } from '@xyflow/react';
import { beforeEach, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  root: { current: null as unknown },
  listeners: null as Set<() => void> | null,
  hovered: false,
  setHovered: (() => undefined) as (value: boolean) => void,
  cleanups: [] as Array<() => void>,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => h.root,
  useContext: () => h.listeners,
  useState: () => [h.hovered, h.setHovered],
  useMemo: <T>(factory: () => T) => factory(),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) h.cleanups.push(cleanup);
  },
}));

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
}));

import { SystemNode, type ChainNode } from './SystemNode';

interface RootProps {
  readonly onPointerEnter: (event: { pointerType: string }) => void;
  readonly onPointerLeave: () => void;
  readonly onPointerCancel: () => void;
  readonly children: [ReactElement, ReactElement<{ active: boolean }>];
}

function renderRoot(selected = false): RootProps {
  const component = (SystemNode as unknown as {
    type: (props: NodeProps<ChainNode>) => ReactElement<RootProps>;
  }).type;
  return component({
    id: '31000001',
    data: { name: 'J123456', className: 'C3', whClassId: 3 },
    selected,
  } as unknown as NodeProps<ChainNode>).props;
}

beforeEach(() => {
  h.root.current = null;
  h.listeners = null;
  h.hovered = false;
  h.setHovered = vi.fn();
  h.cleanups.length = 0;
});

it('hovers on mouse or pen pointers but not touch, and clears on leave or cancel', () => {
  h.listeners = new Set();
  const root = renderRoot();
  expect(h.listeners.size).toBe(0);
  expect(root.children[1].props.active).toBe(false);

  root.onPointerEnter({ pointerType: 'touch' });
  expect(h.setHovered).not.toHaveBeenCalled();
  root.onPointerEnter({ pointerType: 'mouse' });
  expect(h.setHovered).toHaveBeenLastCalledWith(true);
  root.onPointerLeave();
  expect(h.setHovered).toHaveBeenLastCalledWith(false);
  root.onPointerCancel();
  expect(h.setHovered).toHaveBeenCalledTimes(3);
});

it('releases a hover the viewport moved away from and unsubscribes on cleanup', () => {
  h.hovered = true;
  expect(renderRoot().children[1].props.active).toBe(true);
  expect(h.cleanups).toHaveLength(0);

  const listeners = new Set<() => void>();
  h.listeners = listeners;
  renderRoot();
  expect(listeners.size).toBe(1);
  const [release] = listeners;

  release!();
  h.root.current = { matches: () => true };
  release!();
  expect(h.setHovered).not.toHaveBeenCalled();
  h.root.current = { matches: () => false };
  release!();
  expect(h.setHovered).toHaveBeenCalledWith(false);

  h.cleanups[0]!();
  expect(listeners.size).toBe(0);
});
