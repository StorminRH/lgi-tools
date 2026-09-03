import type { JumpResolverResponse } from '@/data/maps/api-contract';

export interface DoorbellMemoryEntry {
  readonly transitionObservedAt: number;
  readonly attempts: number;
  readonly settled: boolean;
  readonly inFlight: boolean;
}

export const DOORBELL_ATTEMPT_CAP = 5;

export const DOORBELL_RETRY_INTERVAL_MS = 15_000;

export interface TrackedDoorbellRow {
  readonly characterId: number;
  readonly location: { readonly transitionObservedAt: number | null } | null;
}

export function ownTrackedDoorbellRows(
  tracked: readonly TrackedDoorbellRow[] | undefined,
  ownIds: readonly number[] | undefined,
): readonly TrackedDoorbellRow[] | null {
  if (tracked === undefined || ownIds === undefined) return null;
  const own = new Set(ownIds);
  return tracked.filter((row) => own.has(row.characterId));
}

export interface DoorbellTrackingFeed {
  readonly tracked: readonly TrackedDoorbellRow[];
  readonly ownTrackedCharacterIds: readonly number[];
}

export function ringOwnDoorbells(
  memory: Map<number, DoorbellMemoryEntry> | null,
  tracking: DoorbellTrackingFeed | null | undefined,
  ring: (characterId: number) => Promise<JumpResolverResponse | null>,
): void {
  if (memory === null || tracking === null || tracking === undefined) return;
  const ownTracked = ownTrackedDoorbellRows(
    tracking.tracked,
    tracking.ownTrackedCharacterIds,
  );
  if (ownTracked === null) return;
  void ringPendingTransitions(memory, ownTracked, ring);
}

export interface PendingDoorbell {
  readonly characterId: number;
  readonly transitionObservedAt: number;
}

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
