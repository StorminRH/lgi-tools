import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
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
  EsiRefreshJob,
  EsiRefreshJobStatus,
} from './types';

function idempotencyKey(input: EnqueueEsiRefreshJobInput): string {
  return [
    input.dataset,
    input.userId,
    input.target.ownerType,
    input.target.ownerId,
    input.error.resource ?? 'unknown',
  ].join('|');
}

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

export async function recoverStaleRunningJobs(
  cutoff: Date,
  now = new Date(),
  database: AnyPgDb = db,
): Promise<{ recovered: number; deadLettered: EsiRefreshJob[] }> {
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
    .returning({ id: esiRefreshJobs.id });
  return { recovered: deadLettered.length + retryable.length, deadLettered };
}

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

export function markEsiRefreshJobSucceeded(id: number, now = new Date()): Promise<void> {
  return finishJob(
    id,
    'succeeded',
    { finishedAt: now, lastErrorCode: null, retryAfterSeconds: null },
    now,
  );
}

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
