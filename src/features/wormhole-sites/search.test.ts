import { beforeEach, describe, expect, it } from 'vitest';
import type { SiteSearchEntry } from './queries';
import { setSiteSearchIndex, sitesSearchSource } from './search';

const entry = (over: Partial<SiteSearchEntry> & { id: number; name: string }): SiteSearchEntry => ({
  siteType: 'combat',
  wormholeClass: 'C3',
  blueLootIsk: 1000,
  resourceValueIsk: null,
  ...over,
});

// The sites matcher ignores the context (synchronous, zero-RPC); a minimal one
// satisfies the SearchSource signature.
const ctx = { session: null, isAdmin: false, recents: [] };

describe('sitesSearchSource', () => {
  beforeEach(() => setSiteSearchIndex([]));

  it('returns only fuzzy-matching entries, mapped to site results', async () => {
    setSiteSearchIndex([
      entry({ id: 1, name: 'Forgotten Frontier Recesses' }),
      entry({ id: 2, name: 'Ordinary Perimeter Deposit' }),
    ]);
    const results = await sitesSearchSource.search('frontier', ctx);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      kind: 'site',
      id: 'site:1',
      href: '/sites/1',
      label: 'Forgotten Frontier Recesses',
    });
  });

  it('breaks equal-score ties by class C1→C6 then primary ISK desc', async () => {
    // Identical names → identical fuzzy score, so the class/ISK tiebreak decides.
    setSiteSearchIndex([
      entry({ id: 1, name: 'Vault', wormholeClass: 'C5', blueLootIsk: 999 }),
      entry({ id: 2, name: 'Vault', wormholeClass: 'C1', blueLootIsk: 1 }),
      entry({ id: 3, name: 'Vault', wormholeClass: 'C1', blueLootIsk: 500 }),
    ]);
    const results = await sitesSearchSource.search('Vault', ctx);
    expect(results.map((r) => r.id)).toEqual(['site:3', 'site:2', 'site:1']);
  });

  it('summarizes gas/ore sites by resource value, not blue loot', async () => {
    setSiteSearchIndex([
      entry({
        id: 7,
        name: 'Sizeable Perimeter Reservoir',
        siteType: 'gas',
        wormholeClass: null,
        blueLootIsk: null,
        resourceValueIsk: 42_000_000,
      }),
    ]);
    const [result] = await sitesSearchSource.search('Reservoir', ctx);
    expect(result!.iconText).toBe('—'); // null class → em dash
    expect(result!.sub).toContain('42');
  });
});
