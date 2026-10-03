'use client';

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { toast } from '@/components/ui/toast';
import { getPreferencesEndpoint, putPreferenceEndpoint } from '@/data/preferences/api-contract';
import { processPreferencesResponse } from '@/data/preferences/parse-server-preferences';
import { createClientStore, useClientStore } from '@/lib/client-store';
import { authClient } from '@/platform/auth/auth-client';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import { apiFetch } from '@/transport/api-client';
import {
  PREFERENCES,
  RETIRED_PREFERENCE_KEYS,
  peekLocalPreference,
  pruneRetiredPreferences,
  syncPreferenceCookies,
  writeLocalPreference,
  writePreferenceCookie,
  type PreferenceDef,
} from '@/lib/preferences';

interface ResolvedPreferences {
  readonly values: ReadonlyMap<string, unknown>;
  readonly ready: boolean;
}

// Resolved values live in a client store (see createClientStore); the context
// carries only the stable setter.
const preferencesStore = createClientStore<ResolvedPreferences>({
  values: new Map(),
  ready: false,
});

type SetPreference = <T>(def: PreferenceDef<T>, value: T) => void;

const PreferencesContext = createContext<SetPreference | null>(null);

function markPreferencesLoading(): void {
  const current = preferencesStore.get();
  if (current.ready) preferencesStore.set({ values: current.values, ready: false });
}

function readLocalValues(): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const def of PREFERENCES) {
    const local = peekLocalPreference(def);
    if (local !== undefined) out.set(def.key, local);
  }
  return out;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { data } = authClient.useSession();
  // AuthProvider's settled flag, not better-auth's isPending: a signed-out
  // refetch on window focus must not rebuild every preference consumer.
  const { loading } = useAuth();
  const userId = data?.user?.id ?? null;

  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (loading) return;
    let alive = true;

    const timer = setTimeout(() => {
      if (!alive) return;
      if (RETIRED_PREFERENCE_KEYS.length > 0) pruneRetiredPreferences();

      if (!userId) {
        const local = readLocalValues();
        syncPreferenceCookies(local);
        preferencesStore.set({ values: local, ready: true });
        return;
      }

      markPreferencesLoading();
      void (async () => {
        const res = await apiFetch(getPreferencesEndpoint);
        if (!alive) return;

        const { reconciled, toSeed } = processPreferencesResponse(res, readLocalValues());
        syncPreferenceCookies(reconciled);
        preferencesStore.set({ values: reconciled, ready: true });

        for (const key of toSeed) {
          void apiFetch(putPreferenceEndpoint, { body: { key, value: reconciled.get(key) } });
        }
      })();
    }, 0);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [loading, userId]);

  const set = useCallback(function set<T>(def: PreferenceDef<T>, value: T): void {
    const { values, ready } = preferencesStore.get();
    preferencesStore.set({ values: new Map(values).set(def.key, value), ready });
    writeLocalPreference(def, value);
    writePreferenceCookie(def, value);
    if (userIdRef.current) {
      void apiFetch(putPreferenceEndpoint, { body: { key: def.key, value } }).then((result) => {
        if (!result.ok) toast.error('Save failed');
      });
    }
  }, []);

  return <PreferencesContext.Provider value={set}>{children}</PreferencesContext.Provider>;
}

export function usePreference<T>(
  def: PreferenceDef<T>,
  opts?: { serverValue?: T },
): readonly [T, (value: T) => void] {
  const set = useContext(PreferencesContext);
  const raw = useClientStore(preferencesStore).values.get(def.key);
  let value: T;
  if (raw !== undefined) {
    const parsed = def.schema.safeParse(raw);
    value = parsed.success ? parsed.data : opts?.serverValue ?? def.fallback;
  } else {
    value = opts?.serverValue ?? def.fallback;
  }
  const setValue = useCallback((next: T) => set?.(def, next), [set, def]);
  return [value, setValue] as const;
}
