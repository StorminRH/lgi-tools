// One route shell owns auth → idle probe → pre-lock gate → advisory lock →
// work → telemetry ordering. Routes declare policy and supply domain work;
// none reassemble the lifecycle or reach its lower-level primitives directly.
import type postgres from 'postgres';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { UsageAction } from '@/data/telemetry/types';
import { directClient } from '@/db';
import { requireCronAuth } from '@/transport/cron';
import {
  withAdvisoryLock,
  type ReservedConnection,
} from './advisory-lock';

type Sql = ReturnType<typeof postgres>;

/**
 * Wake class a cron declares: `batch` for daily jobs whose purpose is waking
 * Neon; `idle-silent` for sub-daily watchdogs or drains whose healthy no-op run
 * must touch zero Neon (no lock, no read, no write). The schedule cross-check
 * gate requires every sub-daily schedule to map to an `idle-silent`
 * declaration or carry a written justification.
 */
export type CronWakeClass = 'batch' | 'idle-silent';

/**
 * Handles the shell passes to a declaration's stages so route files never
 * import DB or telemetry primitives directly: the shared direct Neon client,
 * the reserved lock connection when the declaration is lock-guarded, and
 * `record` for route-specific durable telemetry events. Recording failures are
 * swallowed because observability must not break cron work.
 */
export type CronWorkContext = {
  client: Sql;
  reserved?: ReservedConnection;
  record: (
    action: UsageAction,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
};

/**
 * What one cron run produced. `outcome` labels the boundary log line and
 * durable telemetry row; `workDone` feeds the recording policy; `telemetry`
 * carries route-specific metadata; and `body` is serialized as the route's
 * typed JSON response. The shell appends `durationMs` to telemetry.
 */
export type CronRunOutcome<Body> = {
  outcome: string;
  workDone: boolean;
  telemetry?: Record<string, unknown>;
  body: Body;
};

/**
 * One cron route as a declaration: telemetry identity, wake class, lock and
 * recording policies, an optional pre-lock gate, and the work itself.
 * `defineCronRoute` is the only route-level path to auth, advisory locks, or
 * durable cron telemetry, so their ordering cannot drift. Lock contention
 * short-circuits to the declared busy body. `record: 'always'` requires a
 * written justification; the default noteworthy policy records only failure
 * or completed work. `idle.probe` runs before any context or lock exists and
 * may finish an idle-silent run with one boundary line. `preLock` may return a
 * full outcome or pass a typed value into `work`.
 */
export type CronRouteDeclaration<Body, Pre = void> = {
  name: string;
  action: UsageAction;
  wakeClass: CronWakeClass;
  record:
    | { policy: 'noteworthy' }
    | { policy: 'always'; justification: string };
  lock:
    | { key: number; busyBody: (durationMs: number) => Body }
    | { mode: 'none'; justification: string };
  idle?: {
    probe: () => Promise<
      | { idle: true; telemetry?: Record<string, unknown> }
      | { idle: false }
    >;
    body: (durationMs: number) => Body;
  };
  preLock?: (
    ctx: CronWorkContext,
  ) => Promise<{ done: CronRunOutcome<Body> } | { proceed: Pre }>;
  work: (
    ctx: CronWorkContext,
    pre: Pre,
  ) => Promise<CronRunOutcome<Body>>;
};

async function recordUsage(
  scope: string,
  action: UsageAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await logUsageEvent({ action, metadata });
  } catch (err) {
    console.error(`[${scope}] telemetry write failed`, err);
  }
}

function workContext(
  scope: string,
  reserved?: ReservedConnection,
): CronWorkContext {
  return {
    client: directClient,
    reserved,
    record: (action, metadata) =>
      recordUsage(scope, action, metadata),
  };
}

type CronRecordingDeclaration = Pick<
  CronRouteDeclaration<unknown, unknown>,
  'name' | 'action' | 'record'
>;

type CronRecordedOutcome = Pick<
  CronRunOutcome<unknown>,
  'outcome' | 'workDone' | 'telemetry'
>;

async function emitRun(
  declaration: CronRecordingDeclaration,
  outcome: CronRecordedOutcome,
  durationMs: number,
  forceRecord = false,
): Promise<void> {
  const metadata = {
    ...outcome.telemetry,
    outcome: outcome.outcome,
    durationMs,
  };
  console.log(JSON.stringify({ scope: declaration.name, ...metadata }));

  if (
    forceRecord
    || declaration.record.policy === 'always'
    || outcome.workDone
  ) {
    await recordUsage(declaration.name, declaration.action, metadata);
  }
}

async function finishRun<Body, Pre>(
  declaration: CronRouteDeclaration<Body, Pre>,
  outcome: CronRunOutcome<Body>,
  durationMs: number,
): Promise<Response> {
  await emitRun(declaration, outcome, durationMs);
  return Response.json(outcome.body);
}

/**
 * Builds the GET handler for one declared cron route. Owns bearer auth, stage
 * ordering, duration capture, the every-run structured boundary line, the
 * recording-policy-gated durable telemetry row, the busy response, and failure
 * recording. A thrown stage is recorded as a failure and then rethrown so the
 * platform response remains a 500. Route files keep only their static segment
 * config and export the returned handler as `GET`.
 */
export function defineCronRoute<Body, Pre = void>(
  declaration: CronRouteDeclaration<Body, Pre>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;

    const started = Date.now();

    try {
      if (declaration.idle) {
        const idle = await declaration.idle.probe();
        if (idle.idle) {
          const durationMs = Date.now() - started;
          return finishRun(
            declaration,
            {
              outcome: 'idle',
              workDone: false,
              telemetry: idle.telemetry,
              body: declaration.idle.body(durationMs),
            },
            durationMs,
          );
        }
      }

      const baseContext = workContext(declaration.name);
      let pre = undefined as Pre;
      if (declaration.preLock) {
        const gate = await declaration.preLock(baseContext);
        if ('done' in gate) {
          return finishRun(
            declaration,
            gate.done,
            Date.now() - started,
          );
        }
        pre = gate.proceed;
      }

      if ('mode' in declaration.lock) {
        const outcome = await declaration.work(baseContext, pre);
        return finishRun(
          declaration,
          outcome,
          Date.now() - started,
        );
      }

      const lockOutcome = await withAdvisoryLock(
        directClient,
        declaration.lock.key,
        (reserved) =>
          declaration.work(
            workContext(declaration.name, reserved),
            pre,
          ),
      );
      const durationMs = Date.now() - started;
      if (lockOutcome.busy) {
        return finishRun(
          declaration,
          {
            outcome: 'busy',
            workDone: false,
            body: declaration.lock.busyBody(durationMs),
          },
          durationMs,
        );
      }
      return finishRun(
        declaration,
        lockOutcome.result,
        durationMs,
      );
    } catch (err) {
      await emitRun(
        declaration,
        {
          outcome: 'failed',
          workDone: false,
        },
        Date.now() - started,
        true,
      );
      throw err;
    }
  };
}
