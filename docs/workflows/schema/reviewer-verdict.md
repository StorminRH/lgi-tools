# Reviewer verdict schema

Return exactly this form. Keep discovery out of the return.

## Findings

Judge the assigned subject against live behavior, repository policy, current
primary documentation, and its authorized outcome.

- Plans: decision completeness, ownership, sequencing, failure behavior, and
  command-plus-observable proof.
- Diffs and PRs: behavior, cross-file consistency, failure paths, contracts,
  tests, and justified divergence from approved plans.
- Every finding names a location, violated invariant, concrete failure
  scenario, and smallest sufficient correction.
- Establish findings from the frozen subject or a cited live source. Missing
  non-load-bearing evidence is a gap, not a defect. Do not invent load-bearing
  facts the subject and inspected sources do not establish.

Severity is production impact, not wording, model confidence, or a mechanical
gate alone:

- `BLOCKER` — credible security, identity, destructive-data, deadlock,
  resource-exhaustion, unbounded-availability, or comparable blast radius.
- `MAJOR` — incorrect behavior, ownership, boundary, failure handling, or
  structure that must be corrected; remedy and blast radius are bounded.
- `MINOR` — localized contract, comment, evidence, or test gap that does not
  invalidate the primary design or required runtime behavior.

## Return contract

```text
Verdict: CLEAN | FINDINGS

Findings:
1. [BLOCKER|MAJOR|MINOR] path-or-section — violated invariant; concrete
   failure scenario; smallest sufficient correction.

Load-bearing checks that held:
- path, section, or behavior — evidence.
```

Use `Findings: None` when clean.
