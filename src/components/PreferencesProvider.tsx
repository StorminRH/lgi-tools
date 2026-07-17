'use client';

// The autosave-preferences store (F4) — one client provider, mounted once in the
// root layout, that holds every saved preference and hides which tier it came
// from. Anonymous users are localStorage-only; a logged-in user's Neon rows are
// authoritative, with localStorage as the optimistic/offline cache. `usePreference`
// is the single call site both consumers (the /sites view toggle, the planner
// build location) reach for — neither knows the tier.
//
// Storage is read only inside effects (never during render), so the streamed
// shell stays deterministic and there's no hydration mismatch: the first render
// uses the fallback (or, for ssrReadable keys, the server-read cookie value a
// consumer threads in as `serverValue`), then it reconciles after mount.

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
import { authClient } from '@/features/auth/auth-client';
import { apiFetch } from '@/lib/api-client';
import {
  PREFERENCES,
  peekLocalPreference,
  writeLocalPreference,
  writePreferenceCookie,
  type PreferenceDef,
} from '@/lib/preferences';

interface PreferencesContextValue {
  // The reconciled current value per key. A key absent here means "no stored
  // value" — the hook falls through to its serverValue/fallback.
  values: Map<string, unknown>;
  // True once the authoritative tier has settled (immediately for anon; after the
  // server read for a logged-in user). The planner gates its restore on this so it
  // restores the server value, not the optimistic localStorage one.
  ready: boolean;
  set: <T>(def: PreferenceDef<T>, value: T) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

// Every registry key's explicitly-stored local value (absent keys omitted).
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

  // Latest userId for the (stable) setter, without rebinding it each session tick.
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Load + reconcile when the session resolves. Anon → localStorage; logged-in →
  // server is authoritative, seeded once from localStorage for keys it lacks. The
  // work is deferred a tick (setTimeout 0) so no setState runs synchronously in
  // the effect body — the Cache-Components-safe shape PricingSeeder uses.
  useEffect(() => {
    if (isPending) return; // wait for the session to settle before choosing a tier
    let alive = true;

    const timer = setTimeout(() => {
      if (!alive) return;

      if (!userId) {
        setValues(readLocalValues());
        setReady(true);
        return;
      }

      setReady(false);
      void (async () => {
        const res = await apiFetch(getPreferencesEndpoint);
        if (!alive) return;

        // Reconcile the tiers (parse + merge + decide what to seed) off the raw
        // response; a failed read contributes no server values and seeds nothing.
        const { reconciled, toSeed } = processPreferencesResponse(res, readLocalValues());
        setValues(reconciled);
        setReady(true);

        // Carry an anon user's choices up to the server, once, only for the keys
        // the reconciliation flagged (empty on a failed read, so real rows are
        // never clobbered).
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
    writeLocalPreference(def, value); // optimistic + offline cache, always
    writePreferenceCookie(def, value); // no-op unless the key is ssrReadable
    if (userIdRef.current) {
      void apiFetch(putPreferenceEndpoint, { body: { key: def.key, value } }); // last-write-wins
    }
  }, []);

  const ctx = useMemo<PreferencesContextValue>(() => ({ values, ready, set }), [values, ready, set]);

  return <PreferencesContext.Provider value={ctx}>{children}</PreferencesContext.Provider>;
}

/**
 * Reactive value + setter for one preference. `serverValue` (the server-read
 * cookie value for an ssrReadable key) seeds the first render so it matches the
 * server's HTML — omit it for plain localStorage keys (→ fallback). The setter
 * writes through every active tier.
 *
 * Tolerant of a missing provider (like useLoadingToast): outside one — only ever
 * in isolated unit renders, since the provider wraps the whole app in the root
 * layout — it returns the serverValue/fallback and a no-op setter, so a component
 * can be rendered standalone without a provider/auth client.
 */
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
  // `set` is stable (provider useCallback) and `def` is a module constant, so the
  // setter keeps a stable identity — consumers can safely list it in effect deps.
  const set = ctx?.set;
  const setValue = useCallback((next: T) => set?.(def, next), [set, def]);
  return [value, setValue] as const;
}

/**
 * Whether the authoritative tier has settled. Consumers that re-fetch on a saved
 * value (the planner) gate on this so they restore the server value, not the
 * optimistic localStorage one. False outside a provider.
 */
export function usePreferencesReady(): boolean {
  return useContext(PreferencesContext)?.ready ?? false;
}
