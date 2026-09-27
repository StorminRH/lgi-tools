import { z } from 'zod';

const LS_PREFIX = 'lgi:pref:';
const COOKIE_PREFIX = 'lgi_pref_';
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface PreferenceDef<T> {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly fallback: T;
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

export const sitesView = define<'cards' | 'table'>(
  'sites.view',
  z.enum(['cards', 'table']),
  'cards',
  true,
);

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

export const plannerBuildCharacter = define<number | null>(
  'planner.buildCharacterId',
  z.number().int().positive().nullable(),
  null,
  true,
);

export const sitesDetailMode = define<'lightbox' | 'expand'>(
  'sites.detailMode',
  z.enum(['lightbox', 'expand']),
  'expand',
);

export const industryCostBasis = define<'batched' | 'marginal'>(
  'industry.costBasis',
  z.enum(['batched', 'marginal']),
  'marginal',
);

export const atlasCameraFollow = define<boolean>(
  'atlas.cameraFollow',
  z.boolean(),
  false,
);

export const atlasClickFocus = define<boolean>(
  'atlas.clickFocus',
  z.boolean(),
  true,
);

/** The character the Atlas dock follows; null is Auto (latest mover). */
export const atlasDockCharacter = define<number | null>(
  'atlas.dockCharacterId',
  z.number().int().positive().nullable(),
  null,
);

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

const STRIP_DIMMED_NONE = define<number[]>(stripDimmedKey('__none'), stripDimmedSchema, []);

export function stripDimmedDef(surfaceId?: StripSurfaceId): PreferenceDef<number[]> {
  return surfaceId === undefined ? STRIP_DIMMED_NONE : STRIP_DIMMED_DEFS[surfaceId];
}

export const PREFERENCES: readonly PreferenceDef<unknown>[] = [
  sitesView,
  plannerBuildLocation,
  plannerBuildCharacter,
  sitesDetailMode,
  industryCostBasis,
  atlasCameraFollow,
  atlasClickFocus,
  atlasDockCharacter,
  ...STRIP_SURFACE_IDS.map((id) => STRIP_DIMMED_DEFS[id]),
];
const BY_KEY = new Map(PREFERENCES.map((p) => [p.key, p]));

export const PREFERENCE_KEYS: readonly string[] = PREFERENCES.map((p) => p.key);

export const RETIRED_PREFERENCE_KEYS = ['atlas.autoLayout'] as const;

export function pruneRetiredPreferences(): void {
  const store = safeStorage();
  if (store === null) return;
  for (const key of RETIRED_PREFERENCE_KEYS) {
    try {
      store.removeItem(LS_PREFIX + key);
    } catch {
    }
  }
}

export function getPreferenceDef(key: string): PreferenceDef<unknown> | undefined {
  return BY_KEY.get(key);
}

export function validatePreferenceValue(key: string, value: unknown): boolean {
  const def = BY_KEY.get(key);
  return def != null && def.schema.safeParse(value).success;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  }
}

export function cookieNameFor(def: PreferenceDef<unknown>): string {
  return COOKIE_PREFIX + def.key.replace(/\./g, '_');
}

function setPreferenceCookie(def: PreferenceDef<unknown>, encoded: string, maxAge: number): void {
  const secure =
    typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${cookieNameFor(def)}=${encoded}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

export function writePreferenceCookie<T>(def: PreferenceDef<T>, value: T): void {
  if (typeof document === 'undefined' || !def.ssrReadable) return;
  setPreferenceCookie(def, encodeURIComponent(JSON.stringify(value)), COOKIE_MAX_AGE_SECONDS);
}

/**
 * Mirror resolved values into the SSR cookies. A signed-in account value wins
 * over the device's, and without this write-back every server render kept
 * using the stale cookie, so the page swapped after load on each visit. Only
 * cookies are written: account values copied into localStorage would outlive
 * sign-out and be seeded into the next account on a shared browser. Sign-out
 * clears the cookies (`clearPreferenceCookies`) for the same reason.
 */
export function syncPreferenceCookies(values: ReadonlyMap<string, unknown>): void {
  for (const def of PREFERENCES) {
    if (values.has(def.key)) writePreferenceCookie(def, values.get(def.key));
  }
}

/**
 * Expire every SSR preference cookie. The next load rewrites the device's own
 * values from localStorage, so only account-resolved values are lost.
 */
export function clearPreferenceCookies(): void {
  if (typeof document === 'undefined') return;
  for (const def of PREFERENCES) {
    if (def.ssrReadable) setPreferenceCookie(def, '', 0);
  }
}

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
