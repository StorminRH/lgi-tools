# Wave 10 review: admin console lens (P315, P314, P299, P158, P316, P282, P281)

Diff reviewed: `origin/claude/primitives-wave-09...origin/claude/primitives-wave-10`. Commits 3bcc5fd3 (P316), 1e0710a0 (P282), cf7e14c0 (P281), ae42c740 (P158), 35915569 (P299), 6081c4fb (P314), 536220d3 (P315).

## Findings

None. I found no defect I could tie to a real caller or input.

## P281 "already done" claim

The claim holds. Commits 872495b3, a4ecb311, 094922ee and b4cd810c exist, and both `origin/development` and `origin/claude/primitives-wave-09` contain them. On the old ref:
- `shared-reads.ts` has the ISO-keyed `sharedRangeRead`, plus `sharedPeriodRead`. `esi-source-shared.ts` is gone.
- The three ESI cards each did an uncached `getDegradationByCaller`. They now share one `getPriceSourceDegradationShared(range)` read, which also carries `budgetExhaustions`.
- On /admin/search, the duplicate `getSearchTotals` reads are replaced by one `getSearchTrendShared` read over the combined span.
- `deriveCostLensView` and `loadCost` are gone, and their dead `fallback`/`degradationByCaller` inputs went with them. `loadOnDemandMetrics` reads only what it renders.

## Leads checked and refuted

1. **Period math is unchanged for every range (P316).**
   - The new `rangeFor` rounds `to` up to the next minute, as before. For a non-`all` key it then calls `lastNDaysRange(RANGE_DAYS[key], to)`, which is `{ from: daysBefore(to, days), to }`. The old inline `7/30/90` ternary gave the same result. `all` still returns `{ ALL_TIME_FROM, to }`.
   - `previousRange`, `computeDelta`, `trendSeries` and `ALL_TIME_FROM` are byte-identical.
   - There is no `1d` key; `'1d'` maps to the default `30d` on both refs.
   - `lastNDaysRange` has the same body. Its only consumer is the 90-day role audit, now imported from `../period`.
2. **`parseRange` (P316).** For string input the result is the same (`includes` became `find ===`). Arrays now take `raw[0]`, `[]` gives `30d`, and `''` gives `30d`. This matches `URLSearchParams.get` in RangeSelector and the rail (the declared change). No other server reader of `?range` bypasses `parseRange`.
3. **`searchPeriods.days` (P282).**
   - For 7d/30d/90d, `RANGE_DAYS[key]` equals the old AudienceCard value `round((to - from)/DAY_MS) + 1`, because `to - from = (days-1)·DAY_MS`.
   - For `all` it is the same formula over `ALL_TIME_FROM`.
   - The inclusive, non-overlapping windows are untouched, and `metric-view` still reads `rangeDays` only when there are totals.
4. **`countJobs` (P299).**
   - It is the old `countOf` body verbatim.
   - `summarizeQueue` keeps its meaning. `due` and `oldest` come from `LIVE_ESI_REFRESH_JOB_STATUSES` (queued, running, deferred_for_budget, failed_retryable). `dead_lettered` is counted on its own and is not in `due`. Other statuses (succeeded, failed_permanent) are still ignored.
   - `heldForBudget` is the same filter-and-sum.
   - The queue cells, `retainedSummary` and `deadLetterHint` keep the same status lists.
5. **SLI and activity loaders (P158).**
   - `loadSliReads` keeps the two per-read `loadSection` labels (`capability-outcomes`, `capability-latency`).
   - The overview still wraps them in `admin-signals.sli`. Health calls `loadSliReads` once and passes `{...sliReads}` (`outcomes`, `latency`) into the details exactly as before.
   - No page runs the reads twice except through the ISO-keyed `sharedRangeRead`.
   - `loadActivityView(range, previous)` is the old `loadTrafficActivity` body. In AudienceCard it calls `getPageViewStatsShared(range, prev)` again with the same keys, so production dedupes it. The test's "called twice" expectation reflects the vitest `cache` passthrough.
6. **Links and anchors (P315).**
   - Every `adminHref(...)` resolves to the same literal as before: `/admin/health`, `/admin/esi`, `/admin/health#scheduled`, `/admin/queue`, `/admin/statics`, `/admin/users`, and `/admin/users/<id>`.
   - `SCHEDULED_TASKS_ANCHOR = 'scheduled'` feeds the health page's `AdminSection anchor`, which renders `id={anchor}`.
   - The labels 'View jobs', 'Open queue', 'Open statics', 'Review snapshot', 'Open health' and 'Open ESI' are unchanged.
   - The Audience Traffic/Search links and the Referrers→Search link now carry `?range` only for non-default ranges (the declared change). New tests pin this: `traffic/page.test.ts`, `AudienceCard.test`, and `admin-sections.test`.
   - Sharing the `PAGE_ACTIONS` objects across items is harmless; nothing mutates `action`.
7. **Range control placement.** It shows on overview, health, ESI, traffic and connected search; all five are `ranged: true` in `SECTIONS`. It does not show on queue, statics, users, user detail (`title="User"`) or unconnected search (`title={adminSection('search').title}`). This is the same as the old `rangeBasePath` props; statics never passed one in production. All eight titles match the old literals.
8. **Fallow boundaries and the client graph.**
   - `period.ts` has 24 production importers plus its test, all under `app/(site)/admin`. Nothing outside app imports it; the `@/app/` imports found are all tests inside app.
   - `period.ts` imports only a type from `data/telemetry/types`, plus `lib/iso-date` and `lib/search-params`. Both lib modules are pure.
   - The client components (RangeSelector, admin-nav, charts) reach only `period` and `admin-sections`. `admin-sections` adds no new imports: section-path, format/number, period.
   - `signals.ts` → `admin-sections` adds no cycle. `queue-view` → `signals` is a server-only path.
   - `demo-board` (composition) and `map-navigation` (features) importing lib is allowed.
9. **Auth guard and shell (Cache Components).** `AdminPageFrame` keeps `Suspense > AdminGate (requireAdminPage) > head + Suspense(children)`. Only where the title and base path come from changed. `adminHref`/`adminSection` calls at module level (STATUS_CARDS, PAGE_ACTIONS) are pure. `new Date()` still runs only after `await searchParams`, inside the holes.
10. **P314.** `membershipHint` had no reader outside its test. The users search truncation hint (`resultsHint`) is still rendered through the section hint.
11. **Stale references.** None remain to `@/composition/admin-period`, `USERS_HREF`, `loadTrafficActivity`, `rangeBasePath` props or `lastNDaysRange` from `data/telemetry/queries`. No e2e spec asserts the changed links.
12. **Tests are not vacuous.**
    - `AccessCards.test` now checks the real 90-day window (2026-03-11 to 2026-06-09) under fake timers.
    - `countJobs`, `adminHref`, `ADMIN_NAV_GROUPS` uniqueness, `load-signals`, `load-activity` and the traffic page tests each assert concrete values.
