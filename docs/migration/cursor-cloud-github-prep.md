# Cursor Cloud GitHub prep

What the Cursor Cloud scripts still assume about Origin. No Build, secret,
or automation setting was changed. Written 10 September 2026.

## Scripts

| Script | Origin leftovers | Change here |
| --- | --- | --- |
| `.cursor/install.sh` | No Origin CLI, Depot bootstrap, or `cursor-origin` remote. Pins local Postgres 16, anonymous Convex, and GitHub-usable CLIs through `clis.sh`. | None. |
| `.cursor/start.sh` | Comment still said `git push github` against a bare HTTPS remote. That is the old dual-remote name. The script already runs `gh auth setup-git` when `GITHUB_TOKEN` is set. | Comment now names `git push` on the GitHub remote `origin`. |
| `.cursor/clis.sh` | Installs Codegraph, Vercel, and Neon CLIs. No Origin or Depot package. | None. |
| `.cursor/convex.sh` | Anonymous Convex on `:3210`. No Origin remote. Placeholder JWKS is only a wait-state default until `configure-convex-auth.sh` writes a real JWKS file. | None. |
| `.cursor/configure-convex-auth.sh` | Refuses missing JWKS signing keys, the empty placeholder, and a missing `CONVEX_SERVICE_SECRET`. Does not return success on a placeholder. No Origin remote. | None. |

`.cursor/environment.json` points at those scripts and local ports only.

## Remaining live note

`.cursor/cloud-agent.md` still documented an Origin-token merge refusal.
That paragraph now says this VM uses GitHub. The old observation stays
labeled as history.

## Static checks

These files are shell, JSON, and markdown. No TypeScript, lint, or Vitest
target applies. App typecheck and lint were not run.

## Left for Ryan

Cursor dashboard Build activation, secret injection, and automation
retargeting stay with Ryan. This file does not prove a cold Build.
