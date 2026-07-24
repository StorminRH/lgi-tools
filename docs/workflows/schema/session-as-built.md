# Session as-built schema

This file is the canonical form for LGI.tools session as-built records. An
as-built is the finalized record of what one executed session actually
delivered. The contract and plan are frozen prompts; the as-built is the
record species that closes them out. It is written once at session close,
never reopened, and archived with the version bundle beside the contract and
plan pairs.

Record only what the next planning agent cannot recover from the code, the
plan, or the changelog. Aggressive brevity is the standard: a session that
shipped exactly per plan produces a near-empty record, and `None.` is the
expected value for sections with nothing to report. Do not restate the diff,
narrate chronology, or duplicate changelog content.

An as-built record starts with this frame:

```markdown
# Session X.Y.N.M As-Built — Title

**Record status:** Final
**Recorded:** YYYY-MM-DD
**Contract:** `docs/session-contracts/X.Y/X.Y.N.M.md`
**Contract digest:** `sha256:<64 lowercase hexadecimal characters>`
**Plan:** `docs/session-plans/X.Y/X.Y.N.M.md`
**Plan digest:** `sha256:<64 lowercase hexadecimal characters>`
**Branch:** `lifecycle/X.Y.N`
**PR:** `#NNN`
**Record standard:** `docs/workflows/schema/session-as-built.md`
```

The marker values are closed vocabularies:

- `Record status` is exactly `Final`.
- `Recorded` is the authoring date in `YYYY-MM-DD` form.
- `Contract` and `Plan` are the repository-relative paths of the session's
  frozen prompts; the digests are the lowercase SHA-256 of each file's exact
  bytes, prefixed with `sha256:`. Author the record only after close-out has
  set the plan's final `Execution status`, so the digests seal the prompts'
  terminal bytes and any later edit to either prompt is mechanically visible.
- `Branch` is the sub-version's deterministic lifecycle branch.
- `PR` is `#<number>` — the session's own PR, written once that PR exists.
  The PR number plus Delivered outcome make the record a complete devlog
  reference without git-history archaeology.
- `Record standard` is exactly `docs/workflows/schema/session-as-built.md`.

The record lives at `docs/session-as-built/X.Y/<session>.md`. Every record
contains each following `##` heading exactly once in this order, with no
`###` subsections. Every section is non-empty; `None.` is a complete and
valid body.

## Delivered outcome

One short plain-English paragraph: what exists now that did not before, in
behavior terms. This is the general summary an operator can lift directly
into a devlog entry.

## Divergences from plan

One list item per divergence: the plan or contract statement (name its
identifier where one exists), what was built instead, why, and the authority
(operator direction or discovered evidence). `None.` when execution matched
the plan.

## Final surfaces

The exported interfaces, endpoints, schemas, or documents this session
created or materially changed — repository path plus a one-line
responsibility each. A map for the next planner, not prose duplicating the
code. `None.` when the session changed no durable surface worth mapping.

## Discovered work

Work found during execution and deliberately not done, each item naming
where it went: backlog, a named later session, or dropped with the reason.
`None.` when nothing was discovered.

## Successor notes

Traps, non-obvious constraints, and looks-wrong-but-deliberate decisions the
next session must not relearn. `None.` when there are none.

## Verification summary

The plan's `SC-N` identifiers, each with one line of pass evidence. A
criterion the session legitimately did not reach names why instead.
