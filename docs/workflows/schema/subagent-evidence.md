# Subagent evidence forms

These forms are the context boundary between a native subagent and its parent.
The subagent keeps raw command output, broad file reads, and exploratory notes
in its own context. It returns only evidence that changes the parent's plan,
implementation, review, or verification.

Shared rules:

- Use repository-relative paths and exact symbols when available.
- Cite load-bearing evidence without pasting large source or tool output.
- State gaps instead of filling them from memory.
- Do not recommend unrelated work or claim authority beyond the assigned task.
- Keep each result under 800 tokens unless the parent explicitly requests more.

## Repository map

```text
Repository map:
- Scope: <assigned task and affected area>
- Owners: <path or symbol -> responsibility>
- Execution flow: <ordered entry points, calls, and state transitions>
- Impact: <callers, dependencies, registries, tests, and gates>
- Documentation questions: <technology, version, and question or None>
- Unknowns: <unresolved evidence gap or None>
- Evidence: <repository-relative paths and symbols>
```

Do not include raw Codegraph output, complete file inventories, or source
excerpts that the parent can retrieve from the cited location.

## Documentation evidence

```text
Documentation checked:
- <technology> <installed version> | <library ID or primary source> | <query>
  Constraint applied: <task-changing implementation or verification guidance>
- Confirmed unchanged: <relevant behavior that needs no plan change or None>
Documentation gaps: <exact unresolved gap or None>
```

Do not include raw Context7 output, long quotations, or general documentation
that cannot change the assigned task.

## Gate result

```text
Gate result:
- Command: <exact command>
- Exit: <code and pass or fail>
- Failure: <smallest actionable diagnostic or None>
- Artifacts: <generated or changed verification artifacts or None>
- Skipped: <check and reason or None>
- Next action: <rerun condition, caller diagnosis, or None>
```

The gate runner executes only commands supplied by the parent. It does not edit
source, select a different gate, fix failures, use Git write operations, or
perform external actions.
