'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getPreferencesEndpoint, putPreferenceEndpoint } from '@/data/preferences/api-contract';
import { processPreferencesResponse } from '@/data/preferences/parse-server-preferences';
import { authClient } from '@/platform/auth/auth-client';
import { apiFetch } from '@/transport/api-client';
import {
  PREFERENCES,
  RETIRED_PREFERENCE_KEYS,
  peekLocalPreference,
  pruneRetiredPreferences,
  writeLocalPreference,
  writePreferenceCookie,
  type PreferenceDef,
} from '@/lib/preferences';

interface PreferencesContextValue {
  values: Map<string, unknown>;
  ready: boolean;
  set: <T>(def: PreferenceDef<T>, value: T) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readLocalValues(): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const def of PREFERENCES) {
    const local = peekLocalPreference(def);
    if (local !== undefined) out.set(def.key, local);
  }
  return out;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user?.id ?? null;

  const [values, setValues] = useState<Map<string, unknown>>(() => new Map());
  const [ready, setReady] = useState(false);

  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (isPending) return;
    let alive = true;

    const timer = setTimeout(() => {
      if (!alive) return;
      if (RETIRED_PREFERENCE_KEYS.length > 0) pruneRetiredPreferences();

      if (!userId) {
        setValues(readLocalValues());
        setReady(true);
        return;
      }

      setReady(false);
      void (async () => {
        const res = await apiFetch(getPreferencesEndpoint);
        if (!alive) return;

        const { reconciled, toSeed } = processPreferencesResponse(res, readLocalValues());
        setValues(reconciled);
        setReady(true);

        for (const key of toSeed) {
          void apiFetch(putPreferenceEndpoint, { body: { key, value: reconciled.get(key) } });
        }
      })();
    }, 0);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [isPending, userId]);

  const set = useCallback(function set<T>(def: PreferenceDef<T>, value: T): void {
    setValues((prev) => {
      const next = new Map(prev);
      next.set(def.key, value);
      return next;
    });
    writeLocalPreference(def, value);
    writePreferenceCookie(def, value);
    if (userIdRef.current) {
      void apiFetch(putPreferenceEndpoint, { body: { key: def.key, value } });
    }
  }, []);

  const ctx = useMemo<PreferencesContextValue>(() => ({ values, ready, set }), [values, ready, set]);

  return <PreferencesContext.Provider value={ctx}>{children}</PreferencesContext.Provider>;
}

export function usePreference<T>(
  def: PreferenceDef<T>,
  opts?: { serverValue?: T },
): readonly [T, (value: T) => void] {
  const ctx = useContext(PreferencesContext);
  const raw = ctx?.values.get(def.key);
  let value: T;
  if (raw !== undefined) {
    const parsed = def.schema.safeParse(raw);
    value = parsed.success ? parsed.data : opts?.serverValue ?? def.fallback;
  } else {
    value = opts?.serverValue ?? def.fallback;
  }
  const set = ctx?.set;
  const setValue = useCallback((next: T) => set?.(def, next), [set, def]);
  return [value, setValue] as const;
}

export function usePreferencesReady(): boolean {
  return useContext(PreferencesContext)?.ready ?? false;
}
