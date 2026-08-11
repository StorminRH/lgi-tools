import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
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
    rows.push({
      id: seededId - 70,
      name: match[2]!.replaceAll("''", "'"),
    });
  }
  return rows;
}

describe('siteIdForSiteName', () => {
  it('matches the deploy-static catalogue exactly and rejects unknown names', () => {
    const catalogue = catalogueFromSeed();
    expect(catalogue).toHaveLength(69);
    expect(catalogue[0]).toEqual({
      id: 1,
      name: 'Forgotten Perimeter Coronation Platform',
    });
    expect(catalogue[68]).toEqual({
      id: 69,
      name: 'Shattered Ice Field',
    });

    setSiteNameIndex(catalogue);

    for (const site of catalogue) {
      expect(siteIdForSiteName(site.name)).toBe(site.id);
    }
    expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBe(49);
    expect(siteIdForSiteName('Sansha Hideout')).toBeNull();
    expect(siteIdForSiteName('Forgotten Frontier')).toBeNull();
    expect(siteIdForSiteName('')).toBeNull();

    setSiteNameIndex([]);
    expect(siteIdForSiteName('Barren Perimeter Reservoir')).toBeNull();
  });

  it('carries catalogue headline Est. ISK beside the id', () => {
    setSiteNameIndex([
      { id: 49, name: 'Barren Perimeter Reservoir', estIsk: 82_432_500 },
      { id: 1, name: 'Forgotten Perimeter Coronation Platform' },
    ]);
    expect(siteEstIskForSiteName('Barren Perimeter Reservoir')).toBe(82_432_500);
    expect(siteEstIskForSiteName('Forgotten Perimeter Coronation Platform')).toBeNull();
    expect(siteEstIskForSiteName('Sansha Hideout')).toBeNull();
  });

  it('seeds live-eligible harvestable recipes beside Est. ISK', () => {
    setSiteNameIndex([
      {
        id: 49,
        name: 'Barren Perimeter Reservoir',
        estIsk: 28_100_000,
        liveRecipes: [{ typeId: 30370, units: 2_500, seedIsk: 28_100_000 }],
      },
      { id: 1, name: 'Forgotten Perimeter Coronation Platform', estIsk: 12_000_000 },
    ]);
    expect(siteLiveRecipesForSiteName('Barren Perimeter Reservoir')).toEqual([
      { typeId: 30370, units: 2_500, seedIsk: 28_100_000 },
    ]);
    expect(siteLiveRecipesForSiteName('Forgotten Perimeter Coronation Platform')).toEqual(
      [],
    );
    expect(siteLiveRecipesForSiteName('Sansha Hideout')).toEqual([]);
  });
});

