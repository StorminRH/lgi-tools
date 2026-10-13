/** The ids one hop from `id`. */
export type Neighbours = (id: number) => readonly number[];

/** How a breadth-first walk first reached an id: its hop count and the id it came from (null for a source). */
export interface Reached {
  readonly depth: number;
  readonly parent: number | null;
}

function everyTargetReached(
  targets: ReadonlySet<number> | undefined,
  reached: ReadonlyMap<number, Reached>,
): boolean {
  if (targets === undefined) return false;
  for (const target of targets) {
    if (!reached.has(target)) return false;
  }
  return true;
}

function expandLevel(
  frontier: readonly number[],
  depth: number,
  neighbours: Neighbours,
  reached: Map<number, Reached>,
): number[] {
  const next: number[] = [];
  for (const parent of frontier) {
    for (const id of neighbours(parent)) {
      if (reached.has(id)) continue;
      reached.set(id, { depth, parent });
      next.push(id);
    }
  }
  return next;
}

/**
 * Level-synchronous breadth-first walk. Sources sit at depth 0 in the order
 * given, the first discovery of an id wins its parent, and the map's
 * insertion order is discovery order. The walk stops after the level at
 * `maxDepth`, or after the first completed level in which every id in
 * `targets` is reached (an empty `targets` set expands nothing).
 */
export function breadthFirst(
  sources: Iterable<number>,
  neighbours: Neighbours,
  options: { readonly maxDepth?: number; readonly targets?: ReadonlySet<number> } = {},
): ReadonlyMap<number, Reached> {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const reached = new Map<number, Reached>();
  let frontier: number[] = [];
  for (const source of sources) {
    if (reached.has(source)) continue;
    reached.set(source, { depth: 0, parent: null });
    frontier.push(source);
  }
  for (
    let depth = 1;
    depth <= maxDepth && frontier.length > 0 && !everyTargetReached(options.targets, reached);
    depth += 1
  ) {
    frontier = expandLevel(frontier, depth, neighbours, reached);
  }
  return reached;
}

/** The source-to-target path through first-discovery parents, both ends included; null when the walk never reached `target`. */
export function pathTo(
  reached: ReadonlyMap<number, Reached>,
  target: number,
): number[] | null {
  if (!reached.has(target)) return null;
  const path: number[] = [];
  for (
    let cursor: number | null = target;
    cursor !== null;
    cursor = reached.get(cursor)?.parent ?? null
  ) {
    path.push(cursor);
  }
  return path.reverse();
}
