---
name: no-comments
description: "Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints."
disable-model-invocation: true
---

# Comment cleanup

Use [agent calls](../_shared/agent-calls.md). Launch `comment-sicko` with
the bounded working-tree or GitHub PR subject and authority. The seat is
report-only; the parent applies accepted in-scope edits. Complete this pass
before delivery freeze.

1. Require each candidate to identify the comment, cause, concrete reason
   and smallest correction. Check evidence for keep/delete decisions.
2. Apply supported removals and in-scope root-cause fixes. Preserve required
   markers, licenses and intentional negative-test suppressions. For a
   non-obvious constraint, retrieve only evidence necessary to decide.
3. A material constraint remains visible until an approved replacement
   exists. Present a required behavior/architecture decision to the operator;
   do not infer approval from ambiguity or delete the unresolved constraint.
   Out-of-scope redesign remains a named issue, not authority to widen work.
4. Select affected proof through
   [verification](../../../docs/workflows/verification.md). Reuse applicable
   evidence after prose-only changes; no unconditional suite rerun.

Return accepted removals/fixes, retained constraints with reasons, proof and
open decisions. Missing required seat/evidence is `BLOCKED`. The parent
reviews the result; it never defers correctness judgment to a persona.
