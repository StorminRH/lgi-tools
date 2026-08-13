# Session as-built schema

This file is the canonical form for LGI.tools session as-built records. An
as-built is the finalized record of what one executed session actually
delivered. The contract and plan are frozen starting prompts; the as-built is
the forward record species that closes them out after in-session reshaping.
It is written once at session close, never reopened, and archived with the
version bundle beside the contract and plan pairs.

Record only what the next planning agent cannot recover from the code, the
plan, or the changelog. A session that shipped exactly per plan produces a
near-empty record. `None.` is the expected value for sections with nothing to
report. Do not restate the diff or duplicate changelog content.

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
- `PR` is the delivering PR's `#<number>`, written once that PR exists — on
  the final session, and on every session in a sub-version whose effective
  delivery unit is one PR per session. A per-session declaration on any indexed
  contract applies to the whole sub-version so later operator-added splits do
  not require edits to prior frozen contracts. A non-final session under the
  one-sub-version-PR delivery unit writes `Deferred to <final session id>`
  instead. The PR number plus Delivered outcome make the record a complete
  devlog reference without git-history archaeology.
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

Use this exact four-field item for every divergence:

```markdown
- **Plan statement:** <plan or contract statement and identifier>
  **Built instead:** <delivered behavior or interface>
  **Why:** <concise reason>
  **Authority:** Operator: <direction> | Evidence: <source or observed limit>
```

The authority value begins with exactly `Operator:` or `Evidence:`. An as-built
cannot invent authority after the fact; it records `Operator:` or `Evidence:`
authority that existed during execution, including material interface or
architecture substitutions settled by in-session discussion. `None.` when
execution matched the plan.

## Final surfaces

The exported interfaces, endpoints, schemas, or documents this session
created or materially changed — repository path plus a one-line
responsibility each. A map for the next planner, not prose duplicating the
code. `None.` when the session changed no durable surface worth mapping.

## Discovered work

Work found during execution and deliberately not done. Prefer absorbing
corrections in-session; backlog or later-session cuts are extremely rare and
operator-driven. When present, each item names where it went: a `[Backlog]`
GitHub Issue with its number or canonical URL, a named later session, or
dropped with the reason. `None.` when nothing was cut.

## Successor notes

Traps, non-obvious constraints, and looks-wrong-but-deliberate decisions the
next session must not relearn. `None.` when there are none.

## Verification summary

Use exactly one ordered line per plan criterion and one review receipt:

```markdown
- **SC-1:** `Passed` — <specific evidence covering every atomic proof row>
- **SC-2:** `Passed` — <specific evidence covering every atomic proof row>
- **Adversarial review:** Subject: <frozen identity>; Roles: <selected roles>; Runtime identity: requested=<requested selection>, observed=<observed identity or Not observable>; Verdict: <PASS, CLEAN, or CORRECTED>; Disposition: <accepted and rejected finding disposition>.
```

Every plan `SC-N` appears once, in order, and is `Passed`; grouped ranges and a
bare command or suite name are invalid. Close-out adversarial-review writes
`PASS`. Legacy `CLEAN` and `CORRECTED` remain accepted for earlier as-builts.
The review receipt records requested and observed runtime identity separately
and never infers one from the other. Structured criterion and review receipts
bind from session `4.0.2.2.1` onward; earlier as-built records remain a frozen
legacy exception under the resolver's execution-receipt floor.
