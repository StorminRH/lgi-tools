export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return name.trim().slice(0, 2).toUpperCase();
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
