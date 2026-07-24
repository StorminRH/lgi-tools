# Agent-policy-audit procedure

Audit and, when authorized, reconcile LGI.tools guidance that controls coding
agents. Review canonical guides, workflow procedures, artifact schemas, runtime
adapters, hooks, manifests, and mechanical policy checks as one system. Optimize
for reliable agent execution; do not preserve prose or formatting merely for a
human-facing presentation.

This is ordinary task-scoped work. Never invoke the lifecycle resolver, edit
roadmap/session state, run release consistency, bump `APP_VERSION`, or publish a
version heading.

## Execution contract

Inputs:

1. The operator's requested audit or repair boundary.
2. Current `main` plus every explained local commit and worktree change in that
   boundary.
3. `AGENTS.md`, `src/AGENTS.md`, `docs/AGENT_TOOLING.md`,
   `.agent-local/policy-manifest.json`, and the complete canonical workflow,
   schema, and paired-skill inventories derived from them.
4. Current primary documentation for the supported skill and runtime formats.

Modes:

- `REVIEW_ONLY` when the operator requested findings without edits.
- `REPAIR` when the operator requested correction, reconciliation, drafting, or
  synchronization.

Outputs:

1. One result using the exact form under **Return the result**.
2. A complete finding ledger with evidence and disposition.
3. In `REPAIR`, one coherent diff that fixes canonical owners before runtime
   adapters and leaves the operator a complete file-review inventory.

Stop with `BLOCKED` when local changes have unknown provenance, authority is
insufficient for a material policy decision, two canonical owners conflict, or
a required current runtime cannot be inspected. Do not commit, push, open a PR,
merge, deploy, or mutate external state.

## 1. Establish current truth and the audit surface

1. Confirm the current branch, refresh `origin/main`, and prove the relationship
   between local `HEAD` and current main. Preserve all explained local work.
2. Read the required preflight documents. Use Codegraph before repository-wide
   text search when ownership or executable relationships are unfamiliar.
3. Read the selected skill-authoring and documentation-retrieval instructions.
   Verify current runtime CLI options directly when an adapter embeds them.
4. Build the inventory from live sources rather than a remembered file list:
   - canonical guides and procedures in `policy-manifest.json`;
   - every `docs/workflows/schema/*.md` artifact owner;
   - both skill roots and every `SKILL.md`;
   - Claude import adapters and Codex `agents/openai.yaml` metadata;
   - policy hooks, reconciliation ledger, drift checker, and its fixtures; and
   - any changed public document whose claims intersect the policy change.
5. Compare the inventory with the merge-base diff and recent policy history so
   newly added surfaces cannot bypass the audit.

Evidence: branch/base/head SHAs, worktree disposition, documentation sources,
and counted inventories by category.

## 2. Audit agent-facing execution quality

Review every canonical guide, procedure, and schema against these checks:

1. **Audience:** Write direct instructions to an executing agent. Remove
   checklist decoration, motivational explanation, and developer-oriented
   onboarding that does not change agent behavior.
2. **Authority:** State the allowed reads, writes, outward actions, destructive
   actions, and required operator pauses. Never let an adapter broaden the
   canonical procedure.
3. **Inputs and outputs:** Name required inputs, terminal outcomes, blocker
   conditions, evidence, and the exact chat result. Apply
   `docs/workflows/schema/chat-result.md` to every workflow output.
4. **Order and ownership:** Put each rule in one canonical owner, keep phases in
   executable order, and replace duplicated policy with a pointer. Schemas own
   exact forms; workflows own behavior; adapters own runtime mechanics only.
5. **Executability:** Verify command names, flags, paths, environment variables,
   and installed versions. Do not place angle-bracket placeholders where a shell
   interprets redirection. Use task-specific variables for resolved values.
6. **Truth:** Resolve repository paths against the current tree. Validate
   concrete data-backed examples against current data, or remove the unstable
   example and require runtime resolution.
7. **Formatting:** Keep headings, lists, fences, line breaks, and result blocks
   structurally valid. Correct objective spelling and grammar without changing
   an intentional policy choice.
8. **Conflict scan:** Reconcile the guide, workflow, schema, adapter, and
   mechanical checker when any two would drive different actions.

Record every file as `PASS`, `FIX`, or `BLOCKED`; a global statement that the
documents look consistent is not evidence.

## 3. Audit paired skills and runtime behavior

For every paired skill:

1. Confirm the frontmatter contains only `name` and `description`; make the
   description state both capability and concrete invocation triggers.
2. Confirm each adapter points to exactly one canonical procedure and contains
   only invocation authority, native runtime mechanics, and return rendering.
3. Compare Codex and Claude behavior for parity without forcing verbatim text.
   Verify task, subagent, background-process, sandbox, and CLI instructions
   against the current runtime.
4. Confirm the Codex skill has appropriate `agents/openai.yaml` metadata when it
   is directly user-invocable.
5. Confirm a new workflow and both adapters join every applicable manifest,
   prose-ownership, reconciliation, required-path, and fixture check.

Evidence: one parity verdict per skill and the exact runtime-specific difference
for every non-identical pair.

## 4. Repair in owner order

In `REPAIR` mode:

1. Fix canonical guide, procedure, or schema text first.
2. Fix the mechanical owner or checker that allowed the regression.
3. Update both runtime adapters to the corrected shared behavior.
4. Add or update fixtures that fail on the original regression and pass on the
   corrected state.
5. Re-read every affected adapter against its full dependency set before
   restamping reconciliation hashes.
6. Leave frozen roadmap, contract, plan, and as-built records unchanged. Report
   historical examples that are now stale; do not rewrite them as live policy.

Pause for operator direction instead of choosing between materially different
authority, delivery, lifecycle, or product-policy outcomes.

## 5. Validate the repaired system

Run the narrow checks first, then the aggregate policy gates:

1. Validate every changed Codex `SKILL.md` with the current skill validator.
2. Run the focused drift-checker fixtures.
3. Run `python3 .agent-local/check_doc_refs.py --root .` and classify warnings
   from frozen historical records separately from live-policy failures.
4. Run `python3 .agent-local/reconcile_skill_ledger.py` only after the paired
   skill re-review is complete.
5. Run `python3 .agent-local/check_agent_drift.py`. Its ordinary mode must not
   invoke the lifecycle resolver or release-consistency checker.
6. Run `git diff --check` and inspect the complete diff for policy changes not
   represented in the finding ledger.

Do not run `pnpm verify` for a prose-only policy repair unless executable
application or verification code changed. If executable Python policy tooling
changed, run its focused tests and any repository gate that actually consumes
that code.

## Return the result

Format this exact field set under
`docs/workflows/schema/chat-result.md`:

```markdown
## Agent policy audit: `CLEAN` | `REPAIRED` | `BLOCKED`

- **Mode:** Review only | Repair
- **Base and head:** <full SHAs>
- **Surface:** <counted guides, workflows, schemas, skills, and policy tools>

### Audit evidence

- **Agent-facing procedures:** <PASS/FIX/BLOCKED summary>
- **Paired skills:** <parity and runtime summary>
- **Mechanical rails:** <manifest, checker, and fixture summary>
- **Documentation truth:** <path, command, and concrete-example summary>

### Findings and changes

- **Findings:** <numbered ledger with disposition or None>
- **Changed files:** <complete operator-review list or None>
- **Validation:** <commands and results or Not reached>

### Next state

- **Operator review:** <complete file list ready for review, Not required, or
  blocked>
- **Handoff:** <manual review, corrective decision, or owning workflow>
- **Blocker:** <exact blocker or None>
```
