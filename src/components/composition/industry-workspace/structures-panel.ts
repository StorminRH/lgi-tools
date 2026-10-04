import type { AvailableStructure } from '@/features/industry-planner/types';
import { createClientStore, useClientStore } from '@/lib/client-store';

/** A structure saved for a profile that asked for one, as much of it as the profile needs. */
export type NewStructure = Pick<AvailableStructure, 'id' | 'name' | 'systemId' | 'groupId'>;

const newStructureRequest = createClientStore<{
  token: symbol;
  deliver: (structure: NewStructure) => void;
} | null>(null);

export function cancelNewStructure(): void {
  newStructureRequest.set(null);
}

export function setStructuresPanelOpen(open: boolean): void {
  if (!open) {
    cancelNewStructure();
  }
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('panel', 'structures');
  else url.searchParams.delete('panel');
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Opens the drawer on a new structure; once it is saved, `then` gets it and the drawer closes. */
export function requestNewStructure(then: (structure: NewStructure) => void): () => void {
  const request = { token: Symbol(), deliver: then };
  newStructureRequest.set(request);
  setStructuresPanelOpen(true);
  return () => {
    if (newStructureRequest.get() === request) cancelNewStructure();
  };
}

/** The profile request the drawer's form belongs to. */
export function useNewStructureRequest(): symbol | null {
  return useClientStore(newStructureRequest)?.token ?? null;
}

/** Ends a profile's ask: a saved structure goes back to it, a cancelled form just closes. */
export function settleNewStructure(token: symbol, saved: NewStructure | null): void {
  const request = newStructureRequest.get();
  if (request?.token !== token) return;
  cancelNewStructure();
  if (saved === null) return;
  request.deliver(saved);
  setStructuresPanelOpen(false);
}
