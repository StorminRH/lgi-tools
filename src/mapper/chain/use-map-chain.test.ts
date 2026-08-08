import { describe, expect, it } from 'vitest';
import type { Doc } from '@/data/convex/data-model';
import {
  chainSignature,
  connectionDetailsFromRows,
  factsFromSnapshot,
  filterChainConnections,
  filterLivePages,
  layoutConfigKey,
  layoutPostKey,
  normalizeMapAccess,
  unresolvedHolesFromRows,
} from './use-map-chain';
import {
  EMPTY_CHAIN_STATE,
  reconcileChain,
  type ChainSnapshot,
} from './reconciler';
import type { PlacementAssigner } from './placement';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
import { deriveChainTree } from '../layout/facts';
import {
  acceptReply,
  failRequest,
  initialKernelRequestState,
  postRequest,
} from '../layout/kernel-requests';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;

function systems(ids: readonly number[], complete = true) {
  return { rows: ids.map((systemId) => ({ systemId })), complete };
}

function connections(
  rows: readonly {
    _id: string;
    fromSystemId: number;
    toSystemId: number;
    deletedAt?: number | null;
  }[],
  complete = true,
) {
  return { rows, complete };
}

const keepPositions: PlacementAssigner = ({ systems: candidates }) => {
  const proposals = new Map<number, { x: number; y: number }>();
  for (const candidate of candidates) {
    proposals.set(
      candidate.systemId,
      candidate.position ?? { x: candidate.systemId, y: 0 },
    );
  }
  return proposals;
};

// The signature is what stops the merge effect from re-running on every render. If it were unstable,
// every render would re-merge and replay every intent — which 4.0.3.2 binds motion to — while the
// whole suite still passed. These cases pin the property that makes the guard work.
describe('chain snapshot signature', () => {
  it('is stable across freshly built objects with identical content', () => {
    const a = chainSignature(
      systems([JITA, AMARR]),
      connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR }]),
    );
    const b = chainSignature(
      systems([JITA, AMARR]),
      connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR }]),
    );

    expect(a).toBe(b);
  });

  it.each([
    ['a system arrives', systems([JITA, AMARR]), connections([])],
    ['the last system leaves', systems([]), connections([])],
    [
      'a connection arrives',
      systems([JITA]),
      connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR }]),
    ],
    [
      'a connection endpoint changes',
      systems([JITA]),
      connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR + 1 }]),
    ],
  ])('changes when %s', (_label, nextSystems, nextConnections) => {
    const before = chainSignature(systems([JITA]), connections([]));

    expect(chainSignature(nextSystems, nextConnections)).not.toBe(before);
  });

  it('changes when a collection finishes draining', () => {
    const draining = chainSignature(systems([JITA], false), connections([], false));
    const complete = chainSignature(systems([JITA], true), connections([], true));

    // Completeness is what licenses departures, so it must be part of the fingerprint.
    expect(draining).not.toBe(complete);
  });

  it('distinguishes two connections that differ only by document id', () => {
    const first = chainSignature(
      systems([JITA, AMARR]),
      connections([{ _id: 'c1', fromSystemId: JITA, toSystemId: AMARR }]),
    );
    const second = chainSignature(
      systems([JITA, AMARR]),
      connections([{ _id: 'c2', fromSystemId: JITA, toSystemId: AMARR }]),
    );

    expect(first).not.toBe(second);
  });

  it('changes when a connection becomes tombstoned without changing endpoints', () => {
    const active = connections([
      { _id: 'c1', fromSystemId: JITA, toSystemId: AMARR, deletedAt: null },
    ]);
    const tombstoned = connections([
      { _id: 'c1', fromSystemId: JITA, toSystemId: AMARR, deletedAt: 42 },
    ]);
    expect(chainSignature(systems([JITA, AMARR]), tombstoned)).not.toBe(
      chainSignature(systems([JITA, AMARR]), active),
    );
  });
});

describe('factsFromSnapshot', () => {
  it('derives layout facts in server (creation) row order, never reconciled arrival order', () => {
    const snapshot: ChainSnapshot = {
      systems: {
        rows: [{ systemId: AMARR }, { systemId: JITA }],
        complete: true,
      },
      connections: {
        rows: [
          { connectionId: 'c2', fromSystemId: AMARR, toSystemId: JITA },
          { connectionId: 'c1', fromSystemId: JITA, toSystemId: AMARR },
        ],
        complete: true,
      },
    };

    expect(factsFromSnapshot(snapshot)).toEqual({
      systems: [{ systemId: AMARR }, { systemId: JITA }],
      connections: [
        { fromSystemId: AMARR, toSystemId: JITA },
        { fromSystemId: JITA, toSystemId: AMARR },
      ],
    });
  });
});

describe('layout-then-merge posted-key guard', () => {
  it('includes dial fingerprint and revision so config and re-lock re-merge', () => {
    const signature = chainSignature(systems([JITA]), connections([]));
    const configKey = layoutConfigKey(DEFAULT_LAYOUT_CONFIG);
    const base = layoutPostKey(signature, configKey, 0);
    expect(layoutPostKey(signature, configKey, 1)).not.toBe(base);
    expect(
      layoutPostKey(
        signature,
        layoutConfigKey({ ...DEFAULT_LAYOUT_CONFIG, ringSpacing: DEFAULT_LAYOUT_CONFIG.ringSpacing + 60 }),
        0,
      ),
    ).not.toBe(base);
  });

  it('includes the halo fingerprint so a halo membership change re-posts', () => {
    const signature = chainSignature(systems([JITA]), connections([]));
    const configKey = layoutConfigKey(DEFAULT_LAYOUT_CONFIG);
    // The asset landing turns an empty halo into a populated one without
    // touching the authored signature — the key must still change.
    expect(layoutPostKey(signature, configKey, 0, '#')).not.toBe(
      layoutPostKey(signature, configKey, 0, `${JITA + 1}:1:0#`),
    );
    // Omitted halo (empty-halo callers) stays stable with itself.
    expect(layoutPostKey(signature, configKey, 0)).toBe(
      layoutPostKey(signature, configKey, 0),
    );
  });

  it('drops a stale reply after a newer key posts (merges wait for the latest positions)', () => {
    let state = initialKernelRequestState();
    const first = postRequest(state, layoutPostKey('sig', 'cfg', 0));
    if (first.kind !== 'posted') throw new Error('expected post');
    state = first.state;
    const second = postRequest(state, layoutPostKey('sig', 'cfg', 1));
    if (second.kind !== 'posted') throw new Error('expected post');
    state = second.state;

    expect(acceptReply(state, first.requestId)).toBe(false);
    expect(acceptReply(state, second.requestId)).toBe(true);
  });

  it('resets the posted key on terminal-without-apply so the next change retries', () => {
    const posted = postRequest(
      initialKernelRequestState(),
      layoutPostKey('sig', 'cfg', 0),
    );
    if (posted.kind !== 'posted') throw new Error('expected post');
    const failed = failRequest(posted.state, posted.requestId);
    const retry = postRequest(failed, layoutPostKey('sig', 'cfg', 0));
    expect(retry.kind).toBe('posted');
  });
});

// ── OW3 · live-row filter + signature gate + optimistic merge path ───────────
describe('live-row filter upstream of chainSignature', () => {
  it('drops tombstoned rows and changes the signature', () => {
    const subscribed = {
      rows: [
        { systemId: JITA, deletedAt: null as number | null },
        { systemId: AMARR, deletedAt: 1_700_000_000_000 },
      ],
      complete: true,
    };
    const live = filterLivePages(subscribed);
    expect(live.rows.map((row) => row.systemId)).toEqual([JITA]);
    expect(chainSignature(systems([JITA, AMARR]), connections([]))).not.toBe(
      chainSignature(
        { rows: live.rows.map((row) => ({ systemId: row.systemId })), complete: true },
        connections([]),
      ),
    );
  });

  it('treats undefined deletedAt as live (optional-field normalization)', () => {
    const pages = {
      rows: [{ systemId: JITA }, { systemId: AMARR, deletedAt: undefined }],
      complete: true,
    };
    expect(filterLivePages(pages)).toBe(pages);
  });

  it('keeps tombstoned connections as structural layout facts', () => {
    const pages = {
      rows: [
        {
          _id: 'c1',
          fromSystemId: JITA,
          toSystemId: AMARR,
          deletedAt: 42,
          purgeAfter: null,
        },
      ],
      complete: true,
    };
    expect(filterChainConnections(pages)).toBe(pages);
  });
});

describe('client subscription projections', () => {
  it('keeps unanswered access distinct from a live denial', () => {
    expect(normalizeMapAccess(undefined)).toEqual({
      access: undefined,
      canEdit: undefined,
    });
    expect(normalizeMapAccess({ granted: false, canEdit: false })).toEqual({
      access: false,
      canEdit: false,
    });
  });

  it('normalizes optional connection detail fields without dropping tombstones', () => {
    const row = {
      _id: 'c1',
      _creationTime: 10,
      mapId: 'map-a',
      fromSystemId: JITA,
      toSystemId: AMARR,
      wormholeTypeCode: null,
      massState: null,
      shipSize: null,
      eolAt: null,
      deletedAt: 20,
      purgeAfter: 30,
    } as Doc<'mapConnections'>;
    const unresolved = {
      ...row,
      _id: 'stub-1',
      toSystemId: null,
      fromSignatureId: 'ABC-123',
    } as Doc<'mapConnections'>;
    const details = connectionDetailsFromRows([row, unresolved]);
    expect(details.get(row._id)).toMatchObject({
      connectionId: row._id,
      _creationTime: 10,
      lifeStage: null,
      deathEarliestAt: null,
      deathLatestAt: null,
      deletedAt: 20,
      purgeAfter: 30,
      fromSignatureId: null,
      fromDestinationHint: null,
      destinationProvenance: null,
      pendingCandidates: null,
      observedMassKg: null,
      observedMassAtStateKg: null,
    });
    expect(details.has(unresolved._id)).toBe(false);
  });

  it('projects merged identity fields for the card and prompt consumers', () => {
    const row = {
      _id: 'c1',
      _creationTime: 10,
      mapId: 'map-a',
      fromSystemId: JITA,
      toSystemId: AMARR,
      wormholeTypeCode: 'K162',
      massState: null,
      shipSize: null,
      eolAt: null,
      deletedAt: null,
      purgeAfter: null,
      fromSignatureId: 'ABC-123',
      fromDestinationHint: 'deadly',
      destinationProvenance: 'assumed',
      pendingCandidates: ['c1', 'stub-2'],
      observedMassKg: 300_000_000,
      observedMassAtStateKg: 100_000_000,
    } as Doc<'mapConnections'>;
    expect(connectionDetailsFromRows([row]).get(row._id)).toMatchObject({
      fromSignatureId: 'ABC-123',
      fromDestinationHint: 'deadly',
      destinationProvenance: 'assumed',
      pendingCandidates: ['c1', 'stub-2'],
      observedMassKg: 300_000_000,
      observedMassAtStateKg: 100_000_000,
    });
  });

  it('summarizes only live unresolved slots for the prompt feed', () => {
    const base = {
      _creationTime: 10,
      mapId: 'map-a',
      fromSystemId: JITA,
      massState: null,
      shipSize: null,
      eolAt: null,
      deletedAt: null,
      purgeAfter: null,
    };
    const rows = [
      {
        ...base,
        _id: 'stub-1',
        toSystemId: null,
        wormholeTypeCode: null,
        fromSignatureId: 'ABC-123',
      },
      { ...base, _id: 'resolved', toSystemId: AMARR, wormholeTypeCode: 'B274' },
      {
        ...base,
        _id: 'stub-dead',
        toSystemId: null,
        wormholeTypeCode: null,
        deletedAt: 20,
        purgeAfter: 30,
      },
    ] as Doc<'mapConnections'>[];
    expect(unresolvedHolesFromRows(rows)).toEqual([
      {
        connectionId: 'stub-1',
        fromSystemId: JITA,
        fromSignatureId: 'ABC-123',
        wormholeTypeCode: null,
      },
    ]);
  });
});

describe('tombstone → merge removal and root re-derivation (SC-4.5)', () => {
  it('removes a tombstoned root from canvas state and re-roots to the next live system', () => {
    const before: ChainSnapshot = {
      systems: {
        rows: [{ systemId: JITA }, { systemId: AMARR }],
        complete: true,
      },
      connections: {
        rows: [
          {
            connectionId: 'c1',
            fromSystemId: JITA,
            toSystemId: AMARR,
          },
        ],
        complete: true,
      },
    };
    const populated = reconcileChain(
      EMPTY_CHAIN_STATE,
      before,
      new Set(),
      keepPositions,
    );
    expect(deriveChainTree(factsFromSnapshot(before)).rootSystemId).toBe(JITA);

    // Tombstone patch filtered upstream — JITA gone from the live snapshot alone.
    const afterFilter: ChainSnapshot = {
      systems: { rows: [{ systemId: AMARR }], complete: true },
      connections: { rows: [], complete: true },
    };
    const after = reconcileChain(
      populated.state,
      afterFilter,
      new Set(),
      keepPositions,
    );

    expect([...after.state.systems.keys()]).toEqual([AMARR]);
    expect(after.intents.map((intent) => intent.kind)).toEqual(
      expect.arrayContaining(['system-departed', 'connection-departed']),
    );
    expect(deriveChainTree(factsFromSnapshot(afterFilter)).rootSystemId).toBe(
      AMARR,
    );
  });

  it('re-derives the original root from pure facts once it is live again', () => {
    const withoutRoot: ChainSnapshot = {
      systems: { rows: [{ systemId: AMARR }, { systemId: DODIXIE }], complete: true },
      connections: { rows: [], complete: true },
    };
    const restored: ChainSnapshot = {
      systems: {
        rows: [
          { systemId: JITA },
          { systemId: AMARR },
          { systemId: DODIXIE },
        ],
        complete: true,
      },
      connections: { rows: [], complete: true },
    };
    expect(deriveChainTree(factsFromSnapshot(withoutRoot)).rootSystemId).toBe(
      AMARR,
    );
    expect(deriveChainTree(factsFromSnapshot(restored)).rootSystemId).toBe(JITA);
  });
});

describe('optimistic add through the merge (SC-3.3 / SC-3.4)', () => {
  it('shows an optimistic edge then removes it on rollback to server truth', () => {
    const home: ChainSnapshot = {
      systems: { rows: [{ systemId: JITA }], complete: true },
      connections: { rows: [], complete: true },
    };
    const withHome = reconcileChain(
      EMPTY_CHAIN_STATE,
      home,
      new Set(),
      keepPositions,
    );

    const optimistic: ChainSnapshot = {
      systems: {
        rows: [{ systemId: JITA }, { systemId: AMARR }],
        complete: true,
      },
      connections: {
        rows: [
          {
            connectionId: 'optimistic:mapConnections:c1',
            fromSystemId: JITA,
            toSystemId: AMARR,
          },
        ],
        complete: true,
      },
    };
    const local = reconcileChain(
      withHome.state,
      optimistic,
      new Set(),
      keepPositions,
    );
    expect(
      local.state.connections.has('optimistic:mapConnections:c1'),
    ).toBe(true);
    expect(
      local.intents.some((intent) => intent.kind === 'connection-appeared'),
    ).toBe(true);

    // Rejection rolls the optimistic layer back — server still has only home.
    const rolledBack = reconcileChain(
      local.state,
      home,
      new Set(),
      keepPositions,
    );
    expect(rolledBack.state.connections.size).toBe(0);
    expect([...rolledBack.state.systems.keys()]).toEqual([JITA]);
    expect(
      rolledBack.intents.some((intent) => intent.kind === 'connection-departed'),
    ).toBe(true);
  });

  it('swaps a confirmed id in place with no connection intent pair', () => {
    const optimistic: ChainSnapshot = {
      systems: {
        rows: [{ systemId: JITA }, { systemId: AMARR }],
        complete: true,
      },
      connections: {
        rows: [
          {
            connectionId: 'optimistic:mapConnections:c1',
            fromSystemId: JITA,
            toSystemId: AMARR,
          },
        ],
        complete: true,
      },
    };
    const confirmed: ChainSnapshot = {
      systems: optimistic.systems,
      connections: {
        rows: [
          {
            connectionId: 'confirmed:c1',
            fromSystemId: JITA,
            toSystemId: AMARR,
          },
        ],
        complete: true,
      },
    };
    const local = reconcileChain(
      EMPTY_CHAIN_STATE,
      optimistic,
      new Set(),
      keepPositions,
    );
    const merged = reconcileChain(
      local.state,
      confirmed,
      new Set(),
      keepPositions,
    );

    expect([...merged.state.connections.keys()]).toEqual(['confirmed:c1']);
    expect(
      merged.intents.filter(
        (intent) =>
          intent.kind === 'connection-appeared' ||
          intent.kind === 'connection-departed',
      ),
    ).toEqual([]);
  });
});
