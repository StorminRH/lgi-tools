import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyProfileDocument, type ProfileDocument } from '@/features/industry-planner/profiles/profile-document';

const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>,
  cursor: 0,
  effects: [] as Array<{ dependencies?: readonly unknown[]; cleanup?: () => void }>,
  effectCursor: 0,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: <T>(value: T) => [value, vi.fn()],
  useRef: <T>(value: T) => {
    const index = hooks.cursor++;
    hooks.refs[index] ??= { current: value };
    return hooks.refs[index];
  },
  useLayoutEffect: (effect: () => void | (() => void), dependencies?: readonly unknown[]) => {
    const index = hooks.effectCursor++;
    const previous = hooks.effects[index];
    if (dependencies && previous?.dependencies && dependencies.every((value, i) => Object.is(value, previous.dependencies?.[i]))) return;
    previous?.cleanup?.();
    hooks.effects[index] = { dependencies, cleanup: effect() ?? undefined };
  },
}));
vi.mock('@/lib/client-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client-store')>()),
  useClientStore: (store: { get: () => unknown }) => store.get(),
}));
vi.mock('@/components/use-system-search', () => ({ useSystemSearch: () => ({ systems: [] }) }));

import { FacilitiesPanel } from './FacilitiesPanel';
import { cancelNewStructure, settleNewStructure, useNewStructureRequest } from './structures-panel';

const SAVED = { id: 'saved-custom-id', name: 'New Raitaru', systemId: 30000142, groupId: 1404 };

function* elements(node: unknown): Generator<ReactElement<{ children?: unknown; onNewStructure?: () => void }>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* elements(child);
  } else if (isValidElement<{ children?: unknown; onNewStructure?: () => void }>(node)) {
    yield node;
    yield* elements(node.props.children);
  }
}

function render(doc: ProfileDocument, onEdit: (next: ProfileDocument) => void) {
  hooks.cursor = 0;
  hooks.effectCursor = 0;
  const tree = FacilitiesPanel({ doc, onEdit, structures: [], hulls: [] });
  return [...elements(tree)].find((element) => element.props.onNewStructure)?.props.onNewStructure;
}

function hideOrUnmount() {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.effects = [];
}

beforeEach(() => {
  hooks.refs = [];
  hooks.effects = [];
  cancelNewStructure();
  vi.stubGlobal('window', {
    location: { href: 'https://lgi.tools/industry?profile=one' },
    history: { pushState: vi.fn() },
  });
});

afterEach(() => {
  hideOrUnmount();
  cancelNewStructure();
  vi.unstubAllGlobals();
});

test('an active request adds to the latest committed profile document and callback', () => {
  const oldEdit = vi.fn();
  render(emptyProfileDocument(), oldEdit)!();
  const token = useNewStructureRequest()!;
  const latest = emptyProfileDocument([{ characterId: 101, name: 'Added meanwhile' }]);
  const latestEdit = vi.fn();
  render(latest, latestEdit);
  settleNewStructure(token, SAVED);

  expect(oldEdit).not.toHaveBeenCalled();
  expect(latestEdit).toHaveBeenCalledExactlyOnceWith({
    v: 2,
    members: [{ characterId: 101, name: 'Added meanwhile', categories: [] }],
    facilities: [{ kind: 'structure', id: 'saved-custom-id', name: 'New Raitaru', systemId: 30000142, categories: ['manufacturing'] }],
  });
});

test('owner cleanup cancels the request before a late save after route hide or profile replacement', () => {
  const onEdit = vi.fn();
  render(emptyProfileDocument(), onEdit)!();
  const token = useNewStructureRequest()!;
  hideOrUnmount();
  expect(useNewStructureRequest()).toBeNull();
  settleNewStructure(token, SAVED);
  expect(onEdit).not.toHaveBeenCalled();
});
