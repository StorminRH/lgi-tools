export interface ParsedStructureFit {
  structureTypeId: number;
  /** The fit's own name from its header; null when blank. */
  name: string | null;
  rigTypeIds: number[];
}

export type ResolveTypeId = (name: string) => number | undefined;

/** `[Hull, Fit name]`: the hull before the first comma, the name up to the closing bracket. */
function parseHeader(line: string): { hull: string; name: string | null } | null {
  const match = /^\[\s*([^,\]]+?)\s*,\s*(.*?)\s*\]?\s*$/.exec(line);
  if (!match) return null;
  return { hull: match[1]!, name: match[2] || null };
}

function isRigLine(text: string): boolean {
  if (!text.startsWith('Standup ')) return false;
  if (!text.includes('-Set ')) return false;
  if (/\sx\d+$/.test(text)) return false;
  return true;
}

function stripOffline(text: string): string {
  return text.replace(/\s*\/offline$/i, '').trim();
}

export function parseStructureFit(
  clipboard: string,
  resolveTypeId: ResolveTypeId,
): ParsedStructureFit | null {
  const lines = clipboard.split(/\r?\n/);

  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx === -1) return null;
  const header = parseHeader(lines[firstIdx]!.trim());
  if (header === null) return null;
  const structureTypeId = resolveTypeId(header.hull);
  if (structureTypeId === undefined) return null;

  const rigTypeIds: number[] = [];
  for (const raw of lines.slice(firstIdx + 1)) {
    const text = stripOffline(raw.trim());
    if (!isRigLine(text)) continue;
    const id = resolveTypeId(text);
    if (id !== undefined) rigTypeIds.push(id);
  }

  return { structureTypeId, name: header.name, rigTypeIds };
}
