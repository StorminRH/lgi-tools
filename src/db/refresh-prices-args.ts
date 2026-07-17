// Argv parsing for the refresh-prices CLI, extracted import-safe so it's tested
// without running a real refresh. Recognized shapes:
//   (none)     → stale sweep (only rows past their TTL)
//   34,35,36   → explicit IDs, unconditional refresh
//   --debug    → explicit IDs (DEFAULT_DEBUG_IDS), unconditional

/**
 * Sanity trio: Tritanium / Pyerite / Mexallon. Always have deep order books in
 * Jita on both sides — a useful smoke-test default when no IDs are passed.
 */
export const DEFAULT_DEBUG_IDS = [34, 35, 36];

export type RefreshMode = { kind: 'cached' } | { kind: 'explicit'; ids: number[] };

export function parseIds(arg: string): number[] {
  const ids = arg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number.parseInt(s, 10);
      if (!Number.isFinite(n)) throw new Error(`Invalid type ID: "${s}"`);
      return n;
    });
  if (ids.length === 0) throw new Error('No type IDs supplied');
  return ids;
}

export function parseArgs(argv: string[]): RefreshMode {
  let debug = false;
  let idsArg: string | undefined;
  for (const a of argv) {
    if (a === '--debug') debug = true;
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else idsArg = a;
  }
  if (idsArg) return { kind: 'explicit', ids: parseIds(idsArg) };
  if (debug) return { kind: 'explicit', ids: DEFAULT_DEBUG_IDS };
  return { kind: 'cached' };
}
