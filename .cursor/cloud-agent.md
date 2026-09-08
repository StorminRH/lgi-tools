# Cursor Cloud Agent

Read this when setting up or running the Linux VM selected by
`.cursor/environment.json`. The shared bootstrap, local-target contract,
readiness semantics and checkout reconciliation are documented in
[development environments](../docs/development-environments.md). Local Cursor
and Codex sessions keep the Docker workflow in
[README](../README.md#local-development).

The install adapter prepares a cleanly stopped PostgreSQL 16 baseline and
verifies local Next/Convex startup. The single `development` terminal owns
the full task stack and reconciles the actual checkout after a Build restore.
A terminal that exits or never prints the stack readiness message is unready.
`start.sh` prepares CLI paths and GitHub git authentication; it does not hide
an auth reconciler in the background.

Saved environment repository bindings, active Build IDs, Build source SHAs,
secrets/network settings and automation bindings are external to this JSON.
Verify them in Cursor when migrating to GitHub. An existing successful Build
is not evidence that a replacement Build succeeded.

Use the Cursor skill and named-agent paths in AGENTS.md. Check actual `gh`,
GitHub git, Linear and required CLI access on this VM; integrations and shell
credentials are separate capabilities. No inherited Origin runtime is needed.
Depot remains installed pending the CI decision.

For DB suites, prove that the migrated local `:5433` cluster and complete SDE
baseline were used and that meaningful suites ran with zero unintended skips.
Playwright Chromium comes from the selected lockfile. Seed synthetic browser
auth through `pnpm e2e:seed`; keep cookie jars and `auth-storage.json` out of
artifacts. Atlas probes require the running local Convex/Next stack and a real
authenticated fixture operation beyond bootstrap readiness.
