export const DEFAULT_DEBUG_IDS = [34, 35, 36];

export type RefreshMode = { kind: 'cached' } | { kind: 'explicit'; ids: number[] };

export function parseIds(arg: string): number[] {
  const ids = arg
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => {
      const n = Number(s);
      if (!Number.isSafeInteger(n) || n <= 0) {
        throw new Error(`Invalid type ID: "${s}"`);
      }
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
    else if (idsArg === undefined) idsArg = a;
    else throw new Error(`Multiple type ID arguments: "${idsArg}" and "${a}"`);
  }
  if (idsArg) return { kind: 'explicit', ids: parseIds(idsArg) };
  if (debug) return { kind: 'explicit', ids: DEFAULT_DEBUG_IDS };
  return { kind: 'cached' };
}
