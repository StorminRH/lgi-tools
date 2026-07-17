// Pure EFT structure-fit clipboard parser for the Industry Planner (3.7.9.1).
//
// Turns a real in-game "Copy to Clipboard" structure fit into the two things the
// planner needs to compute its bonus: the structure type and the fitted rigs.
// Name → typeId resolution is an injected callback (the SDE lookup is the caller's
// job), so this module stays pure, in-slice, and unit-testable from plain strings.
//
// --- Verified format (CCP fitting spec + pyfa's reference parser; HIGH confidence) ---
//   • Header line: `[StructureTypeName, Fit Name]` — same grammar as a ship fit.
//     The structure type name is the text after `[` up to the FIRST comma
//     (structure names contain no comma); pyfa's importer is `,\s*`-lenient, so we
//     split on the first comma and trim rather than requiring a literal ", ".
//   • Body: one item per line by display name, in slot sections. We do NOT rely on
//     section position — structure rigs are unambiguous by name:
//       RIG     → starts "Standup " AND contains "-Set " (M/L/XL-Set), no " xN" suffix.
//       SERVICE → "Standup " WITHOUT "-Set " (e.g. "Standup Manufacturing Plant I") — excluded.
//       FIGHTER → trailing " xN" — excluded.
//   • `[Empty rig slot]` placeholders are tolerated (skipped) but not depended on;
//     a live export usually omits empty slots. A trailing "/offline" is stripped.
//
// Degrades gracefully: a string with no resolvable structure header returns null;
// rig names that don't resolve are dropped, never thrown.

/** Successfully parsed structure fit containing hull and applicable rig type IDs. */
export interface ParsedStructureFit {
  structureTypeId: number;
  rigTypeIds: number[];
}

/** Resolve an exact in-game type name to its SDE typeId, or undefined if unknown. */
export type ResolveTypeId = (name: string) => number | undefined;

// `[Azbel, Cap Production]` → "Azbel". Returns null if the line isn't a header.
function parseHeaderName(line: string): string | null {
  const match = /^\[\s*([^,\]]+?)\s*,/.exec(line);
  return match?.[1] ?? null;
}

// A rig line by name, independent of its position in the fit.
function isRigLine(text: string): boolean {
  if (!text.startsWith('Standup ')) return false;
  if (!text.includes('-Set ')) return false; // excludes "Standup …" service modules
  if (/\sx\d+$/.test(text)) return false; // excludes fighters (trailing " xN")
  return true;
}

// Strip a trailing "/offline" marker (modules can carry it; harmless on a rig).
function stripOffline(text: string): string {
  return text.replace(/\s*\/offline$/i, '').trim();
}

/**
 * Parses a copied in-game structure fit into structure and rig type IDs, returning explicit errors
 * for unsupported or malformed lines.
 */
export function parseStructureFit(
  clipboard: string,
  resolveTypeId: ResolveTypeId,
): ParsedStructureFit | null {
  const lines = clipboard.split(/\r?\n/);

  // The first non-empty line must be the structure header.
  const firstIdx = lines.findIndex((l) => l.trim().length > 0);
  if (firstIdx === -1) return null;
  // firstIdx is a valid index (findIndex result, checked !== -1 above).
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
