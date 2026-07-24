import { describe, expect, it } from 'vitest';
import { MOCK_SITES } from './mock-data';
import {
  siteDetailSchema,
  sitesListResponseSchema,
} from './api-contract';

function representativeSite() {
  const site = MOCK_SITES[0];
  if (!site) throw new Error('Expected at least one wormhole-site fixture');
  return site;
}

describe('wormhole-sites API contracts', () => {
  it('accepts a representative nested site-detail payload', () => {
    const site = representativeSite();
    expect(siteDetailSchema.parse(site)).toEqual(site);
  });

  it('accepts the catalogue payload with its sheet value key', () => {
    const { resourceValueIsk, waves: _waves, resources: _resources, ...site } =
      representativeSite();
    const payload = [{ ...site, sheetResourceValueIsk: resourceValueIsk }];

    expect(sitesListResponseSchema.parse(payload)).toEqual(payload);
  });

  it('rejects an invalid field nested inside a wave NPC', () => {
    const site = structuredClone(representativeSite());
    const npc = site.waves[0]?.npcs[0];
    if (!npc) throw new Error('Expected a nested NPC fixture');
    npc.quantity = 'many' as never;

    expect(siteDetailSchema.safeParse(site).success).toBe(false);
  });
});
