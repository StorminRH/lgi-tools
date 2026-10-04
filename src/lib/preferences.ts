import { z } from 'zod';

const LS_PREFIX = 'lgi:pref:';

export interface PreferenceDef<T> {
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly fallback: T;
}

function define<T>(key: string, schema: z.ZodType<T>, fallback: T): PreferenceDef<T> {
  return { key, schema, fallback };
}

export const sitesView = define<'cards' | 'table'>(
  'sites.view',
  z.enum(['cards', 'table']),
  'cards',
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

/** The production profile the industry workspace opens on; checked against the live list. */
export const industryProfile = define<string | null>(
  'industry.profileId',
  z.string().min(1).max(100).nullable(),
  null,
);

export const MAX_FAVORITE_BLUEPRINTS = 24;

/** The blueprints starred in the planner, newest first, listed on its landing page. */
export const industryFavoriteBlueprints = define<{ typeId: number; name: string }[]>(
  'industry.favoriteBlueprints',
  z
    .array(z.object({ typeId: z.number().int().positive(), name: z.string().min(1).max(200) }))
    .max(MAX_FAVORITE_BLUEPRINTS),
  [],
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

/** The character whose system scanner pastes go to; null asks when unclear. */
export const atlasScannerCharacter = define<number | null>(
  'atlas.scannerCharacterId',
  z.number().int().positive().nullable(),
  null,
);

export const STRIP_SURFACE_IDS = ['jobs'] as const;
export type StripSurfaceId = (typeof STRIP_SURFACE_IDS)[number];

export function stripDimmedKey(surfaceId: string): string {
  return `strip.${surfaceId}.dimmed`;
}

const stripDimmedSchema = z.array(z.number().int().positive());

const STRIP_DIMMED_DEFS = Object.fromEntries(
  STRIP_SURFACE_IDS.map((id) => [
    id,
    define<number[]>(stripDimmedKey(id), stripDimmedSchema, []),
  ]),
) as Record<StripSurfaceId, PreferenceDef<number[]>>;

const STRIP_DIMMED_NONE = define<number[]>(stripDimmedKey('__none'), stripDimmedSchema, []);

export function stripDimmedDef(surfaceId?: StripSurfaceId): PreferenceDef<number[]> {
  return surfaceId === undefined ? STRIP_DIMMED_NONE : STRIP_DIMMED_DEFS[surfaceId];
}

export const PREFERENCES: readonly PreferenceDef<unknown>[] = [
  sitesView,
  sitesDetailMode,
  industryCostBasis,
  industryProfile,
  industryFavoriteBlueprints,
  atlasCameraFollow,
  atlasClickFocus,
  atlasDockCharacter,
  atlasScannerCharacter,
  ...STRIP_SURFACE_IDS.map((id) => STRIP_DIMMED_DEFS[id]),
];
const BY_KEY = new Map(PREFERENCES.map((p) => [p.key, p]));

export const PREFERENCE_KEYS: readonly string[] = PREFERENCES.map((p) => p.key);

export const RETIRED_PREFERENCE_KEYS = [
  'atlas.autoLayout',
  'strip.skills.dimmed',
  // The planner builds where its production profile says.
  'planner.buildLocation',
  'planner.buildCharacterId',
] as const;

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

/**
 * Preferences once mirrored into cookies for server renders. Nothing reads or
 * writes them any more; sign-out still expires any a browser kept, since they
 * may hold the account's values.
 */
const RETIRED_PREFERENCE_COOKIES = [
  'lgi_pref_sites_view',
  ...STRIP_SURFACE_IDS.map((id) => `lgi_pref_strip_${id}_dimmed`),
];

export function clearRetiredPreferenceCookies(): void {
  if (typeof document === 'undefined') return;
  for (const name of RETIRED_PREFERENCE_COOKIES) {
    document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
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
