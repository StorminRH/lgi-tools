# fallow baselines

Committed `fallow` baselines (this directory is **tracked** — `.gitignore` only
ignores `/.fallow/`, the local cache). Wired into `.fallowrc.json`
(`audit.dupesBaseline`) so the `pnpm fallow` gate flags only issues a changeset
*introduces* beyond what is recorded here.

**End state: both baselines are empty.** `dupes.json` is `{"clone_groups": []}`
and `.fallowrc.json` `health.thresholdOverrides` is `[]` — zero baselined clones,
zero CRAP waivers. The exception-elimination program (Sessions A–E) closed by
testing/extracting every shielded function rather than documenting an exception,
so nothing here is carried as debt.

## Report vs. gate

Two different fallow commands; only one gates CI:

- **`pnpm fallow` = `fallow audit --fail-on-issues` is the CI gate of record.** It
  fails the build on any issue a changeset *introduces*: unused files/exports/
  dependencies, architecture-boundary violations, and **introduced** duplication
  (git-based new-only attribution against the empty `dupes.json`). It does **not**
  measure CRAP.
- **`pnpm fallow:health` = `fallow health --coverage …` is a REPORT.** It scores
  per-function cyclomatic/cognitive/CRAP and **always exits 0**; it is in neither
  `pnpm verify` nor CI. Nothing keys off it — it is the code-health dashboard, not
  a gate.

The universal health caps — cyclomatic **20** / cognitive **15** / CRAP **30** —
now apply to every file, with no `thresholdOverrides` exceptions.

## Accepted warn-only convergences (deliberately unbaselined — not debt)

A whole-repo `fallow dupes` scan reports four small clone groups (~0.2% of the
repo). They are **warn-level** and live in files unchanged vs `main`, so the
audit's new-only attribution already excludes them — baselining them would record
non-debt. They stay un-baselined on purpose; coupling each pair is exactly what
the shared gate/kit primitives are designed to avoid:

| Convergence | Why it stays split |
| --- | --- |
| `api/account/saved-plans/route.ts` ↔ `api/preferences/route.ts` | Route-handler-kit residual — the guard + body-parse + JSON-payload call shape the shared `src/lib` route kit leaves at each site; the handlers' logic differs. |
| `api/cron/refresh-affiliations/route.ts` ↔ `api/cron/refresh-industry-indices/route.ts` | Cron-gate residual — two crons sharing the `runCronJob` call shape; their jobs are unrelated. |
| `industry/[id]/page.tsx` ↔ `sites/[id]/page.tsx` (`generateMetadata`) | Parallel dynamic-metadata heads over different entities; a shared helper would couple two feature routes. |
| `api/account/active-character/route.ts` ↔ `api/account/characters/unlink/route.ts` | Route-kit residual — same guard/parse shape, a different account mutation. |

(The corp tri-state readout — `LiveCorpJobs` ↔ the corp `CorpSectionBody` — is a
*conceptual* convergence that sits below fallow's token threshold, so it is not
even a detected clone group. It is noted here only so a future reader does not
mistake it for hidden debt.)

## How the baselines reached empty

Duplication was driven to the residual above through real extractions — the shared
route/cron/script kits, the owner-sync engine, the `LiveCharacterCard` live-tracker
platform, and the planner-brain + component `*-view.ts` helpers — and the last
curated clones were pruned surgically, never re-absorbed via `--save-baseline`.
CRAP reached `above-threshold: 0` the same way: complex functions were decomposed
and their logic unit-tested, leaving thin low-complexity shells, so no layer needs
a waiver.

### Regenerating

Only after intentionally *resolving* duplication (never to hide it):

```bash
npx fallow dupes --save-baseline fallow-baselines/dupes.json
```

The steady state is empty — duplication a changeset introduces fails `pnpm fallow`
and should be extracted, not baselined.
