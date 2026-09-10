# GitHub delivery inventory

Counts from `StorminRH/lgi-tools` on 10 September 2026. GitHub refs, unique
commits, and Origin-to-GitHub pull request pairs. Nothing here moves refs,
tags, or remotes.

Refresh the counts with:

```bash
git ls-remote --heads origin
git ls-remote --tags origin
git rev-list --count origin/main..origin/development
gh pr list --repo StorminRH/lgi-tools --state open
```

## Manual Verify wording

These four places now use the same start command.

| Place | Wording |
| --- | --- |
| `.github/workflows/test.yml` comment | Actions → Verify → Run workflow, or `gh workflow run Verify --ref <branch>` |
| `CONTRIBUTING.md` | Actions → Verify → Run workflow, or `gh workflow run Verify --ref <branch>` |
| `README.md` | Actions → Verify → Run workflow, or `gh workflow run Verify --ref <branch>` |
| `docs/contributing/testing-principles.md` | Actions → Verify → Run workflow, or `gh workflow run Verify --ref <branch>` |

The workflow `on:` block remains `workflow_dispatch` only. Push and pull
request do not start Verify.

## Lineage

| Ref | SHA | Unique commits versus `main` |
| --- | --- | --- |
| `main` | `654d6587f3d3cf36a084ba6b1d17aa234eeb8c20` | 0 |
| `staging` | `654d6587f3d3cf36a084ba6b1d17aa234eeb8c20` | 0. Same SHA as `main`. |
| `development` | `30eaa5c19e8595bc0c32a501ae24628b76fd048d` | 1. `30eaa5c1` Keep Cloud agents on the same pstack models as setup (#502) |

GitHub reports no tags. Local `git ls-remote --tags origin` is empty.

## Open GitHub pull requests

| GitHub PR | Head | Base | Draft | Head SHA | Ahead of `development` | Behind `development` |
| --- | --- | --- | --- | --- | --- | --- |
| [#504](https://github.com/StorminRH/lgi-tools/pull/504) | `stormin/lgi-115-skill-forge-corrections-e237` | `development` | no | `c40fd381` | 1 | 0 |
| [#503](https://github.com/StorminRH/lgi-tools/pull/503) | `stormin/local-synthetic-pilot-66de` | `development` | no | `5b623989` | 4 | 0 |
| [#493](https://github.com/StorminRH/lgi-tools/pull/493) | `stormin/lgi-109-targeted-identify-read-05b6` | `development` | yes | `8256b3a6` | 1 | 4 |
| [#492](https://github.com/StorminRH/lgi-tools/pull/492) | `stormin/lgi-5-c2i2-engine-fixtures-10ad` | `development` | yes | `725933c6` | 1 | 4 |
| [#491](https://github.com/StorminRH/lgi-tools/pull/491) | `stormin/daily-test-cleanup-sep8-f758` | `development` | yes | `6c79e295` | 1 | 4 |
| [#490](https://github.com/StorminRH/lgi-tools/pull/490) | `stormin/deps-sep8-age-qualified-5d7d` | `development` | yes | `377f9b08` | 1 | 4 |

## Remote branches with no open pull request

| Branch | SHA | Ahead of `development` | Behind `development` |
| --- | --- | --- | --- |
| `stormin/manual-ci-trigger-8a9d` | `60a58707` | 1 | 2 |
| `stormin/pstack-models-cloud-2a2c` | `cf7a1dd8` | 3 | 1 |
| `stormin/retire-lifecycle-process-b176` | `1b9b9687` | 3 | 3 |

## Named Origin to GitHub pull request pairs

Origin CLI was not authenticated here (`origin repo view` returned Not
authenticated). The pairs below come from GitHub pull request titles, not a
live Origin export.

| Origin PR | GitHub PR | GitHub title |
| --- | --- | --- |
| 109 | [471](https://github.com/StorminRH/lgi-tools/pull/471) | Dump: Origin #109 auth composition layer |
| 133 | [478](https://github.com/StorminRH/lgi-tools/pull/478) | Mirror Origin PR 133: maps, telemetry, and EVE read consolidation |
| 135 | [479](https://github.com/StorminRH/lgi-tools/pull/479) | Mirror Origin 135: LGI-104 Atlas subscription scope |
| 137 | [481](https://github.com/StorminRH/lgi-tools/pull/481) | Review mirror for Origin 137: Atlas efficiency and shared data reads |

Linear [LGI-46](https://linear.app/lgitools/issue/LGI-46) still names Origin
[#21](https://cursor.com/codebase/stormin/lgi-tools/pull/21). That Origin
number has no matching GitHub title in these counts.

Closed GitHub migration drafts that later work split out of, not Origin
numbers: [#486](https://github.com/StorminRH/lgi-tools/pull/486),
[#488](https://github.com/StorminRH/lgi-tools/pull/488).

## Sync Manager write we should stop

Sync Manager still has a documented 3:30am ET Origin-to-GitHub branch-tip
write, plus a 12:30am ET dependency-draft create. Turn off the 3:30am write
once work lands only on GitHub. This file does not change the schedule, the
Cursor automation, or the destination.

No repository workflow currently names Sync Manager or 3:30am ET. The
schedule lives in Cursor dashboard configuration, not in this tree.
