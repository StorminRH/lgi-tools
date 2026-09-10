# Vercel cutover prep

Read-only checklist for [LGI-116](https://linear.app/lgitools/issue/LGI-116).
No freeze, reconnect, or deploy runs from this file. Snapshot 10 September
2026.

## `VERCEL_GIT_COMMIT_REF` routing

`src/scripts/vercel-convex-deploy.ts` treats a build as the standing staging
Preview when any of these is `staging`:

- `VERCEL_GIT_COMMIT_REF`
- `VERCEL_TARGET_ENV`
- `LGI_PREVIEW_LINE`

`isStagingPreviewBuild` then adds `--check-build-environment disable` so the
staging deploy key can target Convex `proper-squid-200`. `main`,
`development`, and an empty env keep the default Convex deploy args. The
prod-key-on-preview guard stays on those builds.

Expected Vercel routing after Ryan reconnects project
`prj_3JWovEYFjMSbRDWeI8Dcl0lel8rk` from cursor-origin to
`StorminRH/lgi-tools`:

| Git ref | Vercel git deploy (`vercel.json`) | Convex deploy args | App URL | Convex backend |
| --- | --- | --- | --- | --- |
| `main` | Automatic Production | default guard on | `https://lgi.tools` | Production |
| `staging` | Automatic Preview | guard disabled | `https://staging.lgi.tools` | `proper-squid-200` |
| `development` | Manual Preview only | default guard on | Preview URL if someone deploys | Isolated preview backend, not prod or staging |
| feature branch | Disabled | not deployed by git | none | none |

`vercel.json` `git.deploymentEnabled` already encodes that policy:
`main` and `staging` true, `development` false, other refs false.

## Isolation checklist

Check each row in the Vercel, Neon, and Convex dashboards. Do not change
them from this prep.

| Item | Expected | Source in repo |
| --- | --- | --- |
| Scoped env | Secrets unique per Production, staging Preview, and other Previews. `LOCAL_DB_DRIVER` unset on Vercel. | `.env.example` |
| Neon staging | `LGI_DATABASE_URL` / `LGI_DATABASE_URL_UNPOOLED` on the staging custom env point at Neon branch `staging`. Production uses the Neon integration URLs. | `.env.example` |
| Convex staging | Staging `SITE_URL` and `AUTH_ISSUER_URL` are `https://staging.lgi.tools`. Staging deploy key targets `proper-squid-200`. Production key stays on `main`. | `docs/CONVEX.md`, `.env.example` |
| EVE callback | One redirect URI per origin. Production `https://lgi.tools/api/auth/oauth2/callback/eve`. Staging `https://staging.lgi.tools/api/auth/oauth2/callback/eve`. Local `http://localhost:3000/api/auth/oauth2/callback/eve`. | `.env.example`, README |
| Staging domain | `https://staging.lgi.tools` on the standing Preview. | `.env.example` |
| Deploy protection | `VERCEL_AUTOMATION_BYPASS_SECRET` on staging and protected Previews. App auth still needs a cookie jar. | `.env.example`, `docs/ux-check/README.md` |
| Cron | `vercel.json` crons stay Production-only on Hobby. Paths use `CRON_SECRET` bearer auth. Sub-daily Convex sync is not a Vercel cron. | `vercel.json`, `src/composition/__tests__/idempotency-registry.ts` |

## Out of scope

Reconnect of the Vercel git source, writer freeze, Sync Manager retirement,
and live staging or production deploys stay with Ryan on LGI-116.
