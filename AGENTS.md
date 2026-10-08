# [LGI.tools](http://LGI.tools)

An EVE Online multi-tool focused on simplifying complex tasks.

## Work Flow

Work targets `development`. Promote is `development` → `staging`;
release is `staging` → `main`. Merge with merge commits, never squash. Fixes
made on `staging` or `main` come back to `development` by merging. There are no per-PR preview
deployments: test with local dev servers, and `staging` is the
long-lived test environment.

Sub-agent usage is encouraged, especially for context isolation.
For noisy work such as testing, documentation lookup, and exploring
the repository, isolate those tasks to a sub-agent.

Production builds run in CI and on Vercel; do not run them locally.
Cloud sessions read [the cloud guide](.claude/cloud/GUIDE.md).

## Verification

Before every commit, run `pnpm check` through the test-runner agent:
typecheck, lint, tests related to the change, and static Fallow over
the whole tree. `pnpm verify` is the full gate, with the full suite
under coverage and CRAP. The Coverage health workflow runs its coverage
half on pull request pushes that touch code. Run `pnpm verify` before promote or
release and whenever Coverage health fails.

Fix every Fallow finding when it appears, whoever introduced it. Do not
land past a red check by calling findings pre-existing or out of scope.
Do not raise thresholds or add overrides, baselines, or suppressions.
If a fix is too large for the current change, stop and report it as a
blocker.

## Architecture

[.fallowrc.json](.fallowrc.json) defines the production-layer
boundaries. Preserve them. Use existing primitives; extract shared
code for a real second consumer.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
