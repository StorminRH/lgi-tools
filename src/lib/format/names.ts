/** A word from its first letter or digit on, so a quoted 'Moreau' starts at M; a word with neither, such as '→', stays whole. */
function fromFirstLetterOrDigit(word: string): string {
  const start = word.search(/[\p{L}\p{N}]/u);
  return start > 0 ? word.slice(start) : word;
}

/** A two-character monogram: the first letters of the first two words, or the first two of a single word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).map(fromFirstLetterOrDigit);
  if (words.length >= 2) return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return (words[0] ?? '').slice(0, 2).toUpperCase();
}

const UNRESOLVED_KIND_LABEL = {
  type: 'Type',
  skill: 'Skill',
  character: 'Character',
  corporation: 'Corporation',
  structure: 'Structure',
  station: 'Station',
} as const;

export type UnresolvedNameKind = keyof typeof UNRESOLVED_KIND_LABEL;

/** The placeholder for an EVE entity whose name did not resolve: 'Type 587', 'Character 42'. */
export function unresolvedName(kind: UnresolvedNameKind, id: number | string): string {
  return `${UNRESOLVED_KIND_LABEL[kind]} ${id}`;
}

/** The resolved name from an id-keyed record, or the unresolved placeholder for that kind. */
export function nameOrUnresolved(
  names: Readonly<Record<string, string>>,
  id: number,
  kind: UnresolvedNameKind,
): string {
  return names[String(id)] ?? unresolvedName(kind, id);
}

/** An NPC station name with its dash separators typeset: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant' becomes 'Jita IV-4 — Caldari Navy Assembly Plant'. */
export function formatStationName(name: string): string {
  const collapsed = name.replace(/ - Moon (\d+) - /, '-$1 — ');
  if (collapsed !== name) return collapsed;
  return name.replace(' - ', ' — ');
}
