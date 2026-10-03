import type { AvailableStructure } from '@/features/industry-planner/types';
import { createClientStore, useClientStore } from '@/lib/client-store';

/** A structure saved for a profile that asked for one, as much of it as the profile needs. */
export type NewStructure = Pick<AvailableStructure, 'id' | 'name' | 'systemId' | 'groupId'>;

// A profile's ask for a new structure: the drawer opens on its form, and the
// saved structure goes back to the profile that asked.
const newStructureAsked = createClientStore(false);
let deliver: ((structure: NewStructure) => void) | null = null;

export function setStructuresPanelOpen(open: boolean): void {
  if (!open) {
    newStructureAsked.set(false);
    deliver = null;
  }
  const url = new URL(window.location.href);
  if (open) url.searchParams.set('panel', 'structures');
  else url.searchParams.delete('panel');
  window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

/** Opens the drawer on a new structure; once it is saved, `then` gets it and the drawer closes. */
export function requestNewStructure(then: (structure: NewStructure) => void): void {
  deliver = then;
  newStructureAsked.set(true);
  setStructuresPanelOpen(true);
}

/** Whether the drawer's new-structure form is open for a profile. */
export function useNewStructureAsked(): boolean {
  return useClientStore(newStructureAsked);
}

/** Ends a profile's ask: a saved structure goes back to it, a cancelled form just closes. */
export function settleNewStructure(saved: NewStructure | null): void {
  const then = deliver;
  deliver = null;
  newStructureAsked.set(false);
  if (saved === null || then === null) return;
  then(saved);
  setStructuresPanelOpen(false);
}
