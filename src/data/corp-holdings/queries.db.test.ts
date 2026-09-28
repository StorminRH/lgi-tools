import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  getCorpHoldingContext,
  readCorpProfileState,
  readMemberBases,
  saveCorpProfile,
  saveHoldingNodes,
  stampCorpProfileFresh,
} from './queries';
import { buildHoldingIndex, type CorpAssetItem, placeUnder } from './placement';
import { corpHoldingNodes, corpMemberBases } from './schema';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

const harness = await createDbTestHarness({
  schema: 'test_corp_holdings',
  tables: ['corp_holding_nodes', 'corp_profiles', 'corp_member_bases'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const CORP = 98000001;
const OTHER_CORP = 98000002;
const STATION = 60003760;
const OFFICE = 1001;
const CAN = 3001;
const NOW = new Date('2026-09-28T10:00:00.000Z');

function item(
  itemId: number,
  locationId: number,
  locationType: CorpAssetItem['locationType'],
  locationFlag: string,
  typeId = 34,
): CorpAssetItem {
  return { itemId, typeId, locationId, locationType, locationFlag };
}

const tree = buildHoldingIndex([
  item(OFFICE, STATION, 'station', 'OfficeFolder', 27),
  item(CAN, OFFICE, 'item', 'CorpSAG2', 17366),
  item(2001, CAN, 'item', 'Unlocked'),
]);

const profile = {
  hqStationId: STATION,
  divisionNames: { 2: 'Minerals' },
  containerNames: { [CAN]: 'Ore Can' },
  structureNames: {},
};

async function committedNodeIds(): Promise<number[]> {
  const rows = await harness.db
    .select({ itemId: corpHoldingNodes.itemId })
    .from(corpHoldingNodes)
    .where(eq(corpHoldingNodes.corporationId, CORP));
  return rows.map((row) => row.itemId).sort((a, b) => a - b);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor: condition not met before timeout');
}

describe.skipIf(!harness.reachable)('corp holding nodes against Postgres', () => {
  it('stores the tree and rebuilds placements from it, with the HQ unknown before a context pass', async () => {
    expect(await saveHoldingNodes(CORP, tree, NOW)).toBe('saved');

    const context = await getCorpHoldingContext(CORP);
    expect(context.hq).toEqual({ kind: 'unknown' });
    expect(placeUnder(context.index, CAN, 'Unlocked')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 2,
      containers: [{ itemId: CAN, typeId: 17366 }],
    });
    expect(placeUnder(context.index, OFFICE, 'CorpSAG3')).toEqual({
      kind: 'hangar',
      rootId: STATION,
      division: 3,
      containers: [],
    });
  });

  it('replaces the corp tree and leaves other corps alone', async () => {
    await saveHoldingNodes(CORP, tree, NOW);
    await saveHoldingNodes(OTHER_CORP, tree, NOW);

    await saveHoldingNodes(CORP, buildHoldingIndex([item(2002, 7001, 'station', 'CorpSAG1')]), NOW);

    expect(await committedNodeIds()).toEqual([7001]);
    expect(placeUnder((await getCorpHoldingContext(OTHER_CORP)).index, CAN, 'Unlocked').kind).toBe('hangar');
  });

  it('reports superseded when a concurrent refresh wins the insert race', async () => {
    await saveHoldingNodes(CORP, buildHoldingIndex([item(2002, 7001, 'station', 'CorpSAG1')]), NOW);

    let signalInserted!: () => void;
    let releaseWinner!: () => void;
    const winnerHasInserted = new Promise<void>((resolve) => {
      signalInserted = resolve;
    });
    const winnerMayCommit = new Promise<void>((resolve) => {
      releaseWinner = resolve;
    });
    const winner = harness.sql.begin(async (tx) => {
      await tx`
        INSERT INTO corp_holding_nodes (corporation_id, item_id, kind, root_id, refreshed_at)
        VALUES (${CORP}, ${OFFICE}, 'office', ${STATION}, ${NOW.toISOString()})
      `;
      signalInserted();
      await winnerMayCommit;
    });
    await winnerHasInserted;

    const loser = saveHoldingNodes(CORP, tree, NOW);
    await waitFor(async () => (await committedNodeIds()).length === 0);
    releaseWinner();
    await winner;

    expect(await loser).toBe('superseded');
    expect(await committedNodeIds()).toEqual([OFFICE]);
  });
});

describe.skipIf(!harness.reachable)('corp profile and member bases against Postgres', () => {
  it('upserts the profile and serves it through the context', async () => {
    await saveCorpProfile(CORP, profile, [{ characterId: 90001, baseId: STATION }], NOW);
    await saveCorpProfile(CORP, { ...profile, divisionNames: { 2: 'Ore' } }, [{ characterId: 90001, baseId: STATION }], NOW);

    const context = await getCorpHoldingContext(CORP);
    expect(context.hq).toEqual({ kind: 'known', value: STATION });
    expect(context.divisionNames).toEqual({ 2: 'Ore' });
    expect(context.containerNames.get(CAN)).toBe('Ore Can');
  });

  it('reports no state before the first pass, then the save and stamp times', async () => {
    expect(await readCorpProfileState(CORP)).toBeNull();

    await saveCorpProfile(CORP, profile, [], NOW);
    expect(await readCorpProfileState(CORP)).toEqual({ lastRefreshedAt: NOW });

    const later = new Date('2026-09-28T11:00:00.000Z');
    await stampCorpProfileFresh(CORP, later);
    expect(await readCorpProfileState(CORP)).toEqual({ lastRefreshedAt: later });
  });

  it('returns only the members with a row, and null for a member with no base', async () => {
    await saveCorpProfile(
      CORP,
      profile,
      [
        { characterId: 90001, baseId: STATION },
        { characterId: 90002, baseId: null },
      ],
      NOW,
    );

    expect(await readMemberBases(CORP, [90001, 90002, 90003])).toEqual(
      new Map([
        [90001, STATION],
        [90002, null],
      ]),
    );
    expect(await readMemberBases(CORP, [])).toEqual(new Map());
  });

  it('drops departed members and re-keys a member who moved in from another corp', async () => {
    await saveCorpProfile(OTHER_CORP, profile, [{ characterId: 90005, baseId: 60008494 }], NOW);
    await saveCorpProfile(
      CORP,
      profile,
      [
        { characterId: 90001, baseId: STATION },
        { characterId: 90002, baseId: null },
      ],
      NOW,
    );

    await saveCorpProfile(
      CORP,
      profile,
      [
        { characterId: 90001, baseId: null },
        { characterId: 90005, baseId: STATION },
      ],
      NOW,
    );

    const rows = await harness.db
      .select({ characterId: corpMemberBases.characterId, corporationId: corpMemberBases.corporationId, baseId: corpMemberBases.baseId })
      .from(corpMemberBases);
    expect(rows.sort((a, b) => a.characterId - b.characterId)).toEqual([
      { characterId: 90001, corporationId: CORP, baseId: null },
      { characterId: 90005, corporationId: CORP, baseId: STATION },
    ]);
    expect(await readMemberBases(OTHER_CORP, [90005])).toEqual(new Map());
  });
});
