// --- Verified format (CCP fitting spec + pyfa's reference parser; HIGH confidence) ---

export interface ParsedStructureFit {
  structureTypeId: number;
  rigTypeIds: number[];
}

export type ResolveTypeId = (name: string) => number | undefined;

function parseHeaderName(line: string): string | null {
  const match = /^\[\s*([^,\]]+?)\s*,/.exec(line);
  return match?.[1] ?? null;
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

  const structureName = parseHeaderName(lines[firstIdx]!.trim());
  if (structureName === null) return null;
  const structureTypeId = resolveTypeId(structureName);
  if (structureTypeId === undefined) return null;

  const rigTypeIds: number[] = [];
  for (const raw of lines.slice(firstIdx + 1)) {
    const text = stripOffline(raw.trim());
    if (!isRigLine(text)) continue;
    const id = resolveTypeId(text);
    if (id !== undefined) rigTypeIds.push(id);
  }

  return { structureTypeId, rigTypeIds };
}
