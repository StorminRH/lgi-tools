import { describe, expect, it } from 'vitest';
import { chainSignature } from './use-map-chain';

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
