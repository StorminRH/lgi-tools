import type { LayoutEdge, LayoutFacts } from '@/mapper/layout/layout-contract';

export interface ReplayArgs {
  readonly mapId: string | null;
  readonly userId: string | null;
  readonly chainSeed: number;
  readonly intervalMs: number;
  readonly loop: boolean;
}

const DEFAULT_INTERVAL_MS = 1500;

const VALUE_FLAGS = new Set(['--map', '--user', '--chain', '--interval-ms']);

export function parseReplayArgs(argv: readonly string[]): ReplayArgs | null {
  const values = new Map<string, string>();
  let loop = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    const next = argv[i + 1];
    if (arg === '--') continue;
    if (arg === '--loop') {
      loop = true;
      continue;
    }
    if (VALUE_FLAGS.has(arg) && next !== undefined) {
      values.set(arg, next);
      i += 1;
      continue;
    }
    return null;
  }

  const chainSeed = Number(values.get('--chain') ?? 12);
  const intervalMs = Number(values.get('--interval-ms') ?? DEFAULT_INTERVAL_MS);
  const mapId = values.get('--map') ?? null;
  const userId = values.get('--user') ?? null;
  const wellFormed =
    Number.isFinite(chainSeed) &&
    Number.isFinite(intervalMs) &&
    intervalMs >= 0 &&
    (mapId !== null || userId !== null);
  return wellFormed ? { mapId, userId, chainSeed, intervalMs, loop } : null;
}

export interface SpawnStep {
  readonly systemId: number;

  readonly drainedConnections: readonly LayoutEdge[];

  readonly connections: readonly LayoutEdge[];

  readonly skippedSelfLoops: readonly LayoutEdge[];

  readonly newlyDeferred: readonly LayoutEdge[];
}

export interface SpawnPlan {
  readonly steps: readonly SpawnStep[];
  readonly unplaceable: readonly LayoutEdge[];
}

export function attachingEdgeOf(step: SpawnStep): LayoutEdge | undefined {
  const touches = (edge: LayoutEdge): boolean =>
    edge.fromSystemId === step.systemId || edge.toSystemId === step.systemId;
  return step.connections.find(touches) ?? step.drainedConnections.find(touches);
}

export function planSpawnSteps(
  facts: LayoutFacts,
  connectionSteps: readonly number[],
  size: number,
): SpawnPlan {
  const placed = new Set<number>();
  let pending: LayoutEdge[] = [];
  const steps: SpawnStep[] = [];

  const placeable = (edge: LayoutEdge): boolean =>
    placed.has(edge.fromSystemId) && placed.has(edge.toSystemId);

  for (let systemCount = 1; systemCount <= size; systemCount += 1) {
    const system = facts.systems[systemCount - 1];
    if (system === undefined) throw new Error(`missing system at count ${systemCount}`);
    placed.add(system.systemId);

    const drainedConnections = pending.filter(placeable);
    pending = pending.filter((edge) => !placeable(edge));

    const connections: LayoutEdge[] = [];
    const skippedSelfLoops: LayoutEdge[] = [];
    const newlyDeferred: LayoutEdge[] = [];
    for (const [index, edge] of facts.connections.entries()) {
      if (connectionSteps[index] !== systemCount) continue;
      if (edge.fromSystemId === edge.toSystemId) skippedSelfLoops.push(edge);
      else if (placeable(edge)) connections.push(edge);
      else {
        newlyDeferred.push(edge);
        pending.push(edge);
      }
    }

    steps.push({
      systemId: system.systemId,
      drainedConnections,
      connections,
      skippedSelfLoops,
      newlyDeferred,
    });
  }

  return { steps, unplaceable: pending };
}
