import type { CronBatchResponse, CronBatchStepStatus } from './api-contract';
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
import { directDatabase } from '@/db/direct-database';
import type { PostgresJsDb } from '@/lib/db-types';

export type CronWakeClass = 'batch' | 'idle-silent';

export type CronWorkContext = {
  /** Drizzle over the direct client, built on first read. */
  readonly database: PostgresJsDb;
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
  /** The run finished but part of it failed: it records once and answers 500. */
  failed?: boolean;
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
    get database() {
      return directDatabase();
    },
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

const PARTIAL_FAILURE: CapabilityResult = { outcome: 'unexpected', code: 'partial_failure' };

async function finishRun<Body, Pre>(
  declaration: CronRouteDeclaration<Body, Pre>,
  outcome: CronRunOutcome<Body>,
  durationMs: number,
): Promise<Response> {
  if (outcome.failed === true) {
    await emitRun(declaration, outcome, durationMs, PARTIAL_FAILURE, true);
    return Response.json(outcome.body, { status: 500 });
  }
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

export type CronBatchStep = {
  name: string;
  due: (now: Date) => boolean;
  /** An earlier step that must have succeeded in this run, or this one is skipped. */
  requires?: string;
  run: () => Promise<Response>;
};


export function cronBatchStep<Body, Pre>(
  declaration: CronRouteDeclaration<Body, Pre>,
  due: (now: Date) => boolean = () => true,
  requires?: { name: string },
): CronBatchStep {
  return {
    name: declaration.name,
    due,
    requires: requires?.name,
    run: () => runDeclaredCron(declaration),
  };
}

function requirementMet(step: CronBatchStep, results: CronBatchResponse['steps']): boolean {
  return step.requires === undefined || results.find((result) => result.name === step.requires)?.status === 'ok';
}

async function runBatchStep(step: CronBatchStep): Promise<CronBatchStepStatus> {
  try {
    const response = await withCorrelationScope(() => step.run());
    return response.ok ? 'ok' : 'failed';
  } catch (err) {
    console.error(`[${step.name}] batch step failed`, err);
    return 'failed';
  }
}

/**
 * Runs declared crons one after another in a single invocation, so their
 * order holds however late the platform fires the schedule. Each step records
 * its own telemetry, and a failed step stops only the steps that require it. Body
 * names the route's contract type, as it does for defineCronRoute.
 */
export function defineCronBatchRoute<Body extends CronBatchResponse>(
  steps: readonly CronBatchStep[],
): (req: Request) => Promise<Response & { json(): Promise<Body> }> {
  return async (req) => {
    const denied = await requireCronAuth(req);
    if (denied) return denied;
    const now = new Date();
    const results: CronBatchResponse['steps'] = [];
    for (const step of steps) {
      const status = step.due(now) && requirementMet(step, results) ? await runBatchStep(step) : 'skipped';
      results.push({ name: step.name, status });
    }
    const failed = results.some((result) => result.status === 'failed');
    const body: CronBatchResponse = { steps: results };
    return Response.json(body, { status: failed ? 500 : 200 });
  };
}
