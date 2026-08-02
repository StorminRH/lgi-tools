// Dev-only paced corpus replay into the local Convex deployment.
//
// Seeds a Neon map (or reuses `--map`), projects its access claim, then replays
// a proof-kit corpus timeline through the internal fixture mutations — one
// pause per JUMP (a system and its attaching connection land together, the way
// the game reveals wormholes). `--loop` grows the chain, holds, tears it down
// newest-first (the departure cascade), and repeats until interrupted. The
// skip/defer policy for the corpus's deliberate degenerate edges lives in
// `map-replay-plan.ts`, where it is unit-tested.
//
// Run:
//   pnpm map:replay -- --user <better-auth-user-id> --chain 12
//   pnpm map:replay -- --map <uuid> --chain 33 --interval-ms 1500 --loop
//
// Known dev-tool limitation: connection inserts are not idempotent, so reuse
// `--map` only on a map whose last run completed (or fully tore down). After
// an interrupted run, seed a fresh map with `--user` — replay maps are
// disposable by design.
import { config } from 'dotenv';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { projectMapAccess } from '@/composition/map-access-projection';
import { db } from '@/db';
import { maps } from '@/data/maps/schema';
import { readEnv, requireEnv } from '@/lib/env';
import type { LayoutEdge } from '@/mapper/layout/layout-contract';
import {
  generateChainTimeline,
  PROOF_CORPUS,
  type CorpusEntry,
} from '@/mapper/layout/proof-kit';
import { parseReplayArgs, planSpawnSteps, type ReplayArgs, type SpawnStep } from './map-replay-plan';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

const execFileAsync = promisify(execFile);

const DEFAULT_CONNECTION = {
  wormholeTypeCode: 'C247',
  massState: 'stable' as const,
  shipSize: null,
  eolAt: null,
};

function usage(): never {
  console.error(`Usage:
  pnpm map:replay -- --user <better-auth-user-id> [--chain <corpus-seed>] [--interval-ms <ms>] [--loop]
  pnpm map:replay -- --map <uuid> [--chain <corpus-seed>] [--interval-ms <ms>] [--loop]

--loop replays the chain up, holds, tears it down (departures), and repeats
until interrupted.

Corpus seeds: ${PROOF_CORPUS.map((entry) => entry.seed).join(', ')}
`);
  process.exit(1);
}

function corpusEntry(seed: number): CorpusEntry {
  const entry = PROOF_CORPUS.find((candidate) => candidate.seed === seed);
  if (entry === undefined) {
    console.error(`Unknown corpus seed ${seed}.`);
    usage();
  }
  return entry;
}

async function ensureMap(mapId: string | null, userId: string | null): Promise<string> {
  requireEnv('DATABASE_URL');

  if (mapId !== null) {
    const [existing] = await db.select().from(maps).where(eq(maps.id, mapId)).limit(1);
    if (existing === undefined) {
      throw new Error(`Map ${mapId} not found in Neon.`);
    }
    console.log(`reusing map ${mapId} (${existing.name})`);
    return mapId;
  }

  if (userId === null) {
    throw new Error('unreachable: parseReplayArgs requires --user when --map is absent');
  }

  const id = randomUUID();
  const name = `replay-${new Date().toISOString().slice(0, 19)}`;
  await db.insert(maps).values({ id, userId, name });
  console.log(`seeded map ${id} for user ${userId} (${name})`);
  return id;
}

/** Prints whatever a convex run emitted; kept apart so `convexRun` stays narrow. */
function report(stdout: string, stderr: string): void {
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

/** The human-readable failure detail buried in an execFile rejection. */
function errorDetail(error: unknown): string {
  if (error instanceof Error && 'stderr' in error) {
    return String((error as { stderr?: Buffer | string }).stderr ?? error.message);
  }
  return String(error);
}

async function convexRun(path: string, args: Record<string, unknown>): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'pnpm',
      ['exec', 'convex', 'run', path, JSON.stringify(args)],
      { cwd: process.cwd(), env: process.env, maxBuffer: 10 * 1024 * 1024 },
    );
    report(stdout, stderr);
    return stdout.trim();
  } catch (error) {
    throw new Error(`${path} failed: ${errorDetail(error)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One pause per jump; zero-interval runs never touch the timer. */
function pace(intervalMs: number): Promise<void> {
  return intervalMs > 0 ? sleep(intervalMs) : Promise.resolve();
}

/** How long a looping replay rests between grown and empty states. */
function holdMs(intervalMs: number): number {
  return Math.max(2000, intervalMs * 3);
}

async function insertConnection(mapId: string, edge: LayoutEdge): Promise<string> {
  console.log(`+ connection ${edge.fromSystemId} → ${edge.toSystemId}`);
  const inserted = await convexRun('mapFixtures:insertConnectionFixture', {
    mapId,
    fromSystemId: edge.fromSystemId,
    toSystemId: edge.toSystemId,
    ...DEFAULT_CONNECTION,
  });
  return JSON.parse(inserted) as string;
}

/** Narrates one step's skipped self-loops and freshly deferred edges. */
function logStepNotes(step: SpawnStep): void {
  for (const edge of step.skippedSelfLoops) {
    console.log(`~ skipping self-loop ${edge.fromSystemId} (kernel-only degenerate)`);
  }
  for (const edge of step.newlyDeferred) {
    console.log(
      `~ deferring connection ${edge.fromSystemId} → ${edge.toSystemId} until both endpoints spawn`,
    );
  }
}

/** Inserts one step's placeable connections, appending their doc ids in order. */
async function insertStepConnections(
  mapId: string,
  step: SpawnStep,
  connectionIds: string[],
): Promise<void> {
  for (const edge of step.connections) {
    connectionIds.push(await insertConnection(mapId, edge));
  }
}

/** Executes the precomputed spawn plan; returns inserted connection doc ids in order. */
async function spawnChain(
  mapId: string,
  timeline: ReturnType<typeof generateChainTimeline>,
  entry: CorpusEntry,
  intervalMs: number,
): Promise<string[]> {
  const plan = planSpawnSteps(timeline.facts, timeline.connectionSteps, entry.size);
  const connectionIds: string[] = [];

  for (const step of plan.steps) {
    console.log(`+ system ${step.systemId}`);
    await convexRun('mapFixtures:placeSystemFixture', { mapId, systemId: step.systemId });
    logStepNotes(step);
    await insertStepConnections(mapId, step, connectionIds);
    await pace(intervalMs);
  }

  if (plan.unplaceable.length > 0) {
    console.log(`~ ${plan.unplaceable.length} deferred connection(s) never became placeable; skipped`);
  }
  return connectionIds;
}

/**
 * Tears the chain down for the loop: connections in reverse insertion order,
 * then systems in reverse arrival order — so the removal seam never refuses a
 * still-referenced system, and departures cascade newest-first.
 */
async function despawnChain(
  mapId: string,
  timeline: ReturnType<typeof generateChainTimeline>,
  connectionIds: readonly string[],
  intervalMs: number,
): Promise<void> {
  for (const connectionId of [...connectionIds].reverse()) {
    console.log(`- connection ${connectionId}`);
    await convexRun('mapFixtures:removeConnectionFixture', { connectionId });
    await pace(intervalMs);
  }
  for (const system of [...timeline.facts.systems].reverse()) {
    console.log(`- system ${system.systemId}`);
    await convexRun('mapFixtures:removeSystemFixture', { mapId, systemId: system.systemId });
    await pace(intervalMs);
  }
}

async function run(args: ReplayArgs): Promise<void> {
  const entry = corpusEntry(args.chainSeed);
  const mapId = await ensureMap(args.mapId, args.userId);

  console.log(`projecting access for ${mapId}…`);
  const projection = await projectMapAccess(mapId);
  console.log('projection', projection);

  const timeline = generateChainTimeline(entry);
  console.log(
    `replaying corpus seed ${entry.seed} (n=${entry.size}) at ${args.intervalMs}ms${args.loop ? ', looping' : ''}…`,
  );
  console.log(`open /atlas?map=${mapId}`);

  for (;;) {
    const connectionIds = await spawnChain(mapId, timeline, entry, args.intervalMs);
    if (!args.loop) break;

    await sleep(holdMs(args.intervalMs));
    await despawnChain(mapId, timeline, connectionIds, args.intervalMs);
    await sleep(holdMs(args.intervalMs));
  }

  console.log('replay complete.');
}

const parsed = parseReplayArgs(process.argv.slice(2));
if (parsed === null) usage();
run(parsed).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
