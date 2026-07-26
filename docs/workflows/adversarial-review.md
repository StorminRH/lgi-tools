# Adversarial-review procedure

Review one complete plan, implementation diff, or pull request with independent
models, verify every reported defect, and return one reconciled result plus one
executable fix prompt when work remains. Keep the review read-only.

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
2. One reconciled ledger containing only verified findings and explicit
   rejections.
3. When an actionable defect remains, exactly one fenced, self-contained prompt
   for the owning planning or implementation workflow.

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
     and patch SHA-256, and require the worktree to remain unchanged until both
     reviewers finish.
   - **PR:** record the repository, PR number, base SHA, and exact head SHA.
3. Map each plan outcome or logical change group to its direct request or owning
   lifecycle artifact. Stop if any group lacks authority.
4. Inventory only the source, tests, tooling, configuration, and prose relevant
   to the subject. Identify the highest-risk logical area for the execution
   reviewer.
5. Reuse supplied verification only when it names the frozen subject and still
   matches the repository's current command. Run a gate only when the invoking
   workflow authorizes it; otherwise record the evidence gap for verification.

Evidence: mode, stable subject identity, authority map, logical inventory,
highest-risk area, and current verification or an explicit not-run reason.

## 2. Build context-budgeted reviewer briefs

Write two fresh briefs to a temporary directory outside the repository. Both
briefs include:

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
the other reviewer's output, or the orchestrator's conclusions.

Keep the briefs surgical:

1. Never paste the repository, dependency trees, generated output, or the full
   contents of every changed file into a prompt. Supply paths, hashes, and
   logical inventories so reviewers retrieve relevant evidence with tools.
2. Give the **execution reviewer** the complete plan or change inventory, then
   assign one bounded primary scope:
   - in Plan mode, implementation feasibility, live-code assertions, ordered
     work, and verification proof;
   - in Diff or PR mode, the highest-risk logical area, its callers, contracts,
     and tests.
3. Give the **holistic reviewer** the complete subject identity and authority.
   Focus it on missing outcomes, cross-area contradictions, failure paths,
   behavior drift, and stale-prompt implementation.
4. Start fresh sessions. Do not resume an authoring session or carry unrelated
   conversation history into either review.

## 3. Run the independent model reviews

Run exactly these default reviews concurrently:

1. **Execution reviewer:** Cursor Composer 2.5 Standard, using the bounded scope
   above.
2. **Holistic reviewer:** Cursor Grok 4.5 Medium, covering the complete subject
   through targeted retrieval.

Both run through Cursor Agent in read-only mode, sandboxed, with structured
output. They are independent fresh model sessions even when the invoking agent
is Codex or Claude. Composer's narrower role and standard speed tier are
deliberate cost and context controls; do not replace the two defaults with a
fan-out of native subagents.

Treat each reviewer run as two turns in one Cursor session:

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

On the first Cursor run in a repository, allow workspace trust only through an
operator's interactive grant or the operator's explicit authorization to use
`--trust` for that single invocation. Never add the flag silently or infer
ongoing authorization from a prior run.

When both turns complete without a parseable verdict, diagnose the invocation
against the captured JSON, installed CLI help, and current primary documentation
before spending another run. Allow at most one diagnosed rerun per reviewer
seat. If that rerun still produces no verdict, return `BLOCKED`.

Run at most one escalation review, and only when:

- the default reviewers disagree about a high-blast-radius claim;
- a security, identity, destructive-data, migration, concurrency, or public
  contract finding cannot be verified directly;
- the holistic reviewer reports that the complete subject exceeded reliable
  context; or
- the subject was authored primarily by one default model and the other
  reviewer cannot provide sufficient independent coverage.

Use Cursor Grok 4.5 High for that targeted escalation. If it cannot settle the
claim, return `BLOCKED` for an operator-approved frontier-model review rather
than silently spending Codex or Claude capacity. Do not escalate merely because
a default reviewer found an ordinary actionable defect.

Evidence: each model id, assigned role and scope, investigation and collection
completion states, collected verdict, and the exact escalation trigger or `Not
used`.

## 4. Verify and reconcile

The orchestrating agent must:

1. Personally inspect the highest-blast-radius owner before accepting reviewer
   conclusions.
2. Reproduce or disprove every reported failure against current source, primary
   documentation, tests, or observable behavior.
3. Deduplicate findings by root cause. Classify each accepted item exactly once
   as `BLOCKER`, `MAJOR`, or `MINOR`.
4. Reject false positives explicitly and preserve deliberate behavior in the
   rejection ledger.
5. Confirm the smallest correction remains within the invoking workflow's
   authority and does not create a second owner, widen a public surface, weaken
   a gate, or change an approved outcome.
6. Record which evidence a correction invalidates.
7. Recheck the subject identity. Any unaccounted change during review invalidates
   both verdicts and returns `BLOCKED`.

Return `CLEAN` only when no verified actionable finding remains and all required
evidence is current. Return `FIX_ROUND_REQUIRED` when at least one verified,
in-scope defect remains.

## 5. Build the fix prompt

For `FIX_ROUND_REQUIRED`, write exactly one fenced `text` block that an agent
with no conversation context can execute. Include:

1. repository, review mode, stable subject identity, authority, and intended
   outcome;
2. numbered corrections with exact locations, failure scenarios, and required
   end states;
3. the explicit rejected/do-not-change ledger;
4. focused checks and every invalidated gate to rerun; and
5. a stop condition for scope, architecture, authority, or subject drift.

Address the prompt to the owning planning or implementation workflow. Do not
authorize approval, commit, PR, merge, deployment, lifecycle mutation, or
outward action.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Adversarial review: `CLEAN` | `FIX_ROUND_REQUIRED` | `BLOCKED`

- **Mode:** Plan | Diff | PR
- **Subject:** <paths and digest, diff identity, or PR and exact head>
- **Authority:** <direct request or owning artifacts>

### Review evidence

- **Verification:** <current commands/results or explicit not-run reason>
- **Execution reviewer:** <model, bounded scope, and verdict>
- **Holistic reviewer:** <model, complete-subject verdict>
- **Escalation:** <model, trigger, and verdict or Not used>
- **Load-bearing checks:** <verified properties that held>

### Findings

- **Accepted:** <numbered severity ledger or None>
- **Rejected:** <finding and reason or None>
- **Invalidated verification:** <checks a correction must rerun or None>

### Fix prompt

<one fenced text block or Not required>

### Next state

- **Handoff:** <owning planning/implementation workflow or operator action>
- **Blocker:** <exact blocker or None>
```
