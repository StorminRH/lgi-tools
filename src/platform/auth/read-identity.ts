'use client';

import { createClientStore, useClientStore } from '@/lib/client-store';

export interface ReadIdentity {
  readonly userId: string;
  readonly characterId: number;
}

const identityStore = createClientStore<ReadIdentity | null>(null);

/** A new object marks a new session scope, including a return to an earlier account. */
export function publishReadIdentity(identity: ReadIdentity | null): void {
  const current = identityStore.get();
  if (current?.userId === identity?.userId && current?.characterId === identity?.characterId) return;
  identityStore.set(identity);
}

export const currentReadIdentity = identityStore.get;
export const subscribeReadIdentity = identityStore.subscribe;

export function useReadIdentity(): ReadIdentity | null {
  return useClientStore(identityStore);
}
