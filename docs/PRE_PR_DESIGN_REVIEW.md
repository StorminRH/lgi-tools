# Pre-PR Design Review (LGI.tools)

**Audience:** the agent about to open (or hand off) a PR.
**When invoked:** after implementation and focused/local proof are complete,
**before** the finalized-head definition-of-done checkpoint, PR opening, and external review loop
(`docs/PR_REVIEW.md`) runs. This review is about *design decay*, which
mechanical gates and line-oriented reviewers don't catch.
**Constitution:** `docs/DESIGN_PRINCIPLES.md` (P-numbers refer to it).
**Current health:** `docs/CODE_HEALTH_BASELINE.md`.
**Output:** a short design-notes section for the PR description, zero-or-more
fixes applied in-branch, and backlog entries for anything found-but-out-of-scope.

Preconditions — do not start this review until:

- [ ] The changed behavior has focused and local/UX proof appropriate to the
      surface. The coverage-backed definition-of-done checkpoint follows this
      review so any design fix is included in the final tested head.
- [ ] The branch is small and single-purpose. If the diff mixes a behavior
      change with an unrelated structural change, split it now — reviewers must
      be able to trust "refactor commit = no behavior change" (P9).

Work from the actual diff: `git diff main...HEAD` (and `--stat` for shape).
Create a native runtime todo list with one item for each numbered section below,
plus a return-to-verification item whenever the review produces a code fix.

---

## 1. Interface audit — the core of this review

For **every export added or changed** in the diff:

- **Depth (P1):** count the concepts a caller must learn (params, modes, types,
  preconditions, call-order rules). Is the surface much simpler than what it
  hides? A new export whose doc comment mostly explains *how to hold it
  correctly* is shallow — rework before opening the PR.
- **Hidden decision (P2):** name the decision it owns. If the same decision is
  still known elsewhere after this diff (shape, ordering rule, constant), the
  leak survived — finish pulling it in.
- **Pass-through (P3):** any new function/hook/component that forwards to one
  callee without adding an abstraction gets deleted, not shipped.
- **Speculative surface (P4):** every new param/flag/export has a real caller in
  this diff or the existing repo. Remove the rest.
- **Error posture (P5):** did the diff export any new failure modes to callers
  that the module could have absorbed, defaulted, or defined away? Are there
  caught-and-swallowed errors that hide real faults?

**Widening tripwires** — these specific diffs are frozen without written
justification against DESIGN_PRINCIPLES §5 and the current baseline:

- [ ] No new field on any context value the current baseline names as wide or
      monitored (e.g. the planner concern contexts — fields go only to their
      owning concern).
- [ ] No new export feeding a surface the current baseline holds under a Watch
      finding (check the baseline's `watch-trigger` blocks before widening any
      named module).
- [ ] No new file in the `auth-surface` zone; no new zone `allow` entries.
- [ ] No second wrapper over `apiFetch` / `esiFetch` / `readEnv` / ui primitives.

## 2. Change-amplification audit

Look at `git diff main...HEAD --stat`:

- How many files did the *logical* change require touching? If one conceptual
  change fanned out across many files (same edit repeated, parallel switch
  statements, a rename cascade), that's leaked knowledge — note where the single
  owner should be. Fix now if small; backlog it with the diagnosis if not.
- Did the diff add a **special case** at call sites (a flag, an `if` keyed to
  one caller) instead of generalizing the callee (P4/P5)?
- Duplication: did you copy a block because the abstraction wasn't quite right?
  Copying is a design verdict — either fix the abstraction or record why not
  in the PR notes. (Fallow's dupes gate catches token-level copies; you are
  responsible for the semantic ones it can't see.)

## 3. Comments and rationale (P7)

- Every non-obvious decision the diff makes (ordering, invariant, unit, why not
  the simpler way) has a rationale comment **at the owning site**.
- No comment papers over a bad interface ("call X before Y", field-navigation
  maps). That's an interface bug wearing a comment.
- Interface comments on new exports read like a contract, not an implementation
  summary.

## 4. Tests as design evidence (P9)

- New branching logic has co-located tests; behavior, not layout
  (CONTRIBUTING.md). Logic that was hard to test and got extracted into a pure
  function = good; logic left tangled in a component with a TODO = not done.
- If this PR restructured existing code: point to the characterization tests
  that locked behavior before the moves. If they don't exist, the refactor is
  unverified — add them or shrink the claim.
- No coverage backfill padding.

## 5. Camp-site check (opportunistic, bounded)

Did you leave the code you *touched* a little better than you found it — one
rename, one dead branch removed, one leaked constant pulled home? Aim for
exactly one small opportunistic cleanup per PR, inside the files already in the
diff. Anything bigger you noticed goes to `docs/backlog.md` with a one-line
diagnosis and a hotspot tag — not into this PR (the approved plan's schema-owned
Scope coverage applies to review time too).

## 6. Rail-conflict reconciliation (P10, DESIGN_PRINCIPLES §4)

If fallow or lint pushed back during this branch:

- Any threshold override / suppression added must carry a dated `// note`
  naming the principle that justified it — silent suppressions are reverted.
- Confirm the code was **not** contorted to appease a metric (shallow splits,
  fragment hooks, test-shaped padding). If it was, undo it and take the
  documented override instead.
- Any boundary change ships with both authoritative representations updated
  together: `.fallowrc.json` as the sole mechanical owner and CONTRIBUTING.md
  as public prose. Do not recreate an ESLint boundary mirror.

## 7. Reconcile the live baseline

Compare the branch with `docs/CODE_HEALTH_BASELINE.md`.

- If the branch changes a listed hotspot's LOC, public surface, consumer count,
  override/suppression state, duplication state, direction, or campaign status,
  update the affected metric and row in the same change.
- Update only evidence the branch actually changed. Do not run a partial audit
  or rewrite unrelated hotspot rows.
- Preserve the fixed baseline schema, but advance the snapshot date, app
  version, code ref, previous-comparison identity, and one-line health trend.
  Set Measurement scope to `Targeted: <surface>` and mark unchanged Step 1
  metrics as carried from the previous full measurement. The next full version
  audit remeasures and replaces the whole file.
- If the branch creates a newly credible hotspot, add it with evidence and a
  direction of fix; if that judgment is too broad for the PR, backlog the
  classification for the audit and mark the touched surface as `watch` now.

No changed hotspot surface may reach PR open with a stale baseline.

## 8. Write the design notes

Add a short `Design notes:` block inside the canonical `## Notes` section of the
PR description (3–8 lines). Do not add a fifth top-level PR heading.

1. The decision(s) this PR gives a single home to, and where.
2. Any interface consciously kept deep instead of split (and why), or any
   override taken (and its note location).
3. Anything found and backlogged, so the version audit sees it.

Then return to `close-out`, which proceeds to the external review loop in
`docs/PR_REVIEW.md`.

For audit remediation, the design notes also name the mapped `AF-NNN` findings
and show how the delivered shape meets each required outcome. Passing this
review is necessary but not sufficient for Verified: close-out marks Delivered
after merge, and only the next complete audit may mark the finding Verified.

---

## Fast checklist (all must be true to open the PR)

- [ ] Every new export passes the depth test; zero pass-throughs; zero
      speculative surface.
- [ ] No widening tripwire hit (wide/monitored context values, baseline Watch
      surfaces, auth-surface, sanctioned gates).
- [ ] One logical change ≈ one place edited; semantic duplication resolved or
      justified.
- [ ] Rationale comments present; no comment-as-apology.
- [ ] Refactor commits behavior-preserving and test-locked; behavior commits
      tested.
- [ ] One bounded camp-site cleanup; bigger finds backlogged.
- [ ] All overrides/suppressions dated and justified; boundaries changed in
      triplicate or not at all.
- [ ] Changed hotspot surfaces reconciled in `CODE_HEALTH_BASELINE.md`.
- [ ] Design notes written inside the PR description's `## Notes` section.
