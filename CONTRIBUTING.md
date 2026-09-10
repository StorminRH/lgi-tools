# Contributing to LGI.tools

Thanks for your interest in contributing. LGI.tools is a multi-tool web
platform for [EVE Online](https://www.eveonline.com) players. For local setup,
see [Local development](README.md#local-development) in the README.

## Before you start

- **Agree on the shape first** for anything non-trivial. Small, obvious
  fixes (typos, a broken link, a clear one-line bug) can land directly.
- **Be civil.** Reviews are conversations.

Architecture is deny-by-default Fallow (`.fallowrc.json`) plus lint. Use the
shared `src/components/ui/` primitives instead of importing their libraries
from feature code. Remaining source landmines live in [`src/AGENTS.md`](src/AGENTS.md).
Testing principles: [`docs/contributing/testing-principles.md`](docs/contributing/testing-principles.md).

## Commit style

Plain English. Describe what the change does for the project, not how the code is
structured — no file paths, function names, or jargon in the subject or body.

- **Subject:** one sentence, lowercase after the colon, under 72 characters.
- **Body (optional):** 3–5 bullets on what changed and why.

```
feat: add API endpoints for browsing and filtering wormhole sites

- sites can now be listed, filtered by class and type, and fetched by ID
- full site detail includes waves, NPC counts, and resource values
- invalid filters return a clear error instead of an empty result
```

## Landing and review

1. Land through a GitHub PR targeting `development`. Promote is a GitHub PR
   `development` → `staging`. After that merge, fast-forward
   `development` to `staging` so the lines match. Release is
   `staging` → `main`. Those merges, and any other merge onto
   `staging` or `main`, run through close-out.
2. Before you land, run the local test suite: `pnpm typecheck`,
   `pnpm lint`, Fallow `dead-code` (default and `--production`), `dupes`,
   and `health`, and focused tests for your diff. Before merge, wait for
   GitHub Actions (`verify`, `build`, and `e2e`) on the PR's current commit.
   Laptop `pnpm verify` does not replace those CI checks.
3. Fill in the PR template's **test plan** — what you verified and how.
4. Open the GitHub PR as a draft after a green local suite. Reviewers use
   `gh pr diff <N> --repo StorminRH/lgi-tools`. Mark it ready when review
   should begin, and confirm the configured review bots actually run.
5. Review the delivering GitHub PR itself; no separate mirror or dump PR
   is needed. Keep the existing promote size gate and app-facing file
   count; Git remote aliases such as `origin/staging` still mean Git refs.
6. Freeze the review commit until every review seat has returned. Then one
   batch: triage, dedupe, fix, and note dispositions on the same GitHub PR.
   Confirm reviews and CI apply to the updated commit before merge.

Linear remains the ticket and handoff system. GitHub required-check settings
and source-authority cutover are tracked in
[LGI-112](https://linear.app/lgitools/issue/LGI-112); do not infer that existing
mirrors or deployments have been reconfigured from this guide. Agent
instructions and skills are outside this documentation change. Bring obsolete
Origin commands in those files to the operator for an exact correction;
do not run them as part of a GitHub PR or rewrite the surrounding procedure.

## Conduct, security & license

- This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).
- To report a security vulnerability, see [SECURITY.md](SECURITY.md) — please
  **don't** open a public issue for it.
- LGI.tools is [MIT](LICENSE) licensed; contributions are made under the same
  license.
