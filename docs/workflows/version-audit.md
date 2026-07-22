# Version-audit procedure

This procedure has three resolver-dispatched entry modes: plan an audit, plan
remediation, and execute or resume an approved audit. All modes use the same
classification, baseline, remediation, and archive semantics below.

## Shared authority and state

The resolver owns entry selection. The strict baseline schema owns the live
data-only baseline form. Version-tagged audit plans own findings, rationale,
cycles, approvals, and remediation mappings. This procedure grants no merge,
deployment, production, or destructive-recovery authority.

## Entry mode: plan-version-audit

1. Require the resolver to name `plan-version-audit` for a lifecycle-driven
   Version close. An explicit operator request may select Periodic, which never
   archives.
2. Read the current baseline, this procedure, master plan, contracts, session
   plans, changelog, SCRATCHPAD, backlog, and live configuration.
3. Design exact measurements, commands, artifact inventory, hotspot and drift
   questions, baseline replacement, verification, and any version-close archive
   destination.
4. Present the shape before drafting, give the complete plan to one fresh
   read-only high-effort adversarial reviewer, reconcile every finding, and
   obtain operator approval. Permit at most one rerun after material change.
5. Persist a new Approved cycle-1 plan with full audited ref and procedure
   digest. When a procedure change made an in-progress plan stale, preserve its
   cycle history, AF ledger, statuses, and mappings while reconciling scope.
6. Rerun the resolver and drift gate, report the new directive, and stop.

## Entry mode: plan-audit-remediation

1. Require the resolver to name `plan-audit-remediation`; read the baseline,
   audit plan and ledger, master plan, schemas, SCRATCHPAD, backlog, Codegraph
   evidence, and live code.
2. For every open Floss or Campaign, diagnose the violated ownership, interface,
   change-axis, or coverage principle. Define the required end-state and
   characterization evidence instead of copying a metric.
3. Apply the plan-version topology audit to the complete finding set. Group the
   findings into the fewest safe execution bundles, map every open AF id, and
   map no unaudited scope.
4. Present the topology before drafting, run one fresh read-only adversarial
   review, reconcile findings, and obtain operator approval before mutation.
5. Update the roadmap topology first, then contracts/index, then mark mapped
   findings Planned and set Remediation in progress. Do not create session plans.
6. Rerun the resolver and drift gate, report the new directive, and stop.

## Entry mode: version-audit

Require the resolver to name `version-audit`, then execute the approved plan and
every numbered step below. A restart advances the cycle and audited ref and
repeats the complete audit; it is never a targeted diff.

## Step 0 — Validate the transition

1. Run `python3 .agent-local/resolve_development_state.py --pretty`.
2. Require the directive to name `version-audit` as its handler. Its action
   distinguishes an initial/resumed close audit, a complete restart after
   remediation, or a verified archive transition. Otherwise report the
   directive and return control to `start-session`; this procedure never selects
   a sibling handler. An explicitly requested periodic pass may run while
   sessions remain only from an approved `Audit mode: Periodic` plan, and it
   never archives.
3. Verify the plan's `Procedure digest` is the SHA-256 of the current exact
   `docs/workflows/version-audit.md`; a mismatch returns to `plan-version-audit`.
4. On a complete-restart directive, verify every mapped remediation sub-version
   has terminal merge evidence, advance `Audit cycle`, set `Audited ref` to
   current canonical `main`, and set `Audit status: Approved`. Rerun every
   measurement and gate; a targeted diff is not an audit restart.
5. Read, in order:
   - `docs/workflows/pre-pr-design-review.md`;
   - the current `docs/CODE_HEALTH_BASELINE.md`;
   - the approved version audit plan;
   - the completed master plan and its version-close checklist;
   - the version's contract index, contracts, session plans, changelog entries,
     and SCRATCHPAD shipped evidence.
6. Record the previous baseline's date, code ref, metrics, hotspot rows, rails,
   and campaign queue before overwriting it.

## Step 1 — Measure

Run and record the numbers required by the approved audit plan. At minimum:

```bash
# Size and shape
find src convex \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -path "*_generated*" | wc -l
find src convex \( -name "*.test.ts" -o -name "*.test.tsx" \) \
  ! -path "*_generated*" | wc -l
find src convex \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -path "*_generated*" -print0 \
  | xargs -0 wc -l | sort -rn | head -16

# Churn since the previous baseline ref/date
git log --since="<previous baseline date>" --name-only --pretty=format: -- src convex \
  | sort | uniq -c | sort -rn | head -25

# Coverage and health
pnpm test:coverage
pnpm fallow:health

# Rails and accepted debt
grep -n "thresholdOverrides" -A 20 .fallowrc.json
git diff <previous-baseline-code-ref> -- fallow-baselines/dupes.json .fallowrc.json
grep -rn "eslint-disable\|@ts-expect-error\|fallow-ignore" src convex | wc -l
```

Additionally, measure **every known-wide surface named in the current
`docs/CODE_HEALTH_BASELINE.md`** (export counts, interface field counts,
consumer counts — whatever breadth measure each baseline row records). This
procedure names no version-specific surface or command; the exact measurement
commands live in the version's approved audit plan, derived from the baseline's
current rows.

The churn window here is deliberately the **version lens** — since the previous
baseline ref/date — and intentionally differs from the session-plan schema's
Hotspot proximity evidence: the audit measures a version's
accumulated pressure, planning measures current neighborhood risk.

`fallow:health` is expected to exit nonzero when it reports existing health
findings. Record the report; do not confuse it with the gating `pnpm fallow`
result. Remove generated `coverage/` after the final audit checks.

## Step 2 — Re-rank hotspots

A hotspot is where interface breadth, unrelated change axes, and churn coincide,
not merely a long file. For every candidate, judge:

| Dimension | Question |
| --- | --- |
| Interface breadth | How many caller-visible concepts exist, and did they grow? |
| Change axes | Does the module change for unrelated reasons? |
| Churn | Did multiple sessions touch it during this version? |
| Amplification | Did one logical change fan out through consumers? |
| Cohesion defense | Is it deep and cohesive, or accreting? |

Replace the baseline's current-hotspot table with the new ranking. Reaffirm
protected non-goals from `pre-pr-design-review.md` §5. Every hotspot row states a
direction of fix; “make it smaller” is not sufficient.

Do not copy live metrics or rows into the pre-PR design procedure. Amend its
design creed only when the audit discovers a durable principle or
classification rule, not a new number.

## Step 3 — Review drift no PR-level gate sees

- **Boundary drift:** inspect zone growth, new `allow` entries, and composition
  placed inside a participating slice. Apply `pre-pr-design-review.md` §4.2.
- **Override staleness:** review every Fallow override and suppression as a loan.
  Remove stale entries; classify live ones with rationale and date.
- **Duplication baseline:** classify every accepted clone group as boring shape
  or leaked knowledge. Growth is never accepted silently.
- **Rails gaps:** turn any repeated failure that escaped this version into the
  narrowest useful rail, tripwire, or durable principle.
- **Docs truth:** reconcile architecture and workflow prose with live reality.
  This sweep covers both the workspace docs and the **committed public
  documents**: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, the PR/issue
  templates under `.github/`, `.env.example`, and the `/legal` page. A public
  document that describes the app untruthfully is a finding like any other.
- **Lifecycle truth:** verify contracts, approved session plans, close-out
  evidence, and master-plan terminal statuses agree.

## Step 4 — Classify, record, and route

Put every finding in exactly one bucket:

1. **Floss:** bounded improvement that does not require a structural campaign.
   In a periodic audit it may enter the backlog; in a version-close audit it is
   actionable and must be remediated before archive.
2. **Campaign:** bounded structural work requiring its own sub-version. Define
   the target interface end-state, characterization tests, and done conditions.
   The one-campaign cap applies only to elective new-version planning; a close
   audit schedules every confirmed campaign before archive.
3. **Watch:** pressure without enough evidence for intervention. Put it in the
   baseline with the exact metric or trigger that would promote it to Floss or
   Campaign. Watch is the only non-blocking close-audit classification.

   **Watch promotion triggers have one owner: the baseline's Watch rows.** The
   ledger row records `Watch` status and cites the AF id only — it never
   restates the trigger. Each Watch finding's countable trigger is written as
   one fenced `watch-trigger` block in the baseline's `### Watch triggers`
   section (schema in Step 5), in this closed grammar:

   ```text
   AF-NNN: <metric>(<arg>) <op> <integer>
   ```

   - `<metric>` is exactly one of: `exports` (count of `^export` lines in the
     named repo file), `files` (count of files assigned to the named Fallow
     zone, written `zone:<name>`, from `.fallowrc.json`), or `clones` (count of
     files in the named clone group, written with its Fallow `dup:` id, from a
     whole-version pinned Fallow run).
   - `<op>` is one of `>=`, `>`, `<=`, `<`, `==`.
   - Semantics are **trip-form**: the expression evaluating true means the
     trigger fired. A block may hold multiple lines for one AF id; any line
     true trips it.
   - A tripped trigger is a **warn** — the checker reports `promote AF-NNN`;
     classification remains an audit decision (P10). Judgment conditions that
     are not countable ("a new change axis", "renewed growth") stay in the
     Watch row's prose and never enter a trigger block.
   - The grammar is a closed set. Adding a metric kind is a change to this
     specification, not a checker feature.

Maintain one stable table in the audit plan:

```markdown
| ID | First seen | Class | Principle diagnosis | Required outcome | Remediation | Status |
| --- | ---: | --- | --- | --- | --- | --- |
| AF-001 | 1 | Campaign | one decision leaks across routes | one app-layer owner | X.Y.N | Open |
```

Allocate ids monotonically within the version. Status is `Open`, `Planned`,
`Delivered`, `Verified`, or `Watch`. A fresh audit reuses the same id when a
delivered outcome failed; it returns that finding to Open rather than creating
a duplicate. New findings receive the next id.

The campaign queue is living state in `docs/CODE_HEALTH_BASELINE.md`; this
procedure contains no standing queue.

Campaigns split by change axis, not helper type. Temporary façades exist only
for migration and are removed. Every structural step preserves behavior and
keeps focused tests green.

## Step 5 — Overwrite the baseline

Replace `docs/CODE_HEALTH_BASELINE.md` in full. Do not append an audit entry and
do not preserve prior rows below the new snapshot. Use this exact heading order
and table shape every time:

```markdown
# Code Health Baseline (LGI.tools)

> Living-state notice and design-procedure pointer.

## Snapshot
| Field | Value |
| Date | YYYY-MM-DD |
| App version | X.Y.N |
| Code ref | full SHA |
| Measurement scope | Full audit |
| Previous comparison | prior date, version, and ref |
| Health trend | one line versus the previous baseline |

## Step 1 metrics
| Metric | Current | Previous | Delta / note |

### Largest production files
| Rank | File | LOC | Classification |

### Current churn signals
| File | Recent commits | Current evidence | Verdict |

## Current hotspots
| Hotspot | Evidence | Direction of the fix | Live status |

### Watch triggers
One fenced `watch-trigger` block per Watch finding (grammar in Step 4)

## Rails and exceptions
### Standing Fallow threshold overrides
### Suppressions
### Duplication baseline

## Campaign queue
| Priority | Campaign | Charter summary | Status | Trigger / next action |
```

Required Step 1 metric rows are: production file count, production LOC, test
file count, four coverage percentages, Fallow health score, above-threshold
function count, known-wide interface counts, threshold override count,
suppression count, and duplication clone-group count. Use numeric zero rather
than omitting an empty category.

The health trend is one sentence that distinguishes real improvement from metric
movement. Examples: “Pricing context breadth fell while suppressions and
duplication stayed flat,” or “Metrics held; churn moved toward auth, so the auth
campaign moved ahead of pricing.”

Between full audits, pre-PR review may perform a targeted overwrite after a
measured hotspot surface changes. It preserves this exact schema, advances Date,
App version, Code ref, Previous comparison, and Health trend, and sets
Measurement scope to `Targeted: <surface>`. It remeasures affected rows and marks
untouched Step 1 rows as carried from the prior full measurement in their note.
It never appends a history section.

## Step 6 — Remediate, repeat, or archive

For a periodic audit, stop after the baseline, backlog, campaign, and audit-plan
evidence are reconciled.

For version close with any Floss or Campaign:

1. set each actionable finding Open and set `Audit status: Remediation required`;
2. update SCRATCHPAD to audit remediation planning;
3. run the resolver, report its directive, and return control to
   `start-session`;
4. stop without archiving, selecting the next handler, or planning the next
   master version;
5. after `plan-audit-remediation` maps approved work, use normal session plans,
   branches, PRs, design review, and close-out;
6. after every mapped sub-version merges, mark its finding Delivered; when all
   rows are terminal, rerun the resolver and let its directive start the next
   full cycle.

For a clean version close:

1. run the master plan's version-close checks against actual terminal/deferred
   decisions rather than blindly requiring obsolete checklist text;
2. mark Delivered findings Verified only when this fresh cycle proves each
   required outcome; require every Floss/Campaign to be Verified and the current
   cycle to contain no new actionable finding;
3. require every audit gate to pass and the refreshed baseline Code ref to equal
   `Audited ref`, then set `**Audit status:** Complete`;
4. follow the resolver's `archive-needed` directive to archive the master plan,
   contract directory, session-plan directory, and audit-plan directory as one
   version bundle;
5. keep `docs/CODE_HEALTH_BASELINE.md` active;
6. update SCRATCHPAD to the next master-plan handoff or to a clear
   `awaiting master plan` state;
7. run the workflow-state resolver and `python3 .agent-local/check_agent_drift.py`.

Never archive before the baseline replacement is verified.
