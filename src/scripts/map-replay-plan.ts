// Pure planning for the map replay: argument parsing and spawn-step
// computation, kept apart from the executing script so the deferral and
// degenerate-edge policy is unit-tested rather than dev-observed.
import type { LayoutEdge, LayoutFacts } from '@/mapper/layout/layout-contract';

/** Parsed replay CLI arguments. */
export interface ReplayArgs {
  readonly mapId: string | null;
  readonly userId: string | null;
  readonly chainSeed: number;
  readonly intervalMs: number;
  readonly loop: boolean;
}

const DEFAULT_INTERVAL_MS = 1500;

/** Flags that consume the following argv token as their value. */
const VALUE_FLAGS = new Set(['--map', '--user', '--chain', '--interval-ms']);

/**
 * Parses replay argv; `null` means show usage. The pnpm-forwarded `--`
 * separator is skipped, `--loop` is a bare flag, and every other token must be
 * a known value flag followed by its value.
 */
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

/** One jump of the replay: a system placement plus the connections that land with it. */
export interface SpawnStep {
  readonly systemId: number;
  /**
   * Deferred edges that became placeable because this system landed. Ordinary
   * scans — they must not steal the discovering jump from a current-step edge.
   */
  readonly drainedConnections: readonly LayoutEdge[];
  /** Edges scanned at this step (discovering jump, loops, orphan resolves). */
  readonly connections: readonly LayoutEdge[];
  /** Self-loop edges the live entity contract forbids; logged and skipped. */
  readonly skippedSelfLoops: readonly LayoutEdge[];
  /** Edges held back this step because an endpoint has not spawned yet. */
  readonly newlyDeferred: readonly LayoutEdge[];
}

/** The full spawn plan plus any edges that never became placeable. */
export interface SpawnPlan {
  readonly steps: readonly SpawnStep[];
  readonly unplaceable: readonly LayoutEdge[];
}

/**
 * The discovering connection for one spawn step: prefer a current-step edge
 * that touches the system, and only fall back to a drained deferred edge when
 * that deferred edge is the jump that finally revealed it.
 */
export function attachingEdgeOf(step: SpawnStep): LayoutEdge | undefined {
  const touches = (edge: LayoutEdge): boolean =>
    edge.fromSystemId === step.systemId || edge.toSystemId === step.systemId;
  return step.connections.find(touches) ?? step.drainedConnections.find(touches);
}

/**
 * Computes the ordered spawn plan for one corpus timeline: the proof corpus
 * deliberately contains degenerate edges the kernel must tolerate but the live
 * entity contract forbids or defers — a self-loop is skipped outright
 * (`SELF_LOOP_CONNECTION` server-side) and a connection whose endpoint has not
 * spawned yet is held until that system lands (`UNKNOWN_ENDPOINT` otherwise).
 */
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
