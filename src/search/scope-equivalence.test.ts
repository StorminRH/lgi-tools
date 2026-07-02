// Characterization anchor for the scoped-search refactor (3.7.13.1).
//
// This file pins TODAY'S full-scope global-search behavior against the REAL
// wiring manifest (register-all), so the refactor that makes `searchAll`
// scopeable can prove the default path byte-identical: these assertions were
// written and green against the pre-refactor engine and must stay green,
// extended — never edited — by the scoped-invariants suite below them.
//
// Test-file rules that keep the anchor honest:
//  - `import '@/search/register-all'` populates the module registry exactly as
//    the app shell does at boot. NEVER call `__resetSearchSources()` here — it
//    would empty the manifest-populated registry for the whole file. (Vitest
//    gives each test file its own module registry, so search.test.ts's
//    fixture-world reset is unaffected.)
//  - The lazy Blueprints source fetches its index through `apiFetch`; the
//    module mock below serves a fixture instead. The commands source also
//    imports `apiFetch`, but only inside `onSelect` closures the engine never
//    invokes, so the mock is inert there.
//  - Every run asserts console.warn was NOT called — a broken mock or fixture
//    would silently drop a source via allSettled, and the anchor must fail
//    loudly rather than pass vacuously.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const { BP_FIXTURE } = vi.hoisted(() => ({
  BP_FIXTURE: [
    { blueprintTypeId: 29988, productTypeId: 29986, name: 'Legion Blueprint' },
    { blueprintTypeId: 691, productTypeId: 587, name: 'Rifter Blueprint' },
    { blueprintTypeId: 3888, productTypeId: 3841, name: 'Large Shield Extender II Blueprint' },
  ],
}));

vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(async () => ({ ok: true, status: 200, data: { blueprints: BP_FIXTURE } })),
}));

import '@/search/register-all';
import { searchAll, type SearchContext, type SearchResult, type SearchSection } from '@/search';
import { setSiteSearchIndex } from '@/features/wormhole-sites/search';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import type { Session } from '@/features/auth/types';

const SITES_FIXTURE: SiteSearchEntry[] = [
  { id: 101, name: 'Perimeter Ambush Point', siteType: 'combat', wormholeClass: 'C1', blueLootIsk: 12_000_000, resourceValueIsk: null },
  { id: 102, name: 'Perimeter Camp', siteType: 'combat', wormholeClass: 'C1', blueLootIsk: 9_000_000, resourceValueIsk: null },
  { id: 103, name: 'Forgotten Perimeter Coronation Platform', siteType: 'relic', wormholeClass: 'C2', blueLootIsk: 21_000_000, resourceValueIsk: null },
  { id: 104, name: 'Ordinary Perimeter Deposit', siteType: 'ore', wormholeClass: 'C3', blueLootIsk: null, resourceValueIsk: 4_500_000 },
  { id: 105, name: 'Core Garrison', siteType: 'combat', wormholeClass: 'C5', blueLootIsk: 320_000_000, resourceValueIsk: null },
];

const SESSION_FIXTURE: Session = {
  characterId: 90000001,
  name: 'Test Pilot',
  portraitUrl: 'https://images.evetech.net/characters/90000001/portrait',
  role: 'USER',
};

// Shaped like readRecents() output: rows relabeled kind 'recent' with the
// origin preserved, exactly what GlobalSearch feeds into ctx.recents.
const RECENTS_FIXTURE: SearchResult[] = [
  {
    kind: 'recent',
    id: 'site:101',
    label: 'Perimeter Ambush Point',
    sub: 'Combat · 12M ISK',
    href: '/sites/101',
    iconText: 'C1',
    iconTone: 'cls-c1',
    originKind: 'site',
  },
  {
    kind: 'recent',
    id: 'tool:Industry Planner',
    label: 'Industry Planner',
    sub: 'Live · /industry',
    href: '/industry',
    iconText: 'IP',
    iconTone: 'tool',
    originKind: 'tool',
  },
];

const signedOut = (): SearchContext => ({ session: null, isAdmin: false, recents: [] });
const signedIn = (): SearchContext => ({ session: SESSION_FIXTURE, isAdmin: false, recents: RECENTS_FIXTURE });
const admin = (): SearchContext => ({ session: SESSION_FIXTURE, isAdmin: true, recents: RECENTS_FIXTURE });

// Content-owned sources (tools, commands) get pinned as a stable projection —
// ids/hrefs/gating, not display copy — so a future copy edit doesn't churn the
// anchor. Fixture-owned sources (sites, blueprints, recents) pin full rows.
function project(sections: SearchSection[]) {
  return sections.map((s) => ({
    name: s.name,
    results: s.results.map((r) => ({
      id: r.id,
      label: r.label,
      href: r.href,
      disabled: r.disabled ?? false,
      hasOnSelect: typeof r.onSelect === 'function',
    })),
  }));
}

let warnSpy: MockInstance;

beforeAll(() => {
  setSiteSearchIndex(SITES_FIXTURE);
});

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  // A dropped source (rejected inside allSettled) would warn — the anchor
  // must never pass by silently losing a section.
  expect(warnSpy).not.toHaveBeenCalled();
  warnSpy.mockRestore();
});

describe('full-scope search over the real manifest (characterization anchor)', () => {
  it('returns nothing for an empty query when there are no recents', async () => {
    expect(await searchAll('', signedOut())).toEqual([]);
  });

  it('surfaces only Recent rows, in recency order, on an empty query', async () => {
    const out = await searchAll('', signedIn());
    expect(out).toEqual([
      {
        name: 'Recent',
        results: RECENTS_FIXTURE.map((r) => ({ ...r, matchIndices: [] })),
      },
    ]);
  });

  it('treats a whitespace-only query exactly like an empty one', async () => {
    expect(await searchAll('   ', signedIn())).toEqual(await searchAll('', signedIn()));
  });

  it('matches sites with per-source ranking (fuzzy score, then class, then ISK)', async () => {
    const out = await searchAll('perimeter', signedOut());
    expect(out).toMatchInlineSnapshot(`
      [
        {
          "name": "Sites",
          "results": [
            {
              "href": "/sites/102",
              "iconText": "C1",
              "iconTone": "cls-c1",
              "id": "site:102",
              "kind": "site",
              "label": "Perimeter Camp",
              "matchIndices": [
                0,
                1,
                2,
                3,
                4,
                5,
                6,
                7,
                8,
              ],
              "sub": "Combat · 9M",
            },
            {
              "href": "/sites/101",
              "iconText": "C1",
              "iconTone": "cls-c1",
              "id": "site:101",
              "kind": "site",
              "label": "Perimeter Ambush Point",
              "matchIndices": [
                0,
                1,
                2,
                3,
                4,
                5,
                6,
                7,
                8,
              ],
              "sub": "Combat · 12M",
            },
            {
              "href": "/sites/104",
              "iconText": "C3",
              "iconTone": "cls-c3",
              "id": "site:104",
              "kind": "site",
              "label": "Ordinary Perimeter Deposit",
              "matchIndices": [
                9,
                10,
                11,
                12,
                13,
                14,
                15,
                16,
                17,
              ],
              "sub": "Ore · 5M",
            },
            {
              "href": "/sites/103",
              "iconText": "C2",
              "iconTone": "cls-c2",
              "id": "site:103",
              "kind": "site",
              "label": "Forgotten Perimeter Coronation Platform",
              "matchIndices": [
                10,
                11,
                12,
                13,
                14,
                15,
                16,
                17,
                18,
              ],
              "sub": "Relic · 21M",
            },
          ],
        },
      ]
    `);
  });

  it('matches blueprints through the lazy-loaded index', async () => {
    const out = await searchAll('legion', signedOut());
    expect(out).toMatchInlineSnapshot(`
      [
        {
          "name": "Blueprints",
          "results": [
            {
              "href": "/industry/29988",
              "id": "blueprint:29988",
              "kind": "blueprint",
              "label": "Legion Blueprint",
              "matchIndices": [
                0,
                1,
                2,
                3,
                4,
                5,
              ],
              "sub": "Blueprint",
              "typeId": 29986,
            },
          ],
        },
      ]
    `);
  });

  it('matches tools', async () => {
    const out = await searchAll('industry', signedOut());
    expect(project(out)).toMatchInlineSnapshot(`
      [
        {
          "name": "Tools",
          "results": [
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/jobs",
              "id": "tool:Industry Jobs",
              "label": "Industry Jobs",
            },
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/industry",
              "id": "tool:Industry Planner",
              "label": "Industry Planner",
            },
          ],
        },
      ]
    `);
  });

  it('gates commands on the session: signed out sees log-in', async () => {
    const out = await searchAll('log', signedOut());
    expect(project(out)).toMatchInlineSnapshot(`
      [
        {
          "name": "Commands",
          "results": [
            {
              "disabled": false,
              "hasOnSelect": true,
              "href": "/",
              "id": "cmd:login",
              "label": "Log in with EVE",
            },
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/changelog",
              "id": "cmd:open-changelog",
              "label": "Open changelog",
            },
          ],
        },
      ]
    `);
  });

  it('gates commands on the session: signed in sees log-out', async () => {
    const out = await searchAll('log', signedIn());
    expect(project(out)).toMatchInlineSnapshot(`
      [
        {
          "name": "Commands",
          "results": [
            {
              "disabled": false,
              "hasOnSelect": true,
              "href": "/",
              "id": "cmd:logout",
              "label": "Log out",
            },
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/changelog",
              "id": "cmd:open-changelog",
              "label": "Open changelog",
            },
          ],
        },
      ]
    `);
  });

  it('hides admin commands from non-admins', async () => {
    expect(await searchAll('admin', signedIn())).toEqual([]);
  });

  it('shows admin commands to admins', async () => {
    const out = await searchAll('admin', admin());
    expect(project(out)).toMatchInlineSnapshot(`
      [
        {
          "name": "Commands",
          "results": [
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/admin",
              "id": "cmd:open-admin",
              "label": "Open admin",
            },
            {
              "disabled": false,
              "hasOnSelect": false,
              "href": "/admin/access",
              "id": "cmd:open-access",
              "label": "Open admin access",
            },
          ],
        },
      ]
    `);
  });

  it('returns sections in registration order when every source matches', async () => {
    const out = await searchAll('in', admin());
    expect(out.map((s) => s.name)).toEqual(['Recent', 'Sites', 'Blueprints', 'Tools', 'Commands']);
  });
});
