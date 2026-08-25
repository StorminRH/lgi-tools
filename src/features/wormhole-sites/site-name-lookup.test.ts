import { readFileSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import {
  setSiteNameIndex,
  siteEstIskForSiteName,
  siteIdForSiteName,
  siteLiveRecipesForSiteName,
} from './site-name-lookup';

afterEach(() => {
  setSiteNameIndex([]);
});

/** Canonical public ids 1–69 from the historical seed (offset −70). */
function catalogueFromSeed(): readonly { id: number; name: string }[] {
  const text = readFileSync('drizzle/0006_historical_seed.sql', 'utf8');
  const pat =
    /^\s*\((\d+),\s*'[^']*',\s*'((?:[^']|'')*)',\s*'[^']*',/gm;
  const rows: { id: number; name: string }[] = [];
  for (const match of text.matchAll(pat)) {
    const seededId = Number(match[1]);
    if (seededId < 71 || seededId > 139) continue;
    // Capture group 2 is required by `pat` (quoted name column).
    const name = match[2];
    if (name == null) continue;
    rows.push({
      id: seededId - 70,
      name: name.replaceAll("''", "'"),
    });
  }
  return rows;
}

test('site name index matches the deploy catalogue and carries Est. ISK plus live recipes', () => {
  const catalogue = catalogueFromSeed();
  expect(catalogue[0]).toEqual({
    id: 1,
    name: 'Forgotten Perimeter Coronation Platform',
  });
  expect(catalogue.at(-1)).toEqual({
    id: 69,
    name: 'Shattered Ice Field',
  });

  setSiteNameIndex(catalogue);
  expect(siteIdForSiteName('Forgotten Perimeter Coronation Platform')).toBe(1);
  expect(siteIdForSiteName('Shattered Ice Field')).toBe(69);
  expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBe(49);
  expect(siteIdForSiteName('Ordinary Permiter Deposit')).toBe(63);
  expect(siteIdForSiteName('Ordinary Perimeter Deposit')).toBe(63);
  expect(siteIdForSiteName('Sansha Hideout')).toBeNull();
  expect(siteIdForSiteName('Forgotten Frontier')).toBeNull();
  expect(siteIdForSiteName('')).toBeNull();

  setSiteNameIndex([]);
  expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBeNull();

  setSiteNameIndex([
    {
      id: 49,
      name: 'Barren Perimeter Reservoir',
      estIsk: 82_432_500,
      liveRecipes: [{ typeId: 30370, units: 2_500, seedIsk: 28_100_000 }],
    },
    { id: 1, name: 'Forgotten Perimeter Coronation Platform', estIsk: 12_000_000 },
  ]);
  expect(siteEstIskForSiteName('Barren Perimeter Reservoir')).toBe(82_432_500);
  expect(siteEstIskForSiteName('Forgotten Perimeter Coronation Platform')).toBe(
    12_000_000,
  );
  expect(siteEstIskForSiteName('Sansha Hideout')).toBeNull();
  expect(siteLiveRecipesForSiteName('Barren Perimeter Reservoir')).toEqual([
    { typeId: 30370, units: 2_500, seedIsk: 28_100_000 },
  ]);
  expect(
    siteLiveRecipesForSiteName('Forgotten Perimeter Coronation Platform'),
  ).toEqual([]);
  expect(siteLiveRecipesForSiteName('Sansha Hideout')).toEqual([]);

  setSiteNameIndex([
    { id: 49, name: 'Barren Perimeter Reservoir', estIsk: 82_432_500 },
    { id: 1, name: 'Forgotten Perimeter Coronation Platform' },
  ]);
  expect(siteEstIskForSiteName('Forgotten Perimeter Coronation Platform')).toBeNull();
});
