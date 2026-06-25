# fallow baselines

Committed `fallow` baselines (this directory is **tracked** — `.gitignore` only
ignores `/.fallow/`, the local cache). Wired into `.fallowrc.json` so the
`pnpm fallow` audit gate flags only **new** issues beyond what's recorded here.

The gate **fails the build** on a new clone: `pnpm fallow` runs `fallow audit
--fail-on-issues`, which turns an introduced, non-baselined clone into a failing
finding (duplication was warn-only before — it reported but never failed).
Inherited clones stay excluded by the audit's git-based new-only attribution, so
touching a file that already holds a baselined clone never false-fails — only
duplication the changeset *adds* blocks.

Only **duplication** has a baseline. Dead-code and health (`fallow health` →
`Above threshold: 0`) reach true zero with no baseline — baselines are a
temporary migration aid here, not the steady state.

## `dupes.json`

The duplication that remained after this pass extracted the high-value clones
(telemetry query helper, eve-data meta helpers, the cron auth/`swallow`
scaffold, the chart tooltip hook, and the cross-feature `LiveCharacterCard`
shell that collapsed the 154-line skill-queue ↔ industry-jobs panel clone). Repo
duplication dropped from **4.8% → 3.4%**; the remainder is captured here:

| Clone group | Why it's baselined, not fixed |
| --- | --- |
| `convex/industryJobs.ts` ↔ `convex/skills.ts` (+ their `*Sync.ts`, `engine.ts`) | **Temporary debt.** The shared `applySyncResults` envelope is genuinely extractable into `convex/lib/`, but it's the highest-effort item and these files were just reworked in #118. Deferred to the sync-engine consolidation the code comments already anticipate. The divergent per-result apply halves (`applyJobResult` vs `applySkillResult`/`mergeData`) must **not** be merged — different domain logic. |
| `sparkline.tsx` / `trend-chart.tsx` / `bar-chart.tsx` axis + SVG scaffold | **Legitimate boilerplate.** Coincidental declarative-SVG similarity across charts with genuinely different scales (`scaleLinear.invert` vs `scaleBand` per-bar). The one true clone (the tooltip CSSOM effect) was extracted to `useCssomTooltip`; a unified `<ChartAxis>` for the rest would be a forced, flag-laden abstraction. |
| `live-character-card.tsx` ↔ `IndustryActiveJobs.tsx` | **Temporary debt.** The new shared card shell now also resembles the active-jobs summary table (a different surface). Folding `IndustryActiveJobs` into the card primitive is out of scope for this pass. |
| `IndustryJobsPanel.tsx` ↔ `SkillQueuePanel.tsx` (residual ~35 lines) | **Legitimate boilerplate.** The per-feature panel shells (live-query wiring + copy) that differ in their dataset, row renderer, and strings — what's left after the shared chrome moved into `LiveCharacterCard`. |
| `contact/route.ts` ↔ `feedback/route.ts` | **Temporary debt.** Low-value JSON-parse + rate-limit-429 scaffolding; a `parseJsonBody`/`rateLimitResponse` extraction is a future tidy. |
| `ingest-sde-if-empty.ts` ↔ `refresh-sde.ts` (SDE version check) | **Legitimate boilerplate.** Two entry scripts sharing the deploy-time version-gate; coupling them would entangle independent deploy/cron entry points. |

_Gate-enablement pass (2026-06-25): turned the gate from warn-only to failing
(`--fail-on-issues`, above) and extracted the one clean clone introduced since —
the three blueprint-activity batch reads in `eve-data/queries.ts` now share a
`mapBlueprintActivities` scaffold. The families above stayed baselined per their
stated reasons (the convex sync apply-halves and the chart SVG scaffold are
deliberately not merged). Baseline refreshed to the current set._

### Regenerating

After intentionally resolving (or accepting) duplication, refresh the baseline:

```bash
npx fallow dupes --save-baseline fallow-baselines/dupes.json
```

Shrink it over time — don't grow it. New duplication that isn't in the baseline
fails `pnpm fallow`.

## A note on health / CRAP (no baseline, by design)

`fallow health` reaches `Above threshold: 0` through real fixes, not a baseline:
genuinely complex functions were refactored (and their extracted logic
unit-tested), and **cyclomatic (20) / cognitive (15) remain universal gates**.
CRAP is coverage-weighted, so it flags every untested function regardless of
risk — and this repo deliberately doesn't unit-test certain layers
(presentational components, DB-bound accessors, entry/CLI scripts, route
handlers/middleware, React effect hooks, framework config) and runs with
`coverage-gaps` off. The `health.thresholdOverrides` in `.fallowrc.json` scope
CRAP off exactly those layers, each with a documented reason; cyclomatic and
cognitive still apply everywhere, so genuine complexity always surfaces.
