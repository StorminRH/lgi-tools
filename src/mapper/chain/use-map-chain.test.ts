import { describe, expect, it } from 'vitest';
import {
  chainSignature,
  factsFromSnapshot,
  filterLivePages,
  layoutConfigKey,
  layoutPostKey,
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
  rows: readonly { _id: string; fromSystemId: number; toSystemId: number }[],
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

  it('re-roots back when the prior root returns live (restore)', () => {
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
            connectionId: 'temp:c1',
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
    expect(local.state.connections.has('temp:c1')).toBe(true);
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
            connectionId: 'temp:c1',
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
