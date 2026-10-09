'use client';

import { createContext, useContext } from 'react';
import type { SystemPresence } from './presence-model';

export const MapPresenceContext = createContext<ReadonlyMap<number, SystemPresence> | null>(null);

export function useSystemPresence(systemId: number): SystemPresence | null {
  return useContext(MapPresenceContext)?.get(systemId) ?? null;
}
