# Agent-policy audit procedure

Audit or repair LGI.tools shared automation policy across repository guides,
canonical workflows, schemas, visible tools, hooks, global skill contracts, and
drift checks. Ordinary-task procedure: never run the lifecycle resolver, change
lifecycle state, or authorize delivery.

## Authority and modes

Select one mode:

- **Report:** inspect and return findings without edits.
- **Repair:** make only the authorized policy and tooling changes, verify them,
  and stop with a local working tree for review.

Repository policy is the source of truth. Machine-global skill installations are
deployment targets, not policy owners. Editing or installing global skills
requires explicit operator authority.

## 1. Establish scope and owners

1. Read this procedure and any affected owning workflow or schema.
2. Record the operator's authority, requested outcome, allowed edit surface, and
   required pause.
3. Inventory: `AGENTS.md` / scoped guides / import-only harness guides;
   `docs/workflows/` and `docs/workflows/schema/`; `tools/`,
   `tools/policy/policy-manifest.json`, and tool tests; repository hook
   configuration; global skill names and their single procedure mappings; and
   transitional compatibility entrypoints under `.agent-local/`.
4. Classify every statement or check by its single owner. Stop on conflicting
   owners instead of blending them.

## 2. Audit the policy chain

For each affected workflow, trace:

```text
operator request
  -> global skill discovery
  -> repository guide
  -> canonical workflow
  -> exact schema
  -> deterministic tool
  -> verification and return result
```

Check that global skills are thin portable adapters with only `name` and
`description` frontmatter; each reads the applicable repository guide and
exactly one owning procedure; repository policy does not depend on a named
application or model; ordinary-safe policy checks do not inspect global
applications, credentials, plugins, models, or skill installations; lifecycle
state is read only by lifecycle workflows; frozen plans and as-built records
are not rewritten to modernize historical commands; and any retained
`.agent-local/` script is a thin compatibility entrypoint to `tools/cli.py`.

## 3. Repair from canonical owners outward

In Repair mode: (1) update the canonical guide, workflow, or schema first;
(2) update the manifest and visible tool implementation; (3) update tests and
hooks; (4) update global skills last, keeping them thin; (5) remove obsolete
mirrored adapters; and (6) preserve only the compatibility entrypoints required
by frozen artifacts.

Do not add a second policy owner. Do not commit, push, open a PR, merge, or
deploy unless the operator separately invokes the owning delivery procedure.

## 4. Validate

```bash
python3 tools/cli.py policy check
python3 tools/cli.py test
python3 tools/cli.py policy check-doc-refs --check --pretty
git diff --check
```

Never run the lifecycle resolver or release-consistency checker as part of this
ordinary policy audit.

## Return the result

Use `docs/workflows/schema/chat-result.md` with:

```markdown
## Agent-policy audit: `PASS` | `FINDINGS` | `BLOCKED`

- **Subject:** <Report or Repair>; <guides, workflows, tools, hooks, and global skills inspected>
- **Result:** <pass, finding count, or blocker summary; ≤2 sentences>
- **Action:** <smallest sufficient correction, local review required, or None>
- **Blocker:** <exact blocker or `None`>
```
