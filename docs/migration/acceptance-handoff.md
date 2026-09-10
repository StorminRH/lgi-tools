# GitHub acceptance handoff

Shell for [LGI-117](https://linear.app/lgitools/issue/LGI-117). No Origin
retirement, Depot cancellation, or Linear write from this file. Snapshot
10 September 2026.

## Delivery proof already landed

| Proof | Where |
| --- | --- |
| Actions Verify, build, and e2e on a GitHub PR | [LGI-112](https://linear.app/lgitools/issue/LGI-112) comment on PR [#496](https://github.com/StorminRH/lgi-tools/pull/496). Run [34379699347](https://github.com/StorminRH/lgi-tools/actions/runs/34379699347) passed. |
| Manual-only Verify | `.github/workflows/test.yml` `on: workflow_dispatch`. CONTRIBUTING, README, and testing principles name Actions → Verify → Run workflow, or `gh workflow run Verify --ref <branch>`. |
| Deleted Depot workflows | No `.depot/` tree on `development`. Actions is the selected CI path. |
| GitHub as the delivery forge | CONTRIBUTING landing steps. Sibling prep PRs [#504](https://github.com/StorminRH/lgi-tools/pull/504) through [#508](https://github.com/StorminRH/lgi-tools/pull/508). |

## LGI-23

[LGI-23](https://linear.app/lgitools/issue/LGI-23) asked for temporary Neon
`preview/ci-*` branches in CI.

Landed proof uses a GitHub Actions `postgres:16` service and
`createDbTestHarness`. LGI-112 recorded 31 DB files and 160 assertions with
zero pending. That supersedes the Neon-branch CI design. Do not add a second
Neon CI path.

LGI-23 remains a backlog ticket until Ryan closes it. This file does not
change its Linear status.

## LGI-46

[LGI-46](https://linear.app/lgitools/issue/LGI-46) asked for Origin
review and comment scopes, GitHub MCP writes, docs-researcher Context7 in
Ask mode, and Origin CLI doc fixes.

Superseded by GitHub delivery and manual-only Verify:

- Origin review, comment, and merge token work
- Depot through `origin pr checks --watch`
- Origin draft create flags as the live close-out path

Still open until proven on a fresh GitHub-backed Cloud Agent:

- GitHub MCP issue and PR writes (historically 403)
- docs-researcher Context7 from Ask mode
- `git push` on the GitHub `origin` remote without rewriting the URL

Skill forge wording for `origin pr diff` is in PR
[#504](https://github.com/StorminRH/lgi-tools/pull/504). Do not treat that
unmerged PR as current `development` until it lands.

## Preserved history mapping

Named Origin-to-GitHub pairs and current refs live in
[github-delivery-inventory.md](./github-delivery-inventory.md) once that
sibling PR lands. Until then, the known title pairs are Origin 109→GitHub
471, 133→478, 135→479, and 137→481. Origin #21 from LGI-46 has no GitHub
title in the 10 September snapshot.

## Open gaps

- Ryan still configures GitHub required checks and source authority
  (LGI-112 remainder).
- Cursor Cloud Build activation and Codex dashboard setup stay with Ryan
  (LGI-120, LGI-121).
- Vercel git reconnect and live staging or production proof stay with Ryan
  (LGI-116).
- Sync Manager 3:30am ET Origin-to-GitHub write is to-retire. The schedule
  is unchanged.
- Depot's already-scheduled cancellation is Ryan's click. This file does
  not cancel it.
- Four-environment matrix cells are empty.

## Linear paste shell

Copy into LGI-117 when Ryan accepts. Do not post it from this PR.

```text
GitHub delivery acceptance (repo prep only)

Delivery proof: Actions Verify is manual-only. Depot workflows are gone.
PR 496 landed verify/build/e2e. Sibling prep PRs 504-508 are open.

Preserved history: Origin 109/133/135/137 map to GitHub 471/478/479/481.
Inventory snapshot lists current refs. No ref was moved.

Superseded: LGI-23 Neon CI branches. LGI-46 Origin review/comment and Depot
watch. Manual Verify and deleted Depot trees replace those paths.

Open: required checks, Cloud Builds, Vercel reconnect, Sync Manager
retirement, Depot cancellation click, GitHub MCP writes, docs-researcher
Context7, matrix evidence.
```
