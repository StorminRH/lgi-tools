import { describe, expect, it } from 'vitest';
import { hubJumpsFrom, TRADE_HUBS } from './trade-hubs';

const JITA = 30_000_142;
const AMARR = 30_002_187;
const DODIXIE = 30_002_659;
const RENS = 30_002_510;
const HEK = 30_002_053;
const A = 1;
const B = 2;
const C = 3;
const FAR = 4;
const ISOLATED = 99;

function neighboursOf(
  edges: ReadonlyArray<readonly [number, number]>,
): (id: number) => readonly number[] {
  const byId = new Map<number, number[]>();
  for (const [from, to] of edges) {
    const forward = byId.get(from) ?? [];
    forward.push(to);
    byId.set(from, forward);
    const back = byId.get(to) ?? [];
    back.push(from);
    byId.set(to, back);
  }
  return (id) => byId.get(id) ?? [];
}

const GRAPH = neighboursOf([
  [JITA, A],
  [A, B],
  [B, AMARR],
  [A, C],
  [C, DODIXIE],
  [FAR, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [12, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [16, 17],
  [17, 18],
  [18, 19],
  [19, JITA],
]);

describe('TRADE_HUBS', () => {
  it('lists the five market hubs in display order', () => {
    expect(TRADE_HUBS).toEqual([
      { id: JITA, name: 'Jita' },
      { id: AMARR, name: 'Amarr' },
      { id: DODIXIE, name: 'Dodixie' },
      { id: RENS, name: 'Rens' },
      { id: HEK, name: 'Hek' },
    ]);
  });
});

describe('hubJumpsFrom', () => {
  it('returns a closest-first 5-tuple with unreachable hubs last', () => {
    expect(hubJumpsFrom(B, GRAPH)).toEqual([
      { id: AMARR, name: 'Amarr', jumps: 1 },
      { id: JITA, name: 'Jita', jumps: 2 },
      { id: DODIXIE, name: 'Dodixie', jumps: 3 },
      { id: RENS, name: 'Rens', jumps: null },
      { id: HEK, name: 'Hek', jumps: null },
    ]);
  });

  it('places a hub system first at zero jumps', () => {
    expect(hubJumpsFrom(JITA, GRAPH)).toEqual([
      { id: JITA, name: 'Jita', jumps: 0 },
      { id: AMARR, name: 'Amarr', jumps: 3 },
      { id: DODIXIE, name: 'Dodixie', jumps: 3 },
      { id: RENS, name: 'Rens', jumps: null },
      { id: HEK, name: 'Hek', jumps: null },
    ]);
  });

  it('keeps TRADE_HUBS order when every hub is unreachable', () => {
    expect(hubJumpsFrom(ISOLATED, GRAPH)).toEqual([
      { id: JITA, name: 'Jita', jumps: null },
      { id: AMARR, name: 'Amarr', jumps: null },
      { id: DODIXIE, name: 'Dodixie', jumps: null },
      { id: RENS, name: 'Rens', jumps: null },
      { id: HEK, name: 'Hek', jumps: null },
    ]);
  });

  it('counts a 16-jump path instead of capping at 15', () => {
    expect(hubJumpsFrom(FAR, GRAPH)).toEqual([
      { id: JITA, name: 'Jita', jumps: 16 },
      { id: AMARR, name: 'Amarr', jumps: 19 },
      { id: DODIXIE, name: 'Dodixie', jumps: 19 },
      { id: RENS, name: 'Rens', jumps: null },
      { id: HEK, name: 'Hek', jumps: null },
    ]);
  });
});
