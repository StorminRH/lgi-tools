# SCRATCHPAD — LGI.tools

> Short cross-session memory. Keep this skimmable in about one minute. The
> upkeep procedure lives in `docs/workflows/close-out.md`.

## Now

- **CURRENT:** session 4.0.2.2.1 is complete and committed on
  `lifecycle/4.0.2.2`. Draft PR #338 is open for the sub-version and publishes
  no version records; it is unreviewed and unmerged.
- **NEXT:** session-plan approval for **4.0.2.2.2**, which owns the
  durable-to-Convex access projection, its teardown and resynchronization, and
  live revocation. It completes and ships PR #338 rather than opening a second
  one.
- Two constraints it must honor, recorded in
  `docs/session-as-built/4.0/4.0.2.2.1.md`: the projection writer must guarantee
  one `mapAccess` row per `(mapId, userId)` because the gate reads it with
  `.unique()`, and Convex permits exactly one `.paginate()` per function
  execution.

## Current boundary

Version 3.10, “Hull Integrity + SKIN,” is closed and archived. Its roadmap,
contracts, plans, as-built records, audit evidence, and close record live in
`../LGI Tools Document Archive/versions/3.10/`.

Version **4.0, “The Living Map,”** is the active master version. Its plan is
`docs/VERSION_4_0_PLAN.md` and its approved delivery topology — 14 sub-versions
across 23 sessions — is the `## Status` table there. Every session is
contracted in `docs/session-contracts/4.0/`. Continue only through
`start-session`; the resolver owns stage selection and the deterministic
`lifecycle/<sub-version>` branch.

Two topology facts that are easy to misread. Sub-version identifiers keep the
phase narratives' original numbers, so merged bundles absorb adjacent numbers
and the sequence contains deliberate gaps; the resolver orders by table row, not
by arithmetic. Sub-versions 4.0.4.2 and 4.0.4.3 are the only ones whose sessions
each ship their own PR — every other sub-version ships one PR for the
sub-version.

Sub-version 4.0.0.1 delivers Phase 0: the baseline captures each master
version's starting ref, measures the expanded registered-row set, and archives
session as-built records with the rest of a version bundle. Its merge advances
the resolver to Phase 1 planning for 4.0.1.1.

`docs/CODE_HEALTH_BASELINE.md` and `docs/UPDATE_WATCH_BASELINE.md` remain the
active health and update-watch state. The full scratchpad as it stood at the
3.10→4.0 boundary is preserved byte-for-byte at
`../LGI Tools Document Archive/pre-4.0/SCRATCHPAD_3.10_pre-compaction.md`.

## Durable homes

- Repository rules and invariants: `AGENTS.md`, `src/AGENTS.md`, and the owning
  workflow or schema under `docs/workflows/`.
- Deferred, unassigned work: `docs/backlog.md`.
- User-facing and internal ship history: `content/changelog/` and git history.
- Per-session planned delivery truth from the 3.10 binding floor:
  `../LGI Tools Document Archive/versions/3.10/session-as-built/`.
- Architecture ownership and the generated dependency view:
  `docs/architecture-boundaries.md`, `.fallowrc.json`, and
  `docs/architecture-map.md`.
- Older scratchpad context: the `pre-3.8/` and `pre-4.0/` document-archive
  folders.

## Open operator carry-forwards

- `DISCORD_ALERT_WEBHOOK_URL` is still optional and unset unless configured
  separately for Production and Preview. It drives price-degradation alerts;
  telemetry still records when delivery is skipped.
- Vercel Speed Insights remains wired but not enabled on the current plan.
- The daily update-watch routine remains paused until the operator explicitly
  chooses to unpause it.

## Working notes

- The repository pins the pnpm release that enforces its seven-day
  `minimumReleaseAge`. Use the pinned package manager when changing the
  lockfile; an older global pnpm can parse the setting without enforcing it.
- Do not rebuild a shipped-version ledger here. Use changelog, git, archived
  lifecycle records, and agent memory for historical forensics.
- Promote any new load-bearing fact to its canonical guide, workflow, schema,
  checker, test, or backlog entry instead of growing this file indefinitely.
