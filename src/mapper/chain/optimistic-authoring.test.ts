import { describe, expect, it } from 'vitest';
import { getFunctionName } from 'convex/server';
import { api } from '@/data/convex/api';
import type { Id } from '@/data/convex/data-model';
import { blankDoor, blankHallway } from '@/data/maps/connection-hallway';
import type { OptimisticLocalStore } from '@/data/convex/use-mutation';
import {
  lifeStageWindowProposal,
  lifetimeMinutesFromEntry,
  optimisticAddSystemFromNode,
  optimisticPatchConnection,
  optimisticRestoreSeveredBranch,
  optimisticSetConnectionDestination,
  optimisticSetConnectionLifeStage,
  optimisticSetHomeSystem,
  optimisticSetConnectionWormholeType,
  optimisticSeverConnection,
  optimisticTempId,
  swallowMutationRejection,
  wormholeTypeWindowProposal,
  type OptimisticConnectionRow,
  type OptimisticSystemRow,
} from './optimistic-authoring';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const MAP = 'map-a';

const SYSTEMS_NAME = getFunctionName(api.mapChainSystems.watchMapSystems);
const CONNECTIONS_NAME = getFunctionName(api.mapChainConnections.watchMapConnections);
const UNRESOLVED_NAME = getFunctionName(api.mapChainConnections.watchUnresolvedHoles);

type PageResult<Row> = {
  page: Row[];
  isDone: boolean;
  continueCursor: string;
};

type StoredQuery = {
  args: {
    mapId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  };
  value: PageResult<OptimisticSystemRow | OptimisticConnectionRow>;
};

/** Minimal OptimisticLocalStore stub that records setQuery writes by function name. */
function mockStore(seed: {
  systems?: OptimisticSystemRow[];
  connections?: OptimisticConnectionRow[];
  unresolved?: OptimisticConnectionRow[];
}): OptimisticLocalStore & {
  systems: OptimisticSystemRow[];
  connections: OptimisticConnectionRow[];
  unresolved: OptimisticConnectionRow[];
} {
  const pages = new Map<string, StoredQuery>([
    [
      SYSTEMS_NAME,
      {
        args: {
          mapId: MAP,
          paginationOpts: { numItems: 100, cursor: null },
        },
        value: {
          page: [...(seed.systems ?? [])],
          isDone: true,
          continueCursor: '',
        },
      },
    ],
    [
      CONNECTIONS_NAME,
      {
        args: {
          mapId: MAP,
          paginationOpts: { numItems: 100, cursor: null },
        },
        value: {
          page: [...(seed.connections ?? [])],
          isDone: true,
          continueCursor: '',
        },
      },
    ],
    [
      UNRESOLVED_NAME,
      {
        args: {
          mapId: MAP,
          paginationOpts: { numItems: 100, cursor: null },
        },
        value: {
          page: [...(seed.unresolved ?? [])],
          isDone: true,
          continueCursor: '',
        },
      },
    ],
  ]);

  const store: OptimisticLocalStore & {
    systems: OptimisticSystemRow[];
    connections: OptimisticConnectionRow[];
    unresolved: OptimisticConnectionRow[];
  } = {
    get systems() {
      // By construction: mockStore seeds both keys and no test deletes them.
      return pages.get(SYSTEMS_NAME)!.value.page as OptimisticSystemRow[];
    },
    get connections() {
      // By construction: mockStore seeds both keys and no test deletes them.
      return pages.get(CONNECTIONS_NAME)!.value
        .page as OptimisticConnectionRow[];
    },
    get unresolved() {
      return pages.get(UNRESOLVED_NAME)!.value
        .page as OptimisticConnectionRow[];
    },
    getQuery() {
      return undefined;
    },
    getAllQueries(query) {
      const name = getFunctionName(query);
      const stored = pages.get(name);
      if (stored === undefined) return [];
      return [{ args: stored.args, value: stored.value }];
    },
    setQuery(query, args, value) {
      if (value === undefined) {
        pages.delete(getFunctionName(query));
        return;
      }
      pages.set(getFunctionName(query), {
        args: args as StoredQuery['args'],
        value: value as StoredQuery['value'],
      });
    },
  };
  return store;
}

function systemRow(
  systemId: number,
  overrides: Partial<OptimisticSystemRow> = {},
): OptimisticSystemRow {
  return {
    _id: `sys:${systemId}`,
    _creationTime: 1,
    mapId: MAP,
    systemId,
    deletedAt: null,
    purgeAfter: null,
    ...overrides,
  };
}

function connectionRow(
  id: string,
  fromSystemId: number,
  toSystemId: number,
  overrides: Partial<OptimisticConnectionRow> = {},
): OptimisticConnectionRow {
  return {
    _id: id,
    _creationTime: 1,
    ...blankHallway({
      mapId: MAP,
      fromSystemId,
      toSystemId,
    }),
    ...overrides,
  };
}

describe('optimisticTempId', () => {
  it('names a client-only temp id for the target table', () => {
    expect(optimisticTempId('mapConnections')).toMatch(
      /^optimistic:mapConnections:/,
    );
  });
});

describe('optimisticSetHomeSystem', () => {
  it('inserts a home system on an empty live map', () => {
    const store = mockStore({});
    optimisticSetHomeSystem(store, { mapId: MAP, systemId: JITA }, 42);
    expect(store.systems).toHaveLength(1);
    expect(store.systems[0]?.systemId).toBe(JITA);
    expect(store.systems[0]?._id).toMatch(/^optimistic:mapSystems:/);
  });

  it('skips when a live system already exists', () => {
    const store = mockStore({ systems: [systemRow(JITA)] });
    optimisticSetHomeSystem(store, { mapId: MAP, systemId: AMARR }, 42);
    expect(store.systems).toHaveLength(1);
    expect(store.systems[0]?.systemId).toBe(JITA);
  });
});

describe('optimisticAddSystemFromNode', () => {
  it('inserts destination + connection together when the origin is live', () => {
    const store = mockStore({ systems: [systemRow(JITA)] });
    optimisticAddSystemFromNode(
      store,
      { mapId: MAP, fromSystemId: JITA, toSystemId: AMARR },
      99,
    );
    // Append-only: destination must stay after the existing root so
    // resolveRoot(facts.systems[0]) does not flip for the optimistic window.
    expect(store.systems.map((row) => row.systemId)).toEqual([JITA, AMARR]);
    expect(store.connections).toHaveLength(1);
    expect(store.connections[0]).toMatchObject({
      fromSystemId: JITA,
      toSystemId: AMARR,
      from: blankDoor(),
      to: blankDoor(),
      massState: null,
      identity: { kind: 'unknown' },
    });
  });

  it('skips when the origin is absent', () => {
    const store = mockStore({});
    optimisticAddSystemFromNode(
      store,
      { mapId: MAP, fromSystemId: JITA, toSystemId: AMARR },
      99,
    );
    expect(store.systems).toHaveLength(0);
    expect(store.connections).toHaveLength(0);
  });

  it('loop-closes without duplicating an already-live destination', () => {
    const store = mockStore({
      systems: [systemRow(JITA), systemRow(AMARR)],
    });
    optimisticAddSystemFromNode(
      store,
      { mapId: MAP, fromSystemId: JITA, toSystemId: AMARR },
      99,
    );
    expect(store.systems).toHaveLength(2);
    expect(store.connections).toHaveLength(1);
  });
});

describe('optimisticPatchConnection', () => {
  it('patches one field on the matching connection id', () => {
    const store = mockStore({
      connections: [connectionRow('c1', JITA, AMARR)],
      unresolved: [connectionRow('stub', JITA, AMARR, { toSystemId: null })],
    });
    optimisticPatchConnection(store, {
      mapId: MAP,
      connectionId: 'c1',
      patch: { massState: 'critical' },
    });
    expect(store.connections[0]?.massState).toBe('critical');
    expect(store.unresolved[0]?.massState).toBeNull();

    optimisticPatchConnection(store, {
      mapId: MAP,
      connectionId: 'stub',
      patch: {
        to: { ...blankDoor(), leadsTo: { kind: 'hint', hint: 'dangerous' } },
      },
    });
    expect(store.unresolved[0]).toMatchObject({
      to: { ...blankDoor(), leadsTo: { kind: 'hint', hint: 'dangerous' } },
    });
  });
});

describe('optimisticSetConnectionDestination', () => {
  it('writes a Leads-to note without spawning a system or moving the line', () => {
    const store = mockStore({
      systems: [systemRow(JITA)],
      unresolved: [connectionRow('stub', JITA, AMARR, { toSystemId: null })],
    });
    optimisticSetConnectionDestination(store, {
      mapId: MAP,
      connectionId: 'stub',
      side: 'from',
      value: AMARR,
    });
    expect(store.unresolved).toEqual([
      expect.objectContaining({
        _id: 'stub',
        toSystemId: null,
        from: expect.objectContaining({
          leadsTo: { kind: 'system', systemId: AMARR },
        }),
      }),
    ]);
    expect(store.connections).toHaveLength(0);
    expect(store.systems.some((row) => row.systemId === AMARR)).toBe(false);

    optimisticSetConnectionDestination(store, {
      mapId: MAP,
      connectionId: 'stub',
      side: 'from',
      value: null,
    });
    expect(store.unresolved).toEqual([
      expect.objectContaining({
        _id: 'stub',
        toSystemId: null,
        from: expect.objectContaining({
          leadsTo: { kind: 'unset' },
        }),
      }),
    ]);
  });
});

describe('optimistic collapse patches', () => {
  it('stamps only the cut edge before the server-computed outcome lands', () => {
    const store = mockStore({
      systems: [systemRow(JITA), systemRow(AMARR)],
      connections: [connectionRow('cut', JITA, AMARR)],
    });
    optimisticSeverConnection(
      store,
      { mapId: MAP, connectionId: 'cut' },
      100,
    );
    expect(store.connections[0]).toMatchObject({
      tombstone: {
        kind: 'removed',
        deletedAt: 100,
        purgeAfter: 100 + 24 * 60 * 60 * 1000,
      },
    });
    expect(store.systems.every((row) => row.deletedAt === null)).toBe(true);
  });

  it('restores every loaded row sharing the cut stamp', () => {
    const stamp = 100;
    const systemTombstone = { deletedAt: stamp, purgeAfter: stamp + 1 };
    const connectionTombstone = {
      tombstone: { kind: 'removed' as const, deletedAt: stamp, purgeAfter: stamp + 1 },
    };
    const store = mockStore({
      systems: [systemRow(JITA, systemTombstone), systemRow(AMARR)],
      connections: [
        connectionRow('cut', JITA, AMARR, connectionTombstone),
        connectionRow('incident', JITA, AMARR, connectionTombstone),
      ],
    });
    optimisticRestoreSeveredBranch(store, {
      mapId: MAP,
      connectionId: 'cut',
    });
    expect(store.systems[0]).toMatchObject({ deletedAt: null, purgeAfter: null });
    expect(
      store.connections.every((row) => row.tombstone.kind === 'live'),
    ).toBe(true);
  });
});

describe('explicit lifetime proposals', () => {
  const connection = {
    connectionId: 'c1' as Id<'mapConnections'>,
    _creationTime: 1_000,
    firstSeenAt: null,
    from: { ...blankDoor(), typeCode: 'B274' },
    to: { ...blankDoor(), typeCode: 'K162' },
    lifetime: {
      kind: 'window' as const,
      earliestAt: 2_000,
      latestAt: 3_000,
      lifeStage: null,
      observedAt: null,
    },
  };

  it('proposes a typed ceiling that never widens a stored window (server parity)', () => {
    // The typed span {1_000, 3_601_000} contains the stored {2_000, 3_000},
    // so the intersection keeps the narrower stored window.
    expect(wormholeTypeWindowProposal(connection, 60)).toEqual({
      earliestAt: 2_000,
      latestAt: 3_000,
    });
    // A contradictory (fully earlier) stored window resets to the typed span.
    expect(
      wormholeTypeWindowProposal(
        {
          ...connection,
          lifetime: {
            kind: 'window',
            earliestAt: 100,
            latestAt: 200,
            lifeStage: null,
            observedAt: null,
          },
        },
        60,
      ),
    ).toEqual({
      earliestAt: 1_000,
      latestAt: 3_601_000,
    });
    expect(wormholeTypeWindowProposal(connection, null)).toEqual({
      earliestAt: 2_000,
      latestAt: 3_000,
    });
    expect(
      wormholeTypeWindowProposal(
        {
          ...connection,
          firstSeenAt: 500,
          lifetime: { kind: 'unknown' },
        },
        60,
      ),
    ).toEqual({
      earliestAt: 500,
      latestAt: 3_600_500,
    });
    expect(
      lifetimeMinutesFromEntry({
        code: 'B274',
        typeId: 1,
        farSide: false,
        totalMass: 2_000_000_000,
        maxJumpMass: 300_000_000,
        massRegen: 0,
        lifetimeMinutes: 1_440,
        sizeClass: 'L',
        targetClass: 7,
      }),
    ).toBe(1_440);
    expect(
      lifetimeMinutesFromEntry({ code: 'K162', typeId: 2, farSide: true }),
    ).toBeNull();
  });

  it('derives life-stage windows and patches both optimistic setters', () => {
    expect(lifeStageWindowProposal('under_4_hours', 10_000, null)).toEqual({
      earliestAt: 3_610_000,
      latestAt: 14_410_000,
    });
    const store = mockStore({
      connections: [connectionRow('c1', JITA, AMARR)],
    });
    optimisticSetConnectionWormholeType(store, {
      mapId: MAP,
      connectionId: 'c1',
      value: 'B274',
      deathEarliestAt: 1,
      deathLatestAt: 2,
    });
    optimisticSetConnectionLifeStage(
      store,
      {
        mapId: MAP,
        connectionId: 'c1',
        value: 'under_1_day',
        deathEarliestAt: 3,
        deathLatestAt: 4,
      },
      5,
    );
    expect(store.connections[0]).toMatchObject({
      from: expect.objectContaining({ typeCode: 'B274' }),
      to: expect.objectContaining({ typeCode: 'K162' }),
      identity: { kind: 'typed', provenance: 'human' },
      lifetime: {
        kind: 'window',
        earliestAt: 3,
        latestAt: 4,
        lifeStage: 'under_1_day',
        observedAt: 5,
      },
    });
  });
});

describe('mutation rejection rider', () => {
  it('resolves undefined instead of leaking a rejected mutation promise', async () => {
    const mutation = swallowMutationRejection(async (_args: { value: number }) => {
      throw new Error('server refusal');
    });
    await expect(mutation({ value: 1 })).resolves.toBeUndefined();
  });
});
