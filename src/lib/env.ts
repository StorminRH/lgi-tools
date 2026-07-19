// Typed, lazily-read server env (3.4.T). One registry of every server-side
// variable; a read validates on access — never at import, never cached — so
// module import stays side-effect-free (the lazy-DB-Proxy principle) and
// vi.stubEnv keeps working in tests.
//
// Schemas are equivalence-preserving, not aspirational, and the required vs.
// verbatim split is load-bearing at the TYPE level too:
//   - REQUIRED (min(1)) — call sites that treat empty-as-missing (`if (!x)`,
//     `||`). readEnv maps '' to undefined, so the same branch is taken either
//     way. `requireEnv` accepts ONLY these keys.
//   - VERBATIM — call sites that use nullish (`??`) or `===`, where a
//     set-but-empty value must keep winning/losing exactly as before, so ''
//     passes through. Passing one of these to `requireEnv` is a compile error
//     (its empty value is meaningful — throwing on it would be a bug).
// Tightening a schema (URL shape, base64 length, …) changes that variable's
// soft-fail behavior — it needs its own review, not a drive-by edit.
//
// Deliberately NOT in the registry:
//   - NODE_ENV — statically inlined by the bundlers; read it directly.
//   - NEXT_PUBLIC_* — client env; must stay literal static reads for Next's
//     build-time inlining (src/config/site-url.ts).
import { z } from 'zod';

const required = z.string().min(1); // '' ≡ missing (truthiness call sites)
const verbatim = z.string(); // '' passes through (nullish / `===` call sites)

// Empty-as-missing variables — readEnv maps '' to undefined; requireEnv-eligible.
const REQUIRED_ENV = {
  DATABASE_URL: required,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  ESI_SNAPSHOT_ENCRYPTION_KEY: required,
  CONVEX_SERVICE_SECRET: required,
  CRON_SECRET: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
} as const;

// Pass-through variables — '' is a valid present value (nullish/`===` sites).
// readEnv-only: their empty value is meaningful, so requireEnv must not accept them.
const VERBATIM_ENV = {
  // Read via the injectable param of resolveLockConnectionUrl (db/index.ts).
  DATABASE_URL_UNPOOLED: verbatim,
  // Schema-owner credential for migrations only (db/migrate-url.ts). Empty ≡
  // unset there — it falls back to DATABASE_URL, so single-role envs are
  // unaffected. Never read by the request path.
  DATABASE_MIGRATION_URL: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  SUPERADMIN_CHARACTER_ID: verbatim,
  // Rate limiting (Vercel-KV-style names from the marketplace integration,
  // UPSTASH_* from a direct signup — rate-limit.ts accepts either)
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  GOOGLE_SITE_VERIFICATION: verbatim,
  VERCEL_ENV: verbatim,
  VERCEL_URL: verbatim,
  NEXT_RUNTIME: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
  LGI_SITES_SAMPLE: verbatim,
} as const;

const SERVER_ENV = { ...REQUIRED_ENV, ...VERBATIM_ENV };

/** Server environment names whose absence is always a configuration error at the read boundary. */
export type RequiredEnvName = keyof typeof REQUIRED_ENV;
/** Closed registry of server environment names permitted through the shared env reader. */
export type ServerEnvName = RequiredEnvName | keyof typeof VERBATIM_ENV;

/**
 * Returns the validated value, or undefined when unset / empty-on-a-required-var.
 * The caller keeps its existing fallback branch (503 / 500-with-message / silent
 * no-op / `??` chain) — this only replaces the raw read.
 */
export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Throwing read for sites where a missing var is a deployment error. Accepts
 * only REQUIRED keys: a verbatim key's empty value is meaningful, so the
 * `if (!value)` throw below would misfire on it — the type makes that a compile
 * error. The message matches the local helpers this replaces (auth,
 * eve-token-service, db scripts, …) byte-for-byte.
 */
export function requireEnv(name: RequiredEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
