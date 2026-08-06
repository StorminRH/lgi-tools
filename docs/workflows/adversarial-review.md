# Adversarial-review procedure

Review one complete plan or implementation diff with independent subagents.
Verify every reported defect and return one concise reconciled result. Use
before a plan gate or opening a PR.

## Execution contract

One review round. Return `PASS`, `CORRECTIONS_REQUIRED`, or `BLOCKED`. Do not
auto-relaunch.

Return `BLOCKED` when a selected reviewer fails to return a verdict or
load-bearing evidence cannot be established.

Verify every accepted finding against
`docs/workflows/schema/reviewer-verdict.md`. Reviewer agreement is not proof.
Do not defer, backlog, or justify findings away — fix clear in-scope defects on
code, or report contested / out-of-scope / product-judgment items in chat.
Plan subjects are report-only.

**Design creed (code).** Prefer small deep interfaces, one owner per decision,
current callers only, edge cases absorbed below stable seams, behavior-preserving
refactors, and metrics as signals not design instructions.
`docs/CODE_HEALTH_BASELINE.md` owns hotspot state.

## 1. Freeze

1. Record authority, ordinary vs lifecycle, and any operator emphasis.
2. Freeze identity: plan path digests; or base/head SHAs; or working-tree base +
   patch digest (worktree stable until verdicts return); or PR + head SHA.
3. Stop if any logical change group lacks authority.
4. Inventory touched surfaces. Note verification status (or not-run). For code,
   note focused/UX proof gaps and added/changed exports (`Exports: none` if
   none).

## 2. Select roles

Launch each selected role once. Do not launch a role just because it exists.

| Context | Integrative seat (exactly one) |
| --- | --- |
| Ordinary / small one-off code | `primitive-checker` |
| Lifecycle plans, lifecycle close-out, other non-ordinary | `holistic-reviewer` |

Plans: integrative only, unless operator emphasis names one scoped seat.

Code: integrative + up to two scoped seats; a third only when three distinct
judgment risks are present. Prefer `ownership-reviewer` for `src/`/`convex/`
behavior, `interface-reviewer` for user-facing UI, then
`architecture-reviewer` / `contract-reviewer` / `reliability-reviewer` only when
that risk is the material one.

Brief each role with: frozen subject identity, authority, operator emphasis,
and current evidence. For a scoped seat, name the primary path/symbol slice.
Do not hint expected defects or share other reviewers' output.

## 3. Launch

Launch one subagent per selected role. One format retry; a second failure is
`BLOCKED`.

Keep a compact receipt for reconciliation (not chat). As-built Verification
summary needs requested and observed runtime identity separately — write
`Not observable` when unavailable; never invent observed identity:

```markdown
| Role | Scope | Requested runtime identity | Observed runtime identity | Reported |
|---|---|---|---|---|
| Integrative | Complete subject | <selection, inherit, or unspecified> | <identity or Not observable> | <counts or Clean> |
| Scoped 1 | <slice> | <selection, inherit, or unspecified> | <identity or Not observable> | <counts or Clean> |
```

Also record accepted and rejected finding disposition for the as-built
`Disposition` line.

Deduplicate by root cause. If reviewers disagree on security, identity,
destructive data, migration, concurrency, or public contract and evidence
cannot settle it, return `BLOCKED` and report the dispute in chat.

## 4. Verify

1. Reproduce or disprove every reported failure.
2. Accept or reject each root cause once (`BLOCKER` / `MAJOR` / `MINOR` per
   `reviewer-verdict.md`).
3. Report false positives and anything needing operator judgment in chat — do
   not bury them as deferrals or backlog entries.

Do not re-run a second discovery pass that duplicates selected seats. Use
design-creed red flags only as checks against reported findings.

**Plans:** `PASS` if clean; `CORRECTIONS_REQUIRED` if verified defects remain.
**Code:** continue to §5.

## 5. Fix and close (code)

Fix accepted in-scope findings on the branch. Re-check with the focused test
that covers the fix. If a fix would change product scope, architecture, or
policy, stop and report it in chat (`BLOCKED` or `CORRECTIONS_REQUIRED`).

Also confirm:

- changed `src/` / `convex/` exports carry required contract comments;
- new/changed behavior has behavioral tests (not coverage padding);
- no metric-only fragmentation or CRAP/complexity overrides;
- touched baseline hotspots stay truthful, or stop for operator decision.

If opening a PR, write a short `Design notes:` block for `## Notes` (owners,
deep/changed interfaces, any operator-approved boundary decision). Audit
remediation: name each mapped `AF-NNN` and how the shape meets it.
Handoff-only non-final sessions: omit Design notes.

## Return

```markdown
## Adversarial review: `PASS` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Subject:** <frozen identity>
- **Result:** <roles; clean or what remains; ≤2 sentences>
- **Action:** <continue, fix listed items, or operator decision>
- **Blocker:** <exact blocker or `None`>
```

`PASS` for code only when every accepted finding is fixed, nothing contested
remains in chat, and Design notes are ready when a PR will open. `PASS` does
not authorize opening the PR. As-built receipts may use
`**Adversarial review:**`.
