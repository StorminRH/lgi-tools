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
| `legal/page.tsx` (two adjacent sections) | **Legitimate boilerplate.** Parallel static-content sections — identical `section`/`SectionLabel`/`p` markup, different prose; a shared component would only obscure plain page copy. |
| owner-sync descriptor + wrapper heads (`owned-assets` ↔ `owned-blueprints` `refresh.ts`; `industry-jobs` ↔ `skill-queue` `refresh.ts`; `industry-jobs-sync.ts` ↔ `skills-sync.ts`) | **Legitimate boilerplate.** The per-slice `OwnerSyncDescriptor` builders + on-view wrappers that drive the shared owner-sync engine (`src/lib/owner-sync`). After MIGRATE.D.2 pulled the refresh mechanism, the ESI reader, the corp-director resolution, and the auth/ESI port wiring each into ONE place, the residual is the thin per-slice mapping between mirror slices (blueprints↔assets, jobs↔skills) — distinct projection, eligibility, endpoints, tables, owner key. Folding 5–9 line descriptor/wrapper heads behind a factory of 6+ slice-specific callbacks would be a forced, flag-laden abstraction. |

_Gate-enablement pass (2026-06-25): turned the gate from warn-only to failing
(`--fail-on-issues`, above) and extracted the one clean clone introduced since —
the three blueprint-activity batch reads in `eve-data/queries.ts` now share a
`mapBlueprintActivities` scaffold. The families above stayed baselined per their
stated reasons (the convex sync apply-halves and the chart SVG scaffold are
deliberately not merged). Baseline refreshed to the current set._

_Owner-sync engine extraction (MIGRATE.D.2): the per-owner ESI→Neon refresh
mechanism the five trackers cloned (owned blueprints/assets, skills, char + corp
industry jobs) moved into one shared engine (`src/lib/owner-sync`), the two ESI
readers unified into one (`src/lib/esi/authed-read.ts`), the corp-director
resolution + the auth/ESI port wiring each extracted to one place
(`src/db/owner-sync-port.ts`). That **dropped** six baselined clones (the four
`esiRead` ↔ `authed-read` reader groups and the two `*-sync.ts` auth/ESI wiring
groups) and **added** four small parallel-slice descriptor/wrapper heads (the row
above) — a net shrink. Pruned surgically rather than via `--save-baseline` to keep
the unrelated MIGRATE.B `use-*-live` / queries clones (out of scope here) excluded
by git new-only attribution, not absorbed into the curated accept-list._

_Server plumbing kit (3.7.29.1): the elimination program's Session A built three
server-side plug-in primitives — a route-handler kit (session/admin/service
guards + body-parse + the 429 rate-limit envelope, extending `src/lib`), a cron
gate (`runCronJob` + `withAdvisoryLock`), and a script bootstrap (`runScript` +
the pure SDE version-gate decisions) — then migrated every route, cron, and db
entry script onto them and unit-tested the extracted logic. That **dropped 14**
baselined clones (the route guard/parse/service scaffolds, the admin-page guard,
the cron auth/lock scaffold, the SDE version-gate + script-teardown groups, and 3
long-dead entries) and let the **`src/db`/`scripts` and `route.ts`/`proxy.ts`
CRAP waiver blocks be deleted** — those layers now pass the universal
cyclomatic-20 / cognitive-15 / CRAP-30 caps unwaivered. The residual cron/route
clones the kit idiom leaves (e.g. two crons sharing the `runCronJob` call shape)
are warn-only kit convergence — coupling the jobs is exactly what the gate
primitive avoids — and don't fail the audit. Pruned surgically, not via
`--save-baseline`._

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
(presentational components, DB-bound accessors, React effect hooks, framework
config, the telemetry client, mock fixtures) and runs with `coverage-gaps` off.
The remaining `health.thresholdOverrides` in `.fallowrc.json` scope CRAP off
exactly those layers, each with a documented reason; cyclomatic and cognitive
still apply everywhere, so genuine complexity always surfaces. (The db/CLI-script
and route-handler/middleware waivers were **removed** in 3.7.29.1 — that logic
now moves into tested helpers with thin, low-complexity shells, so those layers
pass CRAP unwaivered.)
