// The autosave-preferences foundation (F4). One registry of typed, default-driven
// preference keys plus the pure codecs every storage tier shares — no React, no
// Next, no `'use client'`. The stateful hook and the local/server tier adapter
// live in the PreferencesProvider (shared zone); the server route and the Neon KV
// store live in src/data/preferences. Everything keys off the `PreferenceDef`s
// exported here, so adding an autosaved setting is one registry entry.
//
// `window`/`document` are touched only inside typeof-guarded helpers (the
// search-recents/storage.ts safeStorage() pattern), so this module is import-safe
// from server and client alike and never reads storage during render.

import { z } from 'zod';

const LS_PREFIX = 'lgi:pref:';
const COOKIE_PREFIX = 'lgi_pref_';
// Functional preference cookie — first-party, ~1 year, no PII.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface PreferenceDef<T> {
  // The canonical key: the server KV `key` column, the API enum value, and the
  // stem for the localStorage key + cookie name. Stable; never reuse for a
  // different shape.
  readonly key: string;
  // Validates any stored or wire value for this key. A mismatch (an old build, a
  // hand-edited store, another tab) falls back to `fallback` rather than throwing.
  readonly schema: z.ZodType<T>;
  readonly fallback: T;
  // When true the value is ALSO mirrored to a first-party cookie the server reads
  // inside its Suspense hole, so the first paint is already correct (no flash).
  // Unflagged keys stay pure-localStorage.
  readonly ssrReadable: boolean;
}

function define<T>(
  key: string,
  schema: z.ZodType<T>,
  fallback: T,
  ssrReadable = false,
): PreferenceDef<T> {
  return { key, schema, fallback, ssrReadable };
}

// ── Registry — adding an autosaved setting is ONE entry here ──

// /sites cards↔table view. ssrReadable so the streamed shell renders the saved
// view server-side (cookie) and there's no cards→table flip on reload.
export const sitesView = define<'cards' | 'table'>(
  'sites.view',
  z.enum(['cards', 'table']),
  'cards',
  true,
);

// The planner's picked build SYSTEM — only the identifier is persisted; the live
// stations/indices/adjusted-prices are re-fetched on restore (so NOT ssrReadable,
// there's no static value to render). null = no pick (gross-only).
export const plannerBuildLocation = define<{
  systemId: number;
  systemName: string;
  security: number | null;
} | null>(
  'planner.buildLocation',
  z
    .object({
      systemId: z.number().int().positive(),
      systemName: z.string().min(1),
      security: z.number().nullable(),
    })
    .nullable(),
  null,
);

// The planner's BUILD CHARACTER — the compute identity Phase 3's levers
// (skills→time, standings→cost) will read (ACCOUNT.8). null = unset ⇒ the Run-As
// frame mirrors the live active character; picking "Default" stores null again
// (store-explicit-only), so the mirror keeps following whoever is active. The id
// is validated against the linked-character roster client-side — an id no longer
// on the account fails open to the mirror, never rendered. ssrReadable: the frame
// renders on initial load, so the cookie keeps a hard reload from flashing the
// active character while the server GET resolves (the strip criterion).
export const plannerBuildCharacter = define<number | null>(
  'planner.buildCharacterId',
  z.number().int().positive().nullable(),
  null,
  true,
);

// /sites cards: the in-place downward expand vs the centred lightbox overlay.
// NOT ssrReadable — it only changes post-click expand behaviour, never the
// initial render, so there's no first-paint to keep in sync (no hydration flash).
export const sitesDetailMode = define<'lightbox' | 'expand'>(
  'sites.detailMode',
  z.enum(['lightbox', 'expand']),
  'expand',
);

// ── The per-surface character-strip dimmed sets (ACCOUNT.7, D-7) ──
// One def per strip-declaring surface, keyed `strip.<surfaceId>.dimmed`. The
// stored value is the DIMMED characterIds (store-off-not-on): a character absent
// from the array — e.g. a newly linked alt — is lit by default, never stored.
// ssrReadable: dimming changes the initial card list, so the cookie mirror keeps
// a reload from flashing all-lit while the server GET resolves (the sitesView
// criterion). Adding a strip surface = one id here + the feature's spec.strip
// declaration; the wire enum and validation grow automatically.

export const STRIP_SURFACE_IDS = ['skills', 'jobs'] as const;
export type StripSurfaceId = (typeof STRIP_SURFACE_IDS)[number];

export function stripDimmedKey(surfaceId: string): string {
  return `strip.${surfaceId}.dimmed`;
}

const stripDimmedSchema = z.array(z.number().int().positive());

const STRIP_DIMMED_DEFS = Object.fromEntries(
  STRIP_SURFACE_IDS.map((id) => [
    id,
    define<number[]>(stripDimmedKey(id), stripDimmedSchema, [], true),
  ]),
) as Record<StripSurfaceId, PreferenceDef<number[]>>;

// A panel with no strip declaration still calls usePreference unconditionally
// (rules of hooks); this sentinel def is never registered, so it always reads as
// its [] fallback and the server rejects any write of its key (the
// CharacterPortrait sentinel-id precedent — unreachable, never colliding).
const STRIP_DIMMED_NONE = define<number[]>(stripDimmedKey('__none'), stripDimmedSchema, []);

// Total resolver returning stable module-scope refs — usePreference's setter
// identity keys off the def object, so this must never construct per call.
export function stripDimmedDef(surfaceId?: StripSurfaceId): PreferenceDef<number[]> {
  return surfaceId === undefined ? STRIP_DIMMED_NONE : STRIP_DIMMED_DEFS[surfaceId];
}

// The registry, in declaration order. The provider iterates it to seed and
// reconcile the tiers; a setting added above is included here automatically.
export const PREFERENCES: readonly PreferenceDef<unknown>[] = [
  sitesView,
  plannerBuildLocation,
  plannerBuildCharacter,
  sitesDetailMode,
  ...STRIP_SURFACE_IDS.map((id) => STRIP_DIMMED_DEFS[id]),
];
const BY_KEY = new Map(PREFERENCES.map((p) => [p.key, p]));

// The known keys, for the API contract's enum and the server trust boundary.
export const PREFERENCE_KEYS: readonly string[] = PREFERENCES.map((p) => p.key);

// Registry lookup by key — for layers handed a preference REFERENCE (a
// page-settings control key) rather than importing a def directly. Unknown keys
// return undefined and the caller drops them; anti-drift (every spec key is a
// registered preference) is the page-settings engine test's job.
export function getPreferenceDef(key: string): PreferenceDef<unknown> | undefined {
  return BY_KEY.get(key);
}

// Server trust boundary: is `value` a valid payload for this known `key`? The
// route's enum already guarantees the key is known; this guarantees the value
// matches that key's schema before it reaches the KV store.
export function validatePreferenceValue(key: string, value: unknown): boolean {
  const def = BY_KEY.get(key);
  return def != null && def.schema.safeParse(value).success;
}

// ── localStorage codec (the anon store + the logged-in optimistic/offline cache) ──

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The explicitly-stored local value, or undefined when absent/invalid — distinct
// from "the value or its fallback". The provider needs presence: it seeds the
// server only for settings the user actually chose, and leaves an unset key OUT
// of its value map so the hook falls through to its serverValue/fallback. A
// stored `null` (e.g. a cleared build location) is a real value, returned as-is.
export function peekLocalPreference<T>(def: PreferenceDef<T>): T | undefined {
  const store = safeStorage();
  if (!store) return undefined;
  const raw = store.getItem(LS_PREFIX + def.key);
  if (raw == null) return undefined;
  try {
    const parsed = def.schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function writeLocalPreference<T>(def: PreferenceDef<T>, value: T): void {
  const store = safeStorage();
  if (!store) return;
  try {
    store.setItem(LS_PREFIX + def.key, JSON.stringify(value));
  } catch {
    // quota / private mode — the value just isn't cached locally
  }
}

// ── cookie codec (the ssrReadable mirror) ──

export function cookieNameFor(def: PreferenceDef<unknown>): string {
  return COOKIE_PREFIX + def.key.replace(/\./g, '_');
}

// Client-side cookie write — bundled JS, NOT an inline script, so the CSP's
// no-raw-HTML-sink property is untouched. No-op for keys that aren't
// ssrReadable. Non-HttpOnly by necessity (the client owns the write); the
// value is a non-sensitive functional preference.
export function writePreferenceCookie<T>(def: PreferenceDef<T>, value: T): void {
  if (typeof document === 'undefined' || !def.ssrReadable) return;
  const encoded = encodeURIComponent(JSON.stringify(value));
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${cookieNameFor(def)}=${encoded}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

// Pure parse of a raw cookie value (the server passes `cookies().get(name)?.value`,
// so lib stays Next-free). Garbage or a schema mismatch falls back to the default.
export function readPreferenceCookieValue<T>(
  raw: string | undefined,
  def: PreferenceDef<T>,
): T {
  if (raw == null) return def.fallback;
  try {
    const parsed = def.schema.safeParse(JSON.parse(decodeURIComponent(raw)));
    return parsed.success ? parsed.data : def.fallback;
  } catch {
    return def.fallback;
  }
}

// ── sync-on-login reconciliation (pure; the Humble-Component split for the provider) ──

// Server wins for a logged-in user; seed the server from localStorage ONLY for
// keys the server has no value for yet (so an anon user's choices carry over
// once). Returns the reconciled value map and the keys to seed up to the server.
export function reconcilePreferences(
  serverValues: Map<string, unknown>,
  localValues: Map<string, unknown>,
): { values: Map<string, unknown>; toSeed: string[] } {
  const values = new Map<string, unknown>();
  const toSeed: string[] = [];
  for (const def of PREFERENCES) {
    if (serverValues.has(def.key)) {
      values.set(def.key, serverValues.get(def.key));
    } else if (localValues.has(def.key)) {
      values.set(def.key, localValues.get(def.key));
      toSeed.push(def.key);
    }
  }
  return { values, toSeed };
}

export const __TEST_ONLY__ = { LS_PREFIX };
