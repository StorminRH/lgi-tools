import { describe, expect, it } from 'vitest';
import type { RecentBlueprint } from './recent-blueprints';
import { isWatched, toggleWatched, WATCHLIST_MAX } from './watchlist';

const bp = (typeId: number): RecentBlueprint => ({ typeId, productTypeId: typeId + 1000, name: `BP ${typeId}` });

describe('toggleWatched', () => {
  it('adds an unwatched blueprint to the front', () => {
    expect(toggleWatched([bp(1)], bp(2))).toEqual([bp(2), bp(1)]);
  });

  it('removes a blueprint that is already watched', () => {
    expect(toggleWatched([bp(1), bp(2)], bp(1))).toEqual([bp(2)]);
  });

  it('caps the list, dropping the oldest', () => {
    expect(toggleWatched([bp(1), bp(2)], bp(3), 2)).toEqual([bp(3), bp(1)]);
  });

  it('fits one price refresh by default', () => {
    expect(WATCHLIST_MAX).toBe(50);
  });
});

describe('isWatched', () => {
  it('matches on the blueprint type', () => {
    expect(isWatched([bp(1)], 1)).toBe(true);
    expect(isWatched([bp(1)], 1001)).toBe(false);
  });
});
