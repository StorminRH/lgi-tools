# Ordinary Work As-Built — Fold mapConnections into hallway doors

**Record status:** Final
**Recorded:** 2026-08-26
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `development`
**PR:** `#41`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

Atlas connections store as one hallway with two mouths. A mouth holds a class hint or a known system, never both. Scanner and lifetime labels follow the named type even when the first stored mouth is a K162. Re-identifying the same type clears a leftover jump prompt. Corp structures waits for a real request before affiliation ESI, so the page opens on first visit.

- Changed: A hole mouth is a class hint or a known system, never both
- Fixed: Named wormhole types show in scanner and lifetime even when the first stored mouth is a K162
- Fixed: Re-identifying the same wormhole type no longer leaves a jump prompt
- Fixed: Corp structures opens on first visit

## Divergences from plan

None.

## Final surfaces

- `src/data/maps/connection-hallway.ts` — hallway row, exclusive `DoorLeadsTo`, identity, lifetime, resolution, tombstone
- `src/data/maps/connection-door-types.ts` — named-mouth helpers and type patches
- `src/data/maps/connection-door-destinations.ts` — leads-to absorb, vacate, and stub recreate
- `src/data/maps/chain-contract.ts` — `connectionRemovedTombstone` and dual-tombstone reads
- `convex/schema.ts` — contracted `mapConnections`; `by_tombstone_death_latest` and `by_purge_after`
- `convex/lib/mapEntityContracts.ts` — Convex Infer-aligned hallway validators
- `convex/lib/mapScanApply.ts` — paste and identify through hallway writers
- `convex/lib/mapScanElimination.ts` — occupied-door vacate and stub-to-hallway link
- `convex/mapAuthoringFields.ts` — gated field setters on doors
- `convex/mapJumpAuthoring.ts` — jump identity writes `resolution`
- `src/mapper/chain/optimistic-authoring.ts` — client type write clears pending
- `src/mapper/chain/use-map-chain.ts` — `ConnectionEditorDetail` derived from the hallway type
- `src/composition/sync/corp-structures-sync.ts` — affiliation ESI waits on `connection()`
- `src/data/maps/__tests__/connection-fold.ts` — test-only `foldLegacyConnection`
- `convex/__tests__/connection-doc.setup.ts` — bag inserts for Convex tests
- `src/AGENTS.md` — jump identity owns `resolution`; leads-to writes only the door note

## Discovered work

None.

## Successor notes

- Exclusive `DoorLeadsTo`. A mouth is `unset`, a class hint, or a system. Bugbot called destination edits a wipe. That drop is the contract. Do not restore hint-plus-system bags.
- Production writers speak `blankHallway` and the door helpers. `foldLegacyConnection` is a frozen test adapter. One-candidate pending stays `destination` or `open` there. `hasAnswerablePrompt` still needs two survivors.
- Schema is contracted. No loosen-migrate-tighten in this slice. CodeRabbit asked for a backfill. Rejected.
- Same-code scan re-identify and the optimistic type write call `clearPendingResolution`. Jump identity owns `resolution` destination provenance and pending candidate ids. Landmine in `src/AGENTS.md`.
- Vacate calls `connectionTypePatch(target, side, null, null)` and can set `identity` unknown while the other door is still typed. Recreate stub keeps provenance separately. Left unfixed.
- `setConnectionTypedSide` is gone. Typed side follows wormhole-type edits on `identity`.
- Corp-structures affiliation ESI waits on `connection()`. `headers()` still resolves in the session App Shell. `force-dynamic` is not valid under Cache Components.
- Dump is GitHub #463. Findings log is Origin #41 version `02dfa662`. Greptile did not reply. Comment-policy nits, fixture `identityEquals`, tautological jump `candidateIds` asserts, and a stronger `connection()` settlement test stay unfixed.
- Operator cut the sol correctness reviewer. The packet filled context and compacted.

## Verification summary

- **Adversarial review:** Subject: isolated app-facing packet `origin/staging` `22a552bfa07e2b96df4c5702c22675ed6e11764f`..`origin/development` `02dfa662907db3261e721464e6a48e09e3eea749`; Roles: structure-reviewer, thermos, no-comments; behavior-reviewer operator-cut; Runtime identity: requested=agent-file-pin, observed=Not observable; Verdict: `PASS`; Disposition: same-code stamp and optimistic type write now clear pending. Editor detail derived from the hallway type. Resolution landmine named. Exclusive `DoorLeadsTo`, contracted schema, leftover comments, `humanTypedDoors`, `ConnectionRowId` comment, and splitting `ChainTombstoneRow` rejected. Comment-sicko deletions accepted except the dual-tombstone contract and the Atlas glossary.
