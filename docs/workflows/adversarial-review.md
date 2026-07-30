# Adversarial-review procedure

Review one complete plan, implementation diff, or pull request with fresh,
independent native subagents. Keep the review read-only, verify every reported
defect, and return one concise reconciled result.

Planning workflows may invoke **Plan mode** before approval. `close-out` invokes
**Diff mode** before its final definition-of-done checkpoint. An operator may
invoke any mode on demand. This procedure does not replace
`pre-pr-design-review`, external PR review, implementation, approval, or
delivery.

## Execution contract

Select exactly one review mode:

- **Plan:** one complete draft plan plus its authority, schema, source evidence,
  and content digest.
- **Diff:** one complete committed diff or stable working-tree snapshot plus its
  base, authority, changed-surface inventory, and available verification.
- **PR:** one pull request at an exact head SHA plus its complete diff,
  authority, description, review context, and available verification.

Return `BLOCKED` when the subject is incomplete or changes during review,
authority is ambiguous, native subagents are unavailable, a selected reviewer
does not return a verdict, or load-bearing evidence cannot be established.
This procedure grants no edit, approval, commit, PR, merge, deployment,
lifecycle, or outward-action authority.

## Review rules

- Judge the subject against live behavior, repository policy, current primary
  documentation, and its authorized outcome.
- Test plans for decision completeness, ownership, sequencing, failure
  behavior, and command-plus-observable proof.
- Test diffs and PRs for behavior, cross-file consistency, failure paths,
  contracts, tests, and justified divergence from approved plans.
- Require every finding to name a location, violated invariant, concrete
  failure scenario, and smallest sufficient correction.
- Preserve deliberate behavior by recording rejected findings and why they
  must not be changed.
- Reviewer agreement raises confidence but never replaces direct verification.

Severity is assigned by production impact, not by wording, model confidence, or
the existence of a mechanical gate:

- `BLOCKER` — accepting the subject creates a credible security, identity,
  destructive-data, deadlock, resource-exhaustion, unbounded-availability, or
  comparably high-blast-radius failure.
- `MAJOR` — incorrect behavior, ownership, boundary placement, failure handling,
  or structural design must be corrected before acceptance, but the remedy and
  blast radius are bounded.
- `MINOR` — a localized contract, comment, evidence, or test gap should be
  corrected but does not invalidate the primary design or required runtime
  behavior.

A mechanical gate failure alone does not make a finding `BLOCKER`. Top-level
`BLOCKED` means the review cannot establish a trustworthy verdict; it is not a
finding severity.

Findings must be established by the frozen subject or a cited live source.
Reconcile every authorized outcome and complete inventory item before returning,
then verify, deduplicate, and severity-calibrate every candidate finding.
Missing non-load-bearing evidence is a stated gap or unknown, not an assumed
defect; missing load-bearing evidence returns top-level `BLOCKED`.

Return exactly one verdict contract. Keep discovery and exploratory reasoning
inside the isolated reviewer context; append no extra analysis to the contract.

## 1. Freeze the subject and evidence

1. Record the mode, authority, repository, and operator emphasis.
2. Freeze the subject:
   - for a plan, record every reviewed path and its SHA-256 digest;
   - for a committed diff, record the full base and head SHAs;
   - for a working-tree diff, store the complete patch and untracked inventory
     outside the repository, record the base and patch digest, and require the
     worktree to remain unchanged; or
   - for a PR, record the repository, PR number, base SHA, and exact head SHA.
3. Map every outcome or logical change group to its authority. Stop when one is
   unowned.
4. Inventory the relevant source, tests, tooling, configuration, and prose.
5. Record current verification or an explicit not-run reason.

## 2. Select independent review roles

Choose one holistic role and one to three bounded scoped roles:

- use one scoped role for a small cohesive subject;
- use two for two materially distinct risks;
- prefer three for a broad or cross-cutting subject with three distinct areas;
- never add a role that duplicates another role's primary investigation.

Use the portable reviewer vocabulary when it fits the subject:

- select `architecture-reviewer` for interface depth, ownership, boundaries,
  or structural pressure;
- select `interface-reviewer` for changed user-facing behavior,
  accessibility, or design-system conformance; and
- select a task-specific security, identity, data-integrity, concurrency, or
  other role when that risk is more material.

Do not select a reviewer merely because its global definition exists. A
reviewer used during pre-PR design review must still be launched as a fresh
subagent here when its scope is selected.

Role count expresses coverage. Concurrency expresses harness capacity. If the
harness cannot run every selected role concurrently, queue them without
combining roles or reducing independence.

Every brief must include the stable subject identity, authority, operator
emphasis, applicable review rules, read-only instructions, current evidence,
and this response contract:

```text
Verdict: CLEAN | FINDINGS

Findings:
1. [BLOCKER|MAJOR|MINOR] path-or-section — violated invariant; concrete
   failure scenario; smallest sufficient correction.

Load-bearing checks that held:
- path, section, or behavior — evidence.
```

Require `Findings: None` for a clean review. Give each scoped reviewer the full
inventory plus one non-overlapping primary scope. Give the holistic reviewer
the complete subject and focus it on missing outcomes, cross-area
contradictions, failure paths, and stale assumptions. Do not disclose expected
defects, another reviewer's output, or the parent agent's conclusions.

Pass paths, symbols, hashes, and the logical inventory instead of raw discovery
logs or copied source. Require the final verdict to stay compact; the
reviewer's exploratory transcript remains isolated from the parent context.

## 3. Launch native subagents

Launch one fresh native subagent for every selected role. Use the active
harness's native delegation mechanism and isolate each reviewer from the
authoring conversation and other verdicts. Reviewers may inspect the repository
and run read-only diagnostics but may not edit files, communicate externally,
or broaden authority.

Collect structured verdicts from every selected role. Allow one diagnosed
retry when a reviewer fails to return the required format. A second failure
returns `BLOCKED`.

Render one compact receipt before triage:

```markdown
| Reviewer role | Assigned scope | Reported |
|---|---|---:|
| Holistic | Complete subject | <severity counts or Clean> |
| Scoped 1 | <scope> | <severity counts or Clean> |
```

Do not quote or enumerate raw reviewer findings before reconciliation.

## 4. Collect structured verdicts

Confirm each verdict belongs to the frozen subject and contains the required
evidence. Reject unsupported preferences. Deduplicate reports by root cause,
but retain the source roles in review-local evidence.

If reviewers disagree about a security, identity, destructive-data, migration,
concurrency, or public-contract claim, first settle it from source, primary
documentation, tests, or observable behavior. If direct evidence cannot settle
it, return `BLOCKED` for operator direction. Do not silently add an external
reviewer or a product-specific model lane.

## 5. Verify and reconcile

The parent agent must:

1. personally inspect the highest-blast-radius owner;
2. reproduce or disprove every reported failure;
3. classify each accepted root cause once as `BLOCKER`, `MAJOR`, or `MINOR`;
4. record false positives and deliberate do-not-change decisions;
5. confirm the smallest correction remains within authority;
6. record verification invalidated by each correction; and
7. recheck the subject identity.

Return `CLEAN` only when no verified actionable finding remains and all
required evidence is current. Return `CORRECTIONS_REQUIRED` when at least one
verified in-scope defect remains.

## Return the result

Apply `docs/workflows/schema/chat-result.md` to this exact field set:

```markdown
## Adversarial review: `CLEAN` | `CORRECTIONS_REQUIRED` | `BLOCKED`

- **Mode:** Plan | Diff | PR
- **Subject:** <paths and digest, diff identity, or PR and exact head>
- **Authority:** <direct request or owning artifacts>

### Review evidence

- **Verification:** <current commands/results or explicit not-run reason>
- **Selected roles:** <holistic plus one-to-three scoped roles and reason>
- **Execution:** <native subagent completion states>
- **Load-bearing checks:** <verified properties that held>

| Reviewer role | Assigned scope | Reported |
|---|---|---:|
| <role> | <scope> | <severity counts or Clean> |

### Triage

- **Disposition:** <reported count to accepted, rejected, and deduplicated root causes>

| Severity | Location | Verified correction |
|---|---|---|
| <severity> | <subject location> | <smallest sufficient correction> |

- **Rejected:** <do-not-change reasons or None>
- **Invalidated verification:** <checks a correction must rerun or None>

### Next state

- **Caller action:** <continue, correct accepted root causes, or operator action>
- **Review rerun:** <material-change trigger or Not required>
- **Blocker:** <exact blocker or None>
```
