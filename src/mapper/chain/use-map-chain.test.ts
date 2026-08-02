import { describe, expect, it } from 'vitest';
import {
  chainSignature,
  factsFromSnapshot,
  layoutConfigKey,
  layoutPostKey,
} from './use-map-chain';
import type { ChainSnapshot } from './reconciler';
import { DEFAULT_LAYOUT_CONFIG } from '../layout/layout-contract';
import {
  acceptReply,
  failRequest,
  initialKernelRequestState,
  postRequest,
} from '../layout/kernel-requests';

const JITA = 30_000_142;
const AMARR = 30_002_187;

function systems(ids: readonly number[], complete = true) {
  return { rows: ids.map((systemId) => ({ systemId })), complete };
}

function connections(
  rows: readonly { _id: string; fromSystemId: number; toSystemId: number }[],
  complete = true,
) {
  return { rows, complete };
}

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
