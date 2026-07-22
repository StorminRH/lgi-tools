# Pre-PR design-review procedure

Run this procedure after implementation and focused local or UX proof, but
before the finalized-head definition-of-done checkpoint and before any PR is
opened. `docs/DESIGN_PRINCIPLES.md` owns design policy;
`docs/CODE_HEALTH_BASELINE.md` owns current hotspot state. This procedure owns
the required design judgment and its evidence.

## Execution contract

Required inputs:

1. For planned lifecycle work, the approved session contract and plan; for
   ordinary out-of-band work, the direct request and its stated scope.
2. The complete current-change diff against its merge base.
3. Focused behavior, local, and UX evidence applicable to the changed surface.
4. The current design principles and code-health baseline.

Required outputs:

1. One review result using the exact result form in **Return the result**.
2. Every in-scope design defect fixed on the branch.
3. Every genuinely out-of-scope finding recorded once in `docs/backlog.md` with
   its diagnosis, size, and trigger.
4. A concise `Design notes:` block ready for the PR's canonical `## Notes`
   section.
5. The list of verification evidence invalidated by review fixes.

Stop with `BLOCKED` instead of returning to close-out when a required input is
missing, the diff violates an approved scope boundary, or a material design fix
needs operator approval. This procedure grants no authority to open, merge,
deploy, promote, or archive.

Before reviewing, create one native runtime task for each numbered phase below
and one final return-to-verification task. Keep exactly one task active. Attach
the phase evidence before completing its task; a bare assertion such as
"checked" or "looks good" is not evidence.

## 1. Establish the review boundary

1. Resolve the branch merge base and inspect the complete diff, name-status,
   and stat views.
2. Group the changed files by logical change. Name the contract or direct
   request that authorizes each group.
3. Confirm focused proof exists for every changed behavior. Record which
   surfaces legitimately need no runtime or UX proof.
4. Record every added or changed exported surface. If there are none, record
   `Exports: none` and continue.

Evidence: merge-base SHA, logical-change groups with their authority, proof
inventory, and export inventory.

## 2. Review interface depth and decision ownership

For every added or changed export, record:

1. The decision the owning module hides.
2. What the caller must know: parameters, modes, preconditions, units, failure
   cases, and call-order rules.
3. The real caller that requires each new parameter, option, type, or variant.
4. Whether the module absorbs edge cases or pushes avoidable complexity to its
   callers.
5. Verdict: `PASS`, `FIX`, or `BLOCKED`.

Apply these actions:

- If callers must understand implementation detail or sibling state, deepen the
  interface before continuing.
- If the same decision is encoded outside its owner, move the decision to one
  owner and remove the duplicate knowledge.
- If a new layer only renames arguments and forwards to one callee, delete it.
- If a parameter, flag, variant, or export has no current caller, remove it.
- If the module can define away or absorb a failure mode, do so instead of
  exporting that burden.

Also inspect the diff for monitored-context widening, a new export on a Watch
surface, a widened boundary exception, or a second wrapper over an adopted
platform gate. Any occurrence requires an explicit design-principle
justification and current baseline evidence; otherwise classify it `FIX`.

Evidence: one verdict record per changed export and one widening verdict for
the complete diff.

## 3. Review change amplification and semantic duplication

1. For each logical change group, identify every file that had to know the
   changed decision.
2. Treat repeated conditionals, parallel switch cases, caller-specific flags,
   copied policy blocks, and rename cascades as evidence that ownership leaked.
3. Move leaked knowledge to one owner when the fix is in scope.
4. Let the mechanical Fallow gate own token-level duplication. This phase owns
   semantic duplication the mechanical gate cannot detect.

Evidence: one amplification verdict per logical change group, naming its single
owner or the corrective action taken.

## 4. Review rationale and comments

1. Verify every changed exported surface has an interface comment that states
   its contract without restating its signature.
2. Verify non-obvious ordering, invariants, units, ownership, and rejected
   simpler alternatives are recorded at the owning site.
3. Treat comments that explain call order, field navigation, or a workaround as
   interface defects. Fix the interface rather than polishing the apology.
4. Remove commentary that merely narrates visible code.

Evidence: the changed interface-comment inventory and the location of every
added or corrected rationale comment, or `Rationale changes: none`.

## 5. Review tests as design evidence

1. Map every new or changed behavior branch to a behavioral test.
2. For structural changes, identify the characterization evidence that held
   behavior constant before the move.
3. If branching logic remains difficult to test because presentation and policy
   are tangled, separate the policy at its natural seam and test it there.
4. Reject assertions added only to raise coverage or satisfy a metric without
   proving behavior.

Evidence: behavior-to-test mapping, characterization evidence for structural
changes, and any verification items invalidated by fixes.

## 6. Reconcile rail pressure and the live baseline

1. Inspect any lint, Fallow, complexity, duplication, suppression, or boundary
   pressure encountered by the branch.
2. Confirm the implementation was not fragmented, padded with tests, or wrapped
   in pass-through layers solely to satisfy a metric.
3. Apply the current design-principle procedure for every override or
   suppression and retain its required rationale.
4. When a boundary changes, update its mechanical owner and public description
   together; do not create a second enforcement representation.
5. Compare every touched hotspot or Watch surface with the current baseline.
   Update only the affected measurements and required snapshot identity. Do not
   perform a partial rewrite of unrelated baseline evidence.
6. If the diff creates a credible new hotspot, add evidence and a direction of
   fix now or stop for an operator decision. Do not hide the judgment in prose.

Evidence: rail-pressure verdict, override/suppression inventory, boundary
verdict, and baseline update or `Baseline update: not required` with the reason.

## 7. Resolve findings without widening the branch

Classify every finding exactly once:

- `FIXED`: the defect was in scope and is corrected on the branch.
- `DEFERRED`: the finding is outside the whole sub-version and now has one
  actionable backlog entry with diagnosis, size, and trigger.
- `BLOCKED`: correcting it would change approved product scope, architecture,
  or policy and requires operator approval.

Do not add an arbitrary cleanup quota. Make only cleanup required to leave the
touched design coherent. Re-run every phase affected by a fix and list the
mechanical verification that the fix invalidated.

Evidence: finding ledger with classification, disposition, and affected review
or verification phases.

## 8. Prepare PR design notes

Produce a three-to-eight-line `Design notes:` block for the PR's `## Notes`
section. State:

1. Which decisions now have one owner.
2. Which interfaces were deliberately kept deep or changed, and why.
3. Any override, suppression, or boundary decision and its evidence location.
4. Any deferred finding and its backlog entry.

For audit remediation, also name each mapped `AF-NNN` finding and state how the
delivered shape meets its required outcome. Do not mark an audit finding
Verified here; only a later complete audit can do that.

Evidence: the exact PR-ready `Design notes:` block.

## Return the result

Return this exact structure to `close-out`:

```text
Design review: PASS | BLOCKED
Merge base: <full SHA>
Scope groups: <group -> authority>
Exports reviewed: <count or none>
Interface verdict: <summary>
Amplification verdict: <summary>
Rationale verdict: <summary>
Test-design verdict: <summary>
Rail and baseline verdict: <summary>
Findings: <FIXED / DEFERRED / BLOCKED ledger or none>
Invalidated verification: <items or none>
Design notes:
<three to eight PR-ready lines>
```

Return `PASS` only when no `FIX` or `BLOCKED` finding remains, every required
evidence field is populated, any affected baseline state is current, and the
design notes are ready. A `PASS` returns control to
`docs/workflows/close-out.md`; it does not itself authorize PR creation.
