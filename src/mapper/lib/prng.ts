// The mapper's one deterministic randomness source. Fog brushes and the layout
// proof corpus both stamp from this stream, so a change here re-shapes every
// deterministic fixture at once — never fork a second implementation.

/** Mulberry32: a tiny, well-distributed 32-bit PRNG — the same seed yields the same stream everywhere. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
