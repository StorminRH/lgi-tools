# Ordinary Work As-Built — Atlas ambiguous jump signature selection

**Record status:** Final
**Recorded:** 2026-09-07
**Contract:** None.
**Contract digest:** None.
**Plan:** None.
**Plan digest:** None.
**Branch:** `codex/fix-atlas-ambiguous-jump`
**PR:** `#138`
**Record standard:** `docs/workflows/schema/session-as-built.md`

## Delivered outcome

When a jump could belong to more than one wormhole signature, Atlas waits for that choice before drawing the destination. The scanned holes stay as they were until the answer. Picking a signature places the system on that hole in one write. Jumping back before answering adds the ship's mass once and still waits. A collapsed hole to the same systems loses its undo window when that jump is recorded or answered.

- Fixed: Ambiguous wormhole jumps wait for a signature choice before the destination appears on the map.
- Fixed: Picking a signature after a static placeholder claim still completes the jump.
- Fixed: Jumping back before answering counts mass once and does not place the unresolved system.
- Fixed: Recording or answering an ambiguous jump closes undo on a dying hole to the same systems.

## Divergences from plan

None.

## Final surfaces

- `convex/mapJumpAuthoring.ts` writes unanswered jumps as `awaiting-signature` rows and skeletons dying pairs on that corridor.
- `convex/mapJumpIdentity.ts` answers by moving destination and mass onto the chosen hole, then skeletons remaining dying pairs.
- `convex/lib/mapStaticClaim.ts` rebinds awaiting candidate ids when a static claim replaces a hole row.
- `src/mapper/signatures/jump-resolution.ts` keeps the prompt when some saved candidates disappear and still requires an explicit answer for a lone remaining choice.
- `src/composition/jump-resolver/resolver.ts` holds signature elimination and wormhole observations until the destination is placed.

## Discovered work

None.

## Successor notes

Older `pending` rows stay answerable. This change stops writing that kind. A later session can migrate live pending rows if the operator wants that prompt gone. The GitHub dump excludes the Atlas jump probes. Those files remain on the Origin head. Operator visual review of the two-client probe is still open and is a post-promotion pause. This record does not close a numbered 4.1 session.

## Verification summary

- Local gates on `63b182cec326e6d6cb3f40ccc3c90635e935179b`: typecheck, lint, both Fallow dead-code modes, duplication, and local health exited 0. Focused jump tests passed 100 tests across 9 files, including the two dying-pair cases added for Bugbot.
- Origin #138 records an authenticated two-client atlas-ambiguous-jump probe at 15/15 from the earlier implementation pass. This close-out did not rerun that browser probe. The older atlas-automatic-jump probe's earlier total-node-count failure stays disclosed on the PR. Operator visual acceptance is unclaimed.
- **Adversarial review:** Subject: Origin `138`; `origin pr diff 138`; Roles: structure-reviewer, behavior-reviewer, thermo-nuclear-review-subagent, thermo-nuclear-code-quality-review-subagent; Runtime identity: requested=repository agent-file pins, observed=Not observable; Verdict: PASS; Disposition: Bugbot dying-pair supersede accepted and fixed. Structure CLEAN, behavior CLEAN, thermo-bug PASS. Thermo-quality prompt-table and pending-deletion blockers rejected: no failing contract, and live pending rows stay answerable by design. Greptile dump probe-deletion rejected as size-gate isolation. CodeRabbit export comments rejected under no-comments. Comment-sicko deleted nothing.
- GitHub mirror #482 holds the 25 size-gate paths at this Origin head. Greptile and CodeRabbit completed one requested pass. Depot remains the pipeline gate after this record lands.
