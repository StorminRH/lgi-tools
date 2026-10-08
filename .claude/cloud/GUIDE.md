# Cloud Environment

Notes for Claude Code cloud sessions. The environment's setup script runs
[setup.sh](setup.sh) once per snapshot; the SessionStart hook
([../hooks/session-start.sh](../hooks/session-start.sh)) restores
`.env.local` on the fresh clone and starts the dev stack in the background.
The hook's first lines in the session context say whether that worked:
`provisioned=yes|no` with the last setup result, phase, and runtime, then
which hosted credentials are `set`, `proxy` (a network secret), or
`missing`. The last setup log is `~/.local/share/lgi/setup.log`.

## Environment configuration

The environment's Edit dialog at claude.ai/code holds what the repo cannot.
Changing the setup script or allowed domains rebuilds the snapshot, which is
only kept when setup finishes within about five minutes.

Setup script, verbatim. It finds the clone itself, logs where it ran to
`~/.local/share/lgi/environment-setup.log`, and never blocks the
session; the SessionStart hook reruns `setup.sh` when provisioning did not
finish.

```bash
#!/bin/bash
log="$HOME/.local/share/lgi/environment-setup.log"
mkdir -p "$(dirname "$log")"
repo="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [ ! -f "$repo/.claude/cloud/setup.sh" ]; then
  f="$(find / -maxdepth 5 -path '*/.claude/cloud/setup.sh' -not -path '/proc/*' 2>/dev/null | head -1)"
  repo="${f%/.claude/cloud/setup.sh}"
fi
echo "$(date -u +%FT%TZ) cwd=$PWD repo=${repo:-none} branch=$(git -C "${repo:-/}" rev-parse --abbrev-ref HEAD 2>/dev/null)" >>"$log"
bash "$repo/.claude/cloud/setup.sh" || echo "setup.sh exit $?" >>"$log"
exit 0
```

Network secrets (the agent proxy adds the header; the session never sees
the value). Their environment variables hold the placeholder
`proxyinjected` so the CLIs start; that value is expected. It has no hyphen
because the Vercel CLI rejects a `VERCEL_TOKEN` containing one.

| Secret | Allowed website | Header |
| --- | --- | --- |
| `VERCEL_TOKEN` | `api.vercel.com` | `Authorization: Bearer` |
| `NEON_API_KEY` | `console.neon.tech` | `Authorization: Bearer` |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | `staging.lgi.tools` | `x-vercel-protection-bypass` (no prefix) |

Environment variables: `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
`NEON_PROJECT_ID`, `PLAYWRIGHT_BASE_URL`, `EVE_CLIENT_ID`, plus two secrets
that code reads directly: `EVE_CLIENT_SECRET` (the localhost dev EVE app)
and `LGI_CONVEX_STAGING_DEPLOY_KEY` (a deploy key scoped to
`proper-squid-200`).

Allowed domains beyond the defaults: `console.neon.tech`, `api.neon.tech`,
`api.vercel.com`, `vercel.com`, `staging.lgi.tools`,
`proper-squid-200.convex.cloud`, `proper-squid-200.convex.site`,
`api.convex.dev`.

## Dev stack

Check readiness before assuming a failure is in the app:

```bash
.claude/cloud/stack.sh status    # postgres, convex, next, convex-auth
.claude/cloud/stack.sh logs next # or postgres, convex, convex-auth, migrate
.claude/cloud/stack.sh restart
```

- Next is `http://localhost:3000`; PostgreSQL is `localhost:5433`
(`postgres://lgi:lgi@localhost:5433/lgi_tools`); anonymous Convex is
`http://127.0.0.1:3210` with HTTP actions on `:3211`. Logs are in `/tmp/lgi`.
- `stack.sh start` applies pending migrations, so a branch with new
migrations needs no extra step. The snapshot already holds the SDE.
- Authenticated Atlas work needs `convex-auth` to read `ready`. Its status
file is `/tmp/lgi-convex-auth.status` (`0` is success). A running Next or
Convex server alone does not prove authentication is ready.
- The session runs as root. Postgres refuses root, so the cluster in
`/var/lib/lgi-pgdata` belongs to the `postgres` user; [lib.sh](lib.sh)
runs server binaries through `lgi_pg_server`.
- Generated `.env.local` secrets persist in `~/.local/share/lgi/env.local`.
Edit that copy to change them across sessions.

The wrappers pin the local database and the anonymous Convex backend, and
refuse hosted selectors. Preserve those guards when investigating failures.
`.claude/cloud/lib.test.sh` covers them.

## Signing in

Open `http://localhost:3000` and choose **Reset and continue as E2E Pilot**
to sign in without CCP SSO. This resets the reserved test pilot, including
its maps, permissions, linked accounts, and earlier sessions. The pilot has
no ESI tokens. Playwright uses `pnpm e2e:seed` for the same reset and writes
its cookie jar to `e2e/auth-storage.json`, which `curl -b` can reuse for
authenticated route checks.

Real EVE SSO uses `EVE_CLIENT_ID` and `EVE_CLIENT_SECRET` from the
environment. The callback is `http://localhost:3000/api/auth/oauth2/callback/eve`,
which only a browser inside this container can complete.

## Hosted services

Each CLI reads its credential from the environment. Read before writing,
and change production only when the user asks for that change.

- **Neon:** `neon` reads `NEON_API_KEY`, for example
`neon branches list --project-id <id>`. Never point the local stack at a
Neon URL.
- **Vercel:** `vercel` reads `VERCEL_TOKEN`; with `VERCEL_ORG_ID` and
`VERCEL_PROJECT_ID` set it needs no `vercel link`, for example
`vercel ls` or `vercel env ls`.
- **Convex staging:** use [convex-staging.sh](convex-staging.sh), which
reads `LGI_CONVEX_STAGING_DEPLOY_KEY`, accepts only the staging deployment,
refuses `dev`, and needs `LGI_ALLOW_STAGING_PUSH=1` for `deploy` or
`import`. Plain `convex` commands stay on the local anonymous backend.
- **Remote checks:** `PLAYWRIGHT_BASE_URL` with
`VERCEL_AUTOMATION_BYPASS_SECRET` reaches protected staging; see
`.env.example`.

ESI (`esi.evetech.net`), EVE images, EVE SSO, and the SDE on
`developers.eveonline.com` are on the network allowlist, so EVE-facing
routes can be exercised against live data on the local stack.
