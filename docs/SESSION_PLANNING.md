# Session Planning (LGI.tools)

**Audience:** the agent designing a detailed implementation plan before code is
written.
**When invoked:** for every feature, non-trivial fix, or scheduled refactor whose
session contract does not yet have an approved current implementation plan.
**Constitution:** `docs/DESIGN_PRINCIPLES.md`.
**Current health:** `docs/CODE_HEALTH_BASELINE.md`.
**Lifecycle:** `docs/DEVELOPMENT_LIFECYCLE.md`.
**Output:** an approval-ready plan in chat and, after approval, one approved plan
under `docs/session-plans/X.Y/`.

The purpose is to move design judgment to before the code exists. Plan mode is
read-only: do not persist the plan or mutate the repository until Ryan approves
and the runtime returns to execution mode. Headless planning workers may help
author the plan under the routing in `AGENTS.md`; they never implement it or own
lifecycle judgment.

---

## Step 1 — Resolve the lifecycle and load context

1. Run `python3 .agent-local/resolve_development_state.py --pretty`.
2. Continue only when the directive names `plan-session` as its handler for the
   intended session. Otherwise report the directive and return control to
   `start-session`; this procedure never selects a sibling handler.
3. Read, in order:
   - `docs/DESIGN_PRINCIPLES.md` in full;
   - `docs/CODE_HEALTH_BASELINE.md` in full;
   - the active master plan's status, sequence, gates, and relevant decisions;
   - the selected session contract and its contract index;
   - `docs/SCRATCHPAD.md` and relevant `docs/backlog.md` entries;
   - the active agent-guide chain and relevant live code.
4. Use Graphify before broad source searches. Name the slices and Fallow zones
   the work lands in.
5. Verify moving library/framework behavior from current primary documentation.

The contract is product intent; live code is current fact. Report material
conflicts and stop for Ryan rather than planning through them.

Close Step 1 with the first plain-English checkpoint: after context is loaded
and before any Step 3+ design work, present the intended shape of the solution
in plain English and discuss the open shape-level decisions with Ryan. This
discussion happens before drafting; the design steps proceed from the shape
Ryan endorses.

## Step 2 — Check hotspot proximity

Use the **current hotspot table in `docs/CODE_HEALTH_BASELINE.md`**, then run a
quick live check for files the plan expects to touch:

```bash
wc -l <files>
grep -c "^export" <files>
git log --since="3 months ago" --name-only --pretty=format: -- <paths> \
  | sort | uniq -c | sort -rn | head -15
```

The rolling three-month window here is deliberately a **proximity lens** for
the files this plan will touch, and intentionally differs from
`docs/VERSION_AUDIT.md` Step 1's version lens (churn since the previous
baseline): planning measures current neighborhood risk, the audit measures a
version's accumulated pressure.

Decision rule:

- **Inside a hotspot:** begin with the smallest preparatory refactor that creates
  a clean seam for the requested behavior, with characterization tests first.
  Do not attempt the whole campaign unless the contract explicitly owns it.
- **Adjacent to a hotspot:** do not feed its public surface. No new
  `PricingContextValue` field, `auth/queries.ts` export, or `auth-surface` file.
- **Changing a measured hotspot surface:** the plan must include an explicit
  baseline-update step for the same change.

## Step 3 — Design interfaces before tasks

For every new module, hook, component, route contract, or export, answer in
writing:

1. What decision does it own and hide? (P2)
2. What is its complete public surface, and is that surface much simpler than
   the implementation? (P1)
3. Which slice/zone owns it, and do existing import rules permit the design?
4. Who are its real callers now? Remove speculative exports and parameters. (P4)
5. Which failures can be defined away, absorbed, or defaulted inside? (P5)
6. Which rationale or invariant cannot be expressed by the signature? (P7)

New leaf components remain presentational. Branching policy belongs in pure,
tested functions. Focused data hooks do not widen existing providers.

## Step 4 — Design it twice

For each non-trivial ownership decision, sketch two structurally different
decompositions. Compare:

- concepts a caller must learn;
- files a likely next change must touch;
- decisions each option hides or leaks;
- interaction with current hotspots and boundaries.

Choose the smaller public model. Record the rejected option and why in one
sentence; that is the seed for the owning rationale comment.

## Step 5 — Plan tests as design evidence

- Give every new or changed pure behavior a co-located behavioral test.
- Put characterization tests before restructuring under-tested behavior.
- Treat hard-to-test policy as evidence that side effects and decisions need a
  seam.
- Keep refactor steps behavior-preserving and separately reviewable from
  behavior steps.
- Do not add coverage padding.

## Step 6 — Resolve rail and boundary conflicts now

If the design needs a forbidden import, wider zone, threshold override, or
suppression:

- do not plan a workaround or copy;
- apply `DESIGN_PRINCIPLES.md` §4 explicitly;
- include every mirrored boundary/config/doc update in the same plan step;
- include the override or changed hotspot row in the baseline-update step;
- separate the rail change from behavior changes where reviewability requires
  it.

## Step 7 — Define the baseline effect

Classify the session plan as exactly one of the closed marker vocabulary
`Improves | Neutral | Temporary pressure`; the persisted plan records the
verdict in its `**Baseline effect:**` header marker (schema in
`docs/SESSION_CONTRACTS.md`):

- **Improves:** the session is expected to reduce a named hotspot surface,
  override, suppression, duplication entry, or change amplification.
- **Neutral:** the session protects all measured surfaces and does not widen a
  hotspot.
- **Temporary pressure:** a measured surface worsens for a documented reason and
  the same master version contains the bounded reconciliation step.

Metrics are evidence, not the design objective. Explain the architectural
effect using the constitution.

## Step 8 — Write the approval-ready plan

Use this fixed order:

1. **Goal** — one sentence in behavior terms.
2. **Contract and current state** — selected contract, reconciled prerequisites,
   and branch strategy.
3. **Slices/zones and hotspot verdict**.
4. **Preparatory refactor** — first, when required; each step behavior-preserving.
5. **Interface designs** — Step 3 answers, including the draft `/** */`
   interface comments themselves for every new or changed export (the comment
   standard lives in `AGENTS.md`; if the comment is hard to write, the
   interface is wrong — P7).
6. **Design alternatives** — selected option and rejected alternative.
7. **Ordered implementation steps** — small enough to keep focused tests green.
8. **Test and verification plan** — focused, full, UX/operator, and close-out
   gates.
9. **Baseline effect and update**.
10. **Scope guard** — explicit non-goals and backlog routing.

Before requesting approval, present a short plain-English summary alongside the
formal plan — the second plain-English checkpoint, after Step 1's pre-draft
shape discussion. State the intended outcome, the main implementation shape and
tradeoff, the evidence that will prove success, and the most important scope
boundary without requiring Ryan to decode the fixed schema first.

For an audit-remediation contract, also name every `AF-NNN` finding it resolves,
show how the selected decomposition satisfies its principle diagnosis, and name
the pre-PR evidence that will allow close-out to mark it Delivered. The plan may
not downgrade an actionable finding to Watch or substitute metric movement for
the required design outcome.

Create a native runtime todo list from Steps 1–10 before starting the analysis.
The complete draft proceeds to Step 9 before it is presented for approval.

## Step 9 — Adversarially review the complete draft

After the authoring session has a complete draft, but before Ryan sees it:

1. launch a fresh read-only `gpt-5.6-sol` worker at xhigh effort;
2. give it the complete draft plus the contract and the specific evidence the
   draft relies on, without coaching it toward the author's conclusions;
3. require an adversarial review for unsupported assumptions, scope drift,
   boundary or hotspot mistakes, weaker alternatives, missing behavior locks,
   insufficient verification, and contradictions with current code or primary
   documentation;
4. reconcile every finding into the draft or record why it does not apply;
5. rerun the review at most once, and only when the reconciliation materially
   changes the plan's architecture, scope, or verification strategy. The review
   budget is a hard cap: one mandatory pass on the complete draft plus at most
   one rerun. Findings that surface after the cap are reconciled by planner
   judgment and disclosed at approval instead of triggering another pass.

The reviewer is supplementary and never owns the plan. The planning session
retains judgment, surfaces real product or scope conflicts to Ryan, and only
then presents the approval-ready plan. Do not create a separate prompt or
review artifact in the repository.

## Step 10 — Persist only after approval

After Ryan approves and the runtime is in execution mode:

1. write the plan to the deterministic path from the resolver;
2. include the approval markers, exact contract digest, pending execution
   status, and `Baseline effect` marker from `docs/SESSION_CONTRACTS.md`;
3. overwrite any re-approved prior plan rather than appending history;
4. run the resolver again and report its new directive;
5. run `python3 .agent-local/check_agent_drift.py`;
6. stop — the planning session is terminal. A session that planned an artifact
   never executes it; plan-mode acceptance authorized persistence only, and
   execution begins in a fresh `start-session`, whichever runtime runs it.

## Quick pre-flight

- [ ] Correct lifecycle stage and contract selected?
- [ ] Constitution and current baseline read first?
- [ ] Intended shape discussed with Ryan in plain English before drafting?
- [ ] Every new export hides a nameable decision and has a real caller?
- [ ] Two decompositions considered for each non-trivial ownership decision?
- [ ] Hotspot protected or preparatory seam planned first?
- [ ] Behavior locks scheduled before restructuring?
- [ ] Rail conflicts resolved deliberately?
- [ ] Baseline effect classified and update step included when required?
- [ ] Scope guard explicit?
- [ ] Complete draft adversarially reviewed by a fresh xhigh planning worker?
- [ ] No file written before approval?
