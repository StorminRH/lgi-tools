import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const { BP_FIXTURE, SYSTEMS_FIXTURE } = vi.hoisted(() => ({
  BP_FIXTURE: [
    { blueprintTypeId: 29988, productTypeId: 29986, name: 'Legion Blueprint' },
    { blueprintTypeId: 691, productTypeId: 587, name: 'Rifter Blueprint' },
    { blueprintTypeId: 3888, productTypeId: 3841, name: 'Large Shield Extender II Blueprint' },
  ],

  SYSTEMS_FIXTURE: [
    { id: 30000142, name: 'Jita', security: 0.9 },
    { id: 30000144, name: 'Perimeter', security: 0.9 },
    { id: 31000001, name: 'J100001', security: -0.99 },
  ],
}));

vi.mock('@/transport/api-client', () => ({
  apiFetch: vi.fn(async (endpoint: { path: string }) =>
    endpoint.path === '/api/industry/systems'
      ? { ok: true, status: 200, data: { systems: SYSTEMS_FIXTURE } }
      : { ok: true, status: 200, data: { blueprints: BP_FIXTURE } }),
}));

import '@/composition/search/register-all';
import { listRegisteredSources, searchAll, type SearchContext, type SearchResult, type SearchSection } from '@/platform/search';
import { setSiteSearchIndex } from '@/features/wormhole-sites/search';
import type { SiteSearchEntry } from '@/features/wormhole-sites/queries';
import type { Session } from '@/platform/auth/types';

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

  const calls = [...warnSpy.mock.calls];
  warnSpy.mockRestore();
  expect(calls).toEqual([]);
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
              "iconTone": "green",
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
              "iconTone": "green",
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
              "iconTone": "orange",
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
              "iconTone": "green-strong",
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
              "icon": {
                "typeId": 29988,
                "variant": "bp",
              },
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

const DEFAULT_SOURCE_IDS = ['recents', 'sites', 'blueprints', 'tools', 'commands'] as const;

const REGISTERED_SOURCE_IDS = [...DEFAULT_SOURCE_IDS, 'systems'] as const;

const SECTION_NAME_BY_ID: Record<(typeof DEFAULT_SOURCE_IDS)[number], string> = {
  recents: 'Recent',
  sites: 'Sites',
  blueprints: 'Blueprints',
  tools: 'Tools',
  commands: 'Commands',
};

const MATRIX: readonly [string, () => SearchContext][] = [
  ['', signedIn],
  ['perimeter', signedOut],
  ['legion', signedOut],
  ['industry', signedOut],
  ['log', signedOut],
  ['log', signedIn],
  ['admin', admin],
  ['in', admin],
];

describe('scoped queries against the real manifest', () => {
  it('an explicit all-default-ids scope equals the default full-scope run', async () => {
    for (const [query, ctx] of MATRIX) {
      expect(await searchAll(query, ctx(), DEFAULT_SOURCE_IDS)).toEqual(await searchAll(query, ctx()));
    }
  });

  it("a singleton scope returns exactly that source's slice of the full run", async () => {
    for (const [query, ctx] of MATRIX) {
      const full = await searchAll(query, ctx());
      for (const id of DEFAULT_SOURCE_IDS) {
        const scoped = await searchAll(query, ctx(), [id]);
        expect(scoped).toEqual(full.filter((s) => s.name === SECTION_NAME_BY_ID[id]));
      }
    }
  });

  it('a subset scope returns only that subset, in registration order', async () => {
    const out = await searchAll('in', admin(), ['commands', 'sites']);
    expect(out.map((s) => s.name)).toEqual(['Sites', 'Commands']);
    const full = await searchAll('in', admin());
    expect(out).toEqual(full.filter((s) => s.name === 'Sites' || s.name === 'Commands'));
  });

  it('pins the manifest: every registered id listed, unique, in registration order', () => {

    expect(listRegisteredSources().map((s) => s.id)).toEqual([...REGISTERED_SOURCE_IDS]);
  });

  it('a full-scope run after scoped queries still sees every source', async () => {

    const out = await searchAll('in', admin());
    expect(out.map((s) => s.name)).toEqual(['Recent', 'Sites', 'Blueprints', 'Tools', 'Commands']);
  });
});

describe('default-scope-excluded sources (systems)', () => {
  it('a default-scope run never consults the excluded source', async () => {

    expect(await searchAll('jita', signedOut())).toEqual([]);

    const names = (await searchAll('perimeter', signedOut())).map((s) => s.name);
    expect(names).toEqual(['Sites']);
  });

  it("an explicit ['systems'] scope reaches the excluded source through the lazy wrapper", async () => {
    const out = await searchAll('jita', signedOut(), ['systems']);
    expect(out).toEqual([
      {
        name: 'Systems',
        results: [
          {
            kind: 'system',
            id: 'system:30000142',
            label: 'Jita',
            sub: '0.9',

            href: '#',
            matchIndices: [0, 1, 2, 3],
          },
        ],
      },
    ]);
  });

  it('a mixed scope returns included + excluded sections in registration order', async () => {
    const out = await searchAll('perimeter', signedOut(), ['systems', 'sites']);
    expect(out.map((s) => s.name)).toEqual(['Sites', 'Systems']);
  });

  it('pins the flag on the registered systems source', () => {

    const systems = listRegisteredSources().find((s) => s.id === 'systems');
    expect(systems?.excludeFromDefaultScope).toBe(true);
  });
});
