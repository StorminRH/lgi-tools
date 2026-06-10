// Typed, lazily-read server env (3.4.T). One registry of every server-side
// variable; a read validates on access — never at import, never cached — so
// module import stays side-effect-free (the lazy-DB-Proxy principle) and
// vi.stubEnv keeps working in tests.
//
// Schemas are equivalence-preserving, not aspirational:
//   - `required` (min(1)) where every call site already treats empty-as-missing
//     (`if (!x)` / `||`) — readEnv maps '' to undefined, so the same branch is
//     taken either way.
//   - `verbatim` where a call site uses nullish (`??`) or `===` comparisons, so
//     a set-but-empty value keeps winning/losing exactly as before.
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

const SERVER_ENV = {
  // Database
  DATABASE_URL: required,
  // Read via the injectable param of resolveLockConnectionUrl (db/index.ts).
  DATABASE_URL_UNPOOLED: verbatim,
  LOCAL_DB_DRIVER: verbatim,
  DOTENV_PATH: verbatim,
  // Auth / EVE SSO
  BETTER_AUTH_SECRET: verbatim,
  SESSION_SECRET: verbatim,
  BETTER_AUTH_URL: verbatim,
  EVE_CLIENT_ID: required,
  EVE_CLIENT_SECRET: required,
  EVE_TOKEN_ENCRYPTION_KEY: required,
  SUPERADMIN_CHARACTER_ID: verbatim,
  CONVEX_SERVICE_SECRET: required,
  // Cron
  CRON_SECRET: required,
  // Contact / feedback / ops alerts
  RESEND_API_KEY: required,
  CONTACT_EMAIL: required,
  CONTACT_FROM_EMAIL: required,
  DISCORD_WEBHOOK_URL: required,
  DISCORD_ALERT_WEBHOOK_URL: required,
  // Rate limiting (Vercel-KV-style names from the marketplace integration,
  // UPSTASH_* from a direct signup — rate-limit.ts accepts either)
  KV_REST_API_URL: verbatim,
  KV_REST_API_TOKEN: verbatim,
  UPSTASH_REDIS_REST_URL: verbatim,
  UPSTASH_REDIS_REST_TOKEN: verbatim,
  // Google Search Console
  GSC_SERVICE_ACCOUNT_JSON: required,
  GSC_SITE_URL: required,
  GOOGLE_SITE_VERIFICATION: verbatim,
  // Platform / feature flags
  VERCEL_ENV: verbatim,
  LGI_FORCE_TREE_REBUILD: verbatim,
  FF_WORMHOLE_ROLL_CALC: verbatim,
} as const;

export type ServerEnvName = keyof typeof SERVER_ENV;

// The validated value, or undefined when unset / empty-on-a-required-var. The
// caller keeps its existing fallback branch (503 / 500-with-message / silent
// no-op / `??` chain) — this only replaces the raw read.
export function readEnv(name: ServerEnvName): string | undefined {
  const parsed = SERVER_ENV[name].safeParse(process.env[name]);
  return parsed.success ? parsed.data : undefined;
}

// Throwing read for sites where a missing var is a deployment error. The
// message matches the local helpers this replaces (auth, eve-token-service,
// db scripts, …) byte-for-byte, so no caller-visible error text changes.
export function requireEnv(name: ServerEnvName): string {
  const value = readEnv(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
