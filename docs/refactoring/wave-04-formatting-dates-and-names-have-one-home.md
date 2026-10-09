# Wave 4: Formatting, dates and names have one home

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 3: src/lib primitives: collections, math, async, errors, browser](wave-03-src-lib-primitives-collections-math-async.md) · [Index](README.md#roadmap) · [Wave 5: Persistence primitives and data-layer SQL](wave-05-persistence-primitives-and-data-layer-sql.md) →

Fix formatRelativeTime and add formatElapsed. Then lib/iso-date becomes the UTC day-math owner, and lib/format/time keeps display formatters (formatUtcMinute, stripUtcYear) delegating to it. retentionCutoffDay is built on both. Next come formatQuantity (null-aware), then formatCount, formatPct/formatFallbackShare and formatSigned, then the ISK presets. unresolvedName follows, with the corp-holdings location labels on top of it. Station names move to lib/format, activityLabel to data/eve-data, and entryTimes and romanLevel stay in skill-queue.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☐ | [P088](#p088) | Fix formatRelativeTime's 28-29 day '0mo ago' bug and route the compact elapsed-age ladders through one lib formatter | formatting | S | low | medium | — |
| ☐ | [P107](#p107) | Make lib/iso-date.ts the home for UTC day math (isoDay, isoDayNumber, isoDayFromNumber, isoDayStartMs, isUtcWeekend, daysBefore, DAY_MS/HOUR_MS) and delete the private copies | generic-utility | M | low | medium | — |
| ☐ | [P089](#p089) | Make lib/format/time the single UTC date home: one input type, adopt formatIsoDay everywhere, add formatUtcMinute and stripUtcYear | formatting | M | low | medium | [P088](#p088), [P107](#p107) |
| ☐ | [P177](#p177) | Fix retention-pruner drift with existing retentionCutoff and formatIsoDay; keep per-owner pruners | server-pipeline | S | low | low | [P107](#p107), [P089](#p089) |
| ☐ | [P085](#p085) | Route client-rendered and drifted number grouping through formatQuantity (null-aware), keep unit suffixes local | formatting | S | low | medium | — |
| ☐ | [P090](#p090) | Move pluralCount to lib/format/number as formatCount and replace the count-and-noun ternaries | formatting | M | low | low | [P085](#p085) |
| ☐ | [P091](#p091) | Retire formatBonusPct for formatPct, share the Fuzzwork fallback-share label from data/telemetry, and drop redundant formatIsk null guards | formatting | S | low | low | — |
| ☐ | [P095](#p095) | Add formatSigned to lib/format/number and use it for the wallet, the margin and effect modifiers | formatting | S | low | low | — |
| ☐ | [P084](#p084) | Fold the wormhole-site ISK formatters into src/lib/format/isk.ts presets (Compact gains a K tier, Short and Compact take a unit option) and reuse the typed SITE_TYPE_LABEL | formatting | S | low | medium | — |
| ☐ | [P094](#p094) | Add unresolvedName to lib/format/names, retire the '#' and 'Pilot' variants, and give the industry planner one typeName helper | formatting | M | low | low | — |
| ☐ | [P108](#p108) | Export the structure-id rule, location labels and public location name from data/corp-holdings/labels.ts, and the unresolved-entity fallback from lib/format/names.ts | generic-utility | S | low | medium | [P094](#p094) |
| ☐ | [P272](#p272) | Move formatStationName to lib/format and parseStructureFit to features/custom-structures | feature-skeleton | S | low | low | — |
| ☐ | [P098](#p098) | Hoist activityLabel to data/eve-data, label activity 9 as a reaction, and unify the planner's production-activity guard | formatting | S | low | medium | — |
| ☐ | [P118](#p118) | Reuse romanLevel in MemberDetail and give skill-queue one parsed-time and finished-entry rule | generic-utility | S | low | low | — |

<a id="p088"></a>

## P088: Fix formatRelativeTime's 28-29 day '0mo ago' bug and route the compact elapsed-age ladders through one lib formatter

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -35 / +22
- **Depends on:** —
- **Existing primitive:** `src/lib/format/time.ts:formatRelativeTime`

**Problem.** Six functions turn an elapsed duration into the compact m/h/d(/w/mo) token, each written by hand. The lib copy has a real bug: 28-29 days renders '0mo ago', because the week branch tests weeks < 4 instead of days < 30 as the planner's ageLabel does. data/telemetry formatAgo is the same ladder capped at days. mapper formatSignatureAge is the same ladder with no suffix and a '<1m' floor. Admin queue-view ageLabel(from, now) and signals formatHours(hours) apply the same 48-hour day cut-over to the same 'oldest job' note from different inputs, and both print '0m' under a minute.

**Verifier revision.** The core holds up. formatRelativeTime really does render '0mo ago' for 28 and 29 days: weeks = 4 fails `weeks < 4`, then floor(28/30) = 0. The same m/h/d ladder is hand-written in five more places, and queue-view ageLabel and signals formatHours are the same rule (m, then h until 48, then d) for the same 'oldest job' note. Changes from the proposal: (1) releaseLine is dropped. It is calendar-day granularity from a YYYY-MM-DD string with 'today' wording, so a different concept. (2) formatAgo does clamp negative values: ms < 60_000 returns 'just now', so the 'no negative clamp' claim is wrong. (3) The `floor` option is dropped. formatRelativeTime and formatAgo keep 'just now' themselves, and the compact ladder always says '<1m', so the admin queue's '0m' becomes '<1m' (a deliberate copy change). (4) formatAgo becomes formatRelativeTime with largest:'d' and is deleted, rather than calling a second wrapper. (5) signals keeps hours for QUEUE_STALE_HOURS and converts with Math.round(hours*3_600_000), so floating-point floor drift cannot shift a minute.

**Sites (6).**

- [`src/lib/format/time.ts:33-48`](../../src/lib/format/time.ts#L33-L48) — formatRelativeTime; lines 44-47 give '0mo ago' for 28-29 days. Only consumer: src/features/wormhole-sites/components/SiteMetaStrip.tsx:25
- [`src/data/telemetry/health-metrics.ts:76-84,116`](../../src/data/telemetry/health-metrics.ts#L76-L84) — formatAgo: same ladder capped at days ('15d ago'); negative ms already reads 'just now'; used only by deriveCronStatus
- [`src/mapper/signatures/signature-model.ts:303-310`](../../src/mapper/signatures/signature-model.ts#L303-L310) — formatSignatureAge: <1m/m/h/d, 24h cut, no suffix; consumed at src/mapper/signatures/scanner-row-cells.tsx:74,77
- [`src/app/(site)/admin/queue/queue-view.ts:18-24,43`](../../src/app/%28site%29/admin/queue/queue-view.ts#L18-L24) — ageLabel(from, now): clamp, 0m/m, h until 48, d
- [`src/app/(site)/admin/signals.ts:213-221,243,260,419`](../../src/app/%28site%29/admin/signals.ts#L213-L221) — elapsedHours plus formatHours(hours): same rule as queue-view ageLabel; QueueSummary.oldestDueHours is also read by queueLevel (246-249) and health-view.ts:40
- [`src/features/industry-planner/market-score-inputs.ts:30-34,68`](../../src/features/industry-planner/market-score-inputs.ts#L30-L34) — ageLabel(days): d/w/mo with the correct days < 30 week cut-off; only reached for days >= 14

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/signals.ts:273-290`](../../src/app/%28site%29/admin/signals.ts#L273-L290) — releaseLine counts calendar days from a YYYY-MM-DD release date and says 'today'; it never shows m/h, so it is not the same concept
- [`src/components/composition/board/board-view-model.ts:333-345`](../../src/components/composition/board/board-view-model.ts#L333-L345) — characterAge: calendar months and years from a birthday ('2y 3m'), a different concept
- [`src/mapper/authoring/connection-intelligence.ts:81-90`](../../src/mapper/authoring/connection-intelligence.ts#L81-L90) — formatDurationBound: a wormhole lifetime bound that rounds and uses decimal hours, not floored elapsed age
- [`src/lib/format/time.ts:50-59`](../../src/lib/format/time.ts#L50-L59) — formatRemaining: a two-unit countdown ('2d 5h'), deliberately different

</details>

**Home.** `src/lib/format/time.ts (existing module; add formatElapsed, extend formatRelativeTime)`

**Boundary check.** The home is in the lib zone (src/lib/**). The lib rule allows only config, and time.ts imports nothing. Every consumer zone may import lib: data (src/data/telemetry; the data rule allows lib), mapper (src/mapper/signatures; the mapper rule allows lib), app (src/app/(site)/admin; the app rule allows lib), and features (industry-planner and wormhole-sites; the features rule allows lib).

**API sketch.**

```ts
export function formatElapsed(ms: number, opts?: { dayAfterHours?: number /* default 24 */; largest?: 'd' | 'mo' /* default 'd' */ }): string
// ms<0 is clamped to 0; <1 min -> '<1m'; <60 min -> 'Nm'; hours < dayAfterHours -> 'Nh'; then 'Nd'; with largest 'mo': 'Nw' while days < 30, then 'Nmo' (floor(days/30))
export function formatRelativeTime(date: Date | null, now?: number, largest: 'd' | 'mo' = 'mo'): string
// null -> '—'; diff < 60_000 (including future) -> 'just now'; else `${formatElapsed(diff, { largest })} ago`
```

**Migration steps.**

1. Fix the bug on its own first: in time.ts, make the week branch `if (days < 30)`. Add regression cases for 28 and 29 days ('4w ago') and 30 days ('1mo ago') to time.test.ts.
2. Add formatElapsed to time.ts and rewrite formatRelativeTime on top of it with the optional `largest` parameter. Its output for SiteMetaStrip stays the same apart from the bug fix.
3. data/telemetry/health-metrics.ts: delete formatAgo (76-84). In deriveCronStatus (116) use formatRelativeTime(lastRun.timestamp, now.getTime(), 'd'). Move the formatAgo cases in health-metrics.test.ts (66-71) to time.test.ts as formatRelativeTime(..., 'd') cases; the deriveCronStatus headline tests stay as they are.
4. mapper: delete formatSignatureAge (signature-model.ts 303-310) and call formatElapsed(now - row.firstSeenAt) at scanner-row-cells.tsx:74 and :77. Move the signature-model.test.ts cases (431-434) to time.test.ts.
5. admin queue-view.ts: delete ageLabel (18-24); line 43 becomes `oldest job ${formatElapsed(now.getTime() - oldest.getTime(), { dayAfterHours: 48 })}`.
6. admin signals.ts: delete formatHours (217-221) and keep elapsedHours. Lines 260 and 419 use formatElapsed(Math.round(queue.oldestDueHours * 3_600_000), { dayAfterHours: 48 }).
7. planner market-score-inputs.ts: delete ageLabel (30-34); line 68 uses formatElapsed(staleDays * 86_400_000, { largest: 'mo' }).

**Tests.** Add to src/lib/format/time.test.ts: formatElapsed with negative ms -> '<1m', 59s -> '<1m', 47h with dayAfterHours 48 -> '47h', 48h -> '2d', 24h by default -> '1d', 45 days with the default largest -> '45d', 10 days with largest 'mo' -> '1w', 28 and 29 days -> '4w', 30 days -> '1mo'. Also formatRelativeTime regressions for 28, 29 and 30 days, and for largest 'd' ('15d ago'). Existing guards: health-metrics.test.ts 66-71 and deriveCronStatus headlines (97-209), queue-view.test.ts 18-24, signals.test.ts 143-153 ('oldest job 30h/30m/3d'), signature-model.test.ts 431-434, market-score-inputs.test.ts 171-185 ('2w').

**Notes.** Behaviour to keep: formatRelativeTime keeps 'just now' for future dates and under a minute, and '—' for null. formatAgo's output is unchanged with largest 'd' (no weeks; the tests expect '15d ago'). formatSignatureAge's output is unchanged. queue-view and signals: identical except that under a minute changes from '0m' to '<1m' (a deliberate copy change; no test covers it). Planner: identical. Which copy is right: the planner's days < 30 week cut-off is correct and lib's weeks < 4 is the bug. The SiteMetaStrip consumer only hits the bug when a site price is 28-29 days stale. Conflict note: P089 also edits time.ts, so land this first or rebase P089 onto it. Separately, signals.ts:419 says '1 jobs' when due is 1 (covered in P090).

<sub>Reported by: area:app-site, area:industry-planner, area:mapper-signatures, concern:formatting.</sub>

<a id="p107"></a>

## P107: Make lib/iso-date.ts the home for UTC day math (isoDay, isoDayNumber, isoDayFromNumber, isoDayStartMs, isUtcWeekend, daysBefore, DAY_MS/HOUR_MS) and delete the private copies

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -70 production lines (13 slice helpers or inlines, 2 toDayNumber, 2 shadow cutoffs, dayString/isWeekend, about 11 unit constants), +30 in iso-date.ts, +60 test lines; about -20 net test lines after moving the scattered helper tests
- **Depends on:** —
- **Existing primitive:** `src/lib/batched-delete.ts:retentionCutoff; src/lib/format/time.ts:formatIsoDay; src/lib/iso-date.ts`

**Problem.** UTC calendar-day logic is re-implemented across data, composition, components-composition, features and app.
- `toISOString().slice(0, 10)` appears 13 times outside the canonical formatIsoDay, as utcDay, utcDayOf, toDateStr, dateStr, isoDay, dayLabel, formatDate, dayString and inline.
- features/net-worth/queries exports utcDay, so composition/board/board-view takes a date helper from a DB query module.
- toDayNumber is duplicated verbatim, and market-score-inputs inlines the same epoch-day math.
- `Date.parse(`${day}T00:00:00Z`)` is repeated in board-assemble, board-view-model, search-period and both aggregates.
- Two private functions named retentionCutoff return ISO-day strings and shadow lib/batched-delete.retentionCutoff (which returns a Date).
- esi-refresh-jobs/queries.ts:202 hand-rolls the cutoff it already imports.
- gsc/ingest, telemetry/lastNDaysRange and admin-period/rangeFor each redo `now - days*24*60*60*1000`.
- The 7/30/90 key-to-days mapping is copied in search-period.
- DAY_MS, MS_PER_DAY, HOUR_MS and HOUR/DAY unit constants are redeclared in 11 files.

**Verifier revision.** The core is real and the largest of the four.
- 13 sites slice an ISO day under seven private names, while lib/format/time.formatIsoDay exists.
- toDayNumber is copied verbatim in admin/aggregate.ts and data/market-history/aggregate.ts, and inlined in market-score-inputs.
- gsc/queries and market-history/ingest declare private retentionCutoff functions that shadow the lib name.
- esi-refresh-jobs/queries.ts:202 hand-rolls retentionCutoff although the file imports it on line 4.
- The 7/30/90 mapping is copied between admin-period and search-period.

Three parts of the design must change.
(1) P087's 'rangeFor calls lastNDaysRange' is unsafe. composition/admin-period.ts is imported for values by the client component src/app/(site)/admin/RangeSelector.tsx:5. lastNDaysRange lives in data/telemetry/queries.ts, which imports '@/db', so the change would drag the DB client into the client bundle. The same problem applies to importing lib/batched-delete (drizzle-orm) there. The day-offset primitive must therefore live in the dependency-free lib/iso-date.ts.
(2) The 'about a dozen more sites' of unit literals are mostly named per-meaning constants (AUTHORIZATION_MAX_FAILURE_AGE_MS, CONTEXT_MAX_AGE_MS, MAP_CHAIN_UNDO_WINDOW_MS, CEILING_COLLAPSE_GRACE_MS). They document themselves and are not duplication of a helper. Only the bare unit redeclarations (DAY_MS, MS_PER_DAY, HOUR_MS, HOUR, DAY) should go.
(3) retentionCutoff should stay exported from batched-delete. All 8 importers pair it with deleteInBatches, so it can simply delegate to daysBefore rather than move.

searchPeriods has different window semantics: inclusive whole days, days-1. Only the key-to-days mapping is shared, not the arithmetic.

**Sites (30).**

- [`src/lib/iso-date.ts:1-7`](../../src/lib/iso-date.ts#L1-L7) — existing dependency-free UTC-date module (isIsoCalendarDate); the home
- [`src/lib/format/time.ts:29-31`](../../src/lib/format/time.ts#L29-L31) — formatIsoDay, the canonical slice; only 3 importers (IndexCoverageCard, SearchCards, settings/account)
- [`src/lib/batched-delete.ts:13-15`](../../src/lib/batched-delete.ts#L13-L15) — retentionCutoff(days, now): Date; imports drizzle-orm, so it is not client-safe
- [`src/data/gsc/queries.ts:16-22, 33, 47, 53`](../../src/data/gsc/queries.ts#L16-L22) — toDateStr (exported only for its test) and a private string retentionCutoff shadowing the lib name
- [`src/data/gsc/ingest.ts:107-109, 341-343`](../../src/data/gsc/ingest.ts#L107-L109) — private dateStr and a hand-rolled GSC window start
- [`src/data/market-history/ingest.ts:11, 17-20, 35, 91`](../../src/data/market-history/ingest.ts#L11) — local DAY_MS, a private retentionCutoff(now): string, and a 1-day stale cutoff
- [`src/data/esi-refresh-jobs/queries.ts:4, 202, 378-382`](../../src/data/esi-refresh-jobs/queries.ts#L4) — imports retentionCutoff but hand-rolls the same cutoff at 202
- [`src/data/telemetry/queries.ts:406-410`](../../src/data/telemetry/queries.ts#L406-L410) — lastNDaysRange hand-rolls days-before
- [`src/composition/admin-period.ts:13-17`](../../src/composition/admin-period.ts#L13-L17) — rangeFor: 7/30/90 mapping plus inline days-before; client-imported via RangeSelector.tsx:5
- [`src/app/(site)/admin/search/search-period.ts:4, 11-20`](../../src/app/%28site%29/admin/search/search-period.ts#L4) — local DAY_MS, inline day parse, and the copied 7/30/90 mapping (inclusive-day window)
- [`src/app/(site)/admin/aggregate.ts:1-14`](../../src/app/%28site%29/admin/aggregate.ts#L1-L14) — MS_PER_DAY, toDayNumber, dayString and isWeekend
- [`src/data/market-history/aggregate.ts:7-9`](../../src/data/market-history/aggregate.ts#L7-L9) — toDayNumber, verbatim copy
- [`src/features/industry-planner/market-score-inputs.ts:15-22`](../../src/features/industry-planner/market-score-inputs.ts#L15-L22) — daysSinceHistoryDate inlines parse plus floor(/86_400_000), with a NaN->null guard
- [`src/app/(site)/admin/activity-view.ts:6, 10, 56, 59, 102`](../../src/app/%28site%29/admin/activity-view.ts#L6) — MS_PER_DAY and an isoDay arrow
- [`src/features/net-worth/queries.ts:9-11`](../../src/features/net-worth/queries.ts#L9-L11) — exported utcDay copy
- [`src/composition/board/board-view.ts:4, 88`](../../src/composition/board/board-view.ts#L4) — imports utcDay from the net-worth query module
- [`src/composition/board/demo-board.ts:32-33, 843-845`](../../src/composition/board/demo-board.ts#L32-L33) — HOUR/DAY units and the utcDayOf copy
- [`src/app/(site)/admin/health/health-view.ts:73-75`](../../src/app/%28site%29/admin/health/health-view.ts#L73-L75) — exported dayLabel equals the ISO slice; used by ServiceLevelRows.tsx:68 and 116-117
- [`src/app/(site)/admin/users/[userId]/page.tsx:35-37`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L35-L37) — formatDate equals the ISO slice
- [`src/app/(site)/admin/AudienceCard.tsx:29, 41`](../../src/app/%28site%29/admin/AudienceCard.tsx#L29) — inline slice and inline 86_400_000
- [`src/app/(site)/admin/search/page.tsx:17`](../../src/app/%28site%29/admin/search/page.tsx#L17) — inline slice
- [`src/data/telemetry/health-metrics.ts:167`](../../src/data/telemetry/health-metrics.ts#L167) — inline slice
- [`src/composition/board/board-assemble.ts:386`](../../src/composition/board/board-assemble.ts#L386) — inline day-start parse
- [`src/components/composition/board/board-view-model.ts:16-17, 508`](../../src/components/composition/board/board-view-model.ts#L16-L17) — HOUR/DAY units and the dayStart parse
- [`src/composition/board/net-worth-nightly.ts:12, 16`](../../src/composition/board/net-worth-nightly.ts#L12) — local DAY_MS
- [`src/data/corp-holdings/context-sync.ts:37, 126`](../../src/data/corp-holdings/context-sync.ts#L37) — local HOUR_MS
- [`src/data/maps/connection-lifetime.ts:3, 23-25`](../../src/data/maps/connection-lifetime.ts#L3) — local HOUR_MS
- [`src/mapper/authoring/connection-intelligence.ts:48, 83-87`](../../src/mapper/authoring/connection-intelligence.ts#L48) — local HOUR_MS
- [`src/composition/board/api-contract.ts:162`](../../src/composition/board/api-contract.ts#L162) — bare day regex; isIsoCalendarDate does a real calendar check
- [`src/app/(site)/preview/primitives/sample-series.ts:4-8, 18-21`](../../src/app/%28site%29/preview/primitives/sample-series.ts#L4-L8) — local DAY_MS, a dayLabel slice and a weekend check (preview fixture)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/auth/authorization-policy.ts:1-2`](../../src/platform/auth/authorization-policy.ts#L1-L2) — named per-meaning constants; they document themselves. Optionally rewrite as 1 * DAY_MS, but this is not duplication
- [`src/composition/corp-viewer.ts:36`](../../src/composition/corp-viewer.ts#L36) — named per-meaning constant CONTEXT_MAX_AGE_MS
- [`src/data/maps/chain-contract.ts:4`](../../src/data/maps/chain-contract.ts#L4) — named per-meaning constant MAP_CHAIN_UNDO_WINDOW_MS
- [`convex/mapAuthoringSweep.ts:14`](../../convex/mapAuthoringSweep.ts#L14) — named Convex constant; convex may import lib but nothing is duplicated
- [`src/app/(site)/admin/signals.ts:282`](../../src/app/%28site%29/admin/signals.ts#L282) — floor of an elapsed-ms difference against a changelog date, not a calendar-day number; leave it
- [`src/components/composition/board/board-view-model.ts:569`](../../src/components/composition/board/board-view-model.ts#L569) — startOfUtcDay(t) floors epoch ms (with negative-safe modulo); a single site with a different input type
- [`src/app/(site)/preview/primitives/sample-series.ts:25-28`](../../src/app/%28site%29/preview/primitives/sample-series.ts#L25-L28) — the moving average rounds each value; preview data, not worth coupling to admin/aggregate
- [`src/lib/batched-delete.ts:13-15`](../../src/lib/batched-delete.ts#L13-L15) — keep the export where it is (8 delete-pipeline importers); only its body changes

</details>

**Home.** `src/lib/iso-date.ts (extend; it stays dependency-free so client modules such as admin-period can import it). Shared range-key mapping: export it from src/composition/admin-period.ts.`

**Boundary check.** iso-date.ts is in the lib zone (allow: config) and imports nothing. Consumers and the rules that permit lib:
- data/gsc, data/market-history, data/esi-refresh-jobs, data/telemetry, data/corp-holdings, data/maps: data allow includes lib.
- composition (admin-period, board-view, board-assemble, demo-board, net-worth-nightly): composition allow includes lib.
- components-composition (board-view-model): its allow includes lib.
- features (net-worth, industry-planner): features allow includes lib.
- mapper (connection-intelligence): mapper allow includes lib.
- app (admin/*, preview): app allow includes lib.
- lib/batched-delete and lib/format/time: same zone.

search-period.ts (app) importing rangeDays from composition/admin-period is legal under the app rule, which allows composition.

For the bundle, not the zones: admin-period must not import data/telemetry/queries or lib/batched-delete, because RangeSelector.tsx ('use client') imports admin-period values.

**API sketch.**

```ts
// src/lib/iso-date.ts
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export function isoDay(at: Date | number): string; // 'YYYY-MM-DD' (UTC)
export function isoDayStartMs(day: string): number; // Date.parse(`${day}T00:00:00Z`), NaN if invalid
export function isoDayNumber(day: string): number; // Math.floor(isoDayStartMs(day) / DAY_MS)
export function isoDayFromNumber(n: number): string; // isoDay(n * DAY_MS)
export function isUtcWeekend(day: string): boolean;
export function daysBefore(now: Date, days: number): Date; // new Date(now.getTime() - days * DAY_MS)
export function isIsoCalendarDate(value: string): boolean; // existing
// src/lib/batched-delete.ts
export function retentionCutoff(days: number, now: Date): Date { return daysBefore(now, days); }
// src/composition/admin-period.ts
export function rangeDays(key: Exclude<RangeKey, 'all'>): 7 | 30 | 90;
```

**Migration steps.**

1. Add the new exports to src/lib/iso-date.ts and create src/lib/iso-date.test.ts. Port the boundary cases from gsc/queries.test.ts (toDateStr), net-worth queries.db.test.ts (utcDay) and admin/aggregate.test.ts (round trip, consecutive days, weekend), and add tests for daysBefore and isoDayStartMs on invalid input (NaN).
2. Delete formatIsoDay from lib/format/time.ts and point its 3 importers (admin/search/IndexCoverageCard.tsx, admin/search/SearchCards.tsx, settings/account/page.tsx) at isoDay. Move its time.test.ts case to iso-date.test.ts. This leaves one name for one function.
3. Make lib/batched-delete.retentionCutoff delegate to daysBefore. Its 8 importers do not change.
4. data:
- gsc/queries.ts: delete toDateStr and the private retentionCutoff. Use isoDay(retentionCutoff(retentionDays, now)) at 33 and 47, and isoDay(range.from/to) at 53 and 217. Drop the toDateStr test.
- gsc/ingest.ts: delete dateStr. Use isoDay(syncedAt) and isoDay(daysBefore(syncedAt, GSC_WINDOW_DAYS)) at 342-343. In the same file, delete the verbatim private chunk (111-115) and import chunk from '@/lib/array'.
- market-history/ingest.ts: delete DAY_MS and the private retentionCutoff. Use isoDay(retentionCutoff(HISTORY_RETENTION_DAYS, x)) at 31 and 91, and daysBefore(now, 1) at 35.
- esi-refresh-jobs/queries.ts:202: use retentionCutoff(ESI_REFRESH_JOB_RETENTION_DAYS, now).
- telemetry/queries.ts lastNDaysRange: from = daysBefore(now, days).
5. Aggregates: delete toDayNumber in data/market-history/aggregate.ts in favour of isoDayNumber. In app admin/aggregate.ts, delete MS_PER_DAY, toDayNumber, dayString and isWeekend and use the iso-date functions inside zeroFillDaily, then update aggregate.test.ts imports. market-score-inputs.daysSinceHistoryDate: use isoDayStartMs, keep the NaN->null guard, and use isoDayNumber or Math.floor(nowMs / DAY_MS).
6. composition and app:
- admin-period.ts: add rangeDays(key). rangeFor uses daysBefore(now, rangeDays(key)).
- search-period.ts: delete DAY_MS and use rangeDays, DAY_MS and isoDayStartMs. Keep its inclusive (days-1) arithmetic.
- activity-view.ts: delete MS_PER_DAY and the isoDay arrow.
- health-view.ts: delete dayLabel and point ServiceLevelRows.tsx at isoDay.
- users/[userId]/page.tsx: delete formatDate.
- AudienceCard.tsx 29 and 41, search/page.tsx 17, health-metrics.ts 167: use isoDay and DAY_MS.
7. net-worth: delete utcDay from features/net-worth/queries.ts. board-view.ts:88 uses isoDay(now). Move the utcDay test in queries.db.test.ts to iso-date.test.ts. Also replace demo-board utcDayOf, board-assemble:386 and the board-view-model:508 dayStart with isoDay and isoDayStartMs.
8. Unit constants: replace the bare redeclarations with imports of DAY_MS and HOUR_MS (net-worth-nightly, demo-board HOUR/DAY, board-view-model HOUR/DAY, context-sync, connection-lifetime, connection-intelligence, sample-series). Leave the named per-meaning constants as they are.
9. Optional: in composition/board/api-contract.ts:162 use z.string().refine(isIsoCalendarDate). It is a response contract of DB-produced days, so this is hardening only.
10. Run pnpm check through test-runner.

**Tests.** New: src/lib/iso-date.test.ts.

Existing tests that guard behaviour:
- src/app/(site)/admin/period.test.ts (rangeFor)
- src/app/(site)/admin/search/search-period.test.ts (inclusive windows)
- src/app/(site)/admin/aggregate.test.ts (zeroFillDaily, weekend)
- src/data/market-history/aggregate.test.ts
- src/features/industry-planner/market-score-inputs.test.ts (daysSinceHistoryDate null on a bad date)
- src/data/gsc/queries.test.ts
- src/data/telemetry/queries.test.ts (lastNDaysRange)
- src/features/net-worth/queries.db.test.ts
- src/composition/board/board-assemble.test.ts
- src/composition/board/net-worth-nightly.test.ts
- src/composition/board/demo-board.test.ts
- src/lib/format/time.test.ts (remove the formatIsoDay case when it moves)

**Notes.** Behaviour to preserve:
- searchPeriods uses inclusive whole days: from = to - (days-1)*DAY and previous ends at from - DAY. rangeFor uses an exact ms window. Share only the mapping.
- daysSinceHistoryDate must still return null on an unparsable date. isoDayStartMs returns NaN, so keep the guard.
- The gsc and market-history cutoffs compare against Postgres date columns as 'YYYY-MM-DD' strings, so keep the isoDay(...) wrapper there. Do not pass a Date.
- The arithmetic is bit-identical (24*60*60*1000 === 86_400_000).

Why the proposal's routes are rejected:
- Do not route admin-period through data/telemetry lastNDaysRange or lib/batched-delete: RangeSelector.tsx is 'use client' and imports admin-period.
- Do not keep both formatIsoDay and isoDay. Two names for one function is what this change removes.

The gsc/ingest.ts private chunk (111-115) is a verbatim copy of lib/array.chunk. Fix it in the same edit, since that file is being touched anyway.

<sub>Reported by: area:app-site, area:composition, area:data-services, area:features-sites-misc, area:lib-infra, concern:contracts-types, concern:formatting, concern:generic-utils, dupes-triage-2.</sub>

<a id="p089"></a>

## P089: Make lib/format/time the single UTC date home: one input type, adopt formatIsoDay everywhere, add formatUtcMinute and stripUtcYear

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** about -50 / +30
- **Depends on:** [P088](#p088), [P107](#p107)
- **Existing primitive:** `src/lib/format/time.ts:formatUtcDate,formatUtcTime`

**Problem.** lib/format/time.ts has formatUtcDate(Date|string), formatUtcTime(Date|number) and formatIsoDay(Date) with asymmetric inputs, so callers wrap values in new Date(n). formatIsoDay is bypassed by about ten local `toISOString().slice(0, 10)` helpers (dayLabel, formatDate, isoDay, dayString, utcDay, toDateStr, dateStr, utcDayOf, a market-history retentionCutoff, and an inline one in health-metrics). Two of them also re-derive lib/batched-delete's retentionCutoff. The admin 'YYYY-MM-DD HH:MM UTC' stamp is written out four times, including a verbatim copy of traffic-view's private formatSyncedAt (with its 'never') in ScheduledTasks. The board strips the year from formatUtcDate output with the same regex in three places, a regex that is coupled to UTC_DAY's en-GB format.

**Verifier revision.** The UTC-minute stamp is real: the same expression appears in traffic-view, ScheduledTasks, HealthCards and ops-view. Several call sites wrap numbers in `new Date(...)` because the inputs are asymmetric. A wider and more valuable bypass was missed: about ten local helpers (`toISOString().slice(0, 10)`) re-implement the existing formatIsoDay primitive across app, features, data and composition, and two of them also re-implement lib's retentionCutoff. Refuted or descoped: (1) The users/access-view 'drift' is not drift. The column header at users/page.tsx:111 is 'Timestamp (UTC)', so leaving ' UTC' off is intentional. (2) The 'display' date-time style has one consumer (QueueSection), so it fails the second-consumer rule; QueueSection only loses its Date wrapper. (3) server-status 'Up since … UTC' is a single site. (4) Having board-view-model emit short chart labels would regress the tooltips: trend-chart.tsx:60 and WorthTooltip show the full label with the year, and only the ticks strip it. The regex moves to lib instead. (5) The formatEventTime efficiency claim does not hold at real sizes: at most 100 rows (MAP_EVENT_READ_LIMIT, convex/mapChainEvents.ts:5), only while the log is open. Local time versus EVE time is a product decision.

**Sites (22).**

- [`src/lib/format/time.ts:1-31`](../../src/lib/format/time.ts#L1-L31) — UTC_DAY and UTC_TIME are cached; formatUtcDate takes Date\|string\|null, formatUtcTime takes Date\|number\|null, formatIsoDay takes Date only
- [`src/app/(site)/admin/health/health-view.ts:73-75`](../../src/app/%28site%29/admin/health/health-view.ts#L73-L75) — dayLabel = ISO day; consumed at ServiceLevelRows.tsx:68,116-117
- [`src/app/(site)/admin/users/[userId]/page.tsx:35-37,77`](../../src/app/%28site%29/admin/users/[userId]/page.tsx#L35-L37) — formatDate = ISO day
- [`src/app/(site)/admin/activity-view.ts:10,56,59`](../../src/app/%28site%29/admin/activity-view.ts#L10) — isoDay = ISO day
- [`src/app/(site)/admin/aggregate.ts:7-9`](../../src/app/%28site%29/admin/aggregate.ts#L7-L9) — dayString(dayNumber) = ISO day of dayNumber*MS_PER_DAY (tested in aggregate.test.ts)
- [`src/features/net-worth/queries.ts:9-11`](../../src/features/net-worth/queries.ts#L9-L11) — exported utcDay = ISO day; used at src/composition/board/board-view.ts:88 and in queries.db.test.ts 35,181-184
- [`src/data/gsc/queries.ts:16-22`](../../src/data/gsc/queries.ts#L16-L22) — exported toDateStr = ISO day, plus a local retentionCutoff that re-derives lib/batched-delete retentionCutoff
- [`src/data/gsc/ingest.ts:107-109`](../../src/data/gsc/ingest.ts#L107-L109) — dateStr = ISO day
- [`src/data/market-history/ingest.ts:17-20,31,91`](../../src/data/market-history/ingest.ts#L17-L20) — local retentionCutoff = lib retentionCutoff + ISO day
- [`src/data/telemetry/health-metrics.ts:167`](../../src/data/telemetry/health-metrics.ts#L167) — inline ISO day in the 'last synced' headline
- [`src/composition/board/demo-board.ts:843-845`](../../src/composition/board/demo-board.ts#L843-L845) — utcDayOf(ms) = ISO day
- [`src/app/(site)/admin/traffic-view.ts:21-25`](../../src/app/%28site%29/admin/traffic-view.ts#L21-L25) — formatSyncedAt: UTC-minute stamp or 'never'
- [`src/app/(site)/admin/health/ScheduledTasks.tsx:123-128`](../../src/app/%28site%29/admin/health/ScheduledTasks.tsx#L123-L128) — inline verbatim copy of formatSyncedAt
- [`src/app/(site)/admin/health/HealthCards.tsx:95-97`](../../src/app/%28site%29/admin/health/HealthCards.tsx#L95-L97) — inline UTC-minute stamp
- [`src/app/(site)/admin/ops-view.ts:64`](../../src/app/%28site%29/admin/ops-view.ts#L64) — inline UTC-minute stamp
- [`src/app/(site)/admin/users/access-view.ts:6-8,41`](../../src/app/%28site%29/admin/users/access-view.ts#L6-L8) — formatDateTime without ' UTC'; intentional, since the column header reads 'Timestamp (UTC)' (users/page.tsx:111). Optional migration only
- [`src/components/composition/board/board-view-model.ts:322`](../../src/components/composition/board/board-view-model.ts#L322) — formatUtcDate(new Date(point.t)) wrapper
- [`src/components/composition/board/WorthChart.tsx:39,47,68`](../../src/components/composition/board/WorthChart.tsx#L39) — Date wrapper; shortDate regex strips the year for ticks
- [`src/components/composition/board/sections/QueueSection.tsx:93`](../../src/components/composition/board/sections/QueueSection.tsx#L93) — formatUtcDate(new Date(timeline.endsAt)) wrapper
- [`src/components/composition/server-status-presentation.ts:53`](../../src/components/composition/server-status-presentation.ts#L53) — formatUtcTime(new Date(status.startedAt)) wrapper
- [`src/components/composition/board/sections/WalletSection.tsx:23`](../../src/components/composition/board/sections/WalletSection.tsx#L23) — formatUtcDate(row.date).replace(/ \d{4}$/, '')
- [`src/components/composition/board/BalanceTrend.tsx:35`](../../src/components/composition/board/BalanceTrend.tsx#L35) — formatTick strips the year

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/log/map-event-copy.ts:71-79`](../../src/mapper/log/map-event-copy.ts#L71-L79) — formatEventTime shows local time and builds an Intl formatter per call, but it renders at most 100 rows (convex/mapChainEvents.ts:5) only while the log is open. Not a material cost; UTC versus local is a product decision
- [`src/platform/auth/affiliation-store.ts:116-119`](../../src/platform/auth/affiliation-store.ts#L116-L119) — builds a SQL timestamp literal, not a display string
- [`src/scripts/map-replay.ts:73`](../../src/scripts/map-replay.ts#L73) — filename stamp with seconds
- [`src/components/composition/board/sections/QueueSection.tsx:93`](../../src/components/composition/board/sections/QueueSection.tsx#L93) — the date-time concatenation is the only consumer of a 'display' style, so no new style; only the Date wrapper goes
- [`src/app/(site)/preview/primitives/sample-series.ts:6-8`](../../src/app/%28site%29/preview/primitives/sample-series.ts#L6-L8) — preview fixture; may adopt formatIsoDay but not required

</details>

**Home.** `src/lib/format/time.ts (existing): widen inputs, extend formatIsoDay, add formatUtcMinute and stripUtcYear. Reuse lib/batched-delete retentionCutoff for the two cutoff helpers.`

**Boundary check.** Both helpers live in the lib zone; the lib rule allows only config, and neither time.ts nor batched-delete.ts imports other zones. Consumers: app (admin/*) is allowed lib by the app rule. features (net-worth) is allowed lib by the features rule. data (gsc, market-history, telemetry) is allowed lib by the data rule. composition (board/demo-board) is allowed lib by the composition rule. components-composition (board/*, server-status-presentation) is allowed lib by the components-composition rule. All are legal.

**API sketch.**

```ts
type DateInput = Date | string | number;
function toDate(value: DateInput | null): Date | null // private; null for null or an invalid date
export function formatUtcDate(value: DateInput | null): string   // '9 Oct 2026' | '—'
export function formatUtcTime(value: DateInput | null): string   // '14:05' | '—'
export function formatIsoDay(value: Date | number): string       // '2026-10-09'; still throws on an invalid date, as every local copy does today
export function formatUtcMinute(value: DateInput | null, empty = '—'): string // '2026-10-09 14:05 UTC'
export function stripUtcYear(label: string): string             // '9 Oct 2026' -> '9 Oct'; lives next to UTC_DAY, whose format it depends on
```

**Migration steps.**

1. time.ts: add the private toDate and route formatUtcDate and formatUtcTime through it. Widen formatIsoDay to Date | number. Add formatUtcMinute (ISO slicing, so output is byte-identical to today's) and stripUtcYear. Extend time.test.ts.
2. Remove the Date wrappers at board-view-model.ts:322, WorthChart.tsx:47, QueueSection.tsx:93 and server-status-presentation.ts:53.
3. UTC-minute stamps: delete traffic-view formatSyncedAt and use formatUtcMinute(input.lastSyncedAt, 'never'). Replace ScheduledTasks.tsx 125-127 with formatUtcMinute(lastSyncedAt, 'never'), HealthCards.tsx:96 with formatUtcMinute(event.occurredAt), and ops-view.ts:64 with formatUtcMinute(row.finishedAt ?? row.createdAt). access-view is optional: either keep it, or use formatUtcMinute and rename the header to 'Timestamp'.
4. ISO day: delete health-view dayLabel (repoint ServiceLevelRows 20,68,116-117), users/[userId] formatDate, activity-view isoDay, gsc/ingest dateStr, demo-board utcDayOf, and net-worth utcDay (repoint board-view.ts:88 and queries.db.test.ts), all to formatIsoDay. Delete gsc/queries toDateStr (repoint 53 and 217, and move its test cases to time.test.ts). Make aggregate.ts dayString return formatIsoDay(dayNumber * MS_PER_DAY). health-metrics.ts:167 uses formatIsoDay(input.lastSyncedAt).
5. Retention cutoffs: replace the gsc/queries.ts 20-22 and market-history/ingest.ts 17-20 bodies with formatIsoDay(retentionCutoff(days, now)), importing retentionCutoff from '@/lib/batched-delete'.
6. Year strip: WalletSection:23 uses stripUtcYear(formatUtcDate(row.date)) and BalanceTrend:35 uses formatTick={stripUtcYear}. In WorthChart, delete shortDate (39) and use stripUtcYear at 68. Leave the chart labels with the year for tooltips.
7. Leave formatEventTime alone unless product chooses UTC. If it stays local, a module-level Intl.DateTimeFormat is an optional micro-cleanup.

**Tests.** time.test.ts: numeric input for formatUtcDate and formatIsoDay; formatUtcMinute for a Date, a number and an ISO string, plus null -> '—' and null with 'never' -> 'never'; stripUtcYear('9 Oct 2026') -> '9 Oct'; move the toDateStr and utcDay cases from gsc/queries.test.ts 9-16 and net-worth/queries.db.test.ts 181-184 into it. Existing guards: aggregate.test.ts (dayString), traffic-view.test.ts (asOf), ops-view.test.ts (deriveDeadLetterView timing), access-view.test.ts, activity-view.test.ts, health-metrics.test.ts (GSC 'last synced' headline), board-view-model tests for balanceChart labels.

**Notes.** All replacements give byte-identical output: formatUtcMinute uses the same ISO slicing, and formatIsoDay is the same slice. Order matters only because P088 edits the same file. Keep formatIsoDay throwing on invalid input, as every local copy does; the data-layer callers pass real Dates. Lead outside this scope: src/data/esi-refresh-jobs/queries.ts:202 also hand-derives a retention cutoff Date instead of calling lib retentionCutoff. Separately, admin/aggregate.ts:4-6 toDayNumber and data/market-history/aggregate.ts:8 parse an ISO day to a day number the same way; that pair is worth a separate look.

<sub>Reported by: area:mapper-surface, concern:formatting, dupes-triage-1.</sub>

<a id="p177"></a>

## P177: Fix retention-pruner drift with existing retentionCutoff and formatIsoDay; keep per-owner pruners

- **Status:** [ ] not started
- **Category:** server-pipeline · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -20 / +12: delete two local retentionCutoff functions, toDateStr and dateStr; add a 3-line helper; small edits to the test and housekeeping.
- **Depends on:** [P107](#p107), [P089](#p089)
- **Existing primitive:** `src/lib/batched-delete.ts:deleteInBatches,retentionCutoff`

**Problem.** The housekeeping pruners already share deleteInBatches and retentionCutoff (src/lib/batched-delete.ts:13-39), but the copies have drifted.
(1) pruneUsageLogs (src/data/telemetry/log.ts:43-50) deletes through the global db. Every sibling takes `database`, and usage_logs is the only daily-pruned table with no Postgres prune test.
(2) src/data/gsc/queries.ts:20-22 and src/data/market-history/ingest.ts:17-20 each define a private `retentionCutoff` that returns a YYYY-MM-DD string, shadowing the lib function that returns a Date. gsc also has two copies of lib formatIsoDay: toDateStr at queries.ts:16-18 and dateStr at ingest.ts:107-109.
(3) src/data/esi-refresh-jobs/queries.ts:202 recomputes the 7-day retention cutoff inline with 86_400_000, although the module already imports retentionCutoff.
(4) src/composition/table-retention.db.test.ts:29-35 builds one CUTOFF from GSC_RETENTION_DAYS and reuses it as the boundary for corp_access_audit and domain_events. That is correct only while all three constants equal 400.

**Verifier revision.** The drift is real, but the proposed fix is too big. Keep: pruneUsageLogs uses the global db while every sibling takes `database`, and usage_logs is the only daily-pruned table with no Postgres test. Keep: gsc and market-history each define a private `retentionCutoff` that returns a string and shadows the lib function of the same name, which returns a Date. Keep: gsc has two copies of formatIsoDay, esi-refresh-jobs/queries.ts:202 bypasses retentionCutoff, and table-retention.db.test.ts reuses the GSC cutoff for other tables. Drop pruneOlderThan. Each single-column pruner body is already two lines, so the helper saves about one line per site. It would also have to handle date-mode string columns (gsc) differently from timestamptz columns. The write-site scanner (src/esi-datasets/__tests__/write-sites.ts:97-99) only recognizes `deleteInBatches(`, so moving 7 deletes behind a new name would silently drop them from the data-ownership gate. Drop RETENTION_POLICIES. Retention days are already single-sourced constants that both lists import. TABLE_GROWTH_STORIES is a test-only census of every table, and its pruned set differs from DELETE_TASKS: net_worth_days is pruned on snapshot write, market_history is also pruned on refresh, and esi_refresh_jobs has two tiers. Deriving the census from a production list would make the gate check itself. Declaring {table, column, days} in composition would also move deletes out of the slices that own those tables.

**Sites (18).**

- [`src/lib/batched-delete.ts:13-39`](../../src/lib/batched-delete.ts#L13-L39) — canonical retentionCutoff (returns a Date) and deleteInBatches
- [`src/lib/format/time.ts:29-31`](../../src/lib/format/time.ts#L29-L31) — existing formatIsoDay primitive
- [`src/data/telemetry/log.ts:43-50`](../../src/data/telemetry/log.ts#L43-L50) — pruneUsageLogs has no database parameter and uses the global db (drift)
- [`src/data/telemetry/queries.ts:48-53`](../../src/data/telemetry/queries.ts#L48-L53) — re-exports pruneUsageLogs; housekeeping imports it from here
- [`src/composition/pipelines/housekeeping.ts:62-111`](../../src/composition/pipelines/housekeeping.ts#L62-L111) — DELETE_TASKS; usage_logs (68-70) is the only task that does not pass db
- [`src/data/gsc/queries.ts:16-50`](../../src/data/gsc/queries.ts#L16-L50) — toDateStr copies formatIsoDay; the local string retentionCutoff shadows lib; two pruners use it
- [`src/data/gsc/queries.ts:52-54`](../../src/data/gsc/queries.ts#L52-L54) — toDateStr also used for range bounds (and at 217)
- [`src/data/gsc/ingest.ts:107-109`](../../src/data/gsc/ingest.ts#L107-L109) — dateStr, a third copy of formatIsoDay in the gsc slice (used at 343)
- [`src/data/market-history/ingest.ts:11-20`](../../src/data/market-history/ingest.ts#L11-L20) — local DAY_MS and a string retentionCutoff(now) bound to HISTORY_RETENTION_DAYS
- [`src/data/market-history/ingest.ts:26-46`](../../src/data/market-history/ingest.ts#L26-L46) — pruneStaleMarketHistory uses the local cutoff at 31
- [`src/data/market-history/ingest.ts:86-93`](../../src/data/market-history/ingest.ts#L86-L93) — persistHistory trim uses the local cutoff at 91
- [`src/data/esi-refresh-jobs/queries.ts:200-203`](../../src/data/esi-refresh-jobs/queries.ts#L200-L203) — inline cutoff arithmetic bypasses the retentionCutoff the module already imports (line 4)
- [`src/data/domain-events/queries.ts:38-46`](../../src/data/domain-events/queries.ts#L38-L46) — pruneDomainEvents defaults retentionDays, while most siblings require it (minor drift)
- [`src/platform/auth/affiliation-store.ts:240-248`](../../src/platform/auth/affiliation-store.ts#L240-L248) — pruneCorpAccessAudit, the canonical shape
- [`src/platform/auth/verification-retention.ts:6-24`](../../src/platform/auth/verification-retention.ts#L6-L24) — two canonical-shape pruners
- [`src/composition/table-retention.db.test.ts:28-35`](../../src/composition/table-retention.db.test.ts#L28-L35) — CUTOFF from GSC_RETENTION_DAYS reused for corp audit and domain events; hand-computed ms arithmetic
- [`src/composition/table-retention.db.test.ts:154-158`](../../src/composition/table-retention.db.test.ts#L154-L158) — prunes 5 tables; usage_logs absent because pruneUsageLogs cannot take harness.db
- [`src/data/gsc/queries.test.ts:9-18`](../../src/data/gsc/queries.test.ts#L9-L18) — tests toDateStr; formatIsoDay is already tested at src/lib/format/time.test.ts:15

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/pipelines/esi-snapshot-retention.ts:8-47`](../../src/composition/pipelines/esi-snapshot-retention.ts#L8-L47) — Bespoke predicate (a newer snapshot exists and owned_assets does not reference it). Already uses lib retentionCutoff correctly.
- [`src/data/wh-statics/queries.ts:365-390`](../../src/data/wh-statics/queries.ts#L365-L390) — Bespoke status and referenced-snapshot predicate; already uses lib retentionCutoff.
- [`src/data/esi-refresh-jobs/queries.ts:365-387`](../../src/data/esi-refresh-jobs/queries.ts#L365-L387) — Two-tier OR retention; already correct with lib retentionCutoff.
- [`src/composition/account-lifecycle/tracking-receipt-retention.ts:7-28`](../../src/composition/account-lifecycle/tracking-receipt-retention.ts#L7-L28) — Checkpointed cursor drain using MERGE_RECEIPT_RETENTION_MS; a different mechanism.
- [`src/composition/__tests__/table-growth-registry.ts:24-31, 63-164`](../../src/composition/__tests__/table-growth-registry.ts#L24-L31) — Test-side census of every schema table (pruned, bounded, purge-managed, retained). Its pruned set includes net_worth_days, which housekeeping does not prune. It is not a second copy of DELETE_TASKS; it imports the same constants.
- [`src/esi-datasets/__tests__/write-sites.ts:97-99, 114-118`](../../src/esi-datasets/__tests__/write-sites.ts#L97-L99) — Constraint, not a site: the data-ownership scanner only detects batched deletes spelled `deleteInBatches(db, table, …)`. That is why pruneOlderThan and a central policy list were rejected.

</details>

**Home.** `src/lib/batched-delete.ts (add retentionCutoffDay next to retentionCutoff), reusing src/lib/format/time.ts formatIsoDay`

**Boundary check.** Home zone is lib. {from: lib, allow: [config]}; batched-delete.ts importing @/lib/format/time is an intra-zone import. Consumers: data/gsc, data/market-history, data/telemetry and data/esi-refresh-jobs are in zone data, and {from: data} allows lib. src/composition/pipelines/housekeeping.ts and src/composition/table-retention.db.test.ts are in zone composition, and {from: composition} allows data, platform/auth and lib. platform/auth pruners are unchanged ({from: platform/auth} allows lib). No new cross-zone edges.

**API sketch.**

```ts
// src/lib/batched-delete.ts
export function retentionCutoffDay(retentionDays: number, now: Date): string; // = formatIsoDay(retentionCutoff(retentionDays, now))

// src/data/telemetry/log.ts (signature aligned with siblings)
export function pruneUsageLogs(database: AnyPgDb, retentionDays: number, now?: Date, deadline?: number): Promise<BatchedDeleteResult>;
```

**Migration steps.**

1. Add retentionCutoffDay(retentionDays, now) to src/lib/batched-delete.ts as formatIsoDay(retentionCutoff(retentionDays, now)), importing formatIsoDay from '@/lib/format/time'.
2. src/data/gsc/queries.ts: delete the local retentionCutoff (20-22) and have pruneGscSearchAnalytics and pruneGscUrlInspections call retentionCutoffDay. Replace toDateStr (16-18) with formatIsoDay at its uses (53, 217) and delete the export.
3. src/data/gsc/queries.test.ts: delete the toDateStr describe (9-18). Move its UTC day-boundary assertions (23:59:59Z and 00:00:00Z) into src/lib/format/time.test.ts beside the existing formatIsoDay case.
4. src/data/gsc/ingest.ts: delete dateStr (107-109) and use formatIsoDay at each call site, including 343.
5. src/data/market-history/ingest.ts: delete the local retentionCutoff (17-20) and use retentionCutoffDay(HISTORY_RETENTION_DAYS, now) at line 31 and retentionCutoffDay(HISTORY_RETENTION_DAYS, updatedAt) at line 91. Keep DAY_MS, which line 35 still uses.
6. src/data/telemetry/log.ts: add a leading `database: AnyPgDb` parameter to pruneUsageLogs and delete through it. Update housekeeping.ts:69 to pruneUsageLogs(db, USAGE_LOG_RETENTION_DAYS, now, deadline). The re-export in telemetry/queries.ts:48-53 stays.
7. src/data/esi-refresh-jobs/queries.ts:202: replace `new Date(now.getTime() - ESI_REFRESH_JOB_RETENTION_DAYS * 86_400_000)` with retentionCutoff(ESI_REFRESH_JOB_RETENTION_DAYS, now).
8. src/composition/table-retention.db.test.ts: compute each table's boundary with retentionCutoff(<its own constant>, NOW), using retentionCutoffDay for the gsc day columns. Add 'usage_logs' to the harness tables, seed old/boundary/new rows, and assert pruneUsageLogs(database, USAGE_LOG_RETENTION_DAYS, NOW) keeps the boundary and new rows.
9. Optional: remove the retentionDays default from pruneDomainEvents; housekeeping and the tests always pass it.
10. Do NOT add pruneOlderThan or a RETENTION_POLICIES list. Keep the named per-owner pruners calling deleteInBatches(database, table, …) so the write-site scanner keeps attributing them.

**Tests.** Extend src/composition/table-retention.db.test.ts with usage_logs and per-table cutoffs. Move the toDateStr UTC-boundary cases into src/lib/format/time.test.ts. retentionCutoffDay is exercised by the gsc prune assertions in table-retention.db.test.ts and by pruneStaleMarketHistory in src/composition/pipelines/housekeeping.db.test.ts:79; add a one-line unit assertion if coverage needs it. These existing tests guard the behavior: src/composition/pipelines/housekeeping.test.ts (its mocks ignore signatures, so the pruneUsageLogs arity change is safe), src/data/esi-refresh-jobs/esi-refresh-jobs.db.test.ts:86, src/data/wh-statics/queries.db.test.ts:411, src/composition/pipelines/esi-snapshot-retention.db.test.ts:54, and the cross-owner write gate in src/esi-datasets/dataset-declarations.test.ts:298-314, which stays green because deleteInBatches call shapes are unchanged.

**Notes.** Semantics do not change. The gsc and market-history string cutoffs equal formatIsoDay(retentionCutoff(days, now)), the UTC calendar day of the cutoff instant, so `lt(date, day)` still keeps the boundary day, as the existing test asserts with CUTOFF_DAY. pruneUsageLogs keeps deleting through the same global db, because housekeeping passes db. The test drift is latent: table-retention.db.test.ts is right only because GSC, CORP_ACCESS_AUDIT and DOMAIN_EVENT retention are all 400. Changing one of them would fail the test confusingly rather than pass vacuously. Lead outside this scope: more ad-hoc formatIsoDay copies at src/features/net-worth/queries.ts:10, src/app/(site)/admin/health/health-view.ts:74, src/app/(site)/admin/activity-view.ts:10 and src/composition/board/demo-board.ts:844.

<sub>Reported by: area:data-services, area:platform, concern:feature-skeleton, concern:persistence.</sub>

<a id="p085"></a>

## P085: Route client-rendered and drifted number grouping through formatQuantity (null-aware), keep unit suffixes local

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -8 / +6 (no new modules)
- **Depends on:** —
- **Existing primitive:** `src/lib/format/number.ts:formatQuantity,formatCompactQuantity`

**Problem.** formatQuantity pins en-US so that server and client output agree. Some user-facing sites still call bare toLocaleString(). In ResourceRow, a 'use client' component that is server-rendered on standalone site pages, volume and unit counts follow the host locale, so non-en-US browsers hydrate different digits than the server HTML. The same DPS value is grouped in en-US on the card header but in the host locale in WaveCard. The mapper codex panel mixes host-locale grouped kilograms with en-US compact kilograms. The industry cockpit inlines toLocaleString('en-US') instead of the primitive. Separately, the admin 'N active · M dead' queue summary string is defined twice.

**Verifier revision.** The bypass is real, but the hydration claim holds for only one surface and most of the 60 sites are not at risk. Real: ResourceRow is 'use client' and is server-rendered on the standalone site path (SiteCard.tsx:60 → SiteDetailsBody → SiteResourcesLive → SiteResourceRow). Its meta comes from resource-row-view's bare toLocaleString (formatM3 and the unit counts), so a de-DE or fr-FR browser hydrates '4.000 m³' against server '4,000 m³', a text hydration mismatch. Real drift: WaveCard formatDps uses the host locale while site-card-header-view pins en-US for the same dpsTotal. The mapper codex panel shows host-locale full grouping (formatFactKg, the massRowDisplay title) next to en-US compact formatKilograms, which a de-DE user would read as '1.5B kg' beside '2.000.000.000 kg', with ambiguous separators. CockpitKpis:130 hand-rolls formatQuantity. Not real or out of scope: the mapper editor is interaction-only and never server-rendered; admin views are server components (deterministic server locale), and the admin charts are dynamic({ssr:false}) or measured client-only; ui DistributionBars/StackedShareBar only render the default formatter in server-rendered admin cards. A lib formatVolume/formatMass has no second consumer: volume appears only in resource-row-view and mass only in mapper/authoring. trimNumber cannot be deleted because formatDurationBound uses it (connection-intelligence.ts:88). Rewriting the EHP 'k' copy would change the tested 'EHP 100k' for no locale gain, since it already pins en-US. Note that the #418 entry in src/AGENTS.md concerns context changes; the hazard here is an ordinary text mismatch.

**Sites (12).**

- [`src/lib/format/number.ts:1-15`](../../src/lib/format/number.ts#L1-L15) — canonical en-US formatQuantity / formatCompactQuantity; formatPct already maps null to '—'
- [`src/features/wormhole-sites/components/resource-row-view.ts:5-8, 21-31`](../../src/features/wormhole-sites/components/resource-row-view.ts#L5-L8) — formatM3 and the ore/gas unit counts use bare toLocaleString; the inputs are integer bigint columns (schema.ts:102-103)
- [`src/features/wormhole-sites/components/ResourceRow.tsx:1, 30, 45`](../../src/features/wormhole-sites/components/ResourceRow.tsx#L1) — 'use client' renderer of that meta
- [`src/features/wormhole-sites/components/SiteCard.tsx:60, 69`](../../src/features/wormhole-sites/components/SiteCard.tsx#L60) — standalone path server-renders SiteDetailsBody (hydration risk); catalogue path uses LazySiteDetails
- [`src/features/wormhole-sites/components/LazySiteDetails.tsx:15-37`](../../src/features/wormhole-sites/components/LazySiteDetails.tsx#L15-L37) — renders details only after toggle, client-only, so there is no mismatch on this path
- [`src/features/wormhole-sites/components/WaveCard.tsx:28, 50-53`](../../src/features/wormhole-sites/components/WaveCard.tsx#L28) — formatDps uses bare toLocaleString with null → '—'; dpsTotal is an integer (npc-stats/math.ts:240-242)
- [`src/features/wormhole-sites/components/site-card-header-view.ts:15-19`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L15-L19) — same dpsTotal pinned to en-US; the EHP 'k' copy is already en-US
- [`src/features/industry-planner/components/CockpitKpis.tsx:130`](../../src/features/industry-planner/components/CockpitKpis.tsx#L130) — inline toLocaleString('en-US') duplicates formatQuantity
- [`src/mapper/authoring/connection-fields.tsx:267-270, 619-621`](../../src/mapper/authoring/connection-fields.tsx#L267-L270) — formatFactKg uses host-locale full grouping
- [`src/mapper/authoring/connection-intelligence.ts:67-79, 114-115`](../../src/mapper/authoring/connection-intelligence.ts#L67-L79) — en-US compact formatKilograms label next to a host-locale grouped title in the same row
- [`src/app/(site)/admin/signals.ts:252-262`](../../src/app/%28site%29/admin/signals.ts#L252-L262) — queueLine value: `${due} active · ${dead} dead`
- [`src/app/(site)/admin/health/health-view.ts:4-11, 35-41`](../../src/app/%28site%29/admin/health/health-view.ts#L4-L11) — identical queue value string; already imports queueLevel from '../signals'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/actions-view.ts:31-36`](../../src/app/%28site%29/admin/actions-view.ts#L31-L36) — different copy and order ('dead-lettered' first) on an action row that leads with the actionable count; deliberate, not the same string
- [`src/app/(site)/admin/charts.tsx:20-30, 141`](../../src/app/%28site%29/admin/charts.tsx#L20-L30) — dynamic({ssr:false}) / Measured client-only charts; tick values can be fractional, so the rounding formatQuantity would collapse ticks
- [`src/app/(site)/admin/ops-view.ts:36-118`](../../src/app/%28site%29/admin/ops-view.ts#L36-L118) — server-only view; output is deterministic (server locale), so a sweep is cosmetic. avgDurationMs (118) is fractional
- [`src/app/(site)/admin/metric-view.ts:10-64`](../../src/app/%28site%29/admin/metric-view.ts#L10-L64) — server-only, cosmetic
- [`src/app/(site)/admin/esi/esi-view.ts:18-87`](../../src/app/%28site%29/admin/esi/esi-view.ts#L18-L87) — server-only, cosmetic
- [`src/app/(site)/admin/health/ServiceLevelRows.tsx:61, 89, 136`](../../src/app/%28site%29/admin/health/ServiceLevelRows.tsx#L61) — server component, cosmetic
- [`src/data/telemetry/health-metrics.ts:31-36`](../../src/data/telemetry/health-metrics.ts#L31-L36) — refreshVolumeSummary feeds the server-rendered admin ScheduledTasks; cosmetic (optional formatQuantity swap, data → lib is legal)
- [`src/components/ui/distribution-bars.tsx:44`](../../src/components/ui/distribution-bars.tsx#L44) — default formatter only used by server-rendered admin cards; ui may import nothing, so leave it
- [`src/components/ui/stacked-share-bar.tsx:83`](../../src/components/ui/stacked-share-bar.tsx#L83) — same: server-rendered admin consumers only
- [`src/mapper/log/map-event-copy.ts:72`](../../src/mapper/log/map-event-copy.ts#L72) — Date formatting in a client-only log; a different concept (user-locale timestamps)
- [`src/mapper/authoring/connection-intelligence.ts:81-90, 209-211`](../../src/mapper/authoring/connection-intelligence.ts#L81-L90) — trimNumber is still needed by formatDurationBound; do not delete

</details>

**Home.** `src/lib/format/number.ts (existing formatQuantity, widened to accept null); unit suffixes stay with their single owners (formatM3 in resource-row-view.ts, kg helpers in mapper/authoring); queue value exported from src/app/(site)/admin/signals.ts`

**Boundary check.** number.ts is in zone lib. Consumers features/wormhole-sites and features/industry-planner are allowed by {from: features, allow: [..., lib, ...]}; mapper/authoring by {from: mapper, allow: [..., lib, ...]}; app admin by {from: app, allow: [..., lib, ...]}. All of these zones already import lib/format. Leave src/components/ui untouched, since {from: ui, allow: []} forbids lib. The queue helper stays within zone app (signals.ts → health/health-view.ts, an existing import edge).

**API sketch.**

```ts
// src/lib/format/number.ts
export function formatQuantity(value: number | null): string; // null or non-finite -> '—'; else Math.round(value).toLocaleString('en-US')

// src/app/(site)/admin/signals.ts
export function queueSummaryValue(queue: QueueSummary): string; // `${formatQuantity(due)} active · ${formatQuantity(deadLettered)} dead`
```

**Migration steps.**

1. Widen formatQuantity in src/lib/format/number.ts to (value: number | null) and return '—' for null or non-finite, like formatPct. The 32 existing number callers are unaffected apart from NaN printing '—' instead of 'NaN'. Extend number.test.ts.
2. Hydration-risk site first: in resource-row-view.ts make formatM3 return `${formatQuantity(m3)} m³` for non-null input and keep the '—' for null; replace units.toLocaleString() at 24 and 30 with formatQuantity. The inputs are integer bigint columns, so rounding does not change output.
3. WaveCard.tsx: delete formatDps and render formatQuantity(wave.dpsTotal). site-card-header-view.ts:18 uses formatQuantity(peakDps) and `${formatQuantity(totalEhp / 1000)}k`, which keeps 'DPS 500 · EHP 100k'.
4. CockpitKpis.tsx:130: formatQuantity(callout.units).
5. Mapper: formatFactKg (connection-fields.tsx:619-621) becomes `${formatQuantity(kg)} kg`, and the massRowDisplay title (connection-intelligence.ts:115) uses formatQuantity for minKg and maxKg. Keep formatKilograms and trimNumber.
6. Admin (optional, cosmetic): export queueSummaryValue from signals.ts, use it in queueLine (256) and health-view measure() (38). Leave actions-view's different copy. Any wider admin toLocaleString sweep is optional and must skip fractional values (ops-view:118, chart tick formatters).

**Tests.** Existing guards: resource-row-view.test.ts:27-45 ('4,000 m³', '250 rocks · 4,000 m³', '30 units · 600 m³'); site-card-header-view.test.ts:56 ('DPS 500 · EHP 100k'); src/lib/format/number.test.ts; connection-intelligence.test.ts:71 ('1.5M kg') and :87 (title contains 'remaining'). New: number.test.ts null/NaN → '—'; connection-fields.test.ts asserting a codex fact like '2,000,000,000 kg'; optionally a resource-row-view test that stubs Number.prototype.toLocaleString to a de-DE formatter and asserts the output is unchanged (proves locale independence).

**Notes.** Scope was cut from about 60 sites to 8. Only ResourceRow's meta can trigger a hydration mismatch, and only on the standalone (server-rendered) site path. The other user-facing sites are drift or consistency fixes, and the admin sites run server-side with a deterministic locale. Rejected parts of the proposal: lib formatVolume/formatMass (one consumer area each), a non-rounding formatNumber (only needed by the excluded admin chart and avg-duration sites), deleting trimNumber (formatDurationBound depends on it), switching the EHP copy to Intl compact ('100k' → '100K' changes tested copy) and the ui changes. formatQuantity rounds; every migrated value is an integer (bigint columns, Math.round'ed dpsTotal) or kg, where sub-unit precision is meaningless.

<sub>Reported by: area:features-sites-misc, area:lib-infra, area:mapper-chain, concern:formatting.</sub>

<a id="p090"></a>

## P090: Move pluralCount to lib/format/number as formatCount and replace the count-and-noun ternaries

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** about -40 / +12
- **Depends on:** [P085](#p085)
- **Existing primitive:** `src/features/industry-planner/multibuy.ts:pluralCount`

**Problem.** `pluralCount(n, singular, plural)` lives in features/industry-planner/multibuy.ts, used only by MultibuyPanel. Meanwhile, sites across app, data, mapper, features and components-composition write `${n} noun${n === 1 ? '' : 's'}` inline or through local wrappers (ProfileBar memberCount, TrafficCards pluralUsers, scanner-prompt-rail missingPromptCopy, job-view jobsSubtitle, planner daysPhrase). Some group the count with toLocaleString and others print it raw. signals.ts:419 forgets the plural entirely and prints 'Refresh backlog of 1 jobs'.

**Verifier revision.** Real, but low value per site. pluralCount is a general helper stranded in a feature module (the data zone cannot reach it), and about 20 call sites hand-roll the same count-and-noun ternary. Number grouping drifts within the admin console: signals, health-view and TrafficCards group, while health-metrics 139 and 196 do not. A missed site is a real copy bug: signals.ts:419 prints '1 jobs'. Changes from the proposal: (1) The word-only `plural()` export is dropped. The toast copy ('Signature removed'), verb agreement ('character is') and ProfileDialogs (whose singular has no count) read better inline. (2) access-view adminPlural and resultsHint are dead view fields: users/page.tsx reads only view.nonAdminMatches. Delete them rather than migrate them. (3) The home is the existing src/lib/format/number.ts next to formatQuantity, not a new file.

**Sites (18).**

- [`src/features/industry-planner/multibuy.ts:38-40`](../../src/features/industry-planner/multibuy.ts#L38-L40) — existing pluralCount; tested at multibuy.test.ts 173-177
- [`src/features/industry-planner/components/MultibuyPanel.tsx:67,125`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L67) — only consumers
- [`src/components/composition/industry-workspace/ProfileBar.tsx:12-15`](../../src/components/composition/industry-workspace/ProfileBar.tsx#L12-L15) — memberCount re-implements it
- [`src/app/(site)/admin/traffic/TrafficCards.tsx:53-55,157`](../../src/app/%28site%29/admin/traffic/TrafficCards.tsx#L53-L55) — pluralUsers with grouping, passed to DistributionBars formatCount
- [`src/mapper/log/map-event-copy.ts:18-35`](../../src/mapper/log/map-event-copy.ts#L18-L35) — four inline system(s) and signature(s) ternaries
- [`src/mapper/signatures/scanner-prompt-rail.tsx:15-19`](../../src/mapper/signatures/scanner-prompt-rail.tsx#L15-L19) — missingPromptCopy is formatCount(count, 'signature') + ' missing from scan'
- [`src/data/telemetry/health-metrics.ts:35,139,196`](../../src/data/telemetry/health-metrics.ts#L35) — day(s), failed run(s) and budget exhaustion(s); counts not grouped
- [`src/app/(site)/admin/signals.ts:300,410,419`](../../src/app/%28site%29/admin/signals.ts#L300) — job(s) grouped; line 419 always says 'jobs' (a bug when due is 1)
- [`src/app/(site)/admin/health/health-view.ts:78`](../../src/app/%28site%29/admin/health/health-view.ts#L78) — run/runs grouped
- [`src/app/(site)/settings/corporations/corporations-view.ts:68`](../../src/app/%28site%29/settings/corporations/corporations-view.ts#L68) — corporation(s)
- [`src/app/(site)/settings/corporations/page.tsx:41`](../../src/app/%28site%29/settings/corporations/page.tsx#L41) — structure(s)
- [`src/features/maps/TrashWindow.tsx:210`](../../src/features/maps/TrashWindow.tsx#L210) — selected map(s)
- [`src/features/wormhole-sites/site-meta.ts:32`](../../src/features/wormhole-sites/site-meta.ts#L32) — NPC wave(s)
- [`src/features/industry-jobs/job-view.ts:64`](../../src/features/industry-jobs/job-view.ts#L64) — '1 job' / 'N jobs'
- [`src/features/industry-planner/market-score-inputs.ts:24-28`](../../src/features/industry-planner/market-score-inputs.ts#L24-L28) — daysPhrase: '<1 day' guard and rounding, then day(s)
- [`src/components/composition/board/sections/ClonesSection.tsx:37`](../../src/components/composition/board/sections/ClonesSection.tsx#L37) — implant(s)
- [`src/components/composition/board/sections/AttributesSection.tsx:56`](../../src/components/composition/board/sections/AttributesSection.tsx#L56) — 'bonus remap(s)'
- [`src/components/composition/GlobalSearch.tsx:133`](../../src/components/composition/GlobalSearch.tsx#L133) — match/matches

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/mapper/signatures/signature-toast.ts:8-11`](../../src/mapper/signatures/signature-toast.ts#L8-L11) — word-only toast copy with no count; inline is clearer
- [`src/mapper/signatures/signature-elimination-client.ts:75`](../../src/mapper/signatures/signature-elimination-client.ts#L75) — word-only toast copy with no count
- [`src/components/composition/industry-workspace/ProductionCapacity.tsx:65`](../../src/components/composition/industry-workspace/ProductionCapacity.tsx#L65) — verb agreement ('character is' / 'characters are'), not a count-and-noun
- [`src/components/composition/industry-workspace/ProfileDialogs.tsx:180`](../../src/components/composition/industry-workspace/ProfileDialogs.tsx#L180) — the singular omits the count ('Their category' vs 'Their N categories')
- [`src/app/(site)/admin/users/access-view.ts:56-79`](../../src/app/%28site%29/admin/users/access-view.ts#L56-L79) — adminPlural (72) and resultsHint (77-79) are dead: users/page.tsx:246-257 reads only view.nonAdminMatches. Delete them (and the unused adminCount, querySuffix, hasQuery, searchTruncated) instead of migrating
- [`src/features/industry-planner/profiles/profile-view.ts:48`](../../src/features/industry-planner/profiles/profile-view.ts#L48) — duplicate-name suffix (' copy' / ' copy N'), not pluralisation

</details>

**Home.** `src/lib/format/number.ts (existing module, next to formatQuantity)`

**Boundary check.** The home is in the lib zone; the lib rule allows only config, and number.ts imports nothing. Consumer zones: features (multibuy, maps, wormhole-sites, industry-jobs, planner) are allowed lib by the features rule. components-composition (ProfileBar, board sections, GlobalSearch) is allowed lib by the components-composition rule. app (admin, settings) is allowed lib by the app rule. data (telemetry) is allowed lib by the data rule; data could not import the current feature-local pluralCount, because the data rule does not allow features. mapper is allowed lib by the mapper rule.

**API sketch.**

```ts
export function formatCount(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatQuantity(n)} ${n === 1 ? singular : plural}`;
}
```

**Migration steps.**

1. Add formatCount to src/lib/format/number.ts. Move the multibuy.test.ts 173-177 cases into number.test.ts and add a grouping case (1200 -> '1,200 items') and a custom-plural case ('matches').
2. MultibuyPanel 67 and 125 use formatCount. Delete pluralCount from multibuy.ts and its test block.
3. Delete the local wrappers: ProfileBar memberCount becomes formatCount(n, 'member'); TrafficCards pluralUsers becomes formatCount={(n) => formatCount(n, 'user')}; scanner-prompt-rail missingPromptCopy becomes `${formatCount(count, 'signature')} missing from scan`; job-view:64 becomes formatCount(summary.total, 'job').
4. Replace the inline ternaries: health-metrics 35, 139, 196; signals 300 and 410, and fix 419 to `Refresh backlog of ${formatCount(queue.due, 'job')}`; health-view 78; corporations-view 68; corporations page 41; map-event-copy 20, 24, 30, 34 ('downstream system', 'system', 'signature'); site-meta 32 ('NPC wave'); TrashWindow 210 ('selected map'); market-score-inputs 27 (keep the '<1 day' guard and rounding); ClonesSection 37; AttributesSection 56 ('bonus remap'); GlobalSearch 133 (formatCount(n, 'match', 'matches')).
5. access-view: trim deriveAccessView to what the page reads (nonAdminMatches) and update access-view.test.ts 98-112.

**Tests.** New number.test.ts cases for formatCount: 0, 1, 2, 1200 (grouped), and a custom plural. Existing guards: multibuy.test.ts 173-177 (moved), health-metrics.test.ts:168 ('recovered · 2 failed runs …'), signals.test.ts (held-for-budget and dead-letter titles), job-view.test.ts:77 ('1 job'), map-event-copy.test.ts:44 and MapEventLog.test.ts:131, site-meta.test.ts 23-28, corporations-view.test.ts, access-view.test.ts (edit). Add a signals.test.ts case for a single due job ('Refresh backlog of 1 job').

**Notes.** Copy changes, all deliberate: counts of 1,000 and above become grouped at sites that printed them raw (health-metrics failures and exhaustions are the realistic cases); signals:419 '1 jobs' becomes '1 job'. formatQuantity pins 'en-US' where some sites used the runtime default toLocaleString(); on the server this is normally identical, and it is now deterministic. formatQuantity rounds, which is harmless for integer counts; daysPhrase already rounds before formatting. P091 also edits number.ts, health-metrics.ts and signals.ts, so expect trivial rebase conflicts. Fallow does not flag unused object fields, which is why the dead access-view fields survived.

<sub>Reported by: area:app-site, area:components-composition, area:mapper-signatures, area:mapper-surface, concern:formatting.</sub>

<a id="p091"></a>

## P091: Retire formatBonusPct for formatPct, share the Fuzzwork fallback-share label from data/telemetry, and drop redundant formatIsk null guards

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -25 / +8
- **Depends on:** —
- **Existing primitive:** `src/lib/format/number.ts:formatPct; src/lib/format/isk.ts:formatIsk`

**Problem.** The canonical lib formatPct (1 decimal, '—' for null or non-finite) is bypassed in three ways. industry-planner's formatBonusPct is formatPct without the guard and is imported by five modules, including components-composition. Four sites rebuild `(x * 100).toFixed(1)%` inline. The fallback share with its '<1%' floor is implemented twice for the same Fuzzwork metric, once in data/telemetry deriveEsiSourceStatus and once in admin esi-view fallbackShare. Separately, formatIsk already maps null to '—', yet planner sites wrap it in `x !== null ? formatIsk(x) : '—'`, and FeeBreakdownPanel defines its own isk() that is identical to formatIsk.

**Verifier revision.** Most of it holds, but each item is small. formatBonusPct equals formatPct for finite input (structure-bonus-view.test cases such as 9.99 -> '10.0%' match formatPct) and has five importers. Four sites rebuild formatPct inline. The Fuzzwork fallback-share rule ('<1%' floor, otherwise a rounded integer) is duplicated byte-for-byte between data/telemetry and admin esi-view for the same metric. formatIsk already returns '—' for null, and several planner sites guard it anyway. Changes from the proposal: (1) No generic formatSharePct. The floor rule has two sites, both the same metric, so it belongs as one exported helper in data/telemetry, which esi-view already imports. The integer shares in SearchCards and IndexCoverageCard are intentional and have no floor. (2) No new digits parameter: fee-breakdown's 2dp labels are one module with no second consumer. (3) node-card-ledger:63 is not redundant: null * units === 0 in JS, so dropping the guard would render '0.00'. It can only be restyled. CockpitRawLedger:69 has a different fallback ('no price') and a suffix. (4) Added the missed CockpitKpis.tsx 85-86 guards.

**Sites (21).**

- [`src/lib/format/number.ts:12-15`](../../src/lib/format/number.ts#L12-L15) — canonical formatPct
- [`src/components/composition/server-status-presentation.ts:63`](../../src/components/composition/server-status-presentation.ts#L63) — correct usage, formatPct(rate * 100)
- [`src/features/industry-planner/structure-bonus-view.ts:3-6,21-22,33-35`](../../src/features/industry-planner/structure-bonus-view.ts#L3-L6) — formatBonusPct = `${n.toFixed(1)}%`, i.e. formatPct without the guard
- [`src/features/industry-planner/skill-time.ts:147`](../../src/features/industry-planner/skill-time.ts#L147) — formatBonusPct consumer (two calls)
- [`src/components/composition/industry-workspace/CategoryChecklist.tsx:27`](../../src/components/composition/industry-workspace/CategoryChecklist.tsx#L27) — formatBonusPct consumer
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:36`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L36) — formatBonusPct consumer
- [`src/components/composition/industry-workspace/MemberDetail.tsx:55`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L55) — formatBonusPct consumer
- [`src/features/industry-planner/time-lever-rows.ts:10`](../../src/features/industry-planner/time-lever-rows.ts#L10) — `−${((1 - factor) * 100).toFixed(1)}% time`
- [`src/app/(site)/admin/signals.ts:143-148`](../../src/app/%28site%29/admin/signals.ts#L143-L148) — formatSliValue: `${(value * 100).toFixed(1)}%` after its own null and NaN handling
- [`src/app/(site)/admin/gsc-multiples-view.ts:22`](../../src/app/%28site%29/admin/gsc-multiples-view.ts#L22) — CTR inline 1dp
- [`src/app/(site)/admin/search/SearchCards.tsx:39`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L39) — CTR inline 1dp
- [`src/data/telemetry/health-metrics.ts:187-188`](../../src/data/telemetry/health-metrics.ts#L187-L188) — fallback rate label with the '<1%' floor
- [`src/app/(site)/admin/esi/esi-view.ts:28-34,86`](../../src/app/%28site%29/admin/esi/esi-view.ts#L28-L34) — fallbackShare: same metric, same rule (pct > 0 && pct < 1 -> '<1%'), plus 'no data' when nothing was priced
- [`src/lib/format/isk.ts:1-8`](../../src/lib/format/isk.ts#L1-L8) — formatIsk returns '—' for null or non-finite
- [`src/features/industry-planner/components/FeeBreakdownPanel.tsx:11,18`](../../src/features/industry-planner/components/FeeBreakdownPanel.tsx#L11) — local isk() identical to formatIsk
- [`src/features/industry-planner/components/PlannerRail.tsx:238`](../../src/features/industry-planner/components/PlannerRail.tsx#L238) — redundant null guard
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:77`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L77) — redundant null guard
- [`src/features/industry-planner/components/ComponentDrawer.tsx:159`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L159) — redundant null guard
- [`src/features/industry-planner/node-card-ledger.ts:50`](../../src/features/industry-planner/node-card-ledger.ts#L50) — redundant null guard
- [`src/features/industry-planner/cockpit-kpis-view.ts:65,78`](../../src/features/industry-planner/cockpit-kpis-view.ts#L65) — use formatIsk(pricing?.summary?.revenue ?? null) and formatIsk(summary?.inputCost ?? null); revenue is number \| null (types.ts:170)
- [`src/features/industry-planner/components/CockpitKpis.tsx:85-86`](../../src/features/industry-planner/components/CockpitKpis.tsx#L85-L86) — missed site: bases ? formatIsk(bases.x) : '—'

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/fee-breakdown.ts:22-29`](../../src/features/industry-planner/fee-breakdown.ts#L22-L29) — 2dp labels for cost index and tax, matching the game display; one module, so no second consumer for a digits parameter
- [`src/app/(site)/admin/search/SearchCards.tsx:27-28,34`](../../src/app/%28site%29/admin/search/SearchCards.tsx#L27-L28) — integer click share; intentional precision with no floor
- [`src/app/(site)/admin/search/IndexCoverageCard.tsx:25-27`](../../src/app/%28site%29/admin/search/IndexCoverageCard.tsx#L25-L27) — integer share of sitemap URLs; intentional
- [`src/app/(site)/admin/signals.ts:153`](../../src/app/%28site%29/admin/signals.ts#L153) — integer target label ('≥ 99%')
- [`src/features/industry-planner/node-card-ledger.ts:63`](../../src/features/industry-planner/node-card-ledger.ts#L63) — guard is load-bearing: null * units === 0, so it can only become formatIsk(unitPrice === null ? null : units * unitPrice)
- [`src/features/industry-planner/components/CockpitRawLedger.tsx:69`](../../src/features/industry-planner/components/CockpitRawLedger.tsx#L69) — different fallback ('no price') and a ' / unit' suffix
- [`src/components/composition/board/WorthChart.tsx:32-34`](../../src/components/composition/board/WorthChart.tsx#L32-L34) — the guard hides the whole span, not just the value
- [`src/components/ui/distribution-bars.tsx:44-65`](../../src/components/ui/distribution-bars.tsx#L44-L65) — ui zone may import nothing (the ui rule allows []), so its share labels stay local

</details>

**Home.** `src/lib/format/number.ts:formatPct and src/lib/format/isk.ts:formatIsk (existing, unchanged); src/data/telemetry/health-metrics.ts gets an exported formatFallbackShare (moved from esi-view)`

**Boundary check.** formatPct and formatIsk are in the lib zone. Consumers: features (industry-planner) are allowed lib by the features rule; components-composition (industry-workspace) by the components-composition rule; app (admin) by the app rule. formatFallbackShare lives in the data zone (data/telemetry). Its consumer, src/app/(site)/admin/esi/esi-view.ts, is in the app zone, which the app rule allows to import data, and it already imports deriveEsiSourceStatus from the same module. health-metrics.ts gains no new imports.

**API sketch.**

```ts
// src/data/telemetry/health-metrics.ts
export function formatFallbackShare(fallback: Pick<FallbackRateData, 'esi' | 'fallback'>): string
// priced === 0 -> 'no data'; 0 < pct < 1 -> '<1%'; else `${Math.round(pct)}%`
// formatPct(value: number | null): string  (unchanged)
// formatIsk(value: number | null): string  (unchanged)
```

**Migration steps.**

1. Delete formatBonusPct from structure-bonus-view.ts and use formatPct at lines 21-22 and 33-35, skill-time.ts:147, CategoryChecklist.tsx:27, ProfileOverview.tsx:36 and MemberDetail.tsx:55. Move the structure-bonus-view.test.ts 13-20 cases into number.test.ts, and keep the 'one decimal, as game tooltips show' comment at the formatPct call in structure-bonus-view.
2. Use formatPct(x * 100) at time-lever-rows.ts:10 (`−${formatPct((1 - factor) * 100)} time`), signals.ts:147, gsc-multiples-view.ts:22 and SearchCards.tsx:39.
3. Move esi-view fallbackShare (28-34) into health-metrics.ts as the exported formatFallbackShare. deriveEsiSourceStatus line 188 uses it (it already returns early when denom is 0, so 'no data' never reaches a headline). esi-view.ts:86 imports it. Move the esi-view.test.ts 68-74 cases to health-metrics.test.ts.
4. Delete FeeBreakdownPanel's isk() and call formatIsk directly. Drop the guards at PlannerRail:238, CockpitRawLedger:77, ComponentDrawer:159, node-card-ledger:50, cockpit-kpis-view 65 and 78 (via ?. and ?? null), and CockpitKpis 85-86 (formatIsk(bases?.batched ?? null)). Optionally restyle node-card-ledger:63 to formatIsk(unitPrice === null ? null : units * unitPrice).

**Tests.** number.test.ts: the formatBonusPct cases moved to formatPct (2.4, 3.38 -> '3.4%', 9.99 -> '10.0%', 24 -> '24.0%'). health-metrics.test.ts: the formatFallbackShare cases moved from esi-view.test.ts 68-74 ('<1%', '0%', '50%', 'no data'); the existing guard at 246-251 ('partial · <1% fallback') stays. Existing guards: signals.test.ts 263 and 297-298 ('99.9%', '100.0%'), gsc-multiples-view.test.ts:11 ('3.0% CTR'), skill-time.test.ts, node-card-ledger.test.ts, cockpit-kpis-view.test.ts, fee-breakdown.test.ts (unchanged).

**Notes.** Output is identical for all finite inputs. formatPct now shows '—' where formatBonusPct or inline toFixed would have printed 'NaN%' or 'Infinity%', which is an improvement. The two fallback-share copies currently agree exactly; the data/telemetry home makes the admin card and the status headline share one threshold. fallbackRatePoints (health-metrics 203-209) is per-day integer chart data with no floor and stays separate. Not merged: the '−N.N%' reduction prefix recurs at skill-time:147, ProfileOverview:36, MemberDetail:55 and time-lever-rows:10, but a sign option on formatPct is not justified. Shares number.ts, health-metrics.ts and signals.ts with P090; land in either order with a trivial rebase.

<sub>Reported by: area:industry-planner, concern:formatting.</sub>

<a id="p095"></a>

## P095: Add formatSigned to lib/format/number and use it for the wallet, the margin and effect modifiers

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -10 / +8, plus tests: signedIsk, formatEffectPercent and the `sign` field with its plumbing removed; one 5-line helper added.
- **Depends on:** —

**Problem.** Values that may be positive or negative are signed by hand in three places, with two different minus characters. WalletSection's signedIsk writes '+' or U+2212 around formatIsk(Math.abs). The planner margin prefixes industry-styles' `sign` field ('+' or '') onto formatIsk(margin), so a loss renders formatIsk's ASCII hyphen-minus ('-1.23M'). SystemIntelligenceBody's formatEffectPercent writes '+' or '−'. The same app therefore shows a negative ISK amount with two different minus glyphs, and industry-styles carries a presentation-only `sign` field through MarginFigures and CockpitMarginView.

**Verifier revision.** Real, but narrower than proposed. Only three sites format a value whose sign is unknown: WalletSection's signedIsk (16), the planner margin (industry-styles.ts 88 → CockpitKpis.tsx 225) and SystemIntelligenceBody's formatEffectPercent (97-100). The drift is confirmed: a negative margin falls through to formatIsk's toFixed, giving an ASCII '-' ('-1.23M'), while the wallet journal uses U+2212. Refuted parts: (1) the '−0%' bug cannot happen, because wormhole-effects.ts 183-188 drops modifiers that round to 0; (2) FlowLine (board-bits.tsx 70-80) shows fixed-direction in and out amounts (outflow is already positive, plan.ts 116-117) and already uses U+2212; (3) the reduction sites (time-lever-rows 10, MemberDetail 55, ProfileOverview 36, skill-time 147, structure-bonus-readout 19/41-59, CockpitKpis 124) show always-positive bonus magnitudes as reductions. That is a different concept and already consistent, so it is excluded, and the proposed coupling to the formatBonusPct retirement is dropped.

**Sites (7).**

- [`src/components/composition/board/sections/WalletSection.tsx:16,31-33`](../../src/components/composition/board/sections/WalletSection.tsx#L16) — signedIsk: '+' or U+2212 or '' around formatIsk(Math.abs)
- [`src/features/industry-planner/industry-styles.ts:60-67,88`](../../src/features/industry-planner/industry-styles.ts#L60-L67) — MarginFigures.sign is '+' or ''; negatives get no sign of their own
- [`src/features/industry-planner/cockpit-kpis-view.ts:12-21,38,45`](../../src/features/industry-planner/cockpit-kpis-view.ts#L12-L21) — CockpitMarginView passes `sign` through
- [`src/features/industry-planner/components/CockpitKpis.tsx:223-227`](../../src/features/industry-planner/components/CockpitKpis.tsx#L223-L227) — `${view.sign}${formatIsk(view.margin)}`: a negative margin renders ASCII '-' from formatIsk
- [`src/lib/format/isk.ts:1-8`](../../src/lib/format/isk.ts#L1-L8) — formatIsk keeps the sign of its input through toFixed (ASCII '-')
- [`src/mapper/windows/SystemIntelligenceBody.tsx:97-100,120`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L97-L100) — formatEffectPercent: '+' or '−' around Math.abs
- [`src/data/eve-data/wormhole-effects.ts:183-195`](../../src/data/eve-data/wormhole-effects.ts#L183-L195) — modifiers that round to 0 are dropped, so the zero case in formatEffectPercent cannot occur

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/board-bits.tsx:70-80`](../../src/components/composition/board/board-bits.tsx#L70-L80) — FlowLine: fixed-direction in and out (outflow is already positive per character-sheet/plan.ts 116-117) and already U+2212. Moving it to formatSigned would turn '+0.00' into '0.00' for a zero inflow.
- [`src/features/industry-planner/time-lever-rows.ts:10`](../../src/features/industry-planner/time-lever-rows.ts#L10) — a reduction magnitude with a fixed '−'. Different concept, already U+2212.
- [`src/components/composition/industry-workspace/MemberDetail.tsx:55`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L55) — reduction: '−' + formatBonusPct(positive). Belongs with the formatBonusPct opportunity.
- [`src/components/composition/industry-workspace/ProfileOverview.tsx:36`](../../src/components/composition/industry-workspace/ProfileOverview.tsx#L36) — the same reduction pattern
- [`src/features/industry-planner/skill-time.ts:147`](../../src/features/industry-planner/skill-time.ts#L147) — the same reduction pattern
- [`src/features/industry-planner/components/structure-bonus-readout.tsx:19,41-59`](../../src/features/industry-planner/components/structure-bonus-readout.tsx#L19) — structure bonus reductions with a fixed '−'
- [`src/features/industry-planner/components/CockpitKpis.tsx:124`](../../src/features/industry-planner/components/CockpitKpis.tsx#L124) — regional discount pill '−{pct}%', fixed direction

</details>

**Home.** `src/lib/format/number.ts`

**Boundary check.** src/lib/format/number.ts is in the lib zone (it imports nothing; lib may import only config). Consumers: WalletSection is in components-composition (the rule allows lib); CockpitKpis, industry-styles and cockpit-kpis-view are in features/industry-planner (the features rule allows lib); SystemIntelligenceBody is in mapper (the mapper rule allows lib). formatIsk stays in lib/format/isk.ts and is passed in as the magnitude formatter, so number.ts does not need to import isk.ts.

**API sketch.**

```ts
// src/lib/format/number.ts
export function formatSigned(value: number | null, format: (magnitude: number) => string): string;
// null or non-finite → '—'; value > 0 → '+' + format(|v|); value < 0 → '−' + format(|v|); value === 0 → format(0)
```

**Migration steps.**

1. Add formatSigned to src/lib/format/number.ts, with cases in number.test.ts: positive gets '+', negative gets U+2212 and never '-', zero has no sign, null and NaN give '—'.
2. WalletSection.tsx: delete signedIsk (16) and render formatSigned(row.amount, formatIsk) at 32.
3. CockpitKpis.tsx 225: render formatSigned(view.margin, formatIsk). Remove `sign` from MarginFigures (industry-styles.ts 64, 88) and CockpitMarginView (cockpit-kpis-view.ts 18, 38, 45). Update industry-styles.test.ts 148-180 to drop the `sign` expectations.
4. SystemIntelligenceBody.tsx: delete formatEffectPercent (97-100) and render formatSigned(modifier.percent, (m) => `${m}%`) at 120.
5. Leave FlowLine and the reduction sites unchanged.
6. Run pnpm check through the test-runner agent.

**Tests.** Add number.test.ts cases for formatSigned. Existing guards: SystemIntelligenceBody.effect.test.ts 67-68 ('+44%' and '−22%' must stay byte-identical); industry-styles.test.ts 148-180 (sign field removed); cockpit-kpis-view.test.ts. WalletSection and FlowLine have no direct tests, so add a small render or unit assertion for a negative journal amount (U+2212) when touching WalletSection.

**Notes.** Behaviour change: a negative planner margin now renders U+2212 instead of ASCII '-'. Positive margins keep '+', a null margin keeps '—' (today it is '' + formatIsk(null)), and a zero margin keeps no sign. The wallet's output does not change, and neither does effect-modifier output (percent is never 0). Follow-up decision: the margin percentage beside the figure, `(${formatPct(view.marginPct)})`, still renders an ASCII '-' for losses. formatSigned(view.marginPct, formatPct) would fix the glyph but also add '+' to gains, so that is a product call. Do not migrate the reduction displays to formatSigned(-pct, ...): they express 'reduces by X', not a signed delta.

<sub>Reported by: concern:formatting.</sub>

<a id="p084"></a>

## P084: Fold the wormhole-site ISK formatters into src/lib/format/isk.ts presets (Compact gains a K tier, Short and Compact take a unit option) and reuse the typed SITE_TYPE_LABEL

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -27 (format.ts 13, site-meta 14) / +12 in isk.ts
- **Depends on:** —
- **Existing primitive:** `src/lib/format/isk.ts:formatIskShort`

**Problem.** Wormhole-site surfaces use four ISK abbreviation rules. lib formatIskShort covers the table, scanner prices and mapper intel window; lib formatIskCompact covers search; the feature-local formatIsk/formatIskHeader in features/wormhole-sites/format.ts covers the card header, resource rows, live total and social card; and a private formatter in site-meta.ts covers the SEO description. The same site value therefore reads '950K', '0.9M' or '950K ISK' depending on the surface, and global search shows sub-million sites as '0M'. format.ts shadows the lib name formatIsk with a different rule, and site-meta.ts redefines SITE_TYPE_LABEL untyped next to the typed export in the same feature.

**Verifier revision.** Confirmed: features/wormhole-sites/format.ts exports a formatIsk with the same name as the lib one and a different rule (1dp B, otherwise 1dp M, with no K tier and no isFinite check), plus formatIskHeader, which is the same rule with ' ISK'. site-meta.ts has a private fourth rule and an untyped duplicate of SITE_TYPE_LABEL. The same blue-loot value renders as '950K' in SitesTable and the mapper intel window (formatIskShort) but '0.9M' on the card header (site-card-header-view:64) and in resource rows. formatIskCompact's only consumer, search.ts:54, renders a 100K site as '0M'. What changed: (1) Do not standardize everything on formatIskShort. site-meta's rule (1dp B, 0dp M, 0dp K, ' ISK') is exactly formatIskCompact plus a K tier plus a unit. If formatIskCompact gains the K tier and site-meta uses it with {unit: true}, the SEO description copy and its tests ('45M ISK', '12M ISK') stay unchanged, and the '0M' search bug is fixed at the same time. (2) The header, social card and live total map to formatIskShort with {unit: true}, which preserves '125.4M ISK' and '1.2B ISK'. (3) The negative-value gap in Short and Compact is latent: every current caller formats non-negative site or scanner values. Applying Math.abs in the shared core costs nothing, but it is not a live bug. (4) site-card-header-view adds its unit through a separate showIskUnit flag, so it takes plain formatIskShort.

**Sites (13).**

- [`src/lib/format/isk.ts:1-21`](../../src/lib/format/isk.ts#L1-L21) — canonical presets. Short and Compact tier on the signed value; Compact has no K tier
- [`src/lib/format/isk.test.ts:1-23`](../../src/lib/format/isk.test.ts#L1-L23) — pins formatIskCompact(900_000) to '1M'; this expectation changes deliberately
- [`src/features/wormhole-sites/format.ts:1-13`](../../src/features/wormhole-sites/format.ts#L1-L13) — feature formatIsk with the shadowed name and formatIskHeader (same rule plus ' ISK'); == null guard, no isFinite check
- [`src/features/wormhole-sites/site-meta.ts:3-16, 30, 39, 49`](../../src/features/wormhole-sites/site-meta.ts#L3-L16) — private formatter (1dp B, 0dp M/K, ' ISK') and untyped SITE_TYPE_LABEL with a ?? site.siteType fallback
- [`src/features/wormhole-sites/components/wormhole-styles.ts:46-52`](../../src/features/wormhole-sites/components/wormhole-styles.ts#L46-L52) — canonical typed SITE_TYPE_LABEL: Record<SiteType, string>
- [`src/features/wormhole-sites/components/site-card-header-view.ts:3, 64-65`](../../src/features/wormhole-sites/components/site-card-header-view.ts#L3) — waveValue uses the feature formatIsk; the unit is added separately through showIskUnit
- [`src/features/wormhole-sites/components/ResourceRow.tsx:6, 15, 19`](../../src/features/wormhole-sites/components/ResourceRow.tsx#L6) — resource values use the feature formatIsk
- [`src/features/wormhole-sites/components/SiteResourcesLive.tsx:8, 47-54`](../../src/features/wormhole-sites/components/SiteResourcesLive.tsx#L8) — LiveSiteTotal uses formatIskHeader
- [`src/features/wormhole-sites/site-social-card.ts:1, 20`](../../src/features/wormhole-sites/site-social-card.ts#L1) — OG card value uses formatIskHeader
- [`src/features/wormhole-sites/components/SitesTable.tsx:41, 47`](../../src/features/wormhole-sites/components/SitesTable.tsx#L41) — same values through lib formatIskShort
- [`src/features/wormhole-sites/search.ts:3, 54`](../../src/features/wormhole-sites/search.ts#L3) — the only formatIskCompact consumer; 100K renders as '0M'
- [`src/features/wormhole-sites/components/ScannerLivePrices.tsx:112, 129`](../../src/features/wormhole-sites/components/ScannerLivePrices.tsx#L112) — lib formatIskShort
- [`src/mapper/windows/SystemIntelligenceBody.tsx:202-205`](../../src/mapper/windows/SystemIntelligenceBody.tsx#L202-L205) — lib formatIskShort for the site estimated value

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/preview/primitives/data.tsx:88`](../../src/app/%28site%29/preview/primitives/data.tsx#L88) — preview demo formatter for values already expressed in millions; not a product surface
- [`src/components/composition/board/sections/WalletSection.tsx:16`](../../src/components/composition/board/sections/WalletSection.tsx#L16) — sign wrapper over lib formatIsk(Math.abs); already uses the primitive
- [`src/components/composition/board/board-bits.tsx:73-75`](../../src/components/composition/board/board-bits.tsx#L73-L75) — same: a sign prefix over lib formatIsk

</details>

**Home.** `src/lib/format/isk.ts (existing module; presets over one private core)`

**Boundary check.** isk.ts is in zone lib. Consumers: features/wormhole-sites ({from: features, allow: [..., lib, ...]}), mapper ({from: mapper, allow: [..., lib, ...]}), components-composition and app (both allow lib); all already import this file. site-meta.ts importing ./components/wormhole-styles stays inside the features/wormhole-sites zone, and wormhole-styles only type-imports ui tones, so the server-side generateMetadata path pulls in no client code.

**API sketch.**

```ts
// src/lib/format/isk.ts
interface IskOptions { readonly unit?: boolean }   // appends ' ISK'; null or non-finite still return '—'
// private core: function formatScaledIsk(value: number | null, tiers: { b: number; m: number; k: number; below?: (v: number) => string }, options?: IskOptions): string  (tiers on Math.abs(value))
export function formatIsk(value: number | null): string;                              // unchanged: 2/2/1, < 1K -> toFixed(2)
export function formatIskShort(value: number | null, options?: IskOptions): string;   // 1dp B, 1dp M, 0dp K
export function formatIskCompact(value: number | null, options?: IskOptions): string; // 1dp B, 0dp M, 0dp K (new K tier)
```

**Migration steps.**

1. Rewrite src/lib/format/isk.ts with one private core that applies the null/finite guard, Math.abs tiering and the optional ' ISK' unit; express the three exports as presets. Give formatIskCompact a K tier. Keep formatIsk's signature as is, because it is passed as formatY/formatCount callbacks.
2. Update isk.test.ts: Compact 900_000 becomes '900K'; add 100_000 → '100K'; add negatives (-2_000_000 → '-2.0M' Short); add unit cases ('125.4M ISK', null with unit → '—').
3. Migrate the feature callers: site-card-header-view.ts:64 and ResourceRow.tsx:15,19 to formatIskShort; SiteResourcesLive.tsx:53 and site-social-card.ts:20 to formatIskShort(x, { unit: true }).
4. Delete src/features/wormhole-sites/format.ts.
5. In site-meta.ts delete the private formatIsk and SITE_TYPE_LABEL. Use formatIskCompact(value, { unit: true }) at 30 and 39, import SITE_TYPE_LABEL from './components/wormhole-styles', and drop the now-unneeded `?? site.siteType` fallback at 49 (siteType is SiteType).
6. Leave search.ts on formatIskCompact; the new K tier fixes the '0M' rendering.

**Tests.** Existing guards that must still pass unchanged: site-meta.test.ts:31,60 ('45M ISK', '12M ISK'); site-social-card.test.ts:27,46 ('125.4M ISK', '1.2B ISK'); ScannerLivePrices.test.ts:97-126; SystemIntelligenceBody.test.ts:93. Changed: src/lib/format/isk.test.ts (Compact sub-million expectation becomes '900K'; add K-tier, negative and unit cases). New: a site-card-header-view.test.ts case with blueLootIsk 950_000 expecting waveValue '950K'; an isk or search test pinning Compact 100_000 → '100K'.

**Notes.** Visible changes: sub-million values on the card header, resource rows, live total and social card change from '0.9M' to '950K' (matching the table), and search changes from '0M' to '100K'. The SEO description copy is unchanged for values >= 1K. Below 1K, site-meta used to print the raw '${value} ISK'; Compact prints '1K ISK' or '0K ISK'. site-meta only formats values > 0 and real site values are far above 1K, so this is accepted. If a reviewer wants it, give Compact a below-1K tier that prints Math.round(value). Note that (0.95).toFixed(1) is '0.9', which is why the feature copy under-reports 950K. The fallow refactoring-target for isk.ts (19 dependents) argues for keeping the export names stable, which this design does.

<sub>Reported by: area:features-sites-misc, area:lib-infra, concern:formatting, dupes-triage-2.</sub>

<a id="p094"></a>

## P094: Add unresolvedName to lib/format/names, retire the '#' and 'Pilot' variants, and give the industry planner one typeName helper

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** About -20 / +35: two ownerFallback functions and an inline switch deleted, seven planner chains shortened, two small helpers plus tests added. About 30 call sites edited across ~25 files.
- **Depends on:** —
- **Existing primitive:** `src/lib/format/names.ts (currently only initials)`

**Problem.** When an EVE entity name cannot be resolved, the placeholder is written inline at about 30 sites, and it has drifted. Industry jobs and the skill queue write 'Type #587', 'Pilot #42', 'Skill #3396' and 'Corporation #9'. Assets, blueprints, maps, map access, corp structures, auth, the mapper, the workspace, the admin audit and the planner write 'Type 587', 'Character 42', 'Skill 3396' and 'Corporation 9'. The same unresolved pilot therefore reads 'Pilot #42' on the jobs board and 'Character 42' everywhere else. The owner fallback (character or corporation) is a private function copied into two features and rebuilt inline in composition. Within the industry planner, the type-name lookup appears seven times in two forms that are equivalent in production.

**Verifier revision.** The drift is real. Five sites use '#' or 'Pilot': job-view.ts 47 and 60, CorpJobsBoard.tsx 96, SkillQueueRows.tsx 49, TrainingLine.tsx 38. About 25 sites use the 'Kind N' form. ownerFallback is copied verbatim (owned-assets/detail.ts 67-69, owned-blueprints/detail.ts 47-49) and re-derived inline in map-access.ts 76-78. In the planner, the buildNodeDisplay → materialNames → `Type id` chain is redundant in production. queries.ts 127 and 141-142 fill materialNames from getTypeLabels over every tree type id, while toBuildTree (build-tree.ts 20-36, 63-77) sets display names to labels.get(id)?.name ?? `Type id` over a subset of those ids, so both chain forms give the same result. However, the component-sheet-view.test.ts 26-31 fixture puts names only in buildNodeDisplay and relies on the prefix. Revisions: (1) the generic nameOr becomes an optional Record-only helper, because name sources come in three shapes (Record<string,string> from resolveEntityNames/useEntityNames, Map<number,string> from getCharacterNames/getTypeNames, and roster arrays); (2) the 'new closure every render' efficiency claim is rejected: React Compiler is not enabled, the receiving tiles are not memoised, and the cost is negligible; (3) one planner helper instead of two alternative designs; (4) the admin audit view, the corp-structure names and placeName 'Station N' are added; build-tree and queries.ts 163 use the lib helper directly.

**Sites (27).**

- [`src/features/industry-jobs/job-view.ts:47`](../../src/features/industry-jobs/job-view.ts#L47) — `Type #${headlineId}` (drift)
- [`src/features/industry-jobs/job-view.ts:58-61`](../../src/features/industry-jobs/job-view.ts#L58-L61) — runnerName: `Pilot #${installerId}` (drift: 'Pilot' and '#'); 'Unknown pilot' for an undefined id
- [`src/features/industry-jobs/components/CorpJobsBoard.tsx:96`](../../src/features/industry-jobs/components/CorpJobsBoard.tsx#L96) — `Corporation #${id}` (drift)
- [`src/features/skill-queue/components/SkillQueueRows.tsx:49`](../../src/features/skill-queue/components/SkillQueueRows.tsx#L49) — `Skill #${entry.skill_id}` (drift)
- [`src/features/skill-queue/components/TrainingLine.tsx:38`](../../src/features/skill-queue/components/TrainingLine.tsx#L38) — `Skill #${training.skillId}` (drift)
- [`src/features/owned-assets/detail.ts:67-69,95`](../../src/features/owned-assets/detail.ts#L67-L69) — private ownerFallback and its use
- [`src/features/owned-blueprints/detail.ts:47-49,89`](../../src/features/owned-blueprints/detail.ts#L47-L49) — identical private ownerFallback and its use
- [`src/composition/map-access.ts:42,66-69,73-79`](../../src/composition/map-access.ts#L42) — Character and Corporation fallbacks, plus the inline ownerType switch at 76-78
- [`src/composition/map-access-projection.ts:129`](../../src/composition/map-access-projection.ts#L129) — Map.get ?? `Character ${id}`
- [`src/composition/sync/corp-structures-sync.ts:144`](../../src/composition/sync/corp-structures-sync.ts#L144) — `Corporation ${id}`
- [`src/platform/auth/linked-characters.ts:87`](../../src/platform/auth/linked-characters.ts#L87) — `Character ${r.accountId}`; the id is a string
- [`src/mapper/tracking/use-character-identities.ts:23`](../../src/mapper/tracking/use-character-identities.ts#L23) — roster ?? names ?? `Character ${id}`
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:113-120`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L113-L120) — characterNamer: Map ?? `Character ${id}`
- [`src/features/maps/MapCatalogue.tsx:91`](../../src/features/maps/MapCatalogue.tsx#L91) — `Corporation ${id}`
- [`src/app/(site)/admin/users/access-view.ts:42-43`](../../src/app/%28site%29/admin/users/access-view.ts#L42-L43) — actor and target `Character ${id}` (missed by the finders)
- [`src/components/composition/board/board-view-model.ts:375-378`](../../src/components/composition/board/board-view-model.ts#L375-L378) — placeName: `Station ${place.id}` (same concept, station kind; optional)
- [`src/features/industry-planner/queries.ts:102,141-142,163`](../../src/features/industry-planner/queries.ts#L102) — 'Skill N'; materialNames built from labels; product name fallback
- [`src/features/industry-planner/build-tree.ts:31,72`](../../src/features/industry-planner/build-tree.ts#L31) — l?.name ?? `Type ${typeId}`: the source of buildNodeDisplay names
- [`src/features/industry-planner/component-sheet-view.ts:80-81`](../../src/features/industry-planner/component-sheet-view.ts#L80-L81) — nameOf: buildNodeDisplay ?? materialNames ?? Type
- [`src/features/industry-planner/components/ComponentDrawer.tsx:295-299`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L295-L299) — the same three-step chain, inline
- [`src/features/industry-planner/components/CockpitKpis.tsx:371`](../../src/features/industry-planner/components/CockpitKpis.tsx#L371) — the same chain, as an inline nameOf prop
- [`src/features/industry-planner/build-consolidate.ts:66-72`](../../src/features/industry-planner/build-consolidate.ts#L66-L72) — d?.name ?? materialNames ?? Type; d is still needed for label and tone
- [`src/features/industry-planner/build-pricing.ts:292`](../../src/features/industry-planner/build-pricing.ts#L292) — materialNames ?? Type
- [`src/features/industry-planner/components/PricingProvider.tsx:464`](../../src/features/industry-planner/components/PricingProvider.tsx#L464) — nameOf: materialNames ?? Type
- [`src/features/industry-planner/components/MultibuyPanel.tsx:52-56`](../../src/features/industry-planner/components/MultibuyPanel.tsx#L52-L56) — materialNames ?? Type
- [`src/features/industry-planner/available-structures.ts:95`](../../src/features/industry-planner/available-structures.ts#L95) — s.name ?? typeName ?? `Structure ${id}`
- [`src/components/composition/industry-workspace/StructuresManager.tsx:150`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L150) — s.name ?? lookups.types.find(...)?.name ?? `Structure ${id}`: the same corp-structure name rule

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/(site)/admin/ops-view.ts:135`](../../src/app/%28site%29/admin/ops-view.ts#L135) — an event-description sentence that names a character id, not a name fallback
- [`src/components/composition/industry-workspace/StructuresManager.tsx:196`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L196) — `Corporation ${counts.corp}` is a segmented-control label with a count
- [`src/mapper/signatures/scanner-type-combo.tsx:123`](../../src/mapper/signatures/scanner-type-combo.tsx#L123) — aria-label `Type ${rowId}`, unrelated
- [`src/components/composition/board/sections/CharacterIdentity.tsx:50`](../../src/components/composition/board/sections/CharacterIdentity.tsx#L50) — 'Unknown corporation' when there is no id. Different fallback; keep it.
- [`src/mapper/tracking/DockCharacterPicker.tsx:68`](../../src/mapper/tracking/DockCharacterPicker.tsx#L68) — systemName ?? String(systemId): a bare id for a system, different UI
- [`src/db/__tests__/support/db-test-harness.ts:155`](../../src/db/__tests__/support/db-test-harness.ts#L155) — test fixture
- [`convex/mapFixtureTracking.ts:233-245`](../../convex/mapFixtureTracking.ts#L233-L245) — error-detail messages, not display names

</details>

**Home.** `src/lib/format/names.ts (existing module; add unresolvedName and nameOrUnresolved) and src/features/industry-planner/type-name.ts (new, feature-local typeName and typeNamer)`

**Boundary check.** src/lib/format/names.ts is in the lib zone (lib may import only config; this helper imports nothing). Every consumer zone allows lib: features (industry-jobs, skill-queue, owned-assets, owned-blueprints, maps, industry-planner), composition, components-composition (ProfileWorkspace, StructuresManager, board-view-model), mapper (use-character-identities), platform/auth (linked-characters) and app (admin access-view). The planner helper must stay inside src/features/industry-planner: features are auto-discovered per directory and the features rule does not allow 'features', so other features could not share it anyway. All seven planner consumers are in that zone. The helper takes Readonly<Record<string,string>> rather than the EntityNames type, because lib may not import data/corp-holdings.

**API sketch.**

```ts
// src/lib/format/names.ts
export type UnresolvedNameKind = 'type' | 'skill' | 'character' | 'corporation' | 'structure' | 'station';
export function unresolvedName(kind: UnresolvedNameKind, id: number | string): string; // 'Type 587', 'Character 42'
export function nameOrUnresolved(names: Readonly<Record<string, string>>, id: number, kind: UnresolvedNameKind): string; // names[String(id)] ?? unresolvedName(kind, id)

// src/features/industry-planner/type-name.ts
export function typeName(structure: Pick<BlueprintStructure, 'materialNames'>, typeId: number): string; // materialNames[typeId] ?? unresolvedName('type', typeId)
export function typeNamer(structure: Pick<BlueprintStructure, 'materialNames'>): (typeId: number) => string;
```

**Migration steps.**

1. Add unresolvedName and nameOrUnresolved to src/lib/format/names.ts, with cases in names.test.ts.
2. Owner fallbacks: delete ownerFallback in owned-assets/detail.ts 67-69 and owned-blueprints/detail.ts 47-49, and call nameOrUnresolved(names, ownerId, ownerType) at 95 and 89. ownerType is 'character' | 'corporation', a subset of UnresolvedNameKind. Replace map-access.ts 76-78 with nameOrUnresolved(names, grant.ownerId, grant.ownerType), and lines 42 and 68 with the 'character' and 'corporation' kinds.
3. Drift sites: job-view.ts 47 → nameOrUnresolved(names, headlineId, 'type'); 60 → nameOrUnresolved(entityNames, installerId, 'character'), keeping 'Unknown pilot' for an undefined id; CorpJobsBoard.tsx 96; SkillQueueRows.tsx 49 and TrainingLine.tsx 38 → unresolvedName('skill', id). Update job-view.test.ts 63 and 70 ('Type 587', 'Character 42').
4. Remaining inline fallbacks: map-access-projection 129, corp-structures-sync 144, linked-characters 87 (string id), use-character-identities 23, ProfileWorkspace 119, MapCatalogue 91, admin access-view 42-43, queries.ts 102, available-structures 95, StructuresManager 150 and, optionally, board-view-model 377 ('station').
5. Planner: add type-name.ts with typeName and typeNamer. Change build-tree.ts 31/72 and queries.ts 163 to unresolvedName('type', id). Replace component-sheet-view 80-81, ComponentDrawer 296-299, CockpitKpis 371, build-consolidate 71 (keep `d` for label, tone and isRaw), build-pricing 292, PricingProvider 464 and MultibuyPanel 54 with typeName or typeNamer, dropping the buildNodeDisplay prefix.
6. Make the component-sheet-view.test.ts 26-31 fixture production-shaped: add 10 → 'Capital Armor Plates' and 20 → 'Fernite Carbide' to materialNames. Otherwise those rows would read 'Type 10' and 'Type 20'. Check the build-consolidate, build-pricing, ComponentDrawer and PricingProvider fixtures the same way.
7. Run pnpm check through the test-runner agent.

**Tests.** Add names.test.ts cases: unresolvedName for each kind, string ids, and nameOrUnresolved hit and miss. Add type-name.test.ts: hit, miss → 'Type N'. Existing guards: job-view.test.ts 63 and 70 (expectations change), owned-assets/detail.test.ts 142, owned-blueprints/detail.test.ts 122, map-access.test.ts 132-153, map-access-projection.test.ts 462, admin access-view.test.ts 70, industry-planner queries.db.test.ts 230 and 249 ('Skill 3396'), component-sheet-view.test.ts (fixture to fix), build-consolidate.test.ts, build-pricing.test.ts, ComponentDrawer.test.ts and PricingProvider.test.ts.

**Notes.** User-visible changes, limited to unresolved fallbacks: 'Type #N' → 'Type N', 'Corporation #N' → 'Corporation N', 'Skill #N' → 'Skill N', and 'Pilot #N' → 'Character N' on the industry jobs board. 'Pilot' versus 'Character' is a copy decision. The majority, 'Character', is proposed. runnerName's 'Unknown pilot' for an undefined installerId is a different case and stays. The planner simplification depends on queries.ts building materialNames from the same getTypeLabels result as buildNodeDisplay, over a superset of ids: collectTreeTypeIds walks every input, while toBuildTree walks only produced nodes. Keep that invariant, and if it is ever broken, put the three-step chain back inside typeName rather than at call sites. The getBlueprintStructure output is cached with 'use cache' and cacheLife('max'), and its strings do not change. Adjacent lead, not part of this change: STRUCTURE_ID_FLOOR, 'Upwell structure' and 'Unknown location' are copied in data/corp-holdings/labels.ts 13-15, data/corp-holdings/context-projection.ts 5, owned-assets/detail.ts 7-16 and owned-blueprints/detail.ts 18-25, which could be exported once from data/corp-holdings.

<sub>Reported by: area:features-owned, area:industry-planner, concern:formatting.</sub>

<a id="p108"></a>

## P108: Export the structure-id rule, location labels and public location name from data/corp-holdings/labels.ts, and the unresolved-entity fallback from lib/format/names.ts

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -35 production lines (3 floor constants, 2 predicates, 4 label constants, 2 CorpContexts, 2 ownerFallback, 2 station branches, about 9 inline fallbacks), +15 in labels/context/names, +20 test lines
- **Depends on:** [P094](#p094)
- **Existing primitive:** `src/data/corp-holdings/labels.ts (shared holdings-label module); src/data/eve-data/wormhole-contract.ts:isKnownSpaceSystemId`

**Problem.** The rule 'id >= 1e12 is an Upwell structure; otherwise resolve the NPC station name, else Unknown location' is implemented three times. corp-holdings/labels.ts has it as the private publicRootName. owned-assets/detail.ts and owned-blueprints/detail.ts each have resolveLocationName, and both features already import labelCorpHolding from labels.ts.

The structure floor constant is declared four times, the two labels three times, and the CorpContexts type twice (its shape appears twice more). The copies have drifted on empty-string names: labels.ts formats '' as a station name, while the features show 'Unknown location'. The `Corporation N` / `Character N` fallback is a private ownerFallback in both detail files and is inlined in about 9 other modules across composition, mapper, features, components-composition, platform/auth and app.

**Verifier revision.** The core is confirmed:
- STRUCTURE_ID_FLOOR = 1e12 is declared four times (corp-holdings/labels.ts:13, corp-holdings/context-projection.ts:5, owned-assets/detail.ts:7, owned-blueprints/detail.ts:18).
- STRUCTURE_LABEL and UNKNOWN_LOCATION_LABEL are declared three times.
- The structure-or-NPC-station name rule is written three times (labels.publicRootName, and resolveLocationName in both features), with drift: labels uses `=== undefined` while the features use truthiness.
- ownerFallback and CorpContexts are each declared twice, and CorpContexts' shape is also spelled out in corp-holdings/context.ts:36 and platform/auth/corp-visibility.ts:172.

Four parts change or are dropped.
(1) market-prices is excluded. NPC_STATION_ID_CEILING=1e9 answers 'is this market order at an NPC station'. On real data (stations ~6e7, structures >=1e12) both thresholds agree, and F535's caution stands.
(2) The ESI location_type enum is dropped. owned-assets stores location_type as a free string in its aggregate key and DB column (asset-map.ts:9, queries.ts:42), while corp-holdings parses it strictly with z.enum. Unifying them changes parse strictness and persisted data; that is not a dedupe.
(3) The 'blueprints request names for container ids' drift is not reconcilable. The character blueprint DTO has no location_type (owned-blueprints/esi-projection.ts:10-11), so the detail cannot tell a container from a station.
(4) The character-asset locationFlag '' versus blueprints keeping it is a product choice; it stays out of the shared helper.

No new data/eve-data module is needed. Every consumer already imports data/corp-holdings/labels (or lives in that slice), so exporting the existing private rule reuses it. The 'Character N'/'Corporation N' fallback recurs in about 9 more places across zones, so that one helper belongs in lib/format/names.ts instead.

**Sites (14).**

- [`src/data/corp-holdings/labels.ts:13-15, 35-43, 68`](../../src/data/corp-holdings/labels.ts#L13-L15) — floor, labels, private isNpcStation and publicRootName (`name === undefined` rule): the canonical copy
- [`src/data/corp-holdings/context-projection.ts:5, 74-81`](../../src/data/corp-holdings/context-projection.ts#L5) — fourth floor declaration plus an inline >= check in unnamedStructureIds
- [`src/features/owned-assets/detail.ts:7-19, 43-46, 67-77, 95`](../../src/features/owned-assets/detail.ts#L7-L19) — floor, isPlayerStructure, labels, CorpContexts, ownerFallback, station branch of resolveLocationName (truthiness rule)
- [`src/features/owned-blueprints/detail.ts:18-27, 33, 47-55, 89`](../../src/features/owned-blueprints/detail.ts#L18-L27) — same floor, labels, CorpContexts, ownerFallback and resolveLocationName (truthiness rule)
- [`src/data/corp-holdings/context.ts:35-42`](../../src/data/corp-holdings/context.ts#L35-L42) — corpContextOf already takes ReadonlyMap<number, CorpHoldingContext>, the natural home for CorpContexts
- [`src/platform/auth/corp-visibility.ts:172`](../../src/platform/auth/corp-visibility.ts#L172) — returns the same ReadonlyMap<number, CorpHoldingContext> shape
- [`src/composition/map-access.ts:42, 68`](../../src/composition/map-access.ts#L42) — `Character ${id}` and `Corporation ${id}` fallbacks
- [`src/composition/map-access-projection.ts:129`](../../src/composition/map-access-projection.ts#L129) — `Character ${id}` fallback
- [`src/composition/sync/corp-structures-sync.ts:144`](../../src/composition/sync/corp-structures-sync.ts#L144) — `Corporation ${id}` fallback
- [`src/mapper/tracking/use-character-identities.ts:23`](../../src/mapper/tracking/use-character-identities.ts#L23) — `Character ${id}` fallback
- [`src/features/maps/MapCatalogue.tsx:91`](../../src/features/maps/MapCatalogue.tsx#L91) — `Corporation ${id}` fallback
- [`src/components/composition/industry-workspace/ProfileWorkspace.tsx:119`](../../src/components/composition/industry-workspace/ProfileWorkspace.tsx#L119) — `Character ${id}` fallback
- [`src/platform/auth/linked-characters.ts:87`](../../src/platform/auth/linked-characters.ts#L87) — `Character ${accountId}` fallback
- [`src/app/(site)/admin/users/access-view.ts:42-43`](../../src/app/%28site%29/admin/users/access-view.ts#L42-L43) — `Character ${id}` fallback behind a null-id branch

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-prices/constants.ts:5`](../../src/data/market-prices/constants.ts#L5) — NPC_STATION_ID_CEILING=1e9 for market-order eligibility; agrees with 1e12 on real ids but is a different slice (data/market-prices cannot import data/corp-holdings). Leave it until someone confirms the 1e9-1e12 range is empty
- [`src/data/market-prices/book-math.ts:124-126`](../../src/data/market-prices/book-math.ts#L124-L126) — isDiscountEligibleLocation; same reason
- [`src/data/corp-holdings/placement.ts:54, 66, 75`](../../src/data/corp-holdings/placement.ts#L54) — strict z.enum location_type for corp assets
- [`src/features/owned-assets/esi-projection.ts:3-9, 14-15`](../../src/features/owned-assets/esi-projection.ts#L3-L9) — location_type z.string() feeds the aggregate key and DB column; changing strictness is a behaviour and data change, not a dedupe
- [`src/features/owned-assets/detail.ts:100-107`](../../src/features/owned-assets/detail.ts#L100-L107) — locationFlag '' for character holdings: a product choice, not part of the shared rule
- [`src/features/owned-blueprints/esi-projection.ts:10-11`](../../src/features/owned-blueprints/esi-projection.ts#L10-L11) — the blueprint DTO has no location_type, so container-versus-station name collection cannot match assets
- [`src/data/eve-data/wormhole-contract.ts:209-211`](../../src/data/eve-data/wormhole-contract.ts#L209-L211) — isKnownSpaceSystemId is a system-id rule; no relation beyond 'id range'
- [`src/app/(site)/admin/ops-view.ts:135`](../../src/app/%28site%29/admin/ops-view.ts#L135) — a sentence containing 'Character N', not a name fallback
- [`src/components/composition/industry-workspace/StructuresManager.tsx:196`](../../src/components/composition/industry-workspace/StructuresManager.tsx#L196) — a count label 'Corporation {n}', not an entity id

</details>

**Home.** `src/data/corp-holdings/labels.ts for isPlayerStructureId, the label constants and publicLocationName. src/data/corp-holdings/context.ts for type CorpContexts. src/lib/format/names.ts (beside initials) for unresolvedEntityName.`

**Boundary check.** data/corp-holdings is an auto-discovered data zone:
- context-projection.ts is in the same zone.
- features/owned-assets and features/owned-blueprints: features allow includes data, and both already import '@/data/corp-holdings/labels' and '/context'.
- platform/auth/corp-visibility (CorpContexts type): platform/auth allow includes data.
- composition/sync owned-*-sync: composition allow includes data.

lib/format/names.ts is in the lib zone (allow config) and imports nothing. Its consumers: features, composition, mapper, components-composition, platform/auth and app all list lib in their allow rules.

data/market-prices could reach only data/eve-data (the data rule lists data/eve-data, not sibling slices). That is the reason to move isPlayerStructureId to data/eve-data if market-prices ever adopts it. No current consumer needs that.

**API sketch.**

```ts
// data/corp-holdings/labels.ts
export const STRUCTURE_LABEL = 'Upwell structure';
export const UNKNOWN_LOCATION_LABEL = 'Unknown location';
export function isPlayerStructureId(locationId: number): boolean; // >= 1_000_000_000_000
/** Upwell structure label, else the formatted NPC station name, else Unknown location (an empty name counts as unknown). */
export function publicLocationName(locationId: number, names: EntityNames, formatStation: FormatStation): string;
// data/corp-holdings/context.ts
export type CorpContexts = ReadonlyMap<number, CorpHoldingContext>;
// lib/format/names.ts
export function unresolvedEntityName(kind: 'character' | 'corporation', id: number): string; // 'Character 7' / 'Corporation 98000001'
```

**Migration steps.**

1. In data/corp-holdings/labels.ts:
- Export STRUCTURE_LABEL and UNKNOWN_LOCATION_LABEL.
- Replace isNpcStation with an exported isPlayerStructureId, updating the uses at 40 and 68 to !isPlayerStructureId.
- Rename publicRootName to an exported publicLocationName, switching it to the truthiness rule (`name ? formatStation(name) : UNKNOWN_LOCATION_LABEL`).
- Add a labels.test.ts case for an empty-string name.
2. context-projection.ts: delete STRUCTURE_ID_FLOOR and use isPlayerStructureId(rootId) at line 78.
3. data/corp-holdings/context.ts: export type CorpContexts and use it in corpContextOf's signature. platform/auth/corp-visibility.ts:172 returns CorpContexts.
4. features/owned-assets/detail.ts:
- Delete STRUCTURE_ID_FLOOR, isPlayerStructure, STRUCTURE_LABEL, UNKNOWN_LOCATION_LABEL, the CorpContexts type and ownerFallback, and import them instead.
- The station branch of resolveLocationName becomes `return publicLocationName(locationId, names, formatStation)`.
- Keep SHIP_LABEL, CONTAINER_LABEL, the flag predicates, the solar_system branch and locationFlag ''.
5. features/owned-blueprints/detail.ts: delete the same constants, predicate, CorpContexts and ownerFallback. resolveLocationName becomes publicLocationName. Keep summaryNameIds as-is apart from the predicate import.
6. Add unresolvedEntityName to lib/format/names.ts with a test in names.test.ts. Use it for ownerName in both detail.ts files. As a follow-up in the same PR or the next, replace the inline fallbacks in composition/map-access.ts, map-access-projection.ts, sync/corp-structures-sync.ts, mapper/tracking/use-character-identities.ts, features/maps/MapCatalogue.tsx, industry-workspace/ProfileWorkspace.tsx, platform/auth/linked-characters.ts and admin/users/access-view.ts (keeping its null-id 'Unknown actor/target' branch).
7. Run pnpm check through test-runner. The CorpContexts re-exports from the features disappear, so update any test that imported the type from features/*/detail.

**Tests.** Existing tests that pin current strings and must stay green:
- src/data/corp-holdings/labels.test.ts (lines 61-72)
- src/features/owned-assets/detail.test.ts (106-142: Upwell structure, Unknown location, 'Character 7', 'Corporation ${CORP}')
- src/features/owned-blueprints/detail.test.ts (113-123)

Add:
- an empty-name case to labels.test.ts (now 'Unknown location')
- unresolvedEntityName cases to src/lib/format/names.test.ts
- context-projection tests covering unnamedStructureIds at the 1e12 boundary

**Notes.** Drift decision: the features' truthiness rule is correct, because an empty ESI name should read 'Unknown location', not ''. Adopting it changes labels.ts only for '' names, and no test pins that case.

What must not change:
- Asset holdings keep locationFlag ''.
- Blueprint holdings keep summary.locationFlag.
- Assets keep resolving solar_system names unformatted, and keep the item->ship/container/structure flag heuristics.
- Blueprint name-id collection stays 'every non-structure location id', because ESI blueprints have no location_type.

Do not touch market-prices' 1e9 ceiling in this change.

<sub>Reported by: area:data-services, area:features-owned, concern:contracts-types, concern:generic-utils, dupes-triage-2.</sub>

<a id="p272"></a>

## P272: Move formatStationName to lib/format and parseStructureFit to features/custom-structures

- **Status:** [ ] not started
- **Category:** feature-skeleton · **Kind:** simplification · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About 0 net: about 5 lines and one file move, and one file is deleted. Optionally +1 for the satisfies clause.
- **Depends on:** —
- **Existing primitive:** `src/lib/format/names.ts`

**Problem.** features/industry-planner hosts two modules that the planner never uses. formatStationName is a pure EVE station-name formatter consumed only by the owned-assets and owned-blueprints syncs in composition. parseStructureFit parses a pasted Upwell fit for the custom-structures parse-fit route, whose endpoint contract lives in features/custom-structures. The planner therefore shows false fan-in (both files are hotspots: health-targets.txt:76 score 18.6 and :118 score 17.0). The parser's response schema cannot be typed against ParsedStructureFit because the two live in different features.

**Sites (7).**

- [`src/features/industry-planner/format-station-name.ts:1-5`](../../src/features/industry-planner/format-station-name.ts#L1-L5) — Pure string formatter; no direct unit test exists.
- [`src/composition/sync/owned-assets-sync.ts:4, 50`](../../src/composition/sync/owned-assets-sync.ts#L4) — Import, and injection into buildOwnedAssetDetail.
- [`src/composition/sync/owned-blueprints-sync.ts:5, 51`](../../src/composition/sync/owned-blueprints-sync.ts#L5) — Import, and injection into buildOwnedDetail.
- [`src/features/industry-planner/structure-fit-parse.ts:1-50`](../../src/features/industry-planner/structure-fit-parse.ts#L1-L50) — Self-contained parser with no imports.
- [`src/features/industry-planner/structure-fit-parse.test.ts:1-101`](../../src/features/industry-planner/structure-fit-parse.test.ts#L1-L101) — Unit tests that move with it.
- [`src/app/api/account/custom-structures/parse-fit/route.ts:8, 24`](../../src/app/api/account/custom-structures/parse-fit/route.ts#L8) — The only production consumer.
- [`src/features/custom-structures/api-contract.ts:100-113`](../../src/features/custom-structures/api-contract.ts#L100-L113) — parseStructureFitResponseSchema repeats the ParsedStructureFit shape untyped. The same file ties customStructureRowSchema to its type with `satisfies` (line 30).

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/owned-assets/detail.ts:71-76, 92`](../../src/features/owned-assets/detail.ts#L71-L76) — Receives formatStation as an injected FormatStation function; it is unaffected by the move and should keep the injection.

</details>

**Home.** `src/lib/format/names.ts (formatStationName); src/features/custom-structures/structure-fit-parse.ts (parser and test)`

**Boundary check.** formatStationName goes to the lib zone. Its consumers are src/composition/sync/* (composition zone, whose rule allows 'lib'), and lib imports nothing, which {from: lib, allow: [config]} permits. structure-fit-parse.ts goes to the features/custom-structures zone. Its consumer src/app/api/account/custom-structures/parse-fit/route.ts is in the api zone, whose rule allows 'features'. custom-structures/api-contract.ts may import it within its own zone. The test files move with their modules.

**API sketch.**

```ts
// src/lib/format/names.ts
export function formatStationName(name: string): string; // body unchanged

// src/features/custom-structures/structure-fit-parse.ts
export interface ParsedStructureFit { structureTypeId: number; name: string | null; rigTypeIds: number[] }
export type ResolveTypeId = (name: string) => number | undefined;
export function parseStructureFit(clipboard: string, resolveTypeId: ResolveTypeId): ParsedStructureFit | null;
```

**Migration steps.**

1. Append formatStationName to src/lib/format/names.ts. Add unit cases to src/lib/format/names.test.ts: the moon-collapse form 'X - Moon 4 - Y' becomes 'X-4 — Y', and a plain 'A - B' becomes 'A — B'.
2. Repoint the imports at owned-assets-sync.ts:4 and owned-blueprints-sync.ts:5 to '@/lib/format/names', then delete src/features/industry-planner/format-station-name.ts.
3. git mv src/features/industry-planner/structure-fit-parse.ts and its .test.ts into src/features/custom-structures/.
4. Repoint parse-fit/route.ts:8 to '@/features/custom-structures/structure-fit-parse'.
5. Optional: in custom-structures/api-contract.ts, add `satisfies z.ZodType<{ parsed: ParsedStructureFit | null }>` to parseStructureFitResponseSchema, so the route payload type stays tied to the parser.

**Tests.** Move structure-fit-parse.test.ts as-is. Add formatStationName cases to src/lib/format/names.test.ts, since it has no direct test today. src/app/api/account/custom-structures/parse-fit/route.test.ts guards the route wiring. Run pnpm check through test-runner so Fallow confirms there are no unresolved imports or coverage gaps.

**Notes.** No behaviour change. data/eve-data would also be a legal home for formatStationName (composition may import data), but lib/format keeps it importable from the components and ui-adjacent zones should a client view need it later. Keep the FormatStation injection in owned-assets and owned-blueprints. P273 also touches features/custom-structures, but the two are independent.

<sub>Reported by: area:industry-planner.</sub>

<a id="p098"></a>

## P098: Hoist activityLabel to data/eve-data, label activity 9 as a reaction, and unify the planner's production-activity guard

- **Status:** [ ] not started
- **Category:** formatting · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** about -15 production lines (two label functions, a duplicate constant, productionActivity, the cast); about +12 production (activityLabel, the named id, the guard); +20 test lines
- **Depends on:** —
- **Existing primitive:** `src/data/eve-data/constants.ts:ACTIVITY_NAME_TO_ID,ACTIVITY_ID_LABEL`

**Problem.** Two features each define `ACTIVITY_ID_LABEL[id] ?? 'Industry'`. Industry-jobs treats ESI activity 9 as a reaction for slot counting, but the shared label map has no 9, so those jobs display 'Industry'. jobCategory hard-codes 1, 3, 4, 5, 8, 9 and 11 instead of using ACTIVITY_NAME_TO_ID, which type-images.jobImage already uses. Inside the planner:
- industry-styles.ts declares a third REACTION_ACTIVITY_ID = 11 beside structure-bonus's REACTION_ACTIVITY.
- The 'manufacturing or reaction' narrowing is written three times; structure-factors needs an `as IndustryActivityId` cast because its version is not a type guard.

**Verifier revision.** The core holds. activityLabel (industry-planner/industry-styles.ts:94-96) and jobActivityLabel (industry-jobs/industry-jobs-styles.ts:14-16) have identical bodies. They live in two feature zones that may not import each other but may both import data, so data/eve-data is the right home. There is also a real visible bug: industry-jobs counts activity 9 as a reaction for slots (pinned by industry-jobs-styles.test.ts 'including live-ESI activity 9'), but ACTIVITY_ID_LABEL has no entry for 9, so those job rows render 'Industry'.

Several parts do not survive:
- The 'planner does not treat 9 as a reaction' drift is not drift. Planner activity ids come from the SDE through ACTIVITY_NAME_TO_ID over INDUSTRY_ACTIVITY_NAMES (only 1 and 11), never from ESI.
- Hoisting MANUFACTURING_ACTIVITY, REACTION_ACTIVITY and IndustryActivityId into data is rejected. Their only consumers are the planner and components-composition (about 17 importers), and ACTIVITY_NAME_TO_ID is typed Record<ActivityName, number>, so the literal types the planner needs cannot be derived from it without retyping.
- activitySlotPool in data is rejected. jobCategory has a single consumer (industry-jobs/slots.ts).

The planner's third REACTION_ACTIVITY_ID and the triplicated 'manufacturing or reaction' predicate are real, but they are planner-internal and belong in structure-bonus.ts.

**Sites (15).**

- [`src/data/eve-data/constants.ts:8-15, 37-44`](../../src/data/eve-data/constants.ts#L8-L15) — ACTIVITY_NAME_TO_ID (typed Record<ActivityName, number>) and ACTIVITY_ID_LABEL (no entry for 9). Only the two label functions import ACTIVITY_ID_LABEL.
- [`src/data/eve-data/type-images.ts:26-42`](../../src/data/eve-data/type-images.ts#L26-L42) — jobImage already compares against ACTIVITY_NAME_TO_ID.*; this is the pattern for jobCategory
- [`src/features/industry-jobs/industry-jobs-styles.ts:14-16`](../../src/features/industry-jobs/industry-jobs-styles.ts#L14-L16) — jobActivityLabel, identical body to the planner's activityLabel
- [`src/features/industry-jobs/industry-jobs-styles.ts:18-31`](../../src/features/industry-jobs/industry-jobs-styles.ts#L18-L31) — isReaction (9 or 11) and jobCategory with bare literals 1, 3, 4, 5, 8
- [`src/features/industry-jobs/industry-jobs-styles.test.ts:18-36`](../../src/features/industry-jobs/industry-jobs-styles.test.ts#L18-L36) — pins the label fallback and jobCategory(9) === 'reactions' ('live-ESI activity 9'); nothing pins the label for 9
- [`src/features/industry-jobs/job-view.ts:8, 50`](../../src/features/industry-jobs/job-view.ts#L8) — the only jobActivityLabel consumer
- [`src/features/industry-planner/industry-styles.ts:94-96`](../../src/features/industry-planner/industry-styles.ts#L94-L96) — activityLabel (identical body)
- [`src/features/industry-planner/industry-styles.ts:131, 139-157`](../../src/features/industry-planner/industry-styles.ts#L131) — local REACTION_ACTIVITY_ID = 11, used in classifyBuildNode at 153
- [`src/features/industry-planner/components/PlannerRail.tsx:21, 82`](../../src/features/industry-planner/components/PlannerRail.tsx#L21) — activityLabel consumer
- [`src/features/industry-planner/components/ComponentDrawer.tsx:20, 71`](../../src/features/industry-planner/components/ComponentDrawer.tsx#L20) — activityLabel consumer
- [`src/features/industry-planner/coverage.test.ts:63, 96`](../../src/features/industry-planner/coverage.test.ts#L63) — pins activityLabel as an industry-styles export; update on migration
- [`src/features/industry-planner/structure-bonus.ts:6-8`](../../src/features/industry-planner/structure-bonus.ts#L6-L8) — MANUFACTURING_ACTIVITY = 1, REACTION_ACTIVITY = 11, IndustryActivityId. This is the planner's home for these, with about 17 importers including components-composition.
- [`src/features/industry-planner/cockpit-margin.ts:1, 12-14`](../../src/features/industry-planner/cockpit-margin.ts#L1) — inline mfg-or-reaction predicate (feeableActivity)
- [`src/features/industry-planner/profiles/profile-plan.ts:56-58, 125`](../../src/features/industry-planner/profiles/profile-plan.ts#L56-L58) — productionActivity narrowing helper and its only call
- [`src/features/industry-planner/structure-factors.ts:133-134`](../../src/features/industry-planner/structure-factors.ts#L133-L134) — same predicate, then `activity as IndustryActivityId` because it is not a type guard

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/industry-planner/structure-bonus.ts:6-8`](../../src/features/industry-planner/structure-bonus.ts#L6-L8) — Not moved to data. The literal union type is planner-specific, every consumer is the planner or components-composition (which may import features), and ACTIVITY_NAME_TO_ID's number typing cannot supply literal types.
- [`src/features/industry-jobs/industry-jobs-styles.ts:22-31`](../../src/features/industry-jobs/industry-jobs-styles.ts#L22-L31) — jobCategory and JobCategory stay in industry-jobs. Its only caller is slots.ts, and components-composition imports the type legally from features, so no second consumer justifies moving it to data.
- [`src/data/eve-data/type-images.ts:26-42`](../../src/data/eve-data/type-images.ts#L26-L42) — jobImage already uses the canonical ids; no change needed (activity 9 already falls through to the product image)

</details>

**Home.** `src/data/eve-data/constants.ts for activityLabel and LEGACY_REACTION_ACTIVITY_ID; src/features/industry-planner/structure-bonus.ts for isProductionActivity`

**Boundary check.** src/data/eve-data is a data zone and data/eve-data/constants.ts imports nothing. Consumers:
- features/industry-jobs (job-view.ts, industry-jobs-styles.ts) and features/industry-planner (PlannerRail.tsx, ComponentDrawer.tsx): the 'features' rule allows 'data', and both already import '@/data/eve-data/constants' today.
- Features may not import other features (the 'features' allow list has no 'features'), which is why the shared label cannot live in either feature.
- isProductionActivity stays inside features/industry-planner; its consumers (cockpit-margin, profile-plan, structure-factors) are in the same zone.
- constants.ts is already client-safe because client components reach it through industry-styles.

**API sketch.**

```ts
// src/data/eve-data/constants.ts
/** ESI still reports some reaction jobs under the pre-2017 reaction id. */
export const LEGACY_REACTION_ACTIVITY_ID = 9;
const ACTIVITY_ID_LABEL: Record<number, string> = { 1: 'Manufacturing', 3: 'TE Research', 4: 'ME Research', 5: 'Copying', 8: 'Invention', [LEGACY_REACTION_ACTIVITY_ID]: 'Reaction', 11: 'Reaction' };
export function activityLabel(activityId: number): string; // ?? 'Industry'

// src/features/industry-planner/structure-bonus.ts
export function isProductionActivity(id: number | null | undefined): id is IndustryActivityId;
```

**Migration steps.**

1. In src/data/eve-data/constants.ts:
- Add LEGACY_REACTION_ACTIVITY_ID = 9 with a doc comment citing the live-ESI behaviour.
- Add the 9 -> 'Reaction' label entry.
- Export activityLabel(activityId) with the 'Industry' fallback.
- Stop exporting ACTIVITY_ID_LABEL once the two features no longer import it. fallow's unused-exports runs with ignoreExportsUsedInFile:false, so an export used only in its own file is still flagged.
2. Add src/data/eve-data/constants.test.ts covering activityLabel. constants.ts must stay covered under fallow coverage-gaps.
3. industry-jobs:
- Delete jobActivityLabel from industry-jobs-styles.ts.
- In job-view.ts, import activityLabel from '@/data/eve-data/constants' and call it at line 50.
- Rewrite jobCategory and isReaction against ACTIVITY_NAME_TO_ID.manufacturing, .reaction, .research_time, .research_material, .copying, .invention and LEGACY_REACTION_ACTIVITY_ID.
- Remove the jobActivityLabel tests from industry-jobs-styles.test.ts.
4. industry-planner:
- Delete activityLabel from industry-styles.ts and drop its ACTIVITY_ID_LABEL import.
- Point PlannerRail.tsx and ComponentDrawer.tsx at '@/data/eve-data/constants'.
- Remove activityLabel from the pinned list in industry-planner/coverage.test.ts.
5. In industry-styles.ts, delete `const REACTION_ACTIVITY_ID = 11` and import REACTION_ACTIVITY from './structure-bonus'. structure-bonus imports neither industry-styles nor anything that imports it, so no cycle forms.
6. In structure-bonus.ts, add the isProductionActivity type guard. Use it in:
- cockpit-margin.ts:12-13: `const feeableActivity = isProductionActivity(activityId)`.
- profile-plan.ts: delete productionActivity (56-58); at 125, `const raw = nodeActivityByBlueprint[bp]; const activity = isProductionActivity(raw) ? raw : null`.
- structure-factors.ts:133-134: narrow with the guard and drop the `as IndustryActivityId` cast.

**Tests.** New tests:
- src/data/eve-data/constants.test.ts: activityLabel(1) = 'Manufacturing', activityLabel(8) = 'Invention', activityLabel(9) = 'Reaction' and activityLabel(11) = 'Reaction' (the visible fix), activityLabel(999) = 'Industry'.
- structure-bonus.test.ts: isProductionActivity(1) and (11) are true; (9), (3), undefined and null are false. Optionally pin MANUFACTURING_ACTIVITY === ACTIVITY_NAME_TO_ID.manufacturing and REACTION_ACTIVITY === ACTIVITY_NAME_TO_ID.reaction so the planner literals cannot drift from the SDE map.
- Optionally, a job-view test that an activity_id 9 job's activityLabel is 'Reaction'.

Existing guards that must stay green: industry-jobs-styles.test.ts jobCategory (29-36), the industry-styles.test.ts and build-plan-view.test.ts classifyBuildNode/REACTION_NODE_LABEL cases, the cockpit-margin, profile-plan and structure-factors suites.

**Notes.** Visible change: ESI jobs with activity_id 9 now read 'Reaction' instead of 'Industry' in job rows. Adding 9 to the shared label map cannot affect the planner, because planner ids come from the SDE (1 and 11 only). Keep jobCategory(9) as 'reactions'; the industry-jobs copy is the correct one for ESI data. The planner was never wrong about 9; it just never sees it. The 'manufacturing or reaction' predicate is semantically identical at all three sites, so the type guard needs no reconciliation.

<sub>Reported by: area:features-owned, area:industry-planner.</sub>

<a id="p118"></a>

## P118: Reuse romanLevel in MemberDetail and give skill-queue one parsed-time and finished-entry rule

- **Status:** [ ] not started
- **Category:** generic-utility · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** about -15 / +15 in production code (net about 0; consistency gain), +30 in tests
- **Depends on:** —
- **Existing primitive:** `src/features/skill-queue/progress.ts:romanLevel`

**Problem.** MemberDetail re-declares romanLevel. Separately, 'has this queue entry finished?' is decided by four different expressions over hand-parsed optional ISO dates:
- entryProgress: both dates parse and finish <= now gives done; a missing or unparseable date gives paused.
- board remainingQueue: keep the entry if finish_date is missing or Date.parse(finish) > now.
- board effectiveSkills: apply the entry if finish_date is present and !(Date.parse(finish) > now).
- board queueTimeline: both dates parse and finish > now.
They disagree in two cases. An unparseable finish_date is applied as a finished level by effectiveSkills (NaN > now is false, so it falls through to applyFinishedEntry), dropped by remainingQueue, and reported as paused by entryProgress. A past finish with no start is dropped and applied by the board but reported as paused by entryProgress and currentTraining. Optional dates are parsed in seven places, some with a null sentinel and some with NaN.

**Verifier revision.** Two parts survive. First, MemberDetail.tsx:22-26 copies the ROMAN table and level() byte for byte from features/skill-queue/progress.ts:63-66 (romanLevel), which components-composition may import. Second, the rule for 'finished by now' really is implemented four ways and drifts on partial or malformed dates. Three parts are rejected. (a) Moving remainingQueue, queueWindow, queueTimeline and effectiveSkills into features/skill-queue fails AGENTS.md's 'real second consumer' test: the board is their only consumer, so the move relocates code without deduplicating anything. (b) The efficiency claims are not material. A queue holds at most about 150 entries and levels a few hundred keys, recomputed once per 'now' tick, which costs microseconds; the second Timeline sits inside the Drawer. (c) Dropping the re-sorts would tie correctness to every producer (ESI parse, DB rows, demo-board) to save an O(n log n) sort on a tiny array, so keep them.

**Sites (13).**

- [`src/components/composition/industry-workspace/MemberDetail.tsx:22-26, 65`](../../src/components/composition/industry-workspace/MemberDetail.tsx#L22-L26) — ROMAN and level() copy, used at line 65
- [`src/features/skill-queue/progress.ts:63-66`](../../src/features/skill-queue/progress.ts#L63-L66) — romanLevel (canonical; also used by components/TrainingLine.tsx:39 and SkillQueueRows.tsx:50)
- [`src/features/skill-queue/progress.ts:22-35`](../../src/features/skill-queue/progress.ts#L22-L35) — entryProgress: null-sentinel parse; a missing or unparseable date gives paused before the done check
- [`src/features/skill-queue/progress.ts:53-55`](../../src/features/skill-queue/progress.ts#L53-L55) — summarizeQueue: NaN-sentinel finish parse
- [`src/features/skill-queue/progress.ts:74-87`](../../src/features/skill-queue/progress.ts#L74-L87) — currentTraining: re-sort at 76 (defensive) and NaN-sentinel finish parse at 83
- [`src/features/skill-queue/queue-view.ts:14-25`](../../src/features/skill-queue/queue-view.ts#L14-L25) — entryRowModel re-parses finish at line 16, which is redundant because training already implies a finite finish
- [`src/components/composition/board/board-view-model.ts:218-233`](../../src/components/composition/board/board-view-model.ts#L218-L233) — effectiveSkills: line 229 treats an unparseable finish as finished (bug)
- [`src/components/composition/board/board-view-model.ts:391-403`](../../src/components/composition/board/board-view-model.ts#L391-L403) — queueTimeline: its own two-date parse and finish <= now skip
- [`src/components/composition/board/board-view-model.ts:622-627`](../../src/components/composition/board/board-view-model.ts#L622-L627) — remainingQueue: its own done rule (line 625) and a re-sort
- [`src/components/composition/board/board-view-model.ts:50-69`](../../src/components/composition/board/board-view-model.ts#L50-L69) — queueHealth composes remainingQueue and summarizeQueue, so both rules apply in one result
- [`src/components/composition/board/board-view-model.ts:92-108`](../../src/components/composition/board/board-view-model.ts#L92-L108) — trainingOf guards Number.isFinite(training.finishesAt), needed only because of the NaN sentinel
- [`src/components/composition/board/sections/SkillsSection.tsx:22, 36`](../../src/components/composition/board/sections/SkillsSection.tsx#L22) — effectiveSkills computed twice in one component (a clarity cleanup, not a performance problem)
- [`src/features/skill-queue/esi-projection.ts:3-12, 34-38`](../../src/features/skill-queue/esi-projection.ts#L3-L12) — dates are z.string() with no datetime validation, so unparseable strings can reach the rules; parse sorts by queue_position

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/components/composition/board/sections/QueueSection.tsx:55-75`](../../src/components/composition/board/sections/QueueSection.tsx#L55-L75) — remainingQueue reached up to three times and Timeline twice (the second inside the Drawer) on arrays of 150 or fewer entries. Not a real efficiency problem; leave it.
- [`src/components/composition/board/sections/SheetHeader.tsx:63-66`](../../src/components/composition/board/sections/SheetHeader.tsx#L63-L66) — A third effectiveSkills call in a sibling subtree. Lifting it to CharacterDetail would thread a new prop through SheetHeader and Kpis for microseconds; not worth it.
- [`src/features/skill-queue/progress.ts:76`](../../src/features/skill-queue/progress.ts#L76) — Re-sort by queue_position in currentTraining. It is defensive against producers other than parseSkillQueueBody (DB rows, demo-board); keep it.
- [`src/app/(site)/admin/signals.ts:232`](../../src/app/%28site%29/admin/signals.ts#L232) — summarizeQueue there is an unrelated ESI refresh-queue summary that happens to share the name

</details>

**Home.** `src/features/skill-queue/progress.ts (existing romanLevel; new entryTimes and isEntryFinished beside entryProgress)`

**Boundary check.** MemberDetail.tsx and board-view-model.ts are in the components-composition zone (src/components/composition/**), and the rule {from: components-composition, allow: [..., features, ...]} permits importing src/features/skill-queue/progress.ts. board-view-model.ts:13 already imports it. queue-view.ts and progress.ts are in the same feature, so those imports are intra-zone.

**API sketch.**

```ts
// src/features/skill-queue/progress.ts
export interface EntryTimes { start: number | null; finish: number | null } // null = missing or unparseable
export function entryTimes(entry: Pick<SkillQueueEntry, 'start_date' | 'finish_date'>): EntryTimes;
export function isEntryFinished(entry: Pick<SkillQueueEntry, 'finish_date'>, now: number): boolean; // finish !== null && finish <= now
export function romanLevel(level: number): string; // existing
```

**Migration steps.**

1. MemberDetail.tsx: delete ROMAN and level (lines 22-26), import { romanLevel } from '@/features/skill-queue/progress', and use romanLevel(skill.level) at line 65.
2. progress.ts: add a private parseOptionalMs(iso?: string): number | null that returns null for undefined or a non-finite Date.parse. Add the exported entryTimes and isEntryFinished.
3. Settle the canonical rule (recommended: finish-only). Rewrite entryProgress on entryTimes so isEntryFinished(entry, now) returns done before the paused check, then return paused if start or finish is null. This changes a past-finish, no-start entry from paused to done, which matches the board. The case is unpinned by tests, so add a test for whichever rule is chosen.
4. progress.ts: in summarizeQueue (53-55) use entries.map(e => entryTimes(e).finish).filter(notNull). In currentTraining (83) use entryTimes(entry).finish, which is non-null for status training, and drop the NaN sentinel. The board's Number.isFinite guard in trainingOf (104) then becomes always-true and can be simplified.
5. queue-view.ts line 16: use entryTimes(entry).finish.
6. board-view-model.ts: effectiveSkills line 229 becomes if (!isEntryFinished(entry, now)) continue; (fixes the unparseable-finish bug). remainingQueue line 625 becomes .filter((entry) => !isEntryFinished(entry, now)). queueTimeline lines 395-398 use const { start, finish } = entryTimes(entry); and skip when either is null or finish <= now.
7. SkillsSection.tsx: optionally reuse the effective value computed at line 22 inside the SectionBody render (it is non-null whenever the body renders) instead of calling effectiveSkills again at line 36.
8. Keep the board functions in board-view-model.ts and keep the defensive sorts.

**Tests.** Add to src/features/skill-queue/progress.test.ts: entryTimes (missing gives null, an unparseable string gives null), isEntryFinished at the boundary (finish === now is finished), the chosen past-finish/no-start rule for entryProgress and currentTraining, and that currentTraining's finishesAt is finite for training. Add to src/components/composition/board/board-view-model.test.ts: an entry with finish_date 'garbage' is not applied by effectiveSkills (today it is) and is kept by remainingQueue. Existing guards that must stay green: board-view-model.test.ts:332-387 (queueWindow, remainingQueue, queueHealth: paused and finished queues) and 389-421 (effectiveSkills), progress.test.ts:46-48 and 129-135 (a dateless entry is paused), queue-view.test.ts.

**Notes.** Which copy is right:
- An unparseable finish_date must not count as finished. effectiveSkills is wrong; entryProgress's null handling is right. remainingQueue drops such an entry today, and after the change shows it as paused.
- An entry with a past finish_date has finished whatever its start_date, so the board's finish-only rule is semantically right and entryProgress's 'paused' is the outlier.
ESI in practice sends both dates or neither (a paused queue), so both divergences only show up on partial or malformed rows. Because esi-projection accepts any string for the dates, the guard belongs in the parse helper, not the schema: tightening the schema to z.iso.datetime() would reject the whole queue body over one bad date. Dropped from the original proposal: relocating the board view-model functions into the feature (single consumer), useMemo lifting, and removing the sorts.

<sub>Reported by: area:components-composition, area:features-owned.</sub>

← [Wave 3: src/lib primitives: collections, math, async, errors, browser](wave-03-src-lib-primitives-collections-math-async.md) · [Index](README.md#roadmap) · [Wave 5: Persistence primitives and data-layer SQL](wave-05-persistence-primitives-and-data-layer-sql.md) →
