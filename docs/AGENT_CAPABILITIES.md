# Agent capabilities

LGI.tools defines behavior in repository-owned guides and workflows. Agent
harnesses supply capabilities; they do not own repository policy. A different
application or model may perform the same work when it can satisfy the same
capability contract.

## Ownership model

- `AGENTS.md` and the nearest scoped `AGENTS.md` own shared instructions.
- `docs/workflows/` owns executable procedures.
- `docs/workflows/schema/` owns exact artifact and result forms.
- `tools/` owns deterministic repository automation.
- Global Agent Skills under `~/.agents/skills/` expose thin discovery and
  dispatch adapters or portable research procedures.
- Harness-native global agents are thin execution adapters. They supply an
  isolated context, model, permissions, and role description without owning
  repository policy.
- A harness-specific skills directory may link to the global skill directory
  when that harness does not discover `~/.agents/skills/` directly.

Repository checks validate these repository-owned contracts only. They do not
inspect machine-global applications, credentials, plugins, models, or skill
installations. Capability availability is established when a workflow needs
it, and a missing required capability returns a truthful blocker.

## Repository workflow skill map

| Global skill | Repository procedure |
|---|---|
| `start-session` | `docs/workflows/start-session.md` |
| `plan-version` | `docs/workflows/plan-version.md` |
| `plan-session` | `docs/workflows/plan-session.md` |
| `plan-version-audit` | `docs/workflows/version-audit.md` |
| `plan-audit-remediation` | `docs/workflows/version-audit.md` |
| `version-audit` | `docs/workflows/version-audit.md` |
| `close-out` | `docs/workflows/close-out.md` |
| `pre-pr-design-review` | `docs/workflows/pre-pr-design-review.md` |
| `adversarial-review` | `docs/workflows/adversarial-review.md` |
| `agent-policy-audit` | `docs/workflows/agent-policy-audit.md` |
| `triage-issue` | `docs/workflows/triage-issue.md` |
| `ux-check` | `docs/workflows/ux-check.md` |
| `update-watch` | `docs/workflows/update-watch.md` |
| `resolve-update-watch` | `docs/workflows/resolve-update-watch.md` |

Each mapped skill must contain portable `SKILL.md` frontmatter with only `name`
and `description`. Its body must locate the LGI.tools repository, read the
applicable `AGENTS.md`, read exactly one owning procedure from the table, and
follow that procedure literally. It must not duplicate workflow steps or grant
authority.

The portable `find-docs` and `map-codebase` skills are research procedures, not
lifecycle dispatch adapters. They may run in an isolated native subagent or in
the main context when delegation is unavailable. Their structured results
follow `docs/workflows/schema/subagent-evidence.md`.

## Capability contracts

### MCP and CLI selection

Prefer an official configured MCP for agent-facing reads and exploration when
it exposes the required behavior. Use the owning CLI for installation,
authentication, index or server maintenance, deterministic scripting, complete
output, recovery, and operations the MCP does not expose. A procedure that
names an exact command still owns that command.

MCP and CLI surfaces complement each other; neither changes repository policy
or grants authority. Choose one primary surface for an operation instead of
repeating the same work through both. If the preferred surface is unavailable,
use the documented fallback and report any remaining capability gap.

### Repository navigation and documentation

Agents need file search, code-relationship exploration, current primary
documentation retrieval, and local command execution.

Codegraph is installed and required for repository mapping. Prefer the harness
Codegraph MCP `codegraph_explore` tool when available; otherwise use the global
`codegraph` CLI. Confirm the executable and index with `command -v codegraph`
and `codegraph status` from the repository root, or with an explicit
repository-root path argument — status, sync, index, install, and other
maintenance commands remain CLI-only. The index lives in gitignored
`.codegraph/`; if a harness sandbox cannot open that directory, re-run
Codegraph CLI calls with unrestricted filesystem access. Use explore (MCP or
CLI) for unfamiliar flows; use the CLI for `query`, `callers`, `callees`,
`impact`, `affected`, and any other command the MCP surface does not expose.
If neither MCP nor CLI can reach a current index, report the blocker; do not
substitute text search.

The `find-docs` skill owns documentation research and its evidence form.
Prefer the official Context7 MCP when it is configured and authenticated; use
the `ctx7` CLI or current official primary documentation when the MCP is
unavailable or incomplete. Do not let a harness-generated rule or skill
replace the repository-owned procedure.

For unfamiliar or cross-cutting code, prefer a fresh read-only `repo-mapper`
subagent that invokes `map-codebase`. For every coding task, prefer a fresh
read-only `docs-researcher` subagent that invokes `find-docs`. The parent passes
only the task, authority, known scope, and required evidence form. The subagents
keep raw Codegraph, source, and documentation output in their own contexts and
return meaningfully compressed, non-redundant structured evidence containing
every material fact the parent needs.

If native subagents are unavailable, the parent runs the applicable skill
directly. A missing preferred subagent is not permission to skip Codegraph or
current documentation. The parent may inspect targeted source and verify
load-bearing claims after it receives the evidence packet; it does not repeat
the broad discovery work without a specific gap.

### Native subagents

Native subagents are available and encouraged when isolation or specialist
focus will materially improve research, verification, or review. Delegate a
complete bounded scope, avoid overlapping assignments, and keep integration,
edits, authorization, and final verification with the parent.

The portable role vocabulary is:

- `docs-researcher`: current primary documentation through `find-docs`;
- `repo-mapper`: repository ownership and execution paths through
  `map-codebase`;
- `gate-runner`: literal caller-supplied verification commands with complete
  command text, native exit evidence, compressed results, and no fixes;
- `architecture-reviewer`: repository design principles, deep-module
  interface depth, boundaries, and structural risk;
- `ownership-reviewer`: local decision ownership, dependency direction,
  primitive reuse, interface breadth, and semantic duplication;
- `reliability-reviewer`: demonstrated state transitions, cleanup,
  cancellation, resource release, concurrency, idempotency, timeouts, retries,
  degradation, and recovery;
- `contract-reviewer`: authority-to-outcome coverage, boundary contracts,
  authoritative shapes, cross-file consistency, and behavioral proof; and
- `interface-reviewer`: user-facing behavior, accessibility, interaction
  semantics, responsive behavior, and documented design-system conformance.

Role names describe capabilities, not a required application, model, or global
file layout. Harness-native definitions may select different models and
permission syntax while following the same repository-owned evidence and
authority contracts.

The parent owns orchestration. It supplies a bounded brief, receives only the
subagent's final structured result, verifies load-bearing conclusions, and
retains all decisions, edits, approval, and outward-action authority.

Adversarial review requires the active harness to create fresh, independent,
read-only reviewers. The parent selects distinct roles, supplies the frozen
subject, collects structured verdicts, and personally verifies every finding.
Reviewer roles and concurrency are separate decisions.

If native subagents are unavailable, the review returns `BLOCKED`. Do not
silently replace them with a product-specific command-line reviewer or an
unapproved external service.

### Authenticated and external tools

Authenticated CLIs, official MCPs, and app connections may remain user-level so
multiple harnesses can share them. Their presence, authentication, entitlement,
and scope are checked at the point of use. Missing credentials or a missing
integration blocks only the procedure that requires it.

GitHub, Vercel, Neon, and similar MCPs complement their CLIs but do not replace
exact workflow commands. Configure write-capable MCPs only with credentials and
project boundaries appropriate to their intended use. Keep development-only
integrations out of production data and projects.

External writes, reviews, deployments, and merges retain the authorization
rules in `AGENTS.md` and the owning workflow regardless of which harness
provides the capability.

## Repository commands

Use the visible dispatcher rather than internal module paths:

```bash
python3 tools/cli.py --help
python3 tools/cli.py policy check
python3 tools/cli.py policy check-all
python3 tools/cli.py test
```

The policy command is ordinary-task safe. It does not run the lifecycle
resolver, release consistency, tests, or machine-global capability checks.
Lifecycle workflows invoke their own stateful checks explicitly.

The three scripts retained under `.agent-local/` are compatibility entrypoints
for frozen historical artifacts. The historical drift entrypoint dispatches
`policy check-all`, which runs repository policy, fixture, and document checks
without lifecycle or machine-global state. New documentation and automation
must use `tools/cli.py`.

## Maintenance

When a guide, workflow, schema, hook, or global adapter changes:

1. update the canonical repository owner first;
2. keep global skills thin and portable;
3. update deterministic mechanics under `tools/`;
4. run `python3 tools/cli.py policy check`;
5. run `python3 tools/cli.py test`; and
6. run the repository definition of done required by the invoking workflow.

Do not restore paired repository skill trees or machine-global parity checkers.
Cross-harness portability comes from shared standards, global discovery, and
capability contracts, not mirrored implementations.
