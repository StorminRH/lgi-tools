---
name: thermo-nuclear-code-quality-review
description: Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. Use for a thermo-nuclear code quality review, thermonuclear review, deep code quality audit, or especially harsh maintainability review.
disable-model-invocation: true
---

# Code quality review

Read [review subject](../_shared/roles/review-subject.md). Audit only defects
introduced or aggravated by the frozen whole PR; use the caller's exact
base/head for an explicitly local audit. Collect evidence and report only.

Trace each changed responsibility through its actual consumers. Assess:

- Ownership: one decision has one owner; existing primitives and layer seams
  are used, with no unjustified cross-layer exception.
- Interfaces: current callers need the exports/abstractions; deep interfaces
  hide work without dumping configuration or branching onto every caller.
- Control flow: state, branches and error paths are readable and bounded;
  a simplification removes real complexity without changing required behavior.
- Cohesion: repeated decisions have a justified shared home; separation
  follows ownership, not an arbitrary file/line limit. Large coherent tests
  need a demonstrated readability/ownership benefit before splitting.
- Maintenance: no scaffolding, speculative compatibility, dead path or
  workaround survives without a present consumer or constraint.
- Evidence: tests discriminate meaningful failures at the lightest sufficient
  layer and preserve required negative/security/concurrency coverage.

File a finding only with a concrete maintenance or correctness consequence,
location, evidence and smallest sufficient correction. Metrics identify
where to inspect; size alone is not a defect. Finish independent review
before reading PR discussion for attribution/deduplication. Return the
shared verdict and calibrated findings; do not force findings or edits.
