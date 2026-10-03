'use client';

import { useAuth } from '@/platform/auth/components/AuthProvider';
import { type ClientStore, createClientStore, useClientStore } from '@/lib/client-store';

/**
 * The last result a client read produced, kept outside the component that
 * asked for it. Next keeps only a few visited routes alive, so a page the
 * pilot returns to often mounts fresh: drawing what it last showed, then
 * refreshing quietly, keeps navigation from replaying skeletons.
 *
 * The memory lives as long as the document. Switching the active character
 * posts a form and signing out reloads, so it never carries one pilot's data
 * to another; a signed-out reader still sees nothing.
 */
export type RememberedRead<T> = ClientStore<T | null>;

export function createRememberedRead<T>(): RememberedRead<T> {
  return createClientStore<T | null>(null);
}

/** The last result. Hydrates as nothing, like the server render. */
export function useRememberedRead<T>(memory: RememberedRead<T>): T | null {
  const value = useClientStore(memory);
  const { session, loading } = useAuth();
  return !loading && session === null ? null : value;
}
