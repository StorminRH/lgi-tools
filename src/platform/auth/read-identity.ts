'use client';

import { createClientStore, useClientStore } from '@/lib/client-store';

export interface ReadIdentity {
  readonly userId: string;
  readonly characterId: number;
}

const identityStore = createClientStore<ReadIdentity | null>(null);

/** Same account and active character. Compares values, so a server-rendered owner can match the live identity. */
export function sameReadIdentity(a: ReadIdentity | null, b: ReadIdentity | null): boolean {
  return a === b || (a !== null && b !== null && a.userId === b.userId && a.characterId === b.characterId);
}

/** A new object marks a new session scope, including a return to an earlier account. */
export function publishReadIdentity(identity: ReadIdentity | null): void {
  if (sameReadIdentity(identityStore.get(), identity)) return;
  identityStore.set(identity);
}

/**
 * Whether a result started under `identity` still belongs to the session
 * signed in now. Compares references: a return to an earlier account is a new
 * scope, so a request from the old one stays stale. Signed out is never current.
 */
export function isCurrentReadIdentity(identity: ReadIdentity | null): identity is ReadIdentity {
  return identity !== null && identity === identityStore.get();
}

export const currentReadIdentity = identityStore.get;
export const subscribeReadIdentity = identityStore.subscribe;

export function useReadIdentity(): ReadIdentity | null {
  return useClientStore(identityStore);
}
