import { createHeartbeatPeers } from '@/data/convex/heartbeat-peers';
import type { JumpResolverResponse } from '@/data/maps/api-contract';

export interface DoorbellMemoryEntry {
  readonly transitionObservedAt: number;
  readonly attempts: number;
  readonly settled: boolean;
  readonly inFlight: boolean;
}

export const DOORBELL_ATTEMPT_CAP = 5;

export const DOORBELL_RETRY_INTERVAL_MS = 15_000;

export const DOORBELL_CHANNEL_PREFIX = 'lgi-atlas-doorbell-v1';

export function doorbellChannelName(userId: string): string {
  return JSON.stringify([DOORBELL_CHANNEL_PREFIX, userId]);
}

function doorbellStorageKey(mapId: string): string {
  return JSON.stringify([DOORBELL_CHANNEL_PREFIX, mapId]);
}

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
  onMemoryChange?: () => void,
): void {
  if (memory === null || tracking === null || tracking === undefined) return;
  const ownTracked = ownTrackedDoorbellRows(
    tracking.tracked,
    tracking.ownTrackedCharacterIds,
  );
  if (ownTracked === null) return;
  void ringPendingTransitions(memory, ownTracked, ring, onMemoryChange);
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
  onMemoryChange?: () => void,
): Promise<void> {
  const pending = pendingDoorbells(tracked, memory);
  for (const { characterId, transitionObservedAt } of pending) {
    memory.set(characterId, {
      ...ringDispatched(memory.get(characterId), transitionObservedAt),
      inFlight: true,
    });
  }
  if (pending.length > 0) onMemoryChange?.();
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
  if (pending.length > 0) onMemoryChange?.();
}

function parseDoorbellMemoryEntry(input: unknown): DoorbellMemoryEntry | null {
  if (typeof input !== 'object' || input === null) return null;
  if (!('transitionObservedAt' in input) || typeof input.transitionObservedAt !== 'number') {
    return null;
  }
  if (!('attempts' in input) || typeof input.attempts !== 'number') return null;
  if (!('settled' in input) || typeof input.settled !== 'boolean') return null;
  if (!('inFlight' in input) || typeof input.inFlight !== 'boolean') return null;
  if (!Number.isSafeInteger(input.transitionObservedAt) || input.transitionObservedAt <= 0) {
    return null;
  }
  if (!Number.isSafeInteger(input.attempts) || input.attempts < 0) return null;
  return {
    transitionObservedAt: input.transitionObservedAt,
    attempts: input.attempts,
    settled: input.settled,
    inFlight: input.inFlight,
  };
}

function parseDoorbellMemorySnapshot(
  input: unknown,
): Map<number, DoorbellMemoryEntry> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return new Map();
  }
  const memory = new Map<number, DoorbellMemoryEntry>();
  for (const [key, value] of Object.entries(input)) {
    const characterId = Number(key);
    if (!Number.isSafeInteger(characterId) || characterId <= 0) continue;
    const entry = parseDoorbellMemoryEntry(value);
    if (entry === null) continue;
    memory.set(characterId, entry);
  }
  return memory;
}

function snapshotDoorbellMemory(
  memory: ReadonlyMap<number, DoorbellMemoryEntry>,
): Record<string, DoorbellMemoryEntry> {
  const snapshot: Record<string, DoorbellMemoryEntry> = {};
  for (const [characterId, entry] of memory) {
    snapshot[String(characterId)] = entry;
  }
  return snapshot;
}

export function hydrateDoorbellMemory(
  storage: Pick<Storage, 'getItem'>,
  mapId: string,
): Map<number, DoorbellMemoryEntry> {
  try {
    const raw = storage.getItem(doorbellStorageKey(mapId));
    if (raw === null) return new Map();
    return parseDoorbellMemorySnapshot(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

export function persistDoorbellMemory(
  storage: Pick<Storage, 'setItem'>,
  mapId: string,
  memory: ReadonlyMap<number, DoorbellMemoryEntry>,
): void {
  try {
    storage.setItem(
      doorbellStorageKey(mapId),
      JSON.stringify(snapshotDoorbellMemory(memory)),
    );
  } catch {
  }
}

interface DoorbellMemoryMessage {
  readonly tabId: string;
  readonly mapId: string;
  readonly entries: Readonly<Record<string, DoorbellMemoryEntry>>;
}

function parseDoorbellMemoryMessage(input: unknown): DoorbellMemoryMessage | null {
  if (typeof input !== 'object' || input === null) return null;
  if (!('tabId' in input) || typeof input.tabId !== 'string' || input.tabId === '') {
    return null;
  }
  if (!('mapId' in input) || typeof input.mapId !== 'string' || input.mapId === '') {
    return null;
  }
  if (!('entries' in input)
    || typeof input.entries !== 'object'
    || input.entries === null
    || Array.isArray(input.entries)) {
    return null;
  }
  return {
    tabId: input.tabId,
    mapId: input.mapId,
    entries: snapshotDoorbellMemory(parseDoorbellMemorySnapshot(input.entries)),
  };
}

function mergeDoorbellMemory(
  memory: Map<number, DoorbellMemoryEntry>,
  incoming: Readonly<Record<string, DoorbellMemoryEntry>>,
): void {
  for (const [key, incomingEntry] of Object.entries(incoming)) {
    const characterId = Number(key);
    if (!Number.isSafeInteger(characterId) || characterId <= 0) continue;
    const current = memory.get(characterId);
    if (current === undefined
      || incomingEntry.transitionObservedAt > current.transitionObservedAt) {
      memory.set(characterId, incomingEntry);
      continue;
    }
    if (incomingEntry.transitionObservedAt !== current.transitionObservedAt) continue;
    memory.set(characterId, {
      transitionObservedAt: current.transitionObservedAt,
      attempts: Math.max(current.attempts, incomingEntry.attempts),
      settled: current.settled || incomingEntry.settled,
      inFlight: current.inFlight || incomingEntry.inFlight,
    });
  }
}

export type DoorbellChannel = Pick<BroadcastChannel, 'postMessage' | 'close'> & {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
};

export function joinDoorbellChannel(input: {
  readonly userId: string;
  readonly mapId: string;
  readonly tabId: string;
  readonly characterIdsHint: readonly number[];
  readonly memory: Map<number, DoorbellMemoryEntry>;
  readonly openChannel: (name: string) => DoorbellChannel;
  readonly now: () => number;
  readonly persist: () => void;
}): { share(): void; close(): void } {
  const peers = createHeartbeatPeers({
    tabId: input.tabId,
    characterIdsHint: [...input.characterIdsHint],
  });
  let channel: DoorbellChannel | null = null;
  const disconnect = () => {
    const previous = channel;
    channel = null;
    if (previous === null) return;
    previous.onmessage = null;
    previous.onmessageerror = null;
    try {
      previous.close();
    } catch {
    }
  };
  try {
    channel = input.openChannel(doorbellChannelName(input.userId));
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (channel === null) return;
      peers.receive(event.data, input.now());
      const message = parseDoorbellMemoryMessage(event.data);
      if (
        message === null
        || message.tabId === input.tabId
        || message.mapId !== input.mapId
      ) {
        return;
      }
      mergeDoorbellMemory(input.memory, message.entries);
      input.persist();
    };
    channel.onmessageerror = disconnect;
  } catch {
    disconnect();
  }
  return {
    share() {
      if (channel === null) return;
      try {
        channel.postMessage({
          tabId: input.tabId,
          mapId: input.mapId,
          entries: snapshotDoorbellMemory(input.memory),
        });
      } catch {
        disconnect();
      }
    },
    close: disconnect,
  };
}
