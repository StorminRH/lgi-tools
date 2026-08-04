import { describe, expect, it } from 'vitest';
import { getFunctionName } from 'convex/server';
import { api } from '@/data/convex/api';
import type { OptimisticLocalStore } from '@/data/convex/use-mutation';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';
import {
  liveSystemPresent,
  optimisticAddSystemFromNode,
  optimisticPatchConnection,
  optimisticSetHomeSystem,
  optimisticTempId,
  optimisticTombstoneSystem,
  useChainAuthoringMutations,
  type OptimisticConnectionRow,
  type OptimisticSystemRow,
} from './optimistic-authoring';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const MAP = 'map-a';

const SYSTEMS_NAME = getFunctionName(api.mapChain.watchMapSystems);
const CONNECTIONS_NAME = getFunctionName(api.mapChain.watchMapConnections);

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
}): OptimisticLocalStore & {
  systems: OptimisticSystemRow[];
  connections: OptimisticConnectionRow[];
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
  ]);

  const store: OptimisticLocalStore & {
    systems: OptimisticSystemRow[];
    connections: OptimisticConnectionRow[];
  } = {
    get systems() {
      return pages.get(SYSTEMS_NAME)!.value.page as OptimisticSystemRow[];
    },
    get connections() {
      return pages.get(CONNECTIONS_NAME)!.value
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
    mapId: MAP,
    fromSystemId,
    toSystemId,
    wormholeTypeCode: null,
    massState: null,
    shipSize: null,
    eolAt: null,
    lifeStage: null,
    lifeStageObservedAt: null,
    deletedAt: null,
    purgeAfter: null,
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

describe('useChainAuthoringMutations', () => {
  it('is the OW4-facing hook that wraps every public authoring mutation', () => {
    expect(typeof useChainAuthoringMutations).toBe('function');
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
    expect(store.systems.map((row) => row.systemId).toSorted()).toEqual([
      JITA,
      AMARR,
    ]);
    expect(store.connections).toHaveLength(1);
    expect(store.connections[0]).toMatchObject({
      fromSystemId: JITA,
      toSystemId: AMARR,
      wormholeTypeCode: null,
      massState: null,
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
    });
    optimisticPatchConnection(store, {
      mapId: MAP,
      connectionId: 'c1',
      patch: { massState: 'critical' },
    });
    expect(store.connections[0]?.massState).toBe('critical');
  });
});

describe('optimisticTombstoneSystem', () => {
  it('stamps the 24h undo window so the live filter can drop the row', () => {
    const now = 1_700_000_000_000;
    const store = mockStore({ systems: [systemRow(JITA)] });
    optimisticTombstoneSystem(store, { mapId: MAP, systemId: JITA }, now);
    expect(store.systems[0]?.deletedAt).toBe(now);
    expect(store.systems[0]?.purgeAfter).toBe(now + MAP_CHAIN_UNDO_WINDOW_MS);
    expect(liveSystemPresent(store, MAP, JITA)).toBe(false);
  });
});
