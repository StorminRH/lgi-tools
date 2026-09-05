import type { Sql } from '@/db';
import {
  capabilityResultForError,
  recordCapabilityOutcome,
  type CapabilityId,
  type CapabilityResult,
} from '@/data/telemetry/capability';
import { logUsageEvent } from '@/data/telemetry/queries';
import type { UsageAction } from '@/data/telemetry/types';
import { directClient } from '@/db';
import { requireCronAuth } from '@/transport/cron';
import { withCorrelationScope } from '@/transport/correlation';
import {
  withAdvisoryLock,
  type ReservedConnection,
} from '@/db/advisory-lock';

export type CronWakeClass = 'batch' | 'idle-silent';

export type CronWorkContext = {
  client: Sql;
  reserved?: ReservedConnection;
  record: (
    action: UsageAction,
    metadata: Record<string, unknown>,
  ) => Promise<void>;
};

export type CronRunOutcome<Body> = {
  outcome: string;
  workDone: boolean;
  telemetry?: Record<string, unknown>;
  body: Body;
};

export type CronRouteDeclaration<Body, Pre = void> = {
  name: string;
  action: UsageAction;
  capability: CapabilityId;
  wakeClass: CronWakeClass;
  record:
    | { policy: 'noteworthy' }
    | { policy: 'always'; justification: string };
  lock:
    | { key: number; busyBody: (durationMs: number) => Body }
    | { mode: 'none'; justification: string };
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
  'name' | 'action' | 'record' | 'capability'
>;

type CronRecordedOutcome = Pick<
  CronRunOutcome<unknown>,
  'outcome' | 'workDone' | 'telemetry'
>;

async function emitRun(
  declaration: CronRecordingDeclaration,
  outcome: CronRecordedOutcome,
  durationMs: number,
  capabilityResult: CapabilityResult = { outcome: 'succeeded', code: 'ok' },
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
    recordCapabilityOutcome(declaration.capability, {
      ...capabilityResult,
      durationMs,
      retry: null,
    });
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

async function runDeclaredCron<Body, Pre>(
  declaration: CronRouteDeclaration<Body, Pre>,
): Promise<Response> {
  const started = Date.now();

  try {
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
      capabilityResultForError(err),
      true,
    );
    throw err;
  }
}

export function defineCronRoute<Body, Pre = void>(
  declaration: CronRouteDeclaration<Body, Pre>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;
    return withCorrelationScope(() => runDeclaredCron(declaration));
  };
}
