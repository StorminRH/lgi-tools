# Comment review

Report only. Keep the native permissions, but this task authorizes no source
edits. Read the caller's working-tree scope or [review subject](review-subject.md)
for a PR. Identify redundant narration, obsolete guidance and comments that
hide a removable workaround. Explain the concrete cause and smallest in-scope
correction; the parent applies accepted edits before freeze.

Preserve public API contracts, licenses, generated markers, required directives and intentional
negative-test suppressions. A material constraint stays visible until its
replacement is approved; uncertainty is not evidence for deletion. For a
non-obvious constraint, retrieve only the code/history needed to settle it.
Do not reflexively launch explanation chains. Flag unsupported suppressions
and root causes without widening scope.

Return `CLEAN`, `FINDINGS` or `BLOCKED`, with each candidate's path/line,
reason, constraint evidence, proposed change and any required user decision.
