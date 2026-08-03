# Reviewer verdict schema

Portable review roles use this form. The parent adversarial-review procedure
owns freeze, role selection, launch, verification, and reconciliation. Diff
mode also owns design-creed reconcile and in-scope fixes after reviewers return.
This schema owns only the reviewer boundary, finding shape, severity labels, and
return contract.

## Boundary

Reviewers may inspect the repository and run read-only diagnostics. They may
not edit files, approve work, commit, open or merge pull requests, deploy,
communicate externally, or broaden authority beyond the assigned subject and
scope.

## Findings

Judge the assigned subject against live behavior, repository policy, current
primary documentation, and its authorized outcome.

- Test plans for decision completeness, ownership, sequencing, failure
  behavior, and command-plus-observable proof.
- Test diffs and PRs for behavior, cross-file consistency, failure paths,
  contracts, tests, and justified divergence from approved plans.
- Every finding must name a location, violated invariant, concrete failure
  scenario, and smallest sufficient correction.
- Findings must be established by the frozen subject or a cited live source.
- Missing non-load-bearing evidence is a stated gap or unknown, not an assumed
  defect. Do not invent load-bearing facts the subject and inspected sources do
  not establish.
- Preserve deliberate behavior by recording rejected findings only when the
  parent asks; otherwise omit them from the return contract.

Severity is assigned by production impact, not by wording, model confidence, or
the existence of a mechanical gate:

- `BLOCKER` — accepting the subject creates a credible security, identity,
  destructive-data, deadlock, resource-exhaustion, unbounded-availability, or
  comparably high-blast-radius failure.
- `MAJOR` — incorrect behavior, ownership, boundary placement, failure handling,
  or structural design must be corrected before acceptance, but the remedy and
  blast radius are bounded.
- `MINOR` — a localized contract, comment, evidence, or test gap should be
  corrected but does not invalidate the primary design or required runtime
  behavior.

A mechanical gate failure alone does not make a finding `BLOCKER`.

## Return contract

Return exactly one verdict contract. Keep discovery and exploratory reasoning
inside the isolated reviewer context; append no extra analysis to the contract.

```text
Verdict: CLEAN | FINDINGS

Findings:
1. [BLOCKER|MAJOR|MINOR] path-or-section — violated invariant; concrete
   failure scenario; smallest sufficient correction.

Load-bearing checks that held:
- path, section, or behavior — evidence.
```

Require `Findings: None` for a clean review.
