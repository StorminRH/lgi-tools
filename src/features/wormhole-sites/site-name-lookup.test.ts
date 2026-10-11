import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { siteSearchEntry } from './__tests__/site-fixtures';
import { createSiteNameLookups, type SiteCatalogueEntry } from './site-name-lookup';
import { SITE_TYPES } from './site-taxonomy';

function iskOrNull(text: string | undefined): number | null {
  return text === undefined || text === 'NULL' ? null : Number(text);
}

/** The deploy catalogue's sites: id, name, type, blue loot ISK and resource ISK. */
function catalogueFromSeed(): SiteCatalogueEntry[] {
  const text = readFileSync('drizzle/0006_historical_seed.sql', 'utf8');
  const pat =
    /^\s*\((\d+),\s*'[^']*',\s*'((?:[^']|'')*)',\s*'([a-z]+)',\s*'[^']*',\s*(?:'[^']*'|NULL),\s*(\d+|NULL),\s*[^,]+,\s*(\d+|NULL),/gm;
  const rows: SiteCatalogueEntry[] = [];
  for (const match of text.matchAll(pat)) {
    const seededId = Number(match[1]);
    if (seededId < 71 || seededId > 139) continue;

    const name = match[2];
    const siteType = SITE_TYPES.find((type) => type === match[3]);
    if (name == null || siteType === undefined) continue;
    rows.push({
      id: seededId - 70,
      name: name.replaceAll("''", "'"),
      siteType,
      blueLootIsk: iskOrNull(match[4]),
      resourceValueIsk: iskOrNull(match[5]),
    });
  }
  return rows;
}

test('site name lookups resolve the deploy catalogue, its typo alias both ways, and the headline ISK', () => {
  const catalogue = catalogueFromSeed();
  expect(catalogue).toHaveLength(69);
  expect(catalogue[0]).toEqual({
    id: 1,
    name: 'Forgotten Perimeter Coronation Platform',
    siteType: 'relic',
    blueLootIsk: 12_800_000,
    resourceValueIsk: null,
  });
  expect(catalogue.at(-1)).toEqual({
    id: 69,
    name: 'Shattered Ice Field',
    siteType: 'ore',
    blueLootIsk: null,
    resourceValueIsk: 8_961_798_806,
  });

  const lookups = createSiteNameLookups(catalogue);
  expect(lookups.siteIdForName('Forgotten Perimeter Coronation Platform')).toBe(1);
  expect(lookups.siteIdForName('Shattered Ice Field')).toBe(69);
  expect(lookups.siteIdForName('Barren Perimeter Reservoir')).toBe(49);
  expect(lookups.siteIdForName('Ordinary Permiter Deposit')).toBe(63);
  expect(lookups.siteIdForName('Ordinary Perimeter Deposit')).toBe(63);
  expect(lookups.siteIdForName('Sansha Hideout')).toBeNull();
  expect(lookups.siteIdForName('Forgotten Frontier')).toBeNull();
  expect(lookups.siteIdForName('')).toBeNull();

  // A relic site reads its blue loot; gas and ore read their resources,
  // even when the sheet also carries a blue loot figure for them.
  expect(lookups.estIskForName('Forgotten Perimeter Coronation Platform')).toBe(12_800_000);
  expect(lookups.estIskForName('Barren Perimeter Reservoir')).toBe(82_432_500);
  expect(lookups.estIskForName('Ordinary Perimeter Deposit')).toBe(284_690_300);
  expect(lookups.estIskForName('Sansha Hideout')).toBeNull();
  expect(lookups.liveRecipesForName('Barren Perimeter Reservoir')).toEqual([]);
  expect(lookups.liveRecipesForName('Sansha Hideout')).toEqual([]);
});

test('site name lookups carry live recipes, and an empty index resolves nothing', () => {
  const recipes = [{ typeId: 30370, units: 2_500, seedIsk: 28_100_000 }];
  const lookups = createSiteNameLookups([
    siteSearchEntry({
      id: 49,
      name: 'Barren Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
      blueLootIsk: 2_000_000,
      resourceValueIsk: 82_432_500,
      liveRecipes: recipes,
    }),
    siteSearchEntry({
      id: 2,
      name: 'Perimeter Ambush Point',
      wormholeClass: 'C1',
      blueLootIsk: 8_600_000,
      resourceValueIsk: 99_000_000,
    }),
  ]);
  expect(lookups.estIskForName('Barren Perimeter Reservoir')).toBe(82_432_500);
  expect(lookups.liveRecipesForName('Barren Perimeter Reservoir')).toEqual(recipes);
  expect(lookups.estIskForName('Perimeter Ambush Point')).toBe(8_600_000);
  expect(lookups.liveRecipesForName('Perimeter Ambush Point')).toEqual([]);

  const empty = createSiteNameLookups([]);
  expect(empty.siteIdForName('Barren Perimeter Reservoir')).toBeNull();
  expect(empty.estIskForName('Barren Perimeter Reservoir')).toBeNull();
  expect(empty.liveRecipesForName('Barren Perimeter Reservoir')).toEqual([]);
});
