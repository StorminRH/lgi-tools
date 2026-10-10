import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ hydrated: true, subscribe: null as ((listener: () => void) => () => void) | null }));

vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, client: () => unknown, server: () => unknown) => {
    h.subscribe = subscribe;
    return h.hydrated ? client() : server();
  },
}));

const stored = new Map<string, string>();
const device = {
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
  },
};
vi.stubGlobal('window', device);

const { recordRecentBlueprint, useRecentBlueprints } = await import('./recent-blueprints');

const KEY = 'lgi:industry:recent-blueprints';
const blueprint = (typeId: number) => ({ typeId, productTypeId: typeId + 1, name: `Blueprint ${typeId}` });

beforeEach(() => {
  stored.clear();
  h.hydrated = true;
});

test('nothing is read until hydrated; then the blueprint opened last leads, a reopened one moves up rather than repeating, eight are kept, and an unchanged list reads as the same list', () => {
  h.hydrated = false;
  expect(useRecentBlueprints()).toBeNull();
  h.hydrated = true;
  expect(useRecentBlueprints()).toEqual([]);

  for (const typeId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 3]) recordRecentBlueprint(blueprint(typeId));
  const recents = useRecentBlueprints();
  expect(recents!.map((r) => r.typeId)).toEqual([3, 9, 8, 7, 6, 5, 4, 2]);
  // The same stored list is the same list, so the page does not re-render for nothing.
  expect(useRecentBlueprints()).toBe(recents);
});

test('recents kept by the old landing page still read, and anything malformed is skipped', () => {
  stored.set(KEY, JSON.stringify([blueprint(691), { typeId: 'x' }, null, blueprint(2047)]));
  expect(useRecentBlueprints()).toEqual([blueprint(691), blueprint(2047)]);
  stored.set(KEY, '{not json');
  expect(useRecentBlueprints()).toEqual([]);
  stored.set(KEY, '{"typeId":1}');
  expect(useRecentBlueprints()).toEqual([]);
});

test('a recorded blueprint tells whoever is listening, until they stop', () => {
  useRecentBlueprints();
  const listener = vi.fn();
  const unsubscribe = h.subscribe!(listener);
  recordRecentBlueprint(blueprint(1));
  expect(listener).toHaveBeenCalledTimes(1);
  unsubscribe();
  recordRecentBlueprint(blueprint(2));
  expect(listener).toHaveBeenCalledTimes(1);
});

test('a device that will not store anything still opens blueprints', () => {
  vi.stubGlobal('window', {
    localStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); } },
  });
  expect(() => recordRecentBlueprint(blueprint(1))).not.toThrow();
  vi.stubGlobal('window', {
    get localStorage(): Storage {
      throw new Error('blocked');
    },
  });
  expect(() => recordRecentBlueprint(blueprint(1))).not.toThrow();
  expect(useRecentBlueprints()).toEqual([]);
  vi.stubGlobal('window', device);
});
