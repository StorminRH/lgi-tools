import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { emptyProfileDocument, type ProfileDocument } from '@/features/industry-planner/profiles/profile-document';

const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  ...rt.react,
}));
vi.mock('@/lib/client-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client-store')>()),
  useClientStore: (store: { get: () => unknown }) => store.get(),
}));
vi.mock('@/components/use-system-search', () => ({ useSystemsById: () => null }));

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
  const tree = rt.render(FacilitiesPanel, { doc, onEdit, structures: [], hulls: [] });
  return [...elements(tree)].find((element) => element.props.onNewStructure)?.props.onNewStructure;
}

beforeEach(() => {
  cancelNewStructure();
  vi.stubGlobal('window', {
    location: { href: 'https://lgi.tools/industry?profile=one' },
    history: { pushState: vi.fn() },
  });
});

afterEach(() => {
  rt.unmount();
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
  rt.hide();
  expect(useNewStructureRequest()).toBeNull();
  settleNewStructure(token, SAVED);
  expect(onEdit).not.toHaveBeenCalled();
});
