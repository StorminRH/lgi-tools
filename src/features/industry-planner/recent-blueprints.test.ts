import { describe, expect, it } from 'vitest';
import { mergeRecent, type RecentBlueprint } from './recent-blueprints';

const bp = (typeId: number, name = `BP ${typeId}`): RecentBlueprint => ({ typeId, name });

describe('mergeRecent', () => {
  it('prepends a new entry, newest first', () => {
    expect(mergeRecent([bp(1)], bp(2))).toEqual([bp(2), bp(1)]);
  });

  it('floats a re-viewed blueprint back to the top, deduped by typeId', () => {
    const merged = mergeRecent([bp(1), bp(2), bp(3)], bp(3, 'Renamed'));
    expect(merged).toEqual([bp(3, 'Renamed'), bp(1), bp(2)]);
  });

  it('caps the list at the max, dropping the oldest', () => {
    const four = [bp(1), bp(2), bp(3), bp(4)];
    expect(mergeRecent(four, bp(5), 4)).toEqual([bp(5), bp(1), bp(2), bp(3)]);
  });
});
