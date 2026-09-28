import { describe, expect, it } from 'vitest';
import type { CorpHoldingContext, Knowable, Placement } from '@/data/corp-holdings/placement';
import type { CharacterCorpRoles, CorpRole } from './corp-roles';
import {
  canSeeHolding,
  compileCorpGrant,
  compileReadScope,
  type CorpGrantInput,
  type HoldingRule,
  type OwnedReadScope,
  possibleTiers,
  rolesAt,
  type SharingState,
} from './corp-visibility';

const CORP = 98000001;
const HQ = 60003760;
const BASE = 60008494;
const ELSEWHERE = 60011866;
const KNOWN_HQ: Knowable<number> = { kind: 'known', value: HQ };
const UNKNOWN: Knowable<never> = { kind: 'unknown' };
const NO_BASE: Knowable<number | null> = { kind: 'known', value: null };

function roles(partial: Partial<Record<keyof CharacterCorpRoles, CorpRole[]>>): CharacterCorpRoles {
  return {
    global: new Set(partial.global ?? []),
    atHq: new Set(partial.atHq ?? []),
    atBase: new Set(partial.atBase ?? []),
    atOther: new Set(partial.atOther ?? []),
  };
}

function context(hq: Knowable<number> = KNOWN_HQ): CorpHoldingContext {
  return {
    corporationId: CORP,
    index: { interiors: new Map() },
    hq,
    divisionNames: {},
    containerNames: new Map(),
    structureNames: new Map(),
  };
}

function known(characterId: number, held: CharacterCorpRoles, base: Knowable<number | null> = NO_BASE) {
  return { characterId, roles: { kind: 'known' as const, roles: held }, base };
}

function grantFor(sharing: SharingState, members: CorpGrantInput['members'], hq: Knowable<number> = KNOWN_HQ) {
  const grant = compileCorpGrant({ corporationId: CORP, sharing, context: context(hq), members });
  const { holdings, blueprints, structures, jobs, manageSharing } = grant;
  return { grant, outcome: { holdings, blueprints, structures, jobs, manageSharing } };
}

const hangar = (rootId: number, division: 1 | 2 | 3 | 4 | 5 | 6 | 7): Placement => ({
  kind: 'hangar',
  rootId,
  division,
  containers: [],
});
const deliveries = (rootId: number): Placement => ({ kind: 'deliveries', rootId, containers: [] });

describe('compileCorpGrant rule table', () => {
  const memberOne = known(1, roles({ global: ['Hangar_Query_1'] }));
  const byLocation = (members: CorpGrantInput['members']): HoldingRule => ({
    kind: 'by-location',
    hq: KNOWN_HQ,
    members: members.flatMap((member) =>
      member.roles.kind === 'known'
        ? [{ characterId: member.characterId, roles: member.roles.roles, base: member.base }]
        : [],
    ),
  });
  const all: HoldingRule = { kind: 'all' };
  const none: HoldingRule = { kind: 'none' };

  it.each<{ name: string; sharing: SharingState; members: CorpGrantInput['members']; expected: unknown }>([
    {
      name: 'Director, off',
      sharing: 'off',
      members: [known(1, roles({ global: ['Director'] }))],
      expected: { holdings: all, blueprints: all, structures: 'manage', jobs: 'own-token', manageSharing: true },
    },
    {
      name: 'Director, on',
      sharing: 'on',
      members: [known(1, roles({ global: ['Director'] }))],
      expected: { holdings: all, blueprints: all, structures: 'manage', jobs: 'own-token', manageSharing: true },
    },
    {
      name: 'no roles, off',
      sharing: 'off',
      members: [known(1, roles({}))],
      expected: { holdings: none, blueprints: none, structures: 'none', jobs: 'none', manageSharing: false },
    },
    {
      name: 'hangar role only, off (self-service parity withholds Director-synced data)',
      sharing: 'off',
      members: [memberOne],
      expected: { holdings: none, blueprints: none, structures: 'none', jobs: 'none', manageSharing: false },
    },
    {
      name: 'roles unknown for every character, off',
      sharing: 'off',
      members: [{ characterId: 1, roles: { kind: 'unknown' }, base: NO_BASE }],
      expected: { holdings: none, blueprints: none, structures: 'none', jobs: 'none', manageSharing: false },
    },
    {
      name: 'roles unknown for every character, on',
      sharing: 'on',
      members: [{ characterId: 1, roles: { kind: 'unknown' }, base: NO_BASE }],
      expected: {
        holdings: byLocation([]),
        blueprints: byLocation([]),
        structures: 'use',
        jobs: 'none',
        manageSharing: false,
      },
    },
    {
      name: 'Accountant, on',
      sharing: 'on',
      members: [known(1, roles({ global: ['Accountant'] }))],
      expected: { holdings: all, blueprints: all, structures: 'use', jobs: 'none', manageSharing: false },
    },
    {
      name: 'Accountant, off',
      sharing: 'off',
      members: [known(1, roles({ global: ['Accountant'] }))],
      expected: { holdings: none, blueprints: none, structures: 'none', jobs: 'none', manageSharing: false },
    },
    {
      name: 'Factory_Manager, on',
      sharing: 'on',
      members: [known(1, roles({ global: ['Factory_Manager'] }))],
      expected: {
        holdings: byLocation([known(1, roles({ global: ['Factory_Manager'] }))]),
        blueprints: all,
        structures: 'use',
        jobs: 'own-token',
        manageSharing: false,
      },
    },
    {
      name: 'Factory_Manager, off (own-token jobs stay self-service)',
      sharing: 'off',
      members: [known(1, roles({ global: ['Factory_Manager'] }))],
      expected: { holdings: none, blueprints: none, structures: 'none', jobs: 'own-token', manageSharing: false },
    },
    {
      name: 'Station_Manager, on',
      sharing: 'on',
      members: [known(1, roles({ global: ['Station_Manager'] }))],
      expected: {
        holdings: byLocation([known(1, roles({ global: ['Station_Manager'] }))]),
        blueprints: byLocation([known(1, roles({ global: ['Station_Manager'] }))]),
        structures: 'manage',
        jobs: 'none',
        manageSharing: false,
      },
    },
    {
      name: 'Station_Manager, off (roster and rigs stay self-service)',
      sharing: 'off',
      members: [known(1, roles({ global: ['Station_Manager'] }))],
      expected: { holdings: none, blueprints: none, structures: 'manage', jobs: 'none', manageSharing: false },
    },
    {
      name: 'hangar role only, on',
      sharing: 'on',
      members: [memberOne],
      expected: {
        holdings: byLocation([memberOne]),
        blueprints: byLocation([memberOne]),
        structures: 'use',
        jobs: 'none',
        manageSharing: false,
      },
    },
    {
      name: 'Factory_Manager only in a tier array grants nothing global',
      sharing: 'on',
      members: [known(1, roles({ atHq: ['Factory_Manager'] }))],
      expected: {
        holdings: byLocation([known(1, roles({ atHq: ['Factory_Manager'] }))]),
        blueprints: byLocation([known(1, roles({ atHq: ['Factory_Manager'] }))]),
        structures: 'use',
        jobs: 'none',
        manageSharing: false,
      },
    },
    {
      name: 'two characters: one Director on either makes the union a Director',
      sharing: 'off',
      members: [known(1, roles({ global: ['Hangar_Query_2'] })), known(2, roles({ global: ['Director'] }))],
      expected: { holdings: all, blueprints: all, structures: 'manage', jobs: 'own-token', manageSharing: true },
    },
    {
      name: 'two characters: an unknown-roles character contributes nothing to a known one',
      sharing: 'on',
      members: [memberOne, { characterId: 2, roles: { kind: 'unknown' }, base: NO_BASE }],
      expected: {
        holdings: byLocation([memberOne]),
        blueprints: byLocation([memberOne]),
        structures: 'use',
        jobs: 'none',
        manageSharing: false,
      },
    },
  ])('$name', ({ sharing, members, expected }) => {
    expect(grantFor(sharing, members).outcome).toEqual(expected);
  });

  it('keeps the context on the grant for the filter and the labels', () => {
    const ctx = context();
    const grant = compileCorpGrant({ corporationId: CORP, sharing: 'on', context: ctx, members: [] });
    expect(grant.context).toBe(ctx);
    expect(grant.corporationId).toBe(CORP);
  });
});

describe('possibleTiers', () => {
  const knownBase: Knowable<number | null> = { kind: 'known', value: BASE };

  it.each<{ name: string; root: number; hq: Knowable<number>; base: Knowable<number | null>; tiers: string[] }>([
    { name: 'base known and matches', root: BASE, hq: KNOWN_HQ, base: knownBase, tiers: ['base'] },
    { name: 'base known, hq known and matches', root: HQ, hq: KNOWN_HQ, base: knownBase, tiers: ['hq'] },
    { name: 'base known, hq known, neither matches', root: ELSEWHERE, hq: KNOWN_HQ, base: knownBase, tiers: ['other'] },
    { name: 'base known, hq unknown', root: ELSEWHERE, hq: UNKNOWN, base: knownBase, tiers: ['hq', 'other'] },
    { name: 'base unknown, hq known and matches', root: HQ, hq: KNOWN_HQ, base: UNKNOWN, tiers: ['base', 'hq'] },
    { name: 'base unknown, hq known, no match', root: ELSEWHERE, hq: KNOWN_HQ, base: UNKNOWN, tiers: ['base', 'other'] },
    { name: 'base unknown, hq unknown', root: ELSEWHERE, hq: UNKNOWN, base: UNKNOWN, tiers: ['base', 'hq', 'other'] },
    { name: 'no base set, hq known and matches', root: HQ, hq: KNOWN_HQ, base: NO_BASE, tiers: ['hq'] },
    { name: 'no base set, hq unknown', root: HQ, hq: UNKNOWN, base: NO_BASE, tiers: ['hq', 'other'] },
    { name: 'base is the HQ station: base wins', root: HQ, hq: KNOWN_HQ, base: { kind: 'known', value: HQ }, tiers: ['base'] },
  ])('$name', ({ root, hq, base, tiers }) => {
    expect(possibleTiers(root, hq, base)).toEqual(tiers);
  });
});

describe('rolesAt', () => {
  it('unions the global roles with the tier roles', () => {
    const held = roles({ global: ['Hangar_Query_1'], atHq: ['Hangar_Query_2'], atOther: ['Trader'] });
    expect([...rolesAt(held, 'hq')]).toEqual(['Hangar_Query_1', 'Hangar_Query_2']);
    expect([...rolesAt(held, 'base')]).toEqual(['Hangar_Query_1']);
    expect([...rolesAt(held, 'other')]).toEqual(['Hangar_Query_1', 'Trader']);
  });
});

describe('canSeeHolding', () => {
  const rule = (members: CorpGrantInput['members'], hq: Knowable<number> = KNOWN_HQ): HoldingRule =>
    grantFor('on', members, hq).grant.holdings;

  it('answers the fixed rules without looking at the placement', () => {
    expect(canSeeHolding({ kind: 'none' }, hangar(HQ, 1))).toBe(false);
    expect(canSeeHolding({ kind: 'all' }, { kind: 'unplaced', rootId: null })).toBe(true);
  });

  it('hides unplaced rows from every non-Director', () => {
    const member = known(1, roles({ global: ['Accountant', 'Hangar_Query_1', 'Deliveries_Query'] }));
    const byLocation: HoldingRule = { kind: 'by-location', hq: KNOWN_HQ, members: [{ characterId: 1, roles: member.roles.roles, base: NO_BASE }] };
    expect(canSeeHolding(byLocation, { kind: 'unplaced', rootId: HQ })).toBe(false);
  });

  it('grants a global Hangar_Query everywhere, including unknown tiers', () => {
    const r = rule([known(1, roles({ global: ['Hangar_Query_3'] }), UNKNOWN)], UNKNOWN);
    expect(canSeeHolding(r, hangar(HQ, 3))).toBe(true);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 3))).toBe(true);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 4))).toBe(false);
  });

  it('grants an HQ-tier Hangar_Query at the HQ station only', () => {
    const r = rule([known(1, roles({ atHq: ['Hangar_Query_2'] }))]);
    expect(canSeeHolding(r, hangar(HQ, 2))).toBe(true);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 2))).toBe(false);
  });

  it('grants a base-tier Hangar_Query at the base, which overrides the HQ', () => {
    const atBase = known(1, roles({ atBase: ['Hangar_Query_5'], atHq: ['Hangar_Query_6'] }), { kind: 'known', value: HQ });
    const r = rule([atBase]);
    expect(canSeeHolding(r, hangar(HQ, 5))).toBe(true);
    expect(canSeeHolding(r, hangar(HQ, 6))).toBe(false);
  });

  it('grants an other-tier Hangar_Query at every non-HQ, non-base root', () => {
    const r = rule([known(1, roles({ atOther: ['Hangar_Query_1'] }), { kind: 'known', value: BASE })]);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 1))).toBe(true);
    expect(canSeeHolding(r, hangar(HQ, 1))).toBe(false);
    expect(canSeeHolding(r, hangar(BASE, 1))).toBe(false);
  });

  it('withholds a tier-specific grant while the base is unknown', () => {
    const r = rule([known(1, roles({ atOther: ['Hangar_Query_1'] }), UNKNOWN)]);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 1))).toBe(false);
    const everyTier = rule([known(1, roles({ atOther: ['Hangar_Query_1'], atBase: ['Hangar_Query_1'] }), UNKNOWN)]);
    expect(canSeeHolding(everyTier, hangar(ELSEWHERE, 1))).toBe(true);
  });

  it('withholds an HQ-tier grant while the HQ is unknown', () => {
    const r = rule([known(1, roles({ atHq: ['Hangar_Query_2'] }))], UNKNOWN);
    expect(canSeeHolding(r, hangar(HQ, 2))).toBe(false);
  });

  it('shows deliveries to the deliveries roles at their tier', () => {
    expect(canSeeHolding(rule([known(1, roles({ atHq: ['Deliveries_Query'] }))]), deliveries(HQ))).toBe(true);
    expect(canSeeHolding(rule([known(1, roles({ atHq: ['Deliveries_Query'] }))]), deliveries(ELSEWHERE))).toBe(false);
    expect(canSeeHolding(rule([known(1, roles({ global: ['Trader'] }))]), deliveries(ELSEWHERE))).toBe(true);
    expect(canSeeHolding(rule([known(1, roles({ global: ['Junior_Accountant'] }))]), deliveries(HQ))).toBe(true);
    expect(canSeeHolding(rule([known(1, roles({ global: ['Hangar_Query_1'] }))]), deliveries(HQ))).toBe(false);
  });

  it('unions two characters: division 1 at the HQ from one, division 2 elsewhere from the other', () => {
    const r = rule([
      known(1, roles({ atHq: ['Hangar_Query_1'] })),
      known(2, roles({ atOther: ['Hangar_Query_2'] })),
    ]);
    expect(canSeeHolding(r, hangar(HQ, 1))).toBe(true);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 2))).toBe(true);
    expect(canSeeHolding(r, hangar(HQ, 2))).toBe(false);
    expect(canSeeHolding(r, hangar(ELSEWHERE, 1))).toBe(false);
  });

  it('gives an unknown-roles character no grant of its own', () => {
    const r = rule([{ characterId: 1, roles: { kind: 'unknown' }, base: NO_BASE }]);
    expect(canSeeHolding(r, hangar(HQ, 1))).toBe(false);
  });
});

describe('compileReadScope', () => {
  it('keeps only corps that grant holdings or blueprints', () => {
    const director = grantFor('on', [known(1, roles({ global: ['Director'] }))]).grant;
    const factory = grantFor('on', [known(2, roles({ global: ['Factory_Manager'] }))]).grant;
    const nothing = grantFor('off', [known(3, roles({ global: ['Station_Manager'] }))]).grant;
    const scope = compileReadScope([1, 2, 3], [director, factory, nothing]);
    expect(scope.characterIds).toEqual([1, 2, 3]);
    expect(scope.corps.map((grant) => grant.blueprints.kind)).toEqual(['all', 'all']);
  });

  it('refuses a hand-built scope at compile time', () => {
    // @ts-expect-error the brand is a module-private symbol, so only compileReadScope can mint a scope
    const forged: OwnedReadScope = { characterIds: [1], corps: [] };
    expect(compileReadScope(forged.characterIds, forged.corps).corps).toEqual([]);
  });
});
