'use client';

// The presence context seam, kept apart from the provider so canvas/window
// consumers (frame badge, intelligence body) depend only on this leaf — not
// on the provider's Convex subscription chain. Unit tests render consumers
// against the null default without mocking a client.
import { createContext, useContext } from 'react';
import type { AfkGateState } from './AfkGate';
import type { SystemPresence } from './presence-model';

/** What the presence context provides to canvas and window consumers. */
export interface MapPresenceValue {
  readonly presence: ReadonlyMap<number, SystemPresence>;
  readonly afk: AfkGateState;
}

/** Provided by `MapPresenceProvider`; null wherever no map canvas is mounted. */
export const MapPresenceContext = createContext<MapPresenceValue | null>(null);

/** One system's presence, or null when nobody is there (or no provider is mounted). */
export function useSystemPresence(systemId: number): SystemPresence | null {
  const value = useContext(MapPresenceContext);
  return value?.presence.get(systemId) ?? null;
}

/**
 * The provider-owned AFK gate. Throws when the provider is missing rather
 * than degrading: a heartbeat running without the gate would silently defeat
 * the AFK pause, which is worse than a loud mount-order bug.
 */
export function useMapPresenceAfk(): AfkGateState {
  const value = useContext(MapPresenceContext);
  if (value === null) {
    throw new Error('useMapPresenceAfk requires a MapPresenceProvider ancestor.');
  }
  return value.afk;
}
