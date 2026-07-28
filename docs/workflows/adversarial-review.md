# Adversarial-review procedure

Review one complete plan, implementation diff, or pull request with independent
models, verify every reported defect, and return one concise reconciled result.
Keep the review read-only.

Planning workflows may invoke **Plan mode** before approval. `close-out` invokes
**Diff mode** before its final definition-of-done checkpoint. An operator may
invoke any mode on demand. This procedure does not replace
`pre-pr-design-review`, the external PR-review gate, implementation, approval,
or delivery.

## Execution contract

Select exactly one review mode:

- **Plan:** one complete draft plan plus its authority, schema, source evidence,
  and content digest.
- **Diff:** one complete committed diff or a stable working-tree snapshot plus
  its base, authority, changed-surface inventory, and available verification.
- **PR:** one pull request at an exact head SHA plus its complete diff,
  authority, description, review context, and available verification.

Required outputs:

1. One result using the exact form under **Return the result**.
2. One compact reconciled ledger containing only verified root causes and the
   explicit rejections needed to preserve deliberate behavior.

Return `BLOCKED` when the subject is incomplete or changes during review, its
authority is ambiguous, the required Cursor reviewers cannot run, or evidence
needed to verify a load-bearing claim cannot be established. A red gate is a
finding when its cause is in the subject; it is a blocker only when the
orchestrator cannot diagnose or attribute it. This procedure grants no edit,
approval, commit, PR, merge, deployment, lifecycle, or outward-action
authority.

## Review rules

- Judge the subject against live behavior, repository policy, current primary
  documentation, and its authorized outcome. Treat contracts and plans as
  frozen prompts whose live-code claims still require verification.
- For a plan, test decision completeness, authority, ownership, sequencing,
  failure behavior, and command-plus-observable proof. Do not invent product
  scope or redesign an approved outcome.
- For a diff or PR, test behavior, cross-file consistency, failure paths,
  contracts, tests, and divergence from the approved plan. Record a technically
  sound divergence as justified rather than regressing live code to stale prose.
- Require every finding to name a subject location, violated contract or
  invariant, concrete failure scenario, and smallest sufficient correction.
  Unsupported preferences are not findings.
- Preserve deliberate behavior by recording rejected findings with the exact
  reason they must not be changed.
- Independent model agreement raises confidence but never replaces source,
  test, documentation, or observable-behavior verification.

## 1. Freeze the subject and evidence

1. Record the mode, authority, repository, and operator emphasis.
2. Freeze the review subject:
   - **Plan:** record every reviewed path and its SHA-256 digest.
   - **Committed diff:** record the full base and head SHAs.
   - **Working-tree diff:** write the complete tracked patch and untracked-file
     inventory to temporary storage outside the repository, record the base SHA
     and patch SHA-256, and require the worktree to remain unchanged until all
     selected reviewers finish.
   - **PR:** record the repository, PR number, base SHA, and exact head SHA.
3. Map each plan outcome or logical change group to its direct request or owning
   lifecycle artifact. Stop if any group lacks authority.
4. Inventory only the source, tests, tooling, configuration, and prose relevant
   to the subject. Rank the logical areas by risk for Composer scope selection.
5. Reuse supplied verification only when it names the frozen subject and still
   matches the repository's current command. Run a gate only when the invoking
   workflow authorizes it; otherwise record the evidence gap for verification.

Evidence: mode, stable subject identity, authority map, logical inventory,
highest-risk area, and current verification or an explicit not-run reason.

## 2. Select scopes and build context-budgeted reviewer briefs

Choose one to three bounded Composer scopes from the logical inventory:

- Use one for one small cohesive subject.
- Use two when two materially distinct areas or risk classes exist.
- Prefer three whenever the subject has at least three meaningful areas, is
  cross-cutting, or is otherwise broad enough to give every seat a distinct
  investigation.
- Never add a seat that would merely repeat another Composer's primary scope.

Freeze the selected count and scopes before launch. Once selected, every seat is
required; a failed seat does not retroactively justify a smaller review.

Write one fresh Grok brief and one fresh brief per selected Composer scope to a
temporary directory outside the repository. Every brief includes:

- the absolute repository path, review mode, stable subject identity, authority,
  and operator emphasis;
- the applicable review rules above;
- read-only instructions and a Codegraph-first investigation requirement;
- current verification evidence; and
- this required response:

```text
Verdict: CLEAN | FINDINGS

Findings:
1. [BLOCKER|MAJOR|MINOR] path-or-section — violated invariant; concrete
   failure scenario; smallest sufficient correction.

Load-bearing checks that held:
- path, section, or behavior — evidence.
```

Require `Findings: None` for a clean review. Do not disclose expected defects,
another reviewer's output, or the orchestrator's conclusions.

Keep every brief surgical:

1. Never paste the repository, dependency trees, generated output, or the full
   contents of every changed file into a prompt. Supply paths, hashes, and
   logical inventories so reviewers retrieve relevant evidence with tools.
2. Give each **Composer reviewer** the complete plan or change inventory, then
   assign its one non-overlapping bounded primary scope:
   - in Plan mode, implementation feasibility, live-code assertions, ordered
     work, and verification proof;
   - in Diff or PR mode, the highest-risk logical area, its callers, contracts,
     and tests.
   Partition those concerns according to the subject instead of assigning fixed
   generic roles that do not fit the change.
3. Give the **Grok reviewer** the complete subject identity and authority.
   Focus it on missing outcomes, cross-area contradictions, failure paths,
   behavior drift, and stale-prompt implementation.
4. Start fresh sessions. Do not resume an authoring session or carry unrelated
   conversation history into any review.

## 3. Run the independent model reviews

Run the selected reviews concurrently:

1. **Scoped reviewers:** one to three independent Cursor Composer 2.5 Standard
   sessions, each using one frozen bounded scope.
2. **Holistic reviewer:** one Cursor Grok 4.5 High session covering the complete
   subject through targeted retrieval.

All seats run through Cursor Agent in read-only mode, sandboxed, with structured
output. They are independent fresh model sessions even when the invoking agent
is Codex or Claude. Composer's narrower roles and standard speed tier are
deliberate cost and context controls. Do not replace or supplement these Cursor
seats with native Codex or Claude subagents.

Treat every reviewer seat as two turns in one Cursor session:

1. Run the plan-mode investigation and capture its complete JSON result,
   including `session_id`.
2. Resume that session once with this fixed collection prompt:

   ```text
   Return the review verdict now as plain text in the required format. Do not perform more investigation, edit files, or refer me to a plan artifact. Output only the Verdict, Findings, and Load-bearing checks sections.
   ```

The collection turn's JSON `result` text is the verdict of record. Some models
write their verdict into a plan artifact instead of the initial transcript, so
a completed investigation alone is not evidence that the verdict was
collected.

After all selected verdicts are collected, render exactly one compact receipt
table before triage:

```markdown
| Reviewer | Assigned scope | Reported |
|---|---|---:|
| Grok 4.5 High | Holistic | <severity counts or Clean> |
| Composer 2.5 #1 | <scope> | <severity counts or Clean> |
```

Add one sentence that triage is beginning. Report only each seat's `CLEAN` state
or severity counts; do not quote, paraphrase, or enumerate its raw findings in
chat. The raw collected verdicts remain review-local evidence for the
orchestrator.

On the first Cursor run in a repository, allow workspace trust only through an
operator's interactive grant or the operator's explicit authorization to use
`--trust` for that single invocation. Never add the flag silently or infer
ongoing authorization from a prior run.

When either turn completes without a parseable result, diagnose the invocation
against the captured JSON, installed CLI help, and current primary documentation
before spending another run. Allow at most one diagnosed rerun per reviewer
seat. If that rerun still produces no verdict, return `BLOCKED`.

Do not launch a duplicate automatic escalation review after the default Grok
High seat. Treat these conditions as escalation triggers:

- the selected reviewers disagree about a high-blast-radius claim;
- a security, identity, destructive-data, migration, concurrency, or public
  contract finding cannot be verified directly;
- the holistic reviewer reports that the complete subject exceeded reliable
  context; or
- the subject was authored primarily by one selected model family and the other
  model family cannot provide sufficient independent coverage.

First attempt to settle the claim from current source, primary documentation,
tests, or observable behavior. If that evidence cannot settle it, return
`BLOCKED` for an operator-approved frontier-model review rather than silently
spending Codex or Claude capacity or rerunning the same Grok tier. Do not
escalate merely because a default reviewer found an ordinary actionable defect.

Evidence: selected seat count, each model id and scope, investigation and
collection completion states, compact reported counts, and the exact escalation
trigger and blocker or `Not used`.

## 4. Verify and reconcile

The orchestrating agent must:

1. Personally inspect the highest-blast-radius owner before accepting reviewer
   conclusions.
2. Reproduce or disprove every reported failure against current source, primary
   documentation, tests, or observable behavior.
3. Deduplicate findings by root cause. Classify each accepted item exactly once
   as `BLOCKER`, `MAJOR`, or `MINOR`.
4. Reject false positives explicitly. Keep the full working ledger
   review-local; carry a rejection into chat only when its concise do-not-change
   reason is needed to preserve deliberate behavior.
5. Confirm the smallest correction remains within the invoking workflow's
   authority and does not create a second owner, widen a public surface, weaken
   a gate, or change an approved outcome.
6. Record which evidence a correction invalidates.
7. Recheck the subject identity. Any unaccounted change during review invalidates
   every verdict and returns `BLOCKED`.

Return `CLEAN` only when no verified actionable finding remains and all required
evidence is current. Return `CORRECTIONS_REQUIRED` when at least one verified,
in-scope defect remains. In chat, list each accepted root cause once in a compact
table; never repeat findings by reviewer. The invoking workflow retains the
detailed review context and owns the correction directly.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Adversarial review: `CLEAN` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Mode:** Plan | Diff | PR
- **Subject:** <paths and digest, diff identity, or PR and exact head>
- **Authority:** <direct request or owning artifacts>

### Review evidence

- **Verification:** <current commands/results or explicit not-run reason>
- **Selected seats:** <one Grok plus one-to-three Composers and selection reason>
- **Escalation:** <model, trigger, and verdict or Not used>
- **Load-bearing checks:** <verified properties that held>

| Reviewer | Assigned scope | Reported |
|---|---|---:|
| <model and seat> | <scope> | <severity counts or Clean> |

### Triage

- **Disposition:** <reported count → accepted root causes, rejected reports, and deduplicated reports>

| Severity | Location | Verified correction |
|---|---|---|
| <severity> | <subject location> | <smallest sufficient correction> |

- **Rejected:** <concise do-not-change reasons needed to preserve deliberate behavior or None>
- **Invalidated verification:** <checks a correction must rerun or None>

### Next state

- **Caller action:** <continue, correct accepted root causes, or operator action>
- **Review rerun:** <material-change trigger or Not required>
- **Blocker:** <exact blocker or None>
```
