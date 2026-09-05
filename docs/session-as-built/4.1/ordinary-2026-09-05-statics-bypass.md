# Ordinary Work As-Built — Vercel bypass on Convex statics fetches

**Record status:** Final
**Recorded:** 2026-09-05
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `stormin/fix-statics-sso-302-e1c9`
**PR:** `#124`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

On staging, adding a wormhole draws that system's static holes again. The live service can reach the app through Vercel login with the same bypass token vend already used.

- Fixed: Adding a system on staging draws its static holes again.
- Changed: Token vend and static-hole fetches share one Vercel bypass header.

## Divergences from plan

None.

## Final surfaces

- `src/lib/env.ts` — `vercelProtectionBypassHeaders` for Convex-to-app fetches behind Vercel SSO
- `convex/mapStatics.ts` — statics fetch sends that header
- `src/platform/auth/service-client.ts` — token vend uses the same helper

## Discovered work

- Route Convex statics through `serviceFetch` once that helper accepts path params and a public, no-bearer call. Left open. This close-out only shared the bypass header.

## Successor notes

- The four systems already on staging still need one `backfillStaticPlaceholders` pass until `hasMore: false`. `SITE_URL` is `https://staging.lgi.tools`. Next must be up.
- Dump is GitHub #475.
- CodeRabbit skipped the dump because the base is `staging`, not the default branch. Greptile posted 5/5 with no findings. Bugbot did not post.

## Verification summary

- **Adversarial review:** Subject: Origin `124`; `origin pr diff 124`; Roles: structure-reviewer, behavior-reviewer, thermos, comment-sicko, Bugbot, Greptile, CodeRabbit; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: shared bypass helper accepted and landed. `serviceFetch` path-param rewrite, comment-sicko reshape flags, and CodeRabbit skip rejected or out of scope.
