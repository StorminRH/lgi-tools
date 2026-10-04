import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cancelNewStructure,
  requestNewStructure,
  setStructuresPanelOpen,
  settleNewStructure,
  useNewStructureRequest,
} from './structures-panel';

vi.mock('@/lib/client-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client-store')>()),
  useClientStore: (store: { get: () => unknown }) => store.get(),
}));

const pushState = vi.fn();
const SAVED = { id: 'cs-9', name: 'Perimeter Raitaru', systemId: 30000144, groupId: 1404 };

beforeEach(() => {
  cancelNewStructure();
  pushState.mockReset();
  vi.stubGlobal('window', {
    location: { href: 'https://lgi.tools/industry?profile=p1' },
    history: { pushState },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the drawer opens and closes through the address', () => {
  setStructuresPanelOpen(true);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1&panel=structures');
  setStructuresPanelOpen(false);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1');
});

test('a profile asking for a new structure gets it once saved, and the drawer closes', () => {
  const then = vi.fn();
  requestNewStructure(then);
  const token = useNewStructureRequest()!;
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1&panel=structures');

  settleNewStructure(token, SAVED);
  expect(then).toHaveBeenCalledWith(SAVED);
  expect(pushState).toHaveBeenLastCalledWith(null, '', '/industry?profile=p1');
});

test('a cancelled form or a closed drawer drops the ask', () => {
  const then = vi.fn();
  requestNewStructure(then);
  const first = useNewStructureRequest()!;
  settleNewStructure(first, null);
  settleNewStructure(first, SAVED);

  requestNewStructure(then);
  const second = useNewStructureRequest()!;
  setStructuresPanelOpen(false);
  settleNewStructure(second, SAVED);

  expect(then).not.toHaveBeenCalled();
});

test('a previous owner cleanup and late save cannot cancel or complete a replacement request', () => {
  const oldDelivery = vi.fn();
  const cancelOld = requestNewStructure(oldDelivery);
  const oldToken = useNewStructureRequest()!;
  const delivery = vi.fn();
  requestNewStructure(delivery);
  const token = useNewStructureRequest()!;

  cancelOld();
  settleNewStructure(oldToken, SAVED);
  expect(useNewStructureRequest()).toBe(token);
  expect(oldDelivery).not.toHaveBeenCalled();
  expect(delivery).not.toHaveBeenCalled();

  settleNewStructure(token, SAVED);
  expect(delivery).toHaveBeenCalledExactlyOnceWith(SAVED);
  expect(useNewStructureRequest()).toBeNull();
});
