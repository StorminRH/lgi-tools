import type { ReactElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WindowPlacement } from './window-model';

const h = vi.hoisted(() => ({ root: { current: null as unknown } }));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useRef: () => h.root,
  useEffect: (effect: () => void) => effect(),
  useCallback: <T>(callback: T) => callback,
}));

import { MapWindow } from './MapWindow';

interface SectionProps {
  readonly ref: (node: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
  readonly onPointerDown?: () => void;
}

const renderWindow = (MapWindow as unknown as {
  render: (props: object, ref: unknown) => ReactElement<SectionProps>;
}).render;

function section(
  placement: WindowPlacement,
  overrides: { appearance?: 'overlay'; ref?: unknown } = {},
) {
  const onClose = vi.fn();
  const onActivate = vi.fn();
  const element = renderWindow(
    { windowId: 'test', title: 'Test', placement, stackIndex: 3, onClose, onActivate, ...overrides },
    overrides.ref ?? null,
  );
  return { props: element.props, onClose, onActivate };
}

function fakeNode() {
  return { style: { setProperty: vi.fn() } };
}

beforeEach(() => {
  h.root.current = null;
});

it('stacks the root through the ref callback and the stack-index effect, forwarding the node', () => {
  const forwarded = vi.fn();
  const { props } = section({ kind: 'docked' }, { ref: forwarded });
  const node = fakeNode();
  props.ref(node);
  expect(h.root.current).toBe(node);
  expect(node.style.setProperty).toHaveBeenCalledWith('--map-window-z', '3');
  expect(forwarded).toHaveBeenCalledWith(node);

  section({ kind: 'docked' });
  expect(node.style.setProperty).toHaveBeenCalledTimes(2);

  props.ref(null);
  expect(forwarded).toHaveBeenLastCalledWith(null);
  expect(node.style.setProperty).toHaveBeenCalledTimes(2);

  const objectRef = { current: null as unknown };
  const withObject = section({ kind: 'docked' }, { ref: objectRef });
  withObject.props.ref(node);
  expect(objectRef.current).toBe(node);
});

it('dismisses anchored cards on Escape and keeps keys and activation off overlays', () => {
  const card = section({ kind: 'scanner-anchored' });
  const escape = { key: 'Escape', defaultPrevented: false, stopPropagation: vi.fn() };
  card.props.onKeyDown?.(escape);
  expect(card.onClose).toHaveBeenCalledTimes(1);
  expect(escape.stopPropagation).toHaveBeenCalled();
  card.props.onKeyDown?.({ ...escape, key: 'a' });
  expect(card.onClose).toHaveBeenCalledTimes(1);
  expect(card.props.onPointerDown).toBe(card.onActivate);

  const dock = section({ kind: 'docked' });
  dock.props.onKeyDown?.(escape);
  expect(dock.onClose).not.toHaveBeenCalled();

  const overlay = section({ kind: 'docked' }, { appearance: 'overlay' });
  expect(overlay.props.onKeyDown).toBeUndefined();
  expect(overlay.props.onPointerDown).toBeUndefined();
});
