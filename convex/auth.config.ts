import type { AuthConfig } from 'convex/server';

// Validation of the spine's Convex-facing JWT (3.4.1b → 3.4.3). The minting
// side lives in the Next.js app (Better Auth jwt plugin): ES256, `iss` =
// BETTER_AUTH_URL, `aud` = 'convex', `sub` = the Better Auth user id. Both
// values here must byte-match the token's claims or validation fails.
//
// Env vars are per Convex deployment (`npx convex env set …`):
// - AUTH_ISSUER_URL — the minting environment's BETTER_AUTH_URL
//   (prod https://lgi.tools; local dev http://localhost:3000).
// - AUTH_JWKS — the JWKS as a data URI
//   (`data:text/plain;charset=utf-8;base64,<base64 of <issuer>/api/auth/jwks>`).
//   The keypair is static (persisted in the app's `jwks` table), so embedding
//   it avoids a remote JWKS fetch on cold validation.
//
// The Convex backend REFUSES a push whose auth config references an unset
// env var (verified live: AuthConfigMissingEnvironmentVariable), so every
// deployment type must carry values — real ones on prod and each developer's
// dev deployment, and neutralized PLACEHOLDERS via the project's default env
// vars (dashboard → project settings) for the fresh per-branch preview
// backends. A placeholder issuer matches no real token's `iss`, so previews
// validate nothing and stay anonymous-only by design (the preview sign-in
// stack isn't provisioned). The conditional below is defense in depth for
// set-but-empty values. A misconfigured PROD deploy would silently validate
// nothing — the post-deploy logged-in smoke check (viewerSubject must be
// non-null) is the guard. No EVE credentials ever live in Convex; token
// custody and refresh stay on the Neon side.
const issuer = process.env.AUTH_ISSUER_URL;
const jwks = process.env.AUTH_JWKS;

export default {
  providers:
    issuer && jwks
      ? [
          {
            type: 'customJwt',
            issuer,
            algorithm: 'ES256',
            jwks,
            applicationID: 'convex',
          },
        ]
      : [],
} satisfies AuthConfig;
