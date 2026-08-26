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
import {
  attachingEdgeOf,
  parseReplayArgs,
  planSpawnSteps,
  type ReplayArgs,
  type SpawnStep,
} from './map-replay-plan';

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

/** Parses the connection doc id a fixture mutation prints last. */
function parseConnectionId(output: string, path: string): string {
  // Convex CLI may emit progress lines before the JSON id; take the last line.
  const lastLine = output.split('\n').at(-1)?.trim() ?? '';
  try {
    const parsed: unknown = JSON.parse(lastLine);
    if (typeof parsed !== 'string') throw new Error('not a string id');
    return parsed;
  } catch {
    throw new Error(`${path} returned unparsable output: ${output}`);
  }
}

async function insertLayoutEdge(
  label: string,
  fixture: string,
  mapId: string,
  edge: LayoutEdge,
): Promise<string> {
  console.log(`+ ${label} ${edge.fromSystemId} → ${edge.toSystemId}`);
  const inserted = await convexRun(fixture, {
    mapId,
    fromSystemId: edge.fromSystemId,
    toSystemId: edge.toSystemId,
    ...DEFAULT_CONNECTION,
  });
  return parseConnectionId(inserted, fixture);
}

const insertConnection = (mapId: string, edge: LayoutEdge) =>
  insertLayoutEdge('connection', 'mapFixturePlace:insertConnectionFixture', mapId, edge);

/**
 * One jump: the revealed system and its discovering connection land in a
 * single transaction, the way real mapping learns about a system — so the
 * canvas births the node already attached to the tree, never elsewhere first.
 */
const insertJump = (mapId: string, edge: LayoutEdge) =>
  insertLayoutEdge('jump', 'mapFixturePlace:placeJumpFixture', mapId, edge);

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

/**
 * One executed spawn step, as the teardown must undo it: the system, the
 * connection it jumped in with (null for a bare root spawn), and every other
 * connection inserted at this step (loop closures, newly placeable deferred
 * edges).
 */
interface SpawnRecord {
  readonly systemId: number;
  readonly attachingConnectionId: string | null;
  readonly otherConnectionIds: readonly string[];
}

/**
 * Executes one spawn step. The edge that discovered this system jumps in
 * atomically with it; only a root (or a system whose attaching edge the
 * corpus deferred until this landing) spawns bare. Prefer a current-step
 * discovering edge over a drained deferred edge that merely became placeable
 * because this system arrived — otherwise teardown collapses the wrong pair.
 * Loop closures and remaining drained edges follow as ordinary scans.
 */
async function executeSpawnStep(mapId: string, step: SpawnStep): Promise<SpawnRecord> {
  const attaching = attachingEdgeOf(step);
  let attachingConnectionId: string | null = null;
  if (attaching === undefined) {
    console.log(`+ system ${step.systemId}`);
    await convexRun('mapFixturePlace:placeSystemFixture', { mapId, systemId: step.systemId });
  } else {
    attachingConnectionId = await insertJump(mapId, attaching);
  }
  logStepNotes(step);
  const otherConnectionIds: string[] = [];
  for (const edge of [...step.connections, ...step.drainedConnections]) {
    if (edge === attaching) continue;
    otherConnectionIds.push(await insertConnection(mapId, edge));
  }
  return { systemId: step.systemId, attachingConnectionId, otherConnectionIds };
}

/** Executes the precomputed spawn plan; returns one record per step, in order. */
async function spawnChain(
  mapId: string,
  timeline: ReturnType<typeof generateChainTimeline>,
  entry: CorpusEntry,
  intervalMs: number,
): Promise<SpawnRecord[]> {
  const plan = planSpawnSteps(timeline.facts, timeline.connectionSteps, entry.size);
  const records: SpawnRecord[] = [];

  for (const step of plan.steps) {
    records.push(await executeSpawnStep(mapId, step));
    await pace(intervalMs);
  }

  if (plan.unplaceable.length > 0) {
    console.log(`~ ${plan.unplaceable.length} deferred connection(s) never became placeable; skipped`);
  }
  return records;
}

/**
 * Tears the chain down for the loop, newest-first, undoing each spawn step the
 * way it happened: loop-closure scans drop as plain connection removals, then
 * the step's wormhole COLLAPSES — connection and the system it had discovered
 * leave in one transaction, because a severed hole makes the far side
 * unreachable and an orphaned system must never linger on the map. Reverse
 * order guarantees every later-inserted connection referencing a system is
 * gone before that system's collapse, so the orphan proof never refuses.
 */
async function despawnChain(
  mapId: string,
  records: readonly SpawnRecord[],
  intervalMs: number,
): Promise<void> {
  for (const record of [...records].reverse()) {
    for (const connectionId of [...record.otherConnectionIds].reverse()) {
      console.log(`- connection ${connectionId}`);
      await convexRun('mapFixtureRemove:removeConnectionFixture', { connectionId });
      await pace(intervalMs);
    }
    if (record.attachingConnectionId === null) {
      console.log(`- system ${record.systemId}`);
      await convexRun('mapFixtureRemove:removeSystemFixture', { mapId, systemId: record.systemId });
    } else {
      console.log(`- collapse ${record.systemId} (with its connection)`);
      await convexRun('mapFixtureRemove:collapseJumpFixture', {
        mapId,
        connectionId: record.attachingConnectionId,
        systemId: record.systemId,
      });
    }
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
    const records = await spawnChain(mapId, timeline, entry, args.intervalMs);
    if (!args.loop) break;

    await sleep(holdMs(args.intervalMs));
    await despawnChain(mapId, records, args.intervalMs);
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
