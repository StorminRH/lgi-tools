import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCorpHoldingContext } from '@/data/corp-holdings/context';
import type { Placement } from '@/data/corp-holdings/placement';
import type { UserCorpAccess } from '@/platform/auth/corp-access';
import type { StoredCorpRoles } from '@/platform/auth/corp-roles-store';
import { canSeeHolding } from '@/platform/auth/corp-visibility';
import { EsiBudgetExhaustedError } from '@/platform/esi';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';

const mocks = vi.hoisted(() => ({
  after: vi.fn((fn: () => unknown) => {
    fn();
  }),
  resolveUserCorpAccess: vi.fn(),
  listCharactersWithHealth: vi.fn(),
  fetchCorpRolesForMembers: vi.fn(),
  refreshCorpContextOnView: vi.fn(async () => []),
  readCorpSharing: vi.fn(),
  readCorpRoles: vi.fn(),
  getCorpHoldingContext: vi.fn(),
  readCorpMemberContext: vi.fn(),
}));

vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('./corp-access', () => ({ resolveUserCorpAccess: mocks.resolveUserCorpAccess }));
// The real usableStoredRoles judges which stored rows the viewer may trust.
vi.mock('./sync/owner-sync-port', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sync/owner-sync-port')>()),
  listCharactersWithHealth: mocks.listCharactersWithHealth,
  fetchCorpRolesForMembers: mocks.fetchCorpRolesForMembers,
}));
vi.mock('./sync/corp-context-sync', () => ({ refreshCorpContextOnView: mocks.refreshCorpContextOnView }));
vi.mock('@/platform/auth/corp-sharing-store', () => ({ readCorpSharing: mocks.readCorpSharing }));
vi.mock('@/platform/auth/corp-roles-store', () => ({ readCorpRoles: mocks.readCorpRoles }));
vi.mock('@/data/corp-holdings/queries', () => ({
  getCorpHoldingContext: mocks.getCorpHoldingContext,
  readCorpMemberContext: mocks.readCorpMemberContext,
}));

import { readCorpViewer, resolveCorpViewer } from './corp-viewer';

const NOW = new Date('2026-09-28T12:00:00Z');
const UNEXPIRED = new Date(NOW.getTime() + 30 * 60_000);
const EXPIRED = new Date(NOW.getTime() - 1);
const CORP = 98000001;
const OTHER_CORP = 98000002;
const HQ = 60003760;
const BASE = 60008494;
const ELSEWHERE = 60011866;
const ALICE = 90001;
const BOB = 90002;

const hangar = (rootId: number, division: 1 | 2 | 3 | 4 | 5 | 6 | 7): Placement => ({
  kind: 'hangar',
  rootId,
  division,
  containers: [],
});

function access(members: Record<number, number[]>): UserCorpAccess {
  const allCharacterIds = Object.values(members).flat();
  return {
    userId: 'u1',
    resolvedAt: NOW.getTime(),
    allCharacterIds,
    authorizedCharacterIds: allCharacterIds,
    corporationIds: Object.keys(members).map(Number),
    characterIdsByCorporation: members,
    refreshTransientFailure: false,
  };
}

function stored(
  characterId: number,
  roles: string[],
  extra: Partial<StoredCorpRoles> = {},
): [number, StoredCorpRoles] {
  return [
    characterId,
    {
      characterId,
      corporationId: CORP,
      roles,
      rolesAtHq: [],
      rolesAtBase: [],
      rolesAtOther: [],
      fetchedAt: NOW,
      expiresAt: UNEXPIRED,
      ...extra,
    },
  ];
}

const health = (characterId: number, missingScopes: string[] = []) =>
  ownerFixture(characterId, { corporationId: CORP, missingScopes });

const record = (roles: string[], rolesAtBase: string[] = []) => ({
  corporationId: CORP,
  roles,
  rolesAtHq: [],
  rolesAtBase,
  rolesAtOther: [],
});

/** Every member the viewer asks for settles with `outcome`. */
function fetchedAs(outcome: PromiseSettledResult<unknown>): void {
  mocks.fetchCorpRolesForMembers.mockImplementation(async (ids: readonly number[]) => new Map(ids.map((id) => [id, outcome])));
}

const answer = (value: unknown): PromiseSettledResult<unknown> => ({ status: 'fulfilled', value });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mocks.resolveUserCorpAccess.mockResolvedValue(access({ [CORP]: [ALICE] }));
  mocks.listCharactersWithHealth.mockResolvedValue([health(ALICE), health(BOB)]);
  mocks.readCorpSharing.mockResolvedValue(new Map([[CORP, 'on']]));
  mocks.readCorpRoles.mockResolvedValue(new Map());
  mocks.getCorpHoldingContext.mockImplementation(async (corporationId: number) =>
    buildCorpHoldingContext(corporationId, [], { hqStationId: HQ, divisionNames: {}, containerNames: {}, structureNames: {} }),
  );
  mocks.readCorpMemberContext.mockResolvedValue({ lastRefreshedAt: NOW, hqStationId: HQ, bases: new Map() });
  fetchedAs(answer(null));
});

describe('resolveCorpViewer', () => {
  it('serves fresh stored roles without an ESI call and scopes the corp by them', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, ['Hangar_Query_2'])]));

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.fetchCorpRolesForMembers).not.toHaveBeenCalled();
    expect(viewer.scope.characterIds).toEqual([ALICE]);
    expect(viewer.scope.corps.map((grant) => grant.corporationId)).toEqual([CORP]);
    const [corp] = viewer.corporations;
    expect(corp?.sharing).toBe('on');
    expect(canSeeHolding(corp!.grant.holdings, hangar(ELSEWHERE, 2))).toBe(true);
    expect(canSeeHolding(corp!.grant.holdings, hangar(ELSEWHERE, 3))).toBe(false);
  });

  it('refetches roles inline past CCP\'s expiry and uses what came back', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, ['Hangar_Query_2'], { expiresAt: EXPIRED })]));
    fetchedAs(answer(record(['Director'])));

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.fetchCorpRolesForMembers).toHaveBeenCalledExactlyOnceWith([ALICE]);
    expect(viewer.corporations[0]?.grant.holdings).toEqual({ kind: 'all' });
    expect(viewer.corporations[0]?.grant.manageSharing).toBe(true);
  });

  it('refetches when the stored row was captured in another corp', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, ['Director'], { corporationId: OTHER_CORP })]));
    fetchedAs(answer(record(['Hangar_Query_1'])));

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.fetchCorpRolesForMembers).toHaveBeenCalledExactlyOnceWith([ALICE]);
    expect(viewer.corporations[0]?.grant.manageSharing).toBe(false);
    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(HQ, 1))).toBe(true);
  });

  it('rejects freshly fetched Director roles associated with a different corporation', async () => {
    fetchedAs(answer({ ...record(['Director']), corporationId: OTHER_CORP }));
    mocks.readCorpSharing.mockResolvedValue(new Map([[CORP, 'off']]));

    const viewer = await resolveCorpViewer('u1');

    expect(viewer.scope.corps).toEqual([]);
    expect(viewer.corporations[0]?.grant.manageSharing).toBe(false);
    expect(viewer.corporations[0]?.grant.structures).toBe('none');
  });

  it('does not authorize an HQ-tier role without a stored corp profile', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, [], { rolesAtHq: ['Hangar_Query_1'] })]));
    mocks.readCorpMemberContext.mockResolvedValue(null);

    const viewer = await resolveCorpViewer('u1');

    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(HQ, 1))).toBe(false);
  });

  it('trusts the stored HQ whatever its age: the member\'s own roles, expiring at CCP\'s time, are the check', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, [], { rolesAtHq: ['Hangar_Query_1'] })]));
    mocks.readCorpMemberContext.mockResolvedValue({
      lastRefreshedAt: new Date('2026-09-20T11:00:00Z'), hqStationId: HQ, bases: new Map([[ALICE, null]]),
    });

    const viewer = await resolveCorpViewer('u1');

    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(HQ, 1))).toBe(true);
  });

  it('uses the fresh snapshot HQ instead of the independently cached label context', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, [], { rolesAtHq: ['Hangar_Query_1'] })]));
    mocks.readCorpMemberContext.mockResolvedValue({
      lastRefreshedAt: NOW, hqStationId: ELSEWHERE, bases: new Map([[ALICE, null]]),
    });

    const viewer = await resolveCorpViewer('u1');

    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(HQ, 1))).toBe(false);
    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(ELSEWHERE, 1))).toBe(true);
  });

  it('hides the corp from a non-Director when a member\'s inline fetch was deferred, without erroring', async () => {
    fetchedAs({ status: 'rejected', reason: new EsiBudgetExhaustedError(19) });

    const viewer = await resolveCorpViewer('u1');

    expect(viewer.scope.corps).toEqual([]);
    expect(viewer.corporations[0]?.grant.holdings).toEqual({ kind: 'none' });
    expect(viewer.corporations[0]?.grant.structures).toBe('use');
  });

  it('treats a failure of the whole batch as unknown roles too', async () => {
    mocks.fetchCorpRolesForMembers.mockRejectedValue(new Error('connection reset'));

    const viewer = await resolveCorpViewer('u1');

    expect(viewer.scope.corps).toEqual([]);
    expect(viewer.corporations[0]?.grant.holdings).toEqual({ kind: 'none' });
  });

  it('hides the corp when no record comes back at all', async () => {
    fetchedAs(answer(null));

    const viewer = await resolveCorpViewer('u1');

    expect(viewer.scope.corps).toEqual([]);
  });

  it('does not call ESI for a character missing the roles scope', async () => {
    mocks.listCharactersWithHealth.mockResolvedValue([
      health(ALICE, ['esi-characters.read_corporation_roles.v1']),
    ]);

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.fetchCorpRolesForMembers).not.toHaveBeenCalled();
    expect(viewer.scope.corps).toEqual([]);
  });

  it('fetches the expired members of every corporation in one batch, so their live checks are shared', async () => {
    mocks.resolveUserCorpAccess.mockResolvedValue(access({ [CORP]: [ALICE], [OTHER_CORP]: [BOB] }));
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, ['Accountant'], { expiresAt: EXPIRED })]));
    mocks.fetchCorpRolesForMembers.mockResolvedValue(new Map([
      [ALICE, answer(record(['Director']))],
      [BOB, answer({ ...record(['Director']), corporationId: OTHER_CORP })],
    ]));

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.fetchCorpRolesForMembers).toHaveBeenCalledExactlyOnceWith([ALICE, BOB]);
    expect(viewer.corporations.map((corp) => [corp.corporationId, corp.grant.holdings.kind])).toEqual([
      [CORP, 'all'],
      [OTHER_CORP, 'all'],
    ]);
  });

  it('keeps a switched-off corp out of scope for an Accountant and in scope for a Director', async () => {
    mocks.resolveUserCorpAccess.mockResolvedValue(access({ [CORP]: [ALICE], [OTHER_CORP]: [BOB] }));
    mocks.readCorpSharing.mockResolvedValue(new Map([[CORP, 'off'], [OTHER_CORP, 'off']]));
    mocks.readCorpRoles.mockResolvedValue(
      new Map([stored(ALICE, ['Accountant']), stored(BOB, ['Director'], { corporationId: OTHER_CORP })]),
    );

    const viewer = await resolveCorpViewer('u1');

    expect(viewer.corporations.map((corp) => [corp.corporationId, corp.sharing, corp.grant.holdings.kind])).toEqual([
      [CORP, 'off', 'none'],
      [OTHER_CORP, 'off', 'all'],
    ]);
    expect(viewer.scope.corps.map((grant) => grant.corporationId)).toEqual([OTHER_CORP]);
    expect(viewer.scope.characterIds).toEqual([ALICE, BOB]);
  });

  it('applies a stored base so a base-tier role grants at the base station only', async () => {
    mocks.readCorpRoles.mockResolvedValue(
      new Map([stored(ALICE, [], { rolesAtBase: ['Hangar_Query_4'] })]),
    );
    mocks.readCorpMemberContext.mockResolvedValue({ lastRefreshedAt: NOW, hqStationId: HQ, bases: new Map([[ALICE, BASE]]) });

    const viewer = await resolveCorpViewer('u1');

    expect(mocks.readCorpMemberContext).toHaveBeenCalledWith(CORP, [ALICE]);
    const rule = viewer.corporations[0]!.grant.holdings;
    expect(canSeeHolding(rule, hangar(BASE, 4))).toBe(true);
    expect(canSeeHolding(rule, hangar(HQ, 4))).toBe(false);
  });

  it('keeps stored bases known until a Director\'s visit refreshes them, however old the profile is', async () => {
    mocks.readCorpRoles.mockResolvedValue(
      new Map([stored(ALICE, [], { rolesAtBase: ['Hangar_Query_4'] })]),
    );
    mocks.readCorpMemberContext.mockResolvedValue({ lastRefreshedAt: new Date('2026-09-20T11:00:00Z'), hqStationId: HQ, bases: new Map([[ALICE, BASE]]) });

    const viewer = await resolveCorpViewer('u1');

    const rule = viewer.corporations[0]!.grant.holdings;
    expect(canSeeHolding(rule, hangar(BASE, 4))).toBe(true);
    expect(canSeeHolding(rule, hangar(HQ, 4))).toBe(false);
  });

  it('treats every base as unknown when the corp has no profile row', async () => {
    mocks.readCorpRoles.mockResolvedValue(
      new Map([stored(ALICE, [], { rolesAtBase: ['Hangar_Query_4'] })]),
    );
    mocks.readCorpMemberContext.mockResolvedValue(null);

    const viewer = await resolveCorpViewer('u1');

    expect(canSeeHolding(viewer.corporations[0]!.grant.holdings, hangar(BASE, 4))).toBe(false);
  });

  it('schedules the Director context pass after the response', async () => {
    await resolveCorpViewer('u1');

    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.refreshCorpContextOnView).toHaveBeenCalledWith('u1');
  });
});

describe('readCorpViewer', () => {
  it('draws the same viewer as resolveCorpViewer and schedules nothing, so a page render may call it', async () => {
    mocks.readCorpRoles.mockResolvedValue(new Map([stored(ALICE, ['Director'])]));

    const viewer = await readCorpViewer('u1');

    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.refreshCorpContextOnView).not.toHaveBeenCalled();
    await expect(resolveCorpViewer('u1')).resolves.toEqual(viewer);
  });
});
