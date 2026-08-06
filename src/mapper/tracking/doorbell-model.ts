// Pure decision core of the jump doorbell observer. Ring-once memory keys on
// the tracked location's transitionObservedAt — never observedAt, which also
// advances on dock/undock and would re-ring without a system change. The
// server's per-(map, character) transition stamp stays the true exactly-once
// guarantee; this memory only bounds client chatter.
import type { JumpResolverResponse } from '@/data/maps/api-contract';

/** Per-character ring bookkeeping for one observed transition. */
export interface DoorbellMemoryEntry {
  readonly transitionObservedAt: number;
  readonly attempts: number;
  readonly settled: boolean;
  readonly inFlight: boolean;
}

/** Ring attempts allowed per transition while the server keeps answering retry. */
export const DOORBELL_ATTEMPT_CAP = 5;

/** The tracked-feed fields the doorbell reads for one character. */
export interface TrackedDoorbellRow {
  readonly characterId: number;
  readonly location: { readonly transitionObservedAt: number | null } | null;
}

/** One decided ring: which character, for which observed transition. */
export interface PendingDoorbell {
  readonly characterId: number;
  readonly transitionObservedAt: number;
}

/**
 * Decides which tracked characters to ring now. A new transition always rings;
 * the same transition re-rings only while unsettled, not in flight, and under
 * the attempt cap, so an unprocessed jump retries on later feed updates without
 * ever storming a settled one.
 */
export function pendingDoorbells(
  tracked: readonly TrackedDoorbellRow[],
  memory: ReadonlyMap<number, DoorbellMemoryEntry>,
): readonly PendingDoorbell[] {
  const pending: PendingDoorbell[] = [];
  for (const row of tracked) {
    const transitionObservedAt = row.location?.transitionObservedAt ?? null;
    if (transitionObservedAt === null) continue;
    const entry = memory.get(row.characterId);
    if (entry !== undefined && entry.transitionObservedAt === transitionObservedAt) {
      if (entry.settled || entry.inFlight || entry.attempts >= DOORBELL_ATTEMPT_CAP) {
        continue;
      }
    }
    pending.push({ characterId: row.characterId, transitionObservedAt });
  }
  return pending;
}

/** The memory entry to store synchronously when a ring is dispatched. */
export function ringDispatched(
  previous: DoorbellMemoryEntry | undefined,
  transitionObservedAt: number,
): DoorbellMemoryEntry {
  const attempts =
    previous !== undefined && previous.transitionObservedAt === transitionObservedAt
      ? previous.attempts + 1
      : 1;
  return { transitionObservedAt, attempts, settled: false, inFlight: false };
}

/**
 * Applies one route answer to the entry for that transition. A null status is a
 * failed attempt (stays retryable); `retry` stays unsettled; every other
 * workflow status settles the transition. Answers for a superseded transition
 * leave the newer entry untouched.
 */
export function ringAnswered(
  entry: DoorbellMemoryEntry,
  transitionObservedAt: number,
  status: JumpResolverResponse['status'] | null,
): DoorbellMemoryEntry {
  if (entry.transitionObservedAt !== transitionObservedAt) return entry;
  return {
    ...entry,
    settled: status !== null && status !== 'retry',
    inFlight: false,
  };
}

/**
 * One observation pass: marks every pending ring in memory before its await, so
 * a development double-invoked effect cannot double-ring, then posts each and
 * records the answers. The injected `ring` seam keeps this drivable in tests.
 */
export async function ringPendingTransitions(
  memory: Map<number, DoorbellMemoryEntry>,
  tracked: readonly TrackedDoorbellRow[],
  ring: (characterId: number) => Promise<JumpResolverResponse | null>,
): Promise<void> {
  const pending = pendingDoorbells(tracked, memory);
  for (const { characterId, transitionObservedAt } of pending) {
    memory.set(characterId, {
      ...ringDispatched(memory.get(characterId), transitionObservedAt),
      inFlight: true,
    });
  }
  await Promise.all(
    pending.map(async ({ characterId, transitionObservedAt }) => {
      const response = await ring(characterId).catch(() => null);
      const entry = memory.get(characterId);
      if (entry === undefined) return;
      memory.set(
        characterId,
        ringAnswered(entry, transitionObservedAt, response?.status ?? null),
      );
    }),
  );
}
