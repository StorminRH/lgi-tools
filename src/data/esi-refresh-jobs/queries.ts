import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { db } from '@/db';
import type { AnyPgDb } from '@/lib/db-types';
import {
  ESI_REFRESH_JOB_RETENTION_DAYS,
  ESI_REFRESH_JOB_MAX_ATTEMPTS,
  LIVE_ESI_REFRESH_JOB_STATUSES,
} from './constants';
import { esiRefreshJobs } from './schema';
import type {
  EnqueueEsiRefreshJobInput,
  DeadLetterRow,
  EsiRefreshJob,
  EsiRefreshQueueStat,
  EsiRefreshJobStatus,
  RequeueDeadLetterOutcome,
} from './types';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  let node = error;
  for (let depth = 0; depth < 5 && node instanceof Error; depth++) {
    if ((node as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    node = (node as { cause?: unknown }).cause;
  }
  return false;
}

function idempotencyKey(input: EnqueueEsiRefreshJobInput): string {
  return [
    input.dataset,
    input.userId,
    input.target.ownerType,
    input.target.ownerId,
    input.error.resource ?? 'unknown',
  ].join('|');
}

/**
 * Coalesces one owner and dataset into the durable refresh queue, preserving an earlier due time
 * and reviving retryable terminal state when required.
 */
export async function enqueueEsiRefreshJob(
  input: EnqueueEsiRefreshJobInput,
  now = new Date(),
  database: AnyPgDb = db,
): Promise<number> {
  const key = idempotencyKey(input);
  const retryAfterMs = (input.error.retryAfterSeconds ?? 0) * 1000;
  const inserted = await database
    .insert(esiRefreshJobs)
    .values({
      dataset: input.dataset,
      userId: input.userId,
      ownerType: input.target.ownerType,
      ownerId: input.target.ownerId,
      resource: input.error.resource ?? 'unknown',
      idempotencyKey: key,
      status: retryAfterMs > 0 ? 'deferred_for_budget' : 'queued',
      nextAttemptAt: new Date(now.getTime() + retryAfterMs),
      budgetReason: input.error.reason,
      budgetRemaining: input.error.remaining,
      retryAfterSeconds: input.error.retryAfterSeconds,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: esiRefreshJobs.id });
  if (inserted[0] !== undefined) return inserted[0].id;

  const existing = await database
    .select({ id: esiRefreshJobs.id })
    .from(esiRefreshJobs)
    .where(
      and(
        eq(esiRefreshJobs.idempotencyKey, key),
        inArray(esiRefreshJobs.status, LIVE_ESI_REFRESH_JOB_STATUSES),
      ),
    )
    .limit(1);
  if (existing[0] === undefined) {
    throw new Error('ESI refresh job coalesced without a live row');
  }
  return existing[0].id;
}

/**
 * Returns jobs stranded in running state beyond the stale threshold to retryable state before a
 * new drain claims work.
 */
export async function recoverStaleRunningJobs(
  cutoff: Date,
  now = new Date(),
  database: AnyPgDb = db,
): Promise<{
  recovered: number;
  retryable: EsiRefreshJob[];
  deadLettered: EsiRefreshJob[];
}> {
  const deadLettered = await database
    .update(esiRefreshJobs)
    .set({
      status: 'dead_lettered',
      attemptCount: sql`${esiRefreshJobs.attemptCount} + 1`,
      updatedAt: now,
      finishedAt: now,
      retryAfterSeconds: null,
      lastErrorCode: 'worker_interrupted',
    })
    .where(
      and(
        eq(esiRefreshJobs.status, 'running'),
        lt(esiRefreshJobs.updatedAt, cutoff),
        gte(esiRefreshJobs.attemptCount, ESI_REFRESH_JOB_MAX_ATTEMPTS - 1),
      ),
    )
    .returning();
  const retryable = await database
    .update(esiRefreshJobs)
    .set({
      status: 'failed_retryable',
      attemptCount: sql`${esiRefreshJobs.attemptCount} + 1`,
      nextAttemptAt: now,
      updatedAt: now,
      lastErrorCode: 'worker_interrupted',
    })
    .where(and(eq(esiRefreshJobs.status, 'running'), lt(esiRefreshJobs.updatedAt, cutoff)))
    .returning();
  return {
    recovered: deadLettered.length + retryable.length,
    retryable,
    deadLettered,
  };
}

/** Atomically claims one bounded due-job batch with row locking and stamps each attempt's running state. */
export async function claimDueEsiRefreshJobs(
  limit: number,
  now = new Date(),
): Promise<EsiRefreshJob[]> {
  const due = await db
    .select()
    .from(esiRefreshJobs)
    .where(
      and(
        inArray(esiRefreshJobs.status, [
          'queued',
          'deferred_for_budget',
          'failed_retryable',
        ]),
        lte(esiRefreshJobs.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(esiRefreshJobs.nextAttemptAt), asc(esiRefreshJobs.createdAt))
    .limit(limit);

  const claimed: EsiRefreshJob[] = [];
  for (const job of due) {
    const rows = await db
      .update(esiRefreshJobs)
      .set({ status: 'running', updatedAt: now })
      .where(
        and(
          eq(esiRefreshJobs.id, job.id),
          inArray(esiRefreshJobs.status, [
            'queued',
            'deferred_for_budget',
            'failed_retryable',
          ]),
        ),
      )
      .returning();
    if (rows[0] !== undefined) claimed.push(rows[0]);
  }
  return claimed;
}

/** Returns queue counts grouped by dataset and status for the operations dashboard. */
export async function getEsiRefreshQueueStats(): Promise<EsiRefreshQueueStat[]> {
  const oldestCreatedAt = sql`min(${esiRefreshJobs.createdAt})`.mapWith(
    esiRefreshJobs.createdAt,
  );
  const rows = await db
    .select({
      status: esiRefreshJobs.status,
      count: count(),
      oldestCreatedAt,
    })
    .from(esiRefreshJobs)
    .groupBy(esiRefreshJobs.status)
    .orderBy(asc(esiRefreshJobs.status));
  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count),
    oldestCreatedAt: row.oldestCreatedAt,
  }));
}

/** Lists dead-lettered refresh jobs newest first using privacy-safe owner labels for operator review. */
export async function listDeadLetteredJobs(limit: number): Promise<DeadLetterRow[]> {
  return await db
    .select({
      id: esiRefreshJobs.id,
      dataset: esiRefreshJobs.dataset,
      ownerType: esiRefreshJobs.ownerType,
      ownerId: esiRefreshJobs.ownerId,
      resource: esiRefreshJobs.resource,
      budgetReason: esiRefreshJobs.budgetReason,
      lastErrorCode: esiRefreshJobs.lastErrorCode,
      attemptCount: esiRefreshJobs.attemptCount,
      createdAt: esiRefreshJobs.createdAt,
      finishedAt: esiRefreshJobs.finishedAt,
    })
    .from(esiRefreshJobs)
    .where(eq(esiRefreshJobs.status, 'dead_lettered'))
    .orderBy(desc(esiRefreshJobs.finishedAt), desc(esiRefreshJobs.id))
    .limit(limit);
}

/**
 * Moves one dead-lettered job back to pending when it still exists and is eligible; returns a
 * closed missing, conflict, or requeued outcome.
 */
export async function requeueDeadLetteredJob(
  id: number,
  now = new Date(),
): Promise<RequeueDeadLetterOutcome> {
  try {
    // One statement keeps classification and mutation atomic on both request
    // drivers. The production neon-http driver does not support callback
    // transactions; the partial unique index remains the final race authority.
    const nowIso = now.toISOString();
    const result = await db.execute<{ outcome: RequeueDeadLetterOutcome['outcome'] }>(sql`
      with target as (
        select status, idempotency_key
        from ${esiRefreshJobs}
        where ${esiRefreshJobs.id} = ${id}
      ), updated as (
        update ${esiRefreshJobs}
        set status = 'queued',
            attempt_count = 0,
            next_attempt_at = ${nowIso}::timestamptz,
            budget_reason = null,
            budget_remaining = null,
            retry_after_seconds = null,
            last_error_code = null,
            updated_at = ${nowIso}::timestamptz,
            finished_at = null
        where ${esiRefreshJobs.id} = ${id}
          and ${esiRefreshJobs.status} = 'dead_lettered'
          and not exists (
            select 1 from ${esiRefreshJobs} live
            where live.idempotency_key = (select idempotency_key from target)
              and live.status in ('queued', 'running', 'deferred_for_budget', 'failed_retryable')
          )
        returning 'requeued'::text as outcome
      )
      select outcome from updated
      union all
      select case
        when (select status from target) = 'dead_lettered' then 'superseded'
        else 'not_found'
      end as outcome
      where not exists (select 1 from updated)
      limit 1
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    const outcome = rows[0]?.outcome ?? 'not_found';
    return { outcome };
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: 'superseded' };
    throw error;
  }
}

async function finishJob(
  id: number,
  status: EsiRefreshJobStatus,
  values: Partial<typeof esiRefreshJobs.$inferInsert>,
  now: Date,
): Promise<void> {
  await db
    .update(esiRefreshJobs)
    .set({ status, updatedAt: now, ...values })
    .where(eq(esiRefreshJobs.id, id));
}

/** Transitions one claimed refresh job to succeeded and clears retry and error state. */
export function markEsiRefreshJobSucceeded(id: number, now = new Date()): Promise<void> {
  return finishJob(
    id,
    'succeeded',
    { finishedAt: now, lastErrorCode: null, retryAfterSeconds: null },
    now,
  );
}

/** Returns one claimed job to pending at its budget-provided due time without consuming a retry attempt. */
export function markEsiRefreshJobDeferred(
  id: number,
  error: EnqueueEsiRefreshJobInput['error'],
  now = new Date(),
): Promise<void> {
  const delayMs = (error.retryAfterSeconds ?? 15 * 60) * 1000;
  return finishJob(
    id,
    'deferred_for_budget',
    {
      nextAttemptAt: new Date(now.getTime() + delayMs),
      budgetReason: error.reason,
      budgetRemaining: error.remaining,
      retryAfterSeconds: error.retryAfterSeconds,
      lastErrorCode: 'budget_deferred',
    },
    now,
  );
}

/** Schedules one claimed job for its next bounded retry and records the privacy-safe failure reason. */
export function markEsiRefreshJobRetryable(
  id: number,
  attemptCount: number,
  code: string,
  nextAttemptAt: Date,
  now = new Date(),
): Promise<void> {
  return finishJob(
    id,
    'failed_retryable',
    { attemptCount, lastErrorCode: code, nextAttemptAt, retryAfterSeconds: null },
    now,
  );
}

/** Marks one claimed job permanently failed when retry cannot repair its owner or dataset condition. */
export function markEsiRefreshJobPermanent(
  id: number,
  code: string,
  now = new Date(),
): Promise<void> {
  return finishJob(
    id,
    'failed_permanent',
    { lastErrorCode: code, finishedAt: now, retryAfterSeconds: null },
    now,
  );
}

/**
 * Transitions one exhausted claimed job to dead-lettered state and records its terminal
 * privacy-safe reason.
 */
export function markEsiRefreshJobDeadLettered(
  id: number,
  attemptCount: number,
  code: string,
  now = new Date(),
): Promise<void> {
  return finishJob(
    id,
    'dead_lettered',
    { attemptCount, lastErrorCode: code, finishedAt: now, retryAfterSeconds: null },
    now,
  );
}

/**
 * Deletes terminal refresh jobs older than the retention window while leaving pending and running
 * work untouched.
 */
export async function pruneEsiRefreshJobs(
  database: AnyPgDb,
  retentionDays = ESI_REFRESH_JOB_RETENTION_DAYS,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  await database
    .delete(esiRefreshJobs)
    .where(
      and(
        inArray(esiRefreshJobs.status, ['succeeded', 'failed_permanent']),
        lt(esiRefreshJobs.finishedAt, cutoff),
      ),
    );
}
