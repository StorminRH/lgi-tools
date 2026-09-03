'use client';

import { createContext, useContext } from 'react';
import type { AfkGateState } from './AfkGate';
import type { SystemPresence } from './presence-model';

interface MapPresenceValue {
  readonly presence: ReadonlyMap<number, SystemPresence>;
  readonly afk: AfkGateState;
}

export const MapPresenceContext = createContext<MapPresenceValue | null>(null);

export function useSystemPresence(systemId: number): SystemPresence | null {
  const value = useContext(MapPresenceContext);
  return value?.presence.get(systemId) ?? null;
}

export function useMapPresenceAfk(): AfkGateState {
  const value = useContext(MapPresenceContext);
  if (value === null) {
    throw new Error('useMapPresenceAfk requires a MapPresenceProvider ancestor.');
  }
  return value.afk;
}
