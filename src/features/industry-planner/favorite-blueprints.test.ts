import { expect, test, vi } from 'vitest';
import { MAX_FAVORITE_BLUEPRINTS } from '@/lib/preferences';

const h = vi.hoisted(() => ({
  ready: true,
  favorites: [] as { typeId: number; name: string }[],
  set: vi.fn(),
}));

vi.mock('react', () => ({ useCallback: <T>(fn: T) => fn }));
vi.mock('@/components/PreferencesProvider', () => ({
  usePreferencesReady: () => h.ready,
  usePreference: () => [h.favorites, h.set],
}));

const { useFavoriteBlueprints } = await import('./favorite-blueprints');

const fav = (typeId: number) => ({ typeId, name: `Blueprint ${typeId}` });

test('the saved stars read as none until they load and a star before then changes nothing; then starring puts a blueprint first, starring again takes it off, and past the cap the oldest drops', () => {
  h.ready = false;
  h.favorites = [fav(1), fav(2)];
  expect(useFavoriteBlueprints().favorites).toBeNull();
  useFavoriteBlueprints().toggle(fav(3));
  expect(h.set).not.toHaveBeenCalled();

  h.ready = true;
  expect(useFavoriteBlueprints().favorites).toEqual([fav(1), fav(2)]);
  useFavoriteBlueprints().toggle(fav(3));
  expect(h.set).toHaveBeenLastCalledWith([fav(3), fav(1), fav(2)]);
  useFavoriteBlueprints().toggle(fav(1));
  expect(h.set).toHaveBeenLastCalledWith([fav(2)]);

  h.set.mockReset();
  h.favorites = Array.from({ length: MAX_FAVORITE_BLUEPRINTS }, (_, i) => fav(i + 1));
  useFavoriteBlueprints().toggle(fav(100));
  const saved = h.set.mock.lastCall![0] as { typeId: number }[];
  expect(saved).toHaveLength(MAX_FAVORITE_BLUEPRINTS);
  expect(saved[0]!.typeId).toBe(100);
  expect(saved.some((f) => f.typeId === MAX_FAVORITE_BLUEPRINTS)).toBe(false);
});
