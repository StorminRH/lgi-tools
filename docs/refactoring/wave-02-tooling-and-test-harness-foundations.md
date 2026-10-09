# Wave 2: Tooling and test-harness foundations

Part of the [primitive extraction guide](README.md). Audit of `e5b7b17` on 2026-10-09; line ranges drift, so re-open each site before editing.

← [Wave 1: Quick wins: delete dead code, fix small correctness and perf bugs](wave-01-quick-wins-delete-dead-code-fix-small.md) · [Index](README.md#roadmap) · [Wave 3: src/lib primitives: collections, math, async, errors, browser](wave-03-src-lib-primitives-collections-math-async.md) →

Make every later PR cheaper and safer. P334 provides one ESLint exemption builder, so later lint additions are one-liners. P340 trims the coverage pins after wave-1 deletions. Shared helpers then replace the hand-rolled fakes: Convex error and seeding, route requests, session fixtures, console prefix silencing, problem bodies, DB harness, reserved connection, query chain, registry diff, domain fixtures, hook runtime and source-scan. The two medium-risk helpers (P338 hook runtime, P339 source-scan) go last. Each must show a planted violation still failing the gate it serves.

| Status | ID | Item | Category | Effort | Risk | Payoff | Depends on |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | [P334](#p334) | Build every no-restricted-syntax and no-restricted-imports list from one canonical list minus exemptions | simplification | M | low | medium | — |
| ☑ | [P340](#p340) | Delete redundant coverage pins and per-file dead Next/Convex mocks; collapse the tautological pin body | testing | M | low | high | — |
| ☑ | [P216](#p216) | Add one strict ConvexError-code assertion and shared map-access seeding helpers to the Convex test setup | testing | M | low | medium | — |
| ☑ | [P341](#p341) | Add src/lib/__tests__/route-requests.ts (postJson, postForm, postEmpty, cronRequest) and migrate the route tests' local builders | testing | M | low | medium | — |
| ☐ | [P344](#p344) | Add typed BetterAuthSession fixtures and type the getSession mocks in route and session tests | testing | S | low | medium | — |
| ☐ | [P346](#p346) | Add a prefix-scoped console silencer in lib test support and migrate the unasserted blanket spies | testing | M | low | medium | — |
| ☐ | [P342](#p342) | Build valid problem fixtures with problemBody/serializeProblem and replace local jsonResponse helpers with Response.json | testing | S | low | low | — |
| ☐ | [P343](#p343) | Adopt the DB harness's resetBetweenTests and expect.poll; drop cargo portrait overrides; pair updatedAt in the harness and add seedAccount | testing | S | low | low | — |
| ☐ | [P349](#p349) | Use createReservedConnectionMock in the four cron route tests that hand-roll the reserved connection | testing | S | low | low | — |
| ☐ | [P244](#p244) | Add createFakeQueryChain to src/db/__tests__/support and migrate the five hand-built Drizzle chains | testing | S | low | low | — |
| ☐ | [P347](#p347) | Share one registry coverage diff and use reflectedSchemaTables in the purge and ESI registry gates | testing | S | low | low | — |
| ☐ | [P348](#p348) | Add per-domain test fixture builders for wormhole sites, industry jobs and mapper chain/layout facts | testing | M | low | low | — |
| ☐ | [P338](#p338) | Extract the shared stateful hook runtime that ~10 hook tests hand-roll, and leave the scripted single-purpose React fakes local | testing | M | medium | medium | — |
| ☐ | [P339](#p339) | Add one source-scan test helper (file listing, route listing, comment strip, pattern match, value-import extraction and resolution) and migrate the rail, census and contract tests to it | testing | M | medium | medium | — |

<a id="p334"></a>

## P334: Build every no-restricted-syntax and no-restricted-imports list from one canonical list minus exemptions

- **Status:** [x] done
- **Category:** simplification · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -250/+40. That covers 10 inline syntax lists of about 16 lines down to one line each, the 20-line duplicate builder, the 10-line no-op block, about 10 import lists, and 12 pairs of about 10 lines down to about 3 each.
- **Depends on:** —

**Problem.** ESLint flat config replaces a rule's options whenever a later block matches, so every owner block that exempts one group must re-list all the others. The config already has an exemption builder, but it is duplicated byte for byte (productionSyntaxSelectorsExcept and primitiveSyntaxSelectorsExcept) and only filters uiAdoptionSelectors. As a result, 10 owner blocks hand-copy the 16-group production list minus their own group: platform/esi, lib/env, tones, preview, opengraph, esi-datasets, type-images, fetch/api-client, eve-sso/proxy, plus the base src/** block itself. Six test and convex blocks repeat the same csp+hex+rgba+apiFetch base. The 17 no-restricted-imports blocks repeat the vendor, cross-cutting, Base UI, sonner and server-root pattern groups the same way. Adding a new rail group means editing about 11 lists by hand, and a missed list silently drops the rail for that owner. Each of the 12 Literal/TemplateElement pairs repeats its regex twice.

**Verifier revision.** Confirmed, and the finder undersold it. The two builders at eslint.config.mjs:545-585 are byte-identical, and since ui/** also uses the full production list, the alias is pointless. The bigger duplication sits elsewhere: the same 16-group production list is hand-copied inline 10 more times (lines 1202-1479), each copy dropping one owner's group. The ui/** block (1480-1489) is a no-op repeat of the src/** list. The same re-listing pattern runs through 17 no-restricted-imports blocks (769-1157). scripts/vendor-rail.test.mjs has an 'existing rails survive the re-listing' suite precisely because of this risk. The 'same message' claim for Literal/TemplateElement pairs holds for only 6 of 12 pairs, so the helper needs an optional template message.

**Sites (16).**

- [`eslint.config.mjs:541-585`](../../eslint.config.mjs#L541-L585) — selectorsWithout plus two byte-identical builders. primitive* is used at 1486-1602 (13 calls) and production* at 1611-1646 (4 calls).
- [`eslint.config.mjs:1202-1226`](../../eslint.config.mjs#L1202-L1226) — Canonical 16-group production list for src/**/*.{ts,tsx,mts}, written inline.
- [`eslint.config.mjs:1227-1250`](../../eslint.config.mjs#L1227-L1250) — src/platform/esi: the canonical list minus esiHostSelectors.
- [`eslint.config.mjs:1251-1273`](../../eslint.config.mjs#L1251-L1273) — src/lib/env.ts: minus processEnvSelectors.
- [`eslint.config.mjs:1274-1296`](../../eslint.config.mjs#L1274-L1296) — src/components/ui/tones.ts: minus hexColorSelectors.
- [`eslint.config.mjs:1297-1317`](../../eslint.config.mjs#L1297-L1317) — Preview: minus hexColor, textSize and roundedSize.
- [`eslint.config.mjs:1318-1341`](../../eslint.config.mjs#L1318-L1341) — opengraph-image: rawHtmlSelectors in place of cspSelectors, i.e. minus inlineStyleSelectors.
- [`eslint.config.mjs:1342-1365`](../../eslint.config.mjs#L1342-L1365) — src/lib/esi-datasets: minus datasetTtlSelectors.
- [`eslint.config.mjs:1379-1401`](../../eslint.config.mjs#L1379-L1401) — type-images.ts: minus imageVariantSelectors.
- [`eslint.config.mjs:1430-1452`](../../eslint.config.mjs#L1430-L1452) — fetch-with-timeout and api-client: minus bareFetchSelectors.
- [`eslint.config.mjs:1453-1479`](../../eslint.config.mjs#L1453-L1479) — eve-sso-constants, eve-sso and proxy: minus ssoHostSelectors.
- [`eslint.config.mjs:1480-1489`](../../eslint.config.mjs#L1480-L1489) — The ui/** block applies the same list as 1202-1226 to a subset of the same files (tones.ts is ignored here and keeps its own override), so it changes nothing.
- [`eslint.config.mjs:1159-1201, 1366-1378, 1402-1429`](../../eslint.config.mjs#L1159-L1201) — Six test and convex lists that all begin with the same cspSelectors, hexColor, rgbaColor and apiFetch base.
- [`eslint.config.mjs:769-1157`](../../eslint.config.mjs#L769-L1157) — 17 no-restricted-imports blocks re-listing vendor, cross-cutting, baseUi, deprecatedBaseUi, sonner and serverRoot pattern groups minus each owner's group. Examples: baseUiWrapperFiles drops baseUi, toast drops sonner, upstash.ts drops upstashRedis, data/convex drops convexReact, gsc drops googleAuth.
- [`eslint.config.mjs:32-102, 206-256, 310-355`](../../eslint.config.mjs#L32-L102) — 12 Literal/TemplateElement selector pairs. Their regexes are identical within each pair (no drift).
- [`scripts/vendor-rail.test.mjs:163-190`](../../scripts/vendor-rail.test.mjs#L163-L190) — 'existing rails survive the re-listing' suite, which exists to catch drift from hand re-listing.

<details><summary>Excluded sites (not the same concept)</summary>

- [`eslint.config.mjs:32-48, 50-61, 63-74, 91-102, 323-334, 344-355`](../../eslint.config.mjs#L32-L48) — These pairs use a distinct '(template literal)' message on the TemplateElement side (hex, rgba, textSize, rounded, esiHost, ssoHost). Only legacyTypeRole, emptyState, tone, skeleton, progress and postgresConnectionString share one message. The helper must accept an optional template message so the output text stays the same.
- [`eslint.config.mjs:44-47`](../../eslint.config.mjs#L44-L47) — The raw hex constant selector is Literal-only and has no template twin; keep it as is.
- [`eslint.config.mjs:297-308`](../../eslint.config.mjs#L297-L308) — directPostgresSelectors are ImportDeclaration and CallExpression selectors, not a Literal/Template pair.

</details>

**Home.** `eslint.config.mjs (config only)`

**Boundary check.** eslint.config.mjs belongs to no fallow zone and is listed in boundaries.coverage.allowUnmatched. The refactor changes only how the config builds its rule option arrays; no src module imports change, so no boundary rule applies.

**API sketch.**

```ts
function literalAndTemplate(pattern, message, templateMessage = message) {
  return [
    { selector: `Literal[value=/${pattern}/]`, message },
    { selector: `TemplateElement[value.raw=/${pattern}/]`, message: templateMessage },
  ];
}
const except = (list, ...exemptions) => list.filter((entry) => !exemptions.includes(entry));
const baseSyntaxSelectors = [...cspSelectors, ...hexColorSelectors, ...rgbaColorSelectors, ...apiFetchSelectors];
const productionSyntaxSelectors = [...bareFetchSelectors, ...ssoHostSelectors, ...baseSyntaxSelectors, ...processEnvSelectors, ...esiHostSelectors, ...textSizeSelectors, ...legacyTypeRoleSelectors, ...roundedSizeSelectors, ...selectElementSelectors, ...inputClassSelectors, ...uiAdoptionSelectors, ...datasetTtlSelectors, ...imageVariantSelectors];
const productionSyntaxSelectorsExcept = (...exemptions) => except(productionSyntaxSelectors, ...exemptions);
// imports: const srcImportPatterns = [...vendorImportPatterns, ...crossCuttingImportPatterns, ...baseUiImportPatterns, ...deprecatedBaseUiImportPatterns, ...sonnerImportPatterns]; const clientImportPatterns = [...srcImportPatterns, ...serverRootImportPatterns]; each owner block: except(list, ...ownGroup)
```

**Migration steps.**

1. Before editing, use `new ESLint().calculateConfigForFile(path)` to dump the no-restricted-syntax and no-restricted-imports options for one file per block (about 35 files: a feature file, each owner file named in a files: list, a ui primitive, tones.ts, a preview file, an opengraph-image, a *.test.ts, a *.db.test.ts, a convex file, the cron route, the upstash, rate-limit, db, auth, gsc and data/convex owners) into a scratch JSON. Re-run after each step and diff the selector and pattern sets; they must be equal (order may change).
2. Define productionSyntaxSelectors and baseSyntaxSelectors. Change productionSyntaxSelectorsExcept to filter the whole list with except(); this works because each selector object is declared once, and cspSelectors spreads the same objects as inlineStyleSelectors and rawHtmlSelectors. Delete selectorsWithout and primitiveSyntaxSelectorsExcept (566-585), and rename its 13 call sites (1486-1602).
3. Replace the inline lists: 1202-1226 becomes productionSyntaxSelectorsExcept(); 1227-1250 (...esiHostSelectors); 1251-1273 (...processEnvSelectors); 1274-1296 (...hexColorSelectors); 1297-1317 (...hexColorSelectors, ...textSizeSelectors, ...roundedSizeSelectors); 1318-1341 (...inlineStyleSelectors); 1342-1365 (...datasetTtlSelectors); 1379-1401 (...imageVariantSelectors); 1430-1452 (...bareFetchSelectors); 1453-1479 (...ssoHostSelectors).
4. Delete the no-op src/components/ui/** block at 1480-1489, after the dump confirms that ui files' config is unchanged.
5. Use baseSyntaxSelectors for the six test and convex blocks (1159-1170, 1171-1185, 1186-1201, 1366-1378, 1402-1414, 1415-1429), each with its existing extras.
6. Apply the same treatment to the no-restricted-imports blocks (769-1157). Define the src and client pattern lists once and express each owner block as except(list, ...ownGroup), keeping each block's extra paths (cron 917-960, nextImageImportPaths).
7. Fold the 12 Literal/TemplateElement pairs into literalAndTemplate(String.raw`...`, message, templateMessage), passing the existing '(template literal)' messages where they differ so the rule text is unchanged.

**Tests.** The existing rails guard this behaviour: scripts/vendor-rail.test.mjs (bare-fetch owners 138-149, SSO owners 151-161, re-listing 163-190), scripts/ui-adoption-rail.test.mjs (145-245, including the exemptionHomes and tokenExemptionHomes tables), scripts/image-variant-rail.test.mjs, scripts/ui-import-rail.test.mjs and scripts/corp-access-rail.test.mjs. They match message fragments such as "Don't hand-write EVE SSO URLs", so keep the message text unchanged. Add one rail, for example scripts/syntax-exemption-rail.test.mjs. For each owner file it should assert that calculateConfigForFile's no-restricted-syntax selector set equals the production set minus that owner's declared exemption, which pins the invariant this refactor creates. The one-time before/after config dump (migration step 1) is the regression check for the refactor itself.

**Notes.** I checked every inline list group by group. Each differs from the canonical 16 only by its owner's exemption, so there is no drift bug today; the risk is future drift when a new group is added. Keep using identity-based exemptions (pass the group arrays). Do not switch to string keys, because uiAdoption exemptions are individual selector objects (rawButtonSelector, liveRegionSelector and so on). P330's optional tracking rail should use literalAndTemplate if this lands first.

<sub>Reported by: dupes-triage-2.</sub>

<a id="p340"></a>

## P340: Delete redundant coverage pins and per-file dead Next/Convex mocks; collapse the tautological pin body

- **Status:** [x] done
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** high · **Size:** About -550 to -650 lines of mock prelude, about -35 redundant pins, about -4 lines of tautological body per file across 22 files, one file deleted; +0 unless the conditional helper is needed (+30)
- **Depends on:** —
- **Existing primitive:** `src/lib/__tests__/module-path.ts (lib test-helper home)`

**Problem.** 22 pin files keep runtime exports on Fallow's coverage-gaps test graph. They are top churn hotspots (health-targets lines 6-30, 130, 288). 12 of them repeat an identical 50-line vi.mock prelude for next/navigation, next/headers, next/cache, next/font/google, next/og, next/dynamic, next/image, @vercel/speed-insights/next and convex/react. Most of those modules are never imported by the file's pinned modules: next/font/google and speed-insights reach only src/app/layout.tsx, and next/og reaches only the two opengraph-image routes. Every file repeats `expect(pinned.length).toBeGreaterThan(0)` plus a toBeDefined loop. About 35 of the pinned exports are already imported by a dedicated test, so those pins are stale. 9 more handler pins exist only because route tests import the handler through an importRoute() wrapper that Fallow cannot see through.

**Verifier revision.** The core claim holds. 12 pin files carry a byte-identical 50-line vi.mock prelude (lines 3-52; md5 4bb05bd0 across all of them). Only src/app/layout.tsx imports next/font/google and @vercel/speed-insights/next, and only the two opengraph-image files import next/og. All 22 pin files (21 in src plus convex/__tests__/export-coverage.test.ts) repeat the `pinned.length > 0` plus toBeDefined-loop body. Verification turned up a larger problem the finders missed: about 35 pins are redundant because another test already statically imports the same named export. For example, tabs.test.ts imports Tabs, IndustryJobsPanel.test.ts imports IndustryJobsPanel, and queries.db.test.ts imports getMarketHistoryInputs, which makes src/data/market-history/coverage.test.ts entirely redundant. A second cause of pins: 9 handler-coverage pins exist only because 11 route tests reach their handler through an `importRoute()` wrapper. Fallow does credit a direct `const { GET } = await import('./route')`. purge-maps GET and becomeSyntheticPilot are reached that way and are not pinned, while every handler reached through the wrapper is pinned. Revised design: delete the redundant pins first and drop mocks per file. Add no shared next-mocks module up front. The one-line next/headers mocks in route tests stay as they are, because swapping them for an async factory import is the same length with more indirection. ui-zone tests cannot import lib at all.

**Sites (25).**

- [`src/components/coverage.test.ts:3-52, 61-76`](../../src/components/coverage.test.ts#L3-L52) — Prelude plus pin body; CharacterStripSection and useLiveDataset are already imported by character-strip-section.test.ts and use-live-dataset.test.ts
- [`src/components/ui/coverage.test.ts:3-52, 73-106`](../../src/components/ui/coverage.test.ts#L3-L52) — Prelude in the ui zone (allow: []); DistributionBars, LoadingToastProvider, Tabs, SplitAxisChart and StackedAreaChart are already imported by their own *.test.ts
- [`src/components/composition/coverage.test.ts:3-52, 53-96`](../../src/components/composition/coverage.test.ts#L3-L52) — Prelude; EntranceOnce and SignedInFold are already imported by their own tests
- [`src/features/changelog/coverage.test.ts:3-52`](../../src/features/changelog/coverage.test.ts#L3-L52) — Identical prelude; pins only MasterSection
- [`src/features/custom-structures/coverage.test.ts:3-52, 53-76`](../../src/features/custom-structures/coverage.test.ts#L3-L52) — Prelude; StructureComposer and deleteCustomStructureEndpoint are already imported by StructureComposer.test.ts and StructureComposer.actions.test.ts
- [`src/features/industry-jobs/coverage.test.ts:3-52, 53-80`](../../src/features/industry-jobs/coverage.test.ts#L3-L52) — Prelude; IndustryJobsPanel is already imported by components/IndustryJobsPanel.test.ts
- [`src/features/industry-planner/coverage.test.ts:3-52, 53-109`](../../src/features/industry-planner/coverage.test.ts#L3-L52) — Prelude; CockpitKpis, GemIcon, HourglassIcon and getBuildLocation are already imported by CockpitKpis.test.ts, IndustryGlyph.test.ts and queries.db.test.ts
- [`src/features/owned-structures/coverage.test.ts:3-52`](../../src/features/owned-structures/coverage.test.ts#L3-L52) — Identical prelude
- [`src/features/skill-queue/coverage.test.ts:3-52, 53-70`](../../src/features/skill-queue/coverage.test.ts#L3-L52) — Identical prelude
- [`src/platform/auth/coverage.test.ts:3-52, 53-68`](../../src/platform/auth/coverage.test.ts#L3-L52) — Prelude; ConvexClientProvider imports convex/react and data/convex/client, which builds a real ConvexReactClient only when NEXT_PUBLIC_CONVEX_URL is set (data/convex/client.test.ts shows that construction works in tests)
- [`src/app/root-coverage.test.ts:3-52, 53-80`](../../src/app/root-coverage.test.ts#L3-L52) — The one file that needs next/font/google and speed-insights (it imports @/app/layout) plus next/og (opengraph-image); the AppRobots pin is already covered by robots.test.ts
- [`src/app/(site)/page-coverage.test.ts:3-52, 53-252`](../../src/app/%28site%29/page-coverage.test.ts#L3-L52) — Prelude; needs next/og (sites/[id]/opengraph-image) but not next/font; AdminPageFrame, AudienceCard, AdminTrendChart, the admin layout default and the settings/characters page default are already imported elsewhere
- [`src/app/api/handler-coverage.test.ts:3-52, 53-144`](../../src/app/api/handler-coverage.test.ts#L3-L52) — Prelude; corp-sharing POST, custom-structures/update POST, auth GET and daily-batch GET are already statically imported by their route tests; 9 more pins exist only because of importRoute wrappers
- [`src/app/layout.tsx:2-4`](../../src/app/layout.tsx#L2-L4) — Sole importer of next/font/google and @vercel/speed-insights/next
- [`src/composition/coverage.test.ts:1-31`](../../src/composition/coverage.test.ts#L1-L31) — Pin loop without a prelude; getCorpJobsForUserOnView and the three corp-structures-sync pins are already imported by sync/*.test.ts
- [`src/data/market-history/coverage.test.ts:1-8`](../../src/data/market-history/coverage.test.ts#L1-L8) — Entirely redundant: queries.db.test.ts:11 imports getMarketHistoryInputs (added 2026-09-29, after the pin on 09-28)
- [`src/data/eve-data/coverage.test.ts:1-16`](../../src/data/eve-data/coverage.test.ts#L1-L16) — Pin loop; both pins are still needed
- [`src/data/market-prices/coverage.test.ts:1-8`](../../src/data/market-prices/coverage.test.ts#L1-L8) — Single pin
- [`src/db/coverage.test.ts:1-15`](../../src/db/coverage.test.ts#L1-L15) — Pin loop
- [`src/features/wormhole-sites/coverage.test.ts:1-15`](../../src/features/wormhole-sites/coverage.test.ts#L1-L15) — Pin loop
- [`src/proxy-coverage.test.ts:1-15`](../../src/proxy-coverage.test.ts#L1-L15) — Pin loop
- [`src/instrumentation.test.ts:1-17`](../../src/instrumentation.test.ts#L1-L17) — Same pin body under another filename
- [`convex/__tests__/export-coverage.test.ts:147-280`](../../convex/__tests__/export-coverage.test.ts#L147-L280) — Missed by the finders: same tautological body; MAP_CONNECTION_SIGNATURE_SCAN_LIMIT, CEILING_SWEEP_BATCH, CEILING_SWEEP_SCAN and MAP_SIGNATURE_PAGE_SIZE are already imported by other convex tests
- [`src/app/api/market-prices/refresh/route.test.ts:70-72, 89`](../../src/app/api/market-prices/refresh/route.test.ts#L70-L72) — importRoute() wrapper; its POST is pinned in handler-coverage. The same pattern appears in admin/wh-statics, admin/esi-jobs/retry, telemetry and cron/refresh-{wh-statics,prices,industry-indices,gsc,sde}
- [`src/app/api/cron/purge-maps/route.test.ts:55, 61`](../../src/app/api/cron/purge-maps/route.test.ts#L55) — Evidence: a direct `const { GET } = await import('./route')` is credited by Fallow, because only maxDuration from this route is pinned (handler-coverage.test.ts:70)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/capability-coverage.test.ts:whole file`](../../src/app/api/capability-coverage.test.ts) — A registry and capability assertion suite, not an export pin
- [`src/app/api/same-origin-coverage.test.ts:whole file`](../../src/app/api/same-origin-coverage.test.ts) — Asserts a route list, not an export pin
- [`src/app/(site)/admin/gsc-coverage-view.test.ts:whole file`](../../src/app/%28site%29/admin/gsc-coverage-view.test.ts) — Name collision only; a behavior test

</details>

**Home.** `No new module. Each pin file shrinks in place. Only if, after step 4, two or more lib-importing files still need the same multi-module mock block, add src/lib/__tests__/next-mocks.ts, next to the existing src/lib/__tests__/module-path.ts.`

**Boundary check.** Nothing new is imported in the default design. For the conditional src/lib/__tests__/next-mocks.ts, which sits in the lib zone and may import only config (next/* and convex/react are npm packages, not zones): app may import lib (rule from:app), api may (from:api), features may (from:features), platform/auth may (from:platform/auth), components may (from:components), components-composition may (from:components-composition), composition may (from:composition) and runtime may (from:runtime). The ui zone has allow: [], so src/components/ui/coverage.test.ts must keep any mock it still needs inline. It most likely needs none, because no ui module imports anything beyond next/link and next/navigation.

**API sketch.**

````ts
Pin body, top-level test per testing-principles:
```ts
import { expect, test } from 'vitest';
import { A } from '...';
test('pins leftover runtime exports on the test graph', () => {
  expect([A, B, C]).not.toContain(undefined);
});
```
Conditional helper:
```ts
// src/lib/__tests__/next-mocks.ts
export function nextNavigationMock(): Record<string, unknown>;
export function nextHeadersMock(): Record<string, unknown>;
export function nextCacheMock(): Record<string, unknown>;
// usage: vi.mock('next/navigation', async () => (await import('@/lib/__tests__/next-mocks')).nextNavigationMock());
```
````

**Migration steps.**

1. Delete the redundant pins (names, files and the covering test are listed in verifiedSites). Delete src/data/market-history/coverage.test.ts outright. Run `pnpm check` through test-runner after each file so that Fallow coverage-gaps confirms each removal. ServiceLevelRows.test.ts vi.mocks '../charts', so confirm the AdminTrendChart removal with Fallow before landing it.
2. As P341 touches the 11 route tests that use `importRoute()`, replace each `const { POST } = await importRoute()` with `const { POST } = await import('./route')` and keep the existing `vi.resetModules()` in beforeEach. Then drop the 9 matching handler-coverage pins: admin/wh-statics POST, admin/esi-jobs/retry POST, telemetry POST, cron refresh-wh-statics/prices/industry-indices/gsc/sde GET, and market-prices/refresh POST. Keep the maxDuration pins unless a test reads them.
3. In every pin file, replace `describe('coverage-gaps', () => { it(... pinned.length > 0 ...; for ... toBeDefined) })` with one top-level `test(...)` that runs `expect([..]).not.toContain(undefined)`. Do not add a pinExports helper.
4. Remove the next/font/google and @vercel/speed-insights/next mocks from the 11 prelude files other than root-coverage. Remove the next/og mock from all of them except root-coverage and page-coverage. Then, one file at a time, delete each remaining mock (next/navigation, next/headers, next/cache, next/dynamic, next/image, convex/react) and run that single file focused. Keep a mock only if the import fails without it. Start with components/ui, features/skill-queue, features/changelog and features/owned-structures, whose pinned modules are mostly pure components.
5. Only if two or more lib-importing files still carry the same multi-module block after step 4, extract src/lib/__tests__/next-mocks.ts and use it through async vi.mock factories. Leave the one-line `vi.mock('next/headers', ...)` calls in route tests alone.
6. Longer term, and outside this change: replace each surviving pin with one behavior test, or delete the export if it is dead.

**Tests.** Fallow coverage-gaps (pnpm check through test-runner) guards every pin removal and must stay green after each file. Each pin file run focused proves its remaining mocks are sufficient. The dedicated tests that now cover the removed pins are tabs.test.ts, IndustryJobsPanel.test.ts, market-history/queries.db.test.ts, StructureComposer*.test.ts, corp-*-sync.test.ts and the others listed in verifiedSites. No new tests.

**Notes.** All 12 prelude copies are identical, so there is no drift to reconcile. The convex/react mock lacks useConvexAuth, which ConvexClientProvider uses, but that only matters at render time and pins never render. data/convex/client.ts constructs a real ConvexReactClient at import only when NEXT_PUBLIC_CONVEX_URL is set, and client.test.ts shows that construction works under Vitest, so platform/auth/coverage probably does not need the convex mock; confirm by running it. Step 2 coordinates with P341, which edits the same route-test files; doing both in one pass avoids touching them twice. The ui-zone file cannot use any lib helper. A strict reading of testing-principles still calls any pin tautological; the single not.toContain(undefined) is the minimum vitest needs to have a test in the file.

<sub>Reported by: concern:feature-skeleton, concern:tests-fixtures.</sub>

<a id="p216"></a>

## P216: Add one strict ConvexError-code assertion and shared map-access seeding helpers to the Convex test setup

- **Status:** [x] done
- **Category:** testing · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -75 lines of copied helpers across 9 files, +45 in the new setup module; about 75 assertion lines rewritten in place
- **Depends on:** —
- **Existing primitive:** `convex/__tests__/mapAuthoring.setup.ts:asUser, expectConvexError`

**Problem.** Error assertions in the Convex suites have drifted into three styles. The first is the substring match rejects.toThrow(code), also used by mapAuthoring.setup's expectConvexError and mapFixtures' copy; it accepts any error whose message contains the text, including a different code that shares a prefix (SELF_LOOP vs SELF_LOOP_CONNECTION). The second is toThrow(ConvexError) or a bare toThrow(), which checks no code at all. The third is a correct instanceof plus data.code check, which exists only privately in mapChain.test.ts and inline in mapAccessProjection.test.ts. Separately, four suites copy the same direct `mapAccess` insert grant, three suites copy a reconcileMapClaims wrapper over a module-level revision counter, seven redeclare `type Chain = TestConvex<typeof schema>`, and two copy a `_scheduled_functions` name filter.

**Verifier revision.** The core holds. Map Convex suites assert ConvexError codes three ways, and the substring form is unsafe today: mapAuthoringFields.test.ts:374 and mapAuthoringHome.test.ts:218-227 assert toThrow('SELF_LOOP'), which would also pass if the earlier validateConnectionInput check threw SELF_LOOP_CONNECTION (convex/lib/mapEntityContracts.ts:284-286). mapTracking.test.ts:229/279/344 check only toThrow(ConvexError), and mapJumpPending.test.ts:280/337 use a bare toThrow(), so any failure passes. The direct mapAccess grant is copied four times, the reconcileMapClaims revision counter three times, and the Chain alias seven times. Revised scope: (1) the module-level nextRevision is a smell, not a bug. Every test builds a fresh convexTest, and the projection only needs increasing revisions, so no test depends on order. (2) Unifying asUser/asEditor is dropped. They are one-line wrappers around t.withIdentity, and they differ on purpose in the identity name ('Editor Pilot' or none), which changes the recorded event actor. (3) A third strict decoder was missed (mapAccessProjection.test.ts:430-449). (4) mapChain's expectErrorCode, the only correct copy, has a flaw: expect.unreachable throws inside the try, and its own catch swallows it. The shared version should use .then(onFulfilled, onRejected).

**Sites (15).**

- [`convex/__tests__/mapAuthoring.setup.ts:21-49`](../../convex/__tests__/mapAuthoring.setup.ts#L21-L49) — exports Chain (21) and asUser with authoring defaults (32-34); private grant (36-45); expectConvexError is a substring match (47-49)
- [`convex/mapChain.test.ts:34-49,77-85`](../../convex/mapChain.test.ts#L34-L49) — Chain, asUser with no name, grant copy; expectErrorCode is the only strict checker, but its expect.unreachable is caught by its own catch
- [`convex/mapFixtures.test.ts:24-39,128-130`](../../convex/mapFixtures.test.ts#L24-L39) — Chain, asEditor, grant copy; second substring expectConvexError, used about 15 times
- [`convex/mapJump.test.ts:29-39`](../../convex/mapJump.test.ts#L29-L39) — Chain plus grant with mapId fixed to MAP
- [`convex/mapTracking.test.ts:26-45,229,279,322-333,344`](../../convex/mapTracking.test.ts#L26-L45) — module-level nextRevision and a 'grant' that actually reconciles via reconcileMapClaims; 229/279/344 check toThrow(ConvexError) with no code; 322/331/333 use substring codes
- [`convex/mapTrackingScoped.test.ts:17-33,176`](../../convex/mapTrackingScoped.test.ts#L17-L33) — Chain, nextRevision, asUser with optional name, reconcile wrapper; inline nextRevision++ at 176
- [`convex/mapAccessProjection.test.ts:25-55,430-449`](../../convex/mapAccessProjection.test.ts#L25-L55) — Chain, nextRevision, reconcile (asserts outcome 'applied') plus reconcileAt with explicit revisions; third inline strict decoder at 430-449
- [`convex/mapAuthoringFields.test.ts:366-374`](../../convex/mapAuthoringFields.test.ts#L366-L374) — toThrow('SELF_LOOP') substring would also accept SELF_LOOP_CONNECTION
- [`convex/mapAuthoringHome.test.ts:218-227`](../../convex/mapAuthoringHome.test.ts#L218-L227) — expectConvexError(..., 'SELF_LOOP') has the same prefix hazard
- [`convex/lib/mapEntityContracts.ts:230-232,284-286`](../../convex/lib/mapEntityContracts.ts#L230-L232) — reject() throws ConvexError({code, detail}); SELF_LOOP_CONNECTION shares a prefix with SELF_LOOP
- [`convex/mapJumpPending.test.ts:16,280,337`](../../convex/mapJumpPending.test.ts#L16) — Chain alias; bare rejects.toThrow() accepts any failure (viewer case likely FORBIDDEN)
- [`convex/mapScan.test.ts:139,148`](../../convex/mapScan.test.ts#L139) — substring codes FORBIDDEN / UNTRACKED_SCAN_SYSTEM
- [`convex/engine.test.ts:21-26`](../../convex/engine.test.ts#L21-L26) — scheduledFunctionsNamed
- [`convex/mapStatics.test.ts:43-48`](../../convex/mapStatics.test.ts#L43-L48) — same _scheduled_functions name filter (fetchSystemStatics)
- [`convex/lib/errorCode.ts:1-10`](../../convex/lib/errorCode.ts#L1-L10) — production code extractor; reuse after the instanceof check

<details><summary>Excluded sites (not the same concept)</summary>

- [`convex/accountMerge.test.ts:115,236,339`](../../convex/accountMerge.test.ts#L115) — asserts message text of string-data ConvexErrors (convex/accountMerge.ts:86,109,160), which have no code; keep the message assertions
- [`convex/mapAccessProjection.test.ts:349-356`](../../convex/mapAccessProjection.test.ts#L349-L356) — bare toThrow() on an argument-validator failure (payload cast `as never`); not a ConvexError, so it stays
- [`convex/mapTrackingScoped.test.ts:174-178`](../../convex/mapTrackingScoped.test.ts#L174-L178) — validator failure with `as never`; stays a bare toThrow()
- [`convex/mapScan.test.ts:29-31`](../../convex/mapScan.test.ts#L29-L31) — asEditor one-liner around t.withIdentity; nothing to save, and the identity name matters for event actors
- [`convex/mapScanIdentify.test.ts:43-45`](../../convex/mapScanIdentify.test.ts#L43-L45) — same one-liner; leave inline
- [`convex/engine-identity.test.ts:32`](../../convex/engine-identity.test.ts#L32) — collects every scheduled job with no name filter; a different use

</details>

**Home.** `convex/__tests__/convexTest.setup.ts (new; the double-dot name keeps it out of the Convex deploy and the vitest test glob, like modules.setup.ts). mapAuthoring.setup.ts keeps its authoring constants, seeds and asUser defaults, and imports grantMapAccess/Chain from it.`

**Boundary check.** The home and every consumer (convex/*.test.ts, convex/lib/*.test.ts, convex/__tests__/mapAuthoring.setup.ts) are in zone `convex` (pattern convex/**), so all imports are intra-zone. The helper imports only convex/values and convex-test (npm; convex-test is in ignoreDependencies), vitest, ../_generated, ../schema and ../lib/errorCode, all in zone convex. No cross-zone import, so no rule is needed. Note: duplicates.ignore covers *.test.ts but not *.setup.ts, so the setup file is still clone-checked, and unused-exports applies to each export.

**API sketch.**

```ts
export type Chain = TestConvex<typeof schema>;
export function grantMapAccess(t: Chain, mapId: string, userId: string, roles: MapRole[]): Promise<void>;
export function claimReconciler(t: Chain): (mapId: string, claims: FunctionArgs<typeof internal.mapAccessProjection.reconcileMapClaims>['claims']) => Promise<FunctionReturnType<typeof internal.mapAccessProjection.reconcileMapClaims>>; // revision counter lives in the closure
export async function expectConvexErrorCode(call: Promise<unknown>, code: string): Promise<ConvexError<{ code: string; detail?: string }>>; // call.then(() => expect.unreachable(...), (e) => e); expect(e).toBeInstanceOf(ConvexError); expect(errorCode(e)).toBe(code); return e
export function scheduledFunctionsNamed(t: Chain, nameFragment: string): Promise<Doc<'_scheduled_functions'>[]>;
```

**Migration steps.**

1. Create convex/__tests__/convexTest.setup.ts with Chain, grantMapAccess, claimReconciler, expectConvexErrorCode and scheduledFunctionsNamed. Build expectConvexErrorCode on .then(onFulfilled, onRejected), not try/catch, so the unreachable assertion is never swallowed.
2. In mapAuthoring.setup.ts, delete the private grant (36-45) and expectConvexErrorCode's substring predecessor (47-49); import grantMapAccess and Chain from the new module, with no re-export. Point the five importers of `type Chain` (mapStatics, mapAuthoringFields, mapAuthoringHome, mapAuthoringSweep, lib/mapStaticClaim tests) at the new module.
3. Replace every expectConvexError call (mapAuthoringCollapse/Fields/Home/Tombstone, mapFixtures) with expectConvexErrorCode. Delete mapFixtures' local copy (128-130) and mapChain's expectErrorCode (77-85).
4. Convert substring code assertions to expectConvexErrorCode in mapScan, mapScanIdentify, mapJump, mapJumpPending, mapTracking, mapTrackingScoped, mapAuthoringFields and mapFixtures (the toThrow('CODE') and toThrow(/CODE/) forms). Pin real codes where mapTracking.test.ts:229/279/344 use toThrow(ConvexError) and mapJumpPending.test.ts:280/337 use bare toThrow(). Run each case to read the actual code, and if a test only passed by substring, fix the test's expectation.
5. Replace the local grant copies in mapChain (40-49), mapFixtures (30-39) and mapJump (31-39) with grantMapAccess; mapJump passes MAP explicitly.
6. Replace nextRevision plus wrapper in mapTracking (27,33-45), mapTrackingScoped (23,29-33) and mapAccessProjection (26,32-43) with `const reconcile = claimReconciler(t)` per test. mapAccessProjection keeps reconcileAt for its explicit-revision stale/duplicate tests and its 'applied' assertion on top of the shared reconciler. mapTrackingScoped:176 uses a literal revision because it tests a validator failure.
7. Replace engine.test.ts:21-26 and mapStatics.test.ts:43-48 with scheduledFunctionsNamed.
8. Delete the local `type Chain` aliases (mapChain 34, mapFixtures 24, mapJump 29, mapJumpPending 16, mapTracking 26, mapTrackingScoped 17, mapAccessProjection 25).

**Tests.** This is test-only. The guard is the converted suites themselves passing under the stricter check. Optionally add convex/__tests__/convexTest.setup.test.ts (edge-runtime) proving that expectConvexErrorCode rejects a different code with a shared prefix (SELF_LOOP vs SELF_LOOP_CONNECTION), a plain Error with matching text, and a resolved call. Run the full convex vitest project through test-runner afterwards.

**Notes.** Keep asUser behavior per suite. mapAuthoring.setup's asUser sends name 'Editor Pilot' by default, mapChain's sends no name, and mapTrackingScoped passes one only when given. eventActor output depends on the name, so do not fold these into one default. mapTracking's 'grant' goes through reconcileMapClaims (the projection, which validates characters and bumps revisions), not a direct insert, so it must become claimReconciler, not grantMapAccess. mapAccessProjection.test.ts:448 asserts data toEqual {code:'FORBIDDEN'} with no detail; keep that by asserting on the error the helper returns. ConvexError messages contain the JSON-stringified data, which is the only reason the substring style ever worked.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p341"></a>

## P341: Add src/lib/__tests__/route-requests.ts (postJson, postForm, postEmpty, cronRequest) and migrate the route tests' local builders

- **Status:** [x] done
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** About -320 lines (~46 builders of 5-9 lines each, 4 locationOf, 11 importRoute wrappers) / +45
- **Depends on:** —

**Problem.** About 46 route tests each define a local buildRequest, makeRequest, request, post, jsonRequest or authedRequest that builds a request to one fixed path. The variants differ only in incidental ways: an optional Origin, an optional Authorization or x-forwarded-for header, header-name casing, string-body passthrough versus always running JSON.stringify, and NextRequest versus Request. preferences/route.test.ts casts a plain Request to NextRequest. Each of the 8 cron suites pairs its own 'test-secret' or 'cron-secret' literal with vi.stubEnv. Fallow's clone gate ignores *.test.ts, so these copies multiply unchecked.

**Verifier revision.** Confirmed and larger than cited. I counted about 46 local request builders across src/app/api and composition: 8 identical form builders plus problem-matrix's formRequest; about 27 JSON POST builders (six maps/sync-leave copies are byte-identical apart from the path); 8 cron authedRequest builders; and 2 bodyless POST builders. No test-helper module covers them, and problem-matrix's jsonRequest/formRequest cannot be shared because they live in a test file. Revisions: drop redirectLocation, since locationOf is a one-line `res.headers.get('location') ?? ''` and inlining it is as clear. Drop stubCronSecret, since it would wrap a single vi.stubEnv call; export the shared secret constant instead. The importRoute inlining is unrelated to request building, but it unlocks P340's handler-pin deletions, so do it in the same pass over those files. Keep the explicit path argument, because 'http://localhost:3000' matters: esi-jobs/retry and active-character assert absolute redirect URLs derived from req.url.

**Sites (44).**

- [`src/app/api/problem-matrix.test.ts:138-155`](../../src/app/api/problem-matrix.test.ts#L138-L155) — jsonRequest(path, body, authorization) and formRequest(path, fields): the general shape to promote
- [`src/app/api/admin/characters/reassign/route.test.ts:42-52`](../../src/app/api/admin/characters/reassign/route.test.ts#L42-L52) — Form builder plus locationOf
- [`src/app/api/admin/characters/unlink/route.test.ts:37-47`](../../src/app/api/admin/characters/unlink/route.test.ts#L37-L47) — Identical form builder plus locationOf
- [`src/app/api/admin/sessions/revoke/route.test.ts:32-42`](../../src/app/api/admin/sessions/revoke/route.test.ts#L32-L42) — Identical form builder plus locationOf
- [`src/app/api/admin/wh-statics/route.test.ts:60-70`](../../src/app/api/admin/wh-statics/route.test.ts#L60-L70) — Form builder plus importRoute
- [`src/app/api/admin/role/route.test.ts:43-54`](../../src/app/api/admin/role/route.test.ts#L43-L54) — importRoute plus form builder
- [`src/app/api/admin/esi-jobs/retry/route.test.ts:36-46`](../../src/app/api/admin/esi-jobs/retry/route.test.ts#L36-L46) — Form builder plus importRoute; asserts absolute redirect 'http://localhost:3000/admin/queue' (lines 123, 138)
- [`src/app/api/account/active-character/route.test.ts:36-42`](../../src/app/api/account/active-character/route.test.ts#L36-L42) — Form builder
- [`src/app/api/account/characters/unlink/route.test.ts:73-85`](../../src/app/api/account/characters/unlink/route.test.ts#L73-L85) — Form builder plus locationOf
- [`src/app/api/account/saved-plans/route.test.ts:51-60`](../../src/app/api/account/saved-plans/route.test.ts#L51-L60) — JSON with optional Origin and string passthrough
- [`src/app/api/preferences/route.test.ts:28-40`](../../src/app/api/preferences/route.test.ts#L28-L40) — Drift: plain Request cast `as unknown as NextRequest`; the route types its parameter as NextRequest
- [`src/app/api/account/industry-profiles/route.test.ts:39-45`](../../src/app/api/account/industry-profiles/route.test.ts#L39-L45) — JSON with fixed Origin and a path suffix
- [`src/app/api/feedback/route.test.ts:45-65`](../../src/app/api/feedback/route.test.ts#L45-L65) — Two builders (stringified JSON with optional origin, plus a raw-string builder) collapse into postJson's string passthrough
- [`src/app/api/market-prices/refresh/route.test.ts:22-31`](../../src/app/api/market-prices/refresh/route.test.ts#L22-L31) — JSON plus x-forwarded-for; importRoute at 70-72
- [`src/app/api/account/custom-structures/route.test.ts:49-55`](../../src/app/api/account/custom-structures/route.test.ts#L49-L55) — JSON with string passthrough
- [`src/app/api/account/custom-structures/update/route.test.ts:35-41`](../../src/app/api/account/custom-structures/update/route.test.ts#L35-L41) — JSON, always stringified
- [`src/app/api/account/custom-structures/search/route.test.ts:21-27`](../../src/app/api/account/custom-structures/search/route.test.ts#L21-L27) — JSON, always stringified
- [`src/app/api/account/custom-structures/parse-fit/route.test.ts:19-27`](../../src/app/api/account/custom-structures/parse-fit/route.test.ts#L19-L27) — JSON, always stringified
- [`src/app/api/account/corp-structures/rigs/route.test.ts:48-54`](../../src/app/api/account/corp-structures/rigs/route.test.ts#L48-L54) — JSON with string passthrough
- [`src/app/api/account/corp-sharing/route.test.ts:40-46`](../../src/app/api/account/corp-sharing/route.test.ts#L40-L46) — JSON, always stringified
- [`src/app/api/account/purge-character/route.test.ts:39-45`](../../src/app/api/account/purge-character/route.test.ts#L39-L45) — JSON, always stringified
- [`src/app/api/telemetry/route.test.ts:27-33`](../../src/app/api/telemetry/route.test.ts#L27-L33) — JSON, always stringified; uses importRoute
- [`src/app/api/industry/skill-levels/route.test.ts:25-31`](../../src/app/api/industry/skill-levels/route.test.ts#L25-L31) — Raw-string JSON body
- [`src/app/api/industry/cost-indices/route.test.ts:15-21`](../../src/app/api/industry/cost-indices/route.test.ts#L15-L21) — Raw-string JSON body
- [`src/app/api/market-history/refresh/route.test.ts:20-26`](../../src/app/api/market-history/refresh/route.test.ts#L20-L26) — JSON wrapping { typeIds }
- [`src/app/api/maps/create/route.test.ts:29-35`](../../src/app/api/maps/create/route.test.ts#L29-L35) — Plain-Request JSON builder
- [`src/app/api/maps/jump/route.test.ts:22-28`](../../src/app/api/maps/jump/route.test.ts#L22-L28) — Byte-identical apart from the path
- [`src/app/api/maps/access/route.test.ts:27-33`](../../src/app/api/maps/access/route.test.ts#L27-L33) — Byte-identical apart from the path
- [`src/app/api/maps/lifecycle-routes.test.ts:29-35`](../../src/app/api/maps/lifecycle-routes.test.ts#L29-L35) — Takes a path suffix
- [`src/app/api/maps/search-characters/route.test.ts:51-57`](../../src/app/api/maps/search-characters/route.test.ts#L51-L57) — Byte-identical apart from the path
- [`src/app/api/maps/signature-elimination/route.test.ts:23-29`](../../src/app/api/maps/signature-elimination/route.test.ts#L23-L29) — Byte-identical apart from the path
- [`src/app/api/sync-leave/route.test.ts:33-39`](../../src/app/api/sync-leave/route.test.ts#L33-L39) — Byte-identical apart from the path
- [`src/app/api/internal/eve-token/route.test.ts:22-31`](../../src/app/api/internal/eve-token/route.test.ts#L22-L31) — JSON plus optional Authorization; base http://localhost
- [`src/app/api/internal/eve-characters/route.test.ts:26-35`](../../src/app/api/internal/eve-characters/route.test.ts#L26-L35) — Same as eve-token
- [`src/app/api/account/sessions/revoke/route.test.ts:35-37`](../../src/app/api/account/sessions/revoke/route.test.ts#L35-L37) — Bodyless POST
- [`src/app/api/account/delete/route.test.ts:34-36`](../../src/app/api/account/delete/route.test.ts#L34-L36) — Bodyless POST
- [`src/app/api/cron/refresh-prices/route.test.ts:40-44, 66`](../../src/app/api/cron/refresh-prices/route.test.ts#L40-L44) — authedRequest(secret = 'test-secret') paired with stubEnv
- [`src/app/api/cron/daily-batch/route.test.ts:45-49, 54`](../../src/app/api/cron/daily-batch/route.test.ts#L45-L49) — 'cron-secret' pairing
- [`src/app/api/cron/purge-maps/route.test.ts:23-27, 31`](../../src/app/api/cron/purge-maps/route.test.ts#L23-L27) — 'cron-secret' pairing
- [`src/app/api/cron/refresh-wh-statics/route.test.ts:62-67, 89`](../../src/app/api/cron/refresh-wh-statics/route.test.ts#L62-L67) — 'test-secret'; importRoute
- [`src/app/api/cron/refresh-industry-indices/route.test.ts:38-42, 58`](../../src/app/api/cron/refresh-industry-indices/route.test.ts#L38-L42) — 'test-secret'; importRoute
- [`src/app/api/cron/refresh-sde/route.test.ts:52-56, 81`](../../src/app/api/cron/refresh-sde/route.test.ts#L52-L56) — 'test-secret'; importRoute
- [`src/app/api/cron/drain-esi-refresh-jobs/route.test.ts:44-51, 58`](../../src/app/api/cron/drain-esi-refresh-jobs/route.test.ts#L44-L51) — 'test-secret'
- [`src/composition/pipelines/cron-gate.test.ts:34-38, 45`](../../src/composition/pipelines/cron-gate.test.ts#L34-L38) — Same cron request, outside the api zone (base http://localhost)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/dev/synthetic-pilot/route.test.ts:25-29`](../../src/app/api/dev/synthetic-pilot/route.test.ts#L25-L29) — Tests Host and Origin header handling against https URLs; a builder that controls the host header is a different concept
- [`src/app/api/rate-limit-preflight.test.ts:14-16`](../../src/app/api/rate-limit-preflight.test.ts#L14-L16) — Generic pipeline test against https://lgi.tools/api/example; one bodyless line, no gain
- [`src/app/api/mutation-route.test.ts:19-21`](../../src/app/api/mutation-route.test.ts#L19-L21) — Same as rate-limit-preflight
- [`src/app/api/admin/characters/reassign/route.test.ts:50-52`](../../src/app/api/admin/characters/reassign/route.test.ts#L50-L52) — locationOf: a one-line header read; no redirectLocation helper

</details>

**Home.** `src/lib/__tests__/route-requests.ts (new; next to the existing src/lib/__tests__/module-path.ts test helper)`

**Boundary check.** The home is in the lib zone (src/lib/**), which may import only config. next/server is an npm package, not a zone, and src/lib/service-auth.ts already imports it. Consumers: src/app/api/**/*.test.ts is the api zone, whose allow list includes lib. src/composition/pipelines/cron-gate.test.ts is the composition zone, whose allow list includes lib. An api-zone home (src/app/api/__tests__) would exclude composition, which may not import api.

**API sketch.**

```ts
import { NextRequest } from 'next/server';
export const TEST_CRON_SECRET = 'test-secret';
interface PostOptions { origin?: string; authorization?: string; headers?: Record<string, string> }
/** POST http://localhost:3000{path}; a string body is sent verbatim, anything else is JSON.stringify'd. No Origin unless given. */
export function postJson(path: string, body: unknown, options?: PostOptions): NextRequest;
export function postForm(path: string, fields: Record<string, string>, options?: PostOptions): NextRequest;
export function postEmpty(path: string, options?: PostOptions): NextRequest;
/** GET with `authorization: Bearer ${secret}`; pair with vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET). */
export function cronRequest(path: string, secret?: string): Request;
```

**Migration steps.**

1. Create src/lib/__tests__/route-requests.ts using problem-matrix's jsonRequest/formRequest as the reference implementation, with base 'http://localhost:3000'.
2. Migrate problem-matrix.test.ts first (18 call sites), then delete its local jsonRequest and formRequest.
3. Migrate the 9 form-builder files (admin reassign/unlink/sessions-revoke/wh-statics/role/esi-jobs-retry, account active-character and characters/unlink) to postForm(path, fields). Keep the locationOf helpers or inline res.headers.get('location').
4. Migrate the JSON builders to postJson. Pass { origin } only where the old builder set Origin (saved-plans, preferences and feedback optionally; industry-profiles always), { authorization } for internal/eve-token and eve-characters, and { headers: { 'x-forwarded-for': ip } } for market-prices/refresh. This also removes the preferences `as unknown as NextRequest` cast.
5. Migrate account/sessions/revoke and account/delete to postEmpty.
6. Migrate the 8 cron suites and cron-gate.test.ts to cronRequest(path) with vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET). For daily-batch and purge-maps, switch both the stubEnv value and the request secret together (from 'cron-secret'). refresh-prices keeps its wrong-secret case as cronRequest(path, 'wrong').
7. In the same pass, replace each `await importRoute()` with a direct `const { POST } = await import('./route')` and delete the wrapper (11 files); keep vi.resetModules. This is what lets P340 delete 9 handler-coverage pins.
8. Delete every local builder. Grep src/app/api and composition for `new NextRequest('http://localhost` and `function (buildRequest|makeRequest|request|authedRequest)` to confirm none remain outside the excluded sites.

**Tests.** The helper is test infrastructure, guarded by the ~46 route suites that use it. problem-matrix.test.ts exercises jsonRequest-with-authorization and formRequest across 18 routes. Tests that assert a missing Origin (saved-plans, preferences, feedback) must keep passing no origin. Run each migrated route test focused, then pnpm check through test-runner.

**Notes.** Behavior to preserve: (a) string passthrough. Builders in corp-sharing, purge-character, telemetry, custom-structures/update, search and parse-fit, and maps/lifecycle-routes always JSON.stringify. Grep showed no string body passed to them today, but check each call site, because postJson would send a string verbatim instead of quoted. (b) The base URL must stay http://localhost:3000, because esi-jobs/retry (123, 138) and active-character (70) assert absolute redirects derived from req.url. internal/* and cron-gate used http://localhost and assert nothing host-derived, so they are safe to move. (c) Return NextRequest for POST builders, which is a Request subclass, so handlers typed Request still accept it; cronRequest returns Request. (d) Form body: some copies pass URLSearchParams and others call .toString(). With an explicit content-type header both send identical bytes. The only drift found is the preferences cast. The 'test-secret' versus 'cron-secret' split is cosmetic, since each suite pairs its own value consistently.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p344"></a>

## P344: Add typed BetterAuthSession fixtures and type the getSession mocks in route and session tests

- **Status:** [ ] not started
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** medium · **Size:** About -110 lines of literals across 17 files, +40 for the fixture and its test, +17 import lines: net about -55
- **Depends on:** —
- **Existing primitive:** `src/composition/route-guards.ts:BetterAuthSession`

**Problem.** Seventeen test files hand-write the enriched Better Auth session that `auth.api.getSession` (or `requireAdminPage`/`checkAdmin`) returns. The shape comes from deriveSessionIdentity: user, session, characterId, name, portraitUrl, role, isAdmin. Five account tests repeat the same 9-field USER literal. Admin tests use three different shapes: no session/name/portraitUrl/role (reassign, unlink, sessions/revoke), `session: {}` without name or role (esi-jobs/retry, wh-statics), and the full shape (role, problem-matrix). Several other tests pass `{ user: { id } }` only. No literal is typed against BetterAuthSession, and every getSessionMock is an untyped vi.fn(). As a result, a change to the session shape, such as a renamed field or a new required field the route reads, cannot fail type-checking in any of these tests.

**Verifier revision.** The core finding holds. Every session literal handed to a mocked auth.api.getSession is untyped. getSessionMock is a bare vi.fn(), so `{ user: { id } }` compiles anyway. The literals drift: there are 5 identical USER copies, partial admin shapes in 6 files, and full admin shapes in 3. I found 7 more sites than the finders cited (admin/esi-jobs/retry, admin/wh-statics, admin/role, composition/session.test, composition/route-guards.test, industry-characters.test, CustomStructuresContent.test and admin-console.test). The scope changes in three ways. (1) Drop authModule(getSession). vitest 4.1.11 hoists vi.mock above imports and rewrites static imports into ordered `await import()` calls (see @vitest/mocker chunk-hoistMocks.js 385-425 and 625-640). The factory runs when the module under test is imported, and at that point a body-level `const getSessionMock` is still in the temporal dead zone. A shared factory would therefore only work with vi.hoisted mocks plus a strict import order, or with an async dynamic import inside the factory. Both cost more than the 3-line literal they replace. characters/unlink also needs unlinkAccount, and synthetic-pilot-store mocks $context. (2) Drop the next/headers helper: the factory is a single line and has the same hoisting problem. (3) The fixtures help only if the mocks are typed too, so type getSessionMock as `vi.fn<() => Promise<BetterAuthSession | null>>()`. With that, a partial literal stops compiling. The admin drift does not change behavior today: the routes read only session.user.id and session.characterId (reassign route.ts 20-21,66; unlink 56-58; sessions/revoke 24,44-46; esi-jobs/retry 35).

**Sites (19).**

- [`src/composition/route-guards.ts:12`](../../src/composition/route-guards.ts#L12) — Existing canonical type: BetterAuthSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>
- [`src/platform/auth/session-identity.ts:4-25`](../../src/platform/auth/session-identity.ts#L4-L25) — Defines the enriched shape: user, session, characterId (number\|null), name, portraitUrl, role, isAdmin
- [`src/app/api/account/active-character/route.test.ts:4-12, 14, 19-21, 32`](../../src/app/api/account/active-character/route.test.ts#L4-L12) — Full USER SESSION (eve-user-1, 100, Alice); untyped getSessionMock; auth mock; next/headers one-liner
- [`src/app/api/account/characters/unlink/route.test.ts:4-12, 31-38, 69`](../../src/app/api/account/characters/unlink/route.test.ts#L4-L12) — Identical SESSION; its auth mock also carries unlinkAccount, so a shared auth factory does not fit
- [`src/app/api/account/sessions/revoke/route.test.ts:5-13, 19-21, 31`](../../src/app/api/account/sessions/revoke/route.test.ts#L5-L13) — Identical SESSION
- [`src/app/api/account/delete/route.test.ts:4-12, 18-20, 30`](../../src/app/api/account/delete/route.test.ts#L4-L12) — Identical SESSION
- [`src/app/api/account/purge-character/route.test.ts:4-12, 19-21, 35`](../../src/app/api/account/purge-character/route.test.ts#L4-L12) — Identical SESSION
- [`src/app/api/admin/characters/reassign/route.test.ts:4-8, 17-19, 38`](../../src/app/api/admin/characters/reassign/route.test.ts#L4-L8) — Partial ADMIN_SESSION { user: { id: 'admin-1' }, characterId: 1, isAdmin: true }
- [`src/app/api/admin/characters/unlink/route.test.ts:4-8, 16-18, 33`](../../src/app/api/admin/characters/unlink/route.test.ts#L4-L8) — Same partial ADMIN_SESSION
- [`src/app/api/admin/sessions/revoke/route.test.ts:4-8, 15-17, 28`](../../src/app/api/admin/sessions/revoke/route.test.ts#L4-L8) — Same partial ADMIN_SESSION
- [`src/app/api/admin/esi-jobs/retry/route.test.ts:6-11, 18-20`](../../src/app/api/admin/esi-jobs/retry/route.test.ts#L6-L11) — Missed by the finders: a third admin variant with session: {} and no name or role (user-admin, 90_000_001)
- [`src/app/api/admin/wh-statics/route.test.ts:6-11, 35-37`](../../src/app/api/admin/wh-statics/route.test.ts#L6-L11) — Missed by the finders: same third variant
- [`src/app/api/admin/role/route.test.ts:5-13, 28-30`](../../src/app/api/admin/role/route.test.ts#L5-L13) — Missed by the finders: full ADMIN_VIEWER shape with role ADMIN
- [`src/app/api/problem-matrix.test.ts:110-118`](../../src/app/api/problem-matrix.test.ts#L110-L118) — Full ADMIN_SESSION, used through the mocked checkAdmin from route-guards rather than composition/auth
- [`src/composition/session.test.ts:17-25`](../../src/composition/session.test.ts#L17-L25) — Missed by the finders: full ENRICHED admin session; test also overrides characterId: null
- [`src/composition/route-guards.test.ts:32-33`](../../src/composition/route-guards.test.ts#L32-L33) — Missed by the finders: partial MEMBER/ADMIN literals with no session, name or role
- [`src/app/(site)/industry/industry-characters.test.ts:62, 87, 94`](../../src/app/%28site%29/industry/industry-characters.test.ts#L62) — Missed by the finders: inline `{ user: { id: 'eve-user-1' } }`
- [`src/app/(site)/industry/CustomStructuresContent.test.ts:4-8, 27, 34`](../../src/app/%28site%29/industry/CustomStructuresContent.test.ts#L4-L8) — Missed by the finders: inline partial sessions, including characterId: null, through a vi.hoisted mock
- [`src/app/(site)/admin/admin-console.test.ts:94`](../../src/app/%28site%29/admin/admin-console.test.ts#L94) — Missed by the finders: requireAdminPage resolves `{ user: { id: 'admin-1' }, isAdmin: true }`

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/is-admin.test.ts:3-30`](../../src/composition/is-admin.test.ts#L3-L30) — Uses the projected client Session type from platform/auth/types (characterId, name, portraitUrl, role), not BetterAuthSession
- [`src/components/composition/SignedInFold.test.ts:16-36`](../../src/components/composition/SignedInFold.test.ts#L16-L36) — useAuth client-store shape, not the server session
- [`src/app/api/auth/[...all]/route.test.ts:93-105`](../../src/app/api/auth/[...all]/route.test.ts#L93-L105) — The `{ user: { id } }` value is also an HTTP JSON body for Response.json, and the route reads only user.id. A typed fixture with Date fields would change the body round-trip, so keep it inline
- [`src/composition/synthetic-pilot-store.test.ts:29-40`](../../src/composition/synthetic-pilot-store.test.ts#L29-L40) — Mocks auth.$context.internalAdapter, not getSession
- `src/app/(site)/page-coverage.test.ts and 10 other */coverage.test.ts files:16-24` — Multi-line next/headers mocks that include cookies() belong to the coverage-prelude work, not this one

</details>

**Home.** `src/composition/__tests__/session-fixture.ts (new, next to the existing composition test registries)`

**Boundary check.** The home is in zone composition (src/composition/**). Each consumer zone may import it: api (src/app/api/** tests) has rule `api` allow [..., 'composition', ...]; app (src/app/(site)/** tests) has rule `app` allow [..., 'composition', ...]; src/composition/*.test.ts is the same zone. The fixture uses only `import type { BetterAuthSession } from '@/composition/route-guards'` (same zone, erased at runtime, so it never loads next/headers or server-only).

**API sketch.**

```ts
import type { BetterAuthSession } from '@/composition/route-guards';
type SessionFixtureOverrides = Partial<Omit<BetterAuthSession, 'user' | 'session'>> & { user?: Partial<BetterAuthSession['user']> };
export function sessionFixture(overrides?: SessionFixtureOverrides): BetterAuthSession; // USER defaults: user.id 'eve-user-1', characterId 100, name 'Alice', portraitUrl 'a', role 'USER', isAdmin false
export function adminSessionFixture(overrides?: SessionFixtureOverrides): BetterAuthSession; // same, with role 'ADMIN', isAdmin true
// user carries the full better-auth record (id, name, email, emailVerified, image, createdAt, updatedAt, role, activeCharacterId);
// session carries (id, token, userId = user.id, expiresAt, createdAt, updatedAt) with fixed dates.
// Consumers type their mock: const getSessionMock = vi.fn<() => Promise<BetterAuthSession | null>>();
```

**Migration steps.**

1. Ask docs-researcher (Vitest) to confirm the vi.fn generic typing for mocks and vi.hoisted mocks before writing test code, as AGENTS.md requires.
2. Create src/composition/__tests__/session-fixture.ts with sessionFixture and adminSessionFixture. Return type is BetterAuthSession; tsc will list any missing better-auth user or session fields. Deep-merge `user` overrides and keep session.userId equal to user.id.
3. Add src/composition/__tests__/session-fixture.test.ts with two checks: the admin fixture has role ADMIN and isAdmin true, and a user.id override also moves session.userId.
4. Migrate the 5 account route tests: replace each SESSION literal with sessionFixture(), whose defaults match these literals, and type getSessionMock. Keep the inline vi.mock('@/composition/auth') factories and the next/headers one-liners.
5. Migrate the 6 admin route tests (reassign, unlink, sessions/revoke, esi-jobs/retry, wh-statics, role) to adminSessionFixture. Pass the ids each file asserts on, e.g. { user: { id: 'admin-1' }, characterId: 1 }, { user: { id: 'user-admin' }, characterId: 90_000_001 }, and the role test's 'eve-user-1000000000' / 1000000000 with its name and portraitUrl. Keep the `{ ...ADMIN, isAdmin: false }` negative cases.
6. Migrate composition/session.test.ts ENRICHED, composition/route-guards.test.ts MEMBER/ADMIN, problem-matrix ADMIN_SESSION, industry-characters.test.ts (3 inline), CustomStructuresContent.test.ts (lines 27 and 34; keep `characterId: null` as an override and keep the null case) and admin-console.test.ts line 94. Type the corresponding hoisted mocks.
7. Delete the now-unused local literals and run `pnpm check` through test-runner.

**Tests.** New: src/composition/__tests__/session-fixture.test.ts covering admin defaults and user-id/session.userId coherence. Existing tests that guard behavior must stay green unchanged in their assertions: the 5 account route tests, the 6 admin route tests, problem-matrix.test.ts, composition/session.test.ts (projection and the null-characterId path), composition/route-guards.test.ts, industry-characters.test.ts and CustomStructuresContent.test.ts. The typed mocks are the actual regression guard: a future session-shape change fails tsc in `pnpm check`.

**Notes.** Preserve per-file ids: tests assert actorUserId 'admin-1', revokeUserSessions('eve-user-1'), owner { userId: 'account-a', characterId: 101 } and similar, so pass overrides instead of relying on defaults where they differ. The partial admin fixtures are not a behavior bug: today's routes read only user.id and characterId, so full fixtures should not change any outcome. If a test starts failing after migration, the route reads a field that the partial fixture had left undefined, and the full fixture is the correct one. Do not build an authModule() vi.mock factory or a next/headers helper; the hoisting reasons are in `reason`. problem-matrix mocks route-guards (checkAdmin), not composition/auth, so only its literal changes.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p346"></a>

## P346: Add a prefix-scoped console silencer in lib test support and migrate the unasserted blanket spies

- **Status:** [ ] not started
- **Category:** testing · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** medium · **Size:** +25 helper, +35 helper test; per-file migration is roughly neutral (one line swapped, with an assertion sometimes added): net about +60 to +100
- **Depends on:** —

**Problem.** The repo's testing principle says to silence only the expected log tags. In practice every one of the 106 console spies across 62 test files swallows all output on its level. In 26 files the spy is never asserted, so a new unexpected console.error during these tests is invisible and cannot fail review. One spy (data/maps/purge.db.test.ts:216) is never restored and mutes the rest of its file. Production logs already lead with a stable first-argument prefix: 61 of 95 non-script calls are inline `[tag]`, and the rest are mostly JSON `{"scope":...}` or fixed prose. Cron-gate.test.ts:320 already shows the assert-by-parsing pattern for JSON logs.

**Verifier revision.** Confirmed and larger than reported. docs/principles/testing-principles.md 112-116 requires silencing only expected tags. All 106 console spies in 62 test files use the blanket `.mockImplementation(() => {})` or `=> undefined` form; there is no other form and no helper. My scan found 26 files whose spies are never asserted (the finders said 17), plus 3 files with some unasserted spies. data/maps/purge.db.test.ts:216 never restores its spy (no restoreAllMocks or mockRestore in the file), so console.error stays muted for the rest of that file. Three design corrections. First, the cron route tests (daily-batch, purge-maps, refresh-*) silence the structured cron-gate log `console.log(JSON.stringify({ scope, ... }))` (cron-gate.ts:105), and some data logs are untagged prose (industry-rules.ts:245 'Industry rules parse:', universe.ts:375). The matcher therefore has to be a string prefix or RegExp, not an assumed `[tag]`. Second, character-authorization.test.ts:116 is inside a test, not at module level. Third, the helper must refuse to wrap an already-mocked console method, or it recurses into itself.

**Sites (14).**

- [`docs/principles/testing-principles.md:112-116`](../../docs/principles/testing-principles.md#L112-L116) — The principle: assert tagged logs that are part of the contract, silence only expected tags, and do not blanket-mock
- [`src/composition/pipelines/housekeeping.test.ts:136-139, 143-157, 166-179`](../../src/composition/pipelines/housekeeping.test.ts#L136-L139) — Three blanket error spies, never asserted; production tag `[housekeeping] ...` at housekeeping.ts 126, 138
- [`src/lib/service-auth.test.ts:37`](../../src/lib/service-auth.test.ts#L37) — Blanket error spy, never asserted; production tag `[service-auth]` at service-auth.ts 23
- [`convex/characterLocationAccess.test.ts:120`](../../convex/characterLocationAccess.test.ts#L120) — Blanket error spy, never asserted
- [`src/app/api/cron/daily-batch/route.test.ts:58, 83`](../../src/app/api/cron/daily-batch/route.test.ts#L58) — Blanket log spy in beforeEach and blanket error spy, never asserted
- [`src/app/api/cron/purge-maps/route.test.ts:45`](../../src/app/api/cron/purge-maps/route.test.ts#L45) — Blanket console.log silencer for the JSON cron-gate log, never asserted
- [`src/composition/pipelines/cron-gate.ts:105`](../../src/composition/pipelines/cron-gate.ts#L105) — Structured log `console.log(JSON.stringify({ scope: declaration.name, ...metadata }))`: the first argument starts with `{"scope":`, not `[tag]`
- [`src/composition/pipelines/cron-gate.test.ts:320`](../../src/composition/pipelines/cron-gate.test.ts#L320) — Existing precedent for asserting the JSON log by parsing mock.calls
- [`src/data/maps/purge.db.test.ts:216`](../../src/data/maps/purge.db.test.ts#L216) — Blanket error spy, never asserted and never restored, so it leaks to later tests in the 300-line file
- [`src/composition/character-authorization.test.ts:110-116`](../../src/composition/character-authorization.test.ts#L110-L116) — Blanket spy inside a test (not module-level); production tags `[character-authorization]` at character-authorization.ts 47, 58
- [`src/data/eve-data/industry-rules.test.ts:171`](../../src/data/eve-data/industry-rules.test.ts#L171) — Silences the untagged prose log 'Industry rules parse:' (industry-rules.ts 245-249)
- [`convex/engine.test.ts:161, 969, 1029, 1075`](../../convex/engine.test.ts#L161) — Unasserted spies in a file that asserts another spy (1000)
- [`convex/mapAuthoringSweep.test.ts:508`](../../convex/mapAuthoringSweep.test.ts#L508) — Unasserted spy beside an asserted one (394)
- [`src/composition/account-lifecycle/owner-transfer.test.ts:269`](../../src/composition/account-lifecycle/owner-transfer.test.ts#L269) — Unasserted warn spy beside asserted ones (249, 250, 290)

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/platform/search/search.test.ts:whole file (one console spy)`](../../src/platform/search/search.test.ts) — Zone platform/search has an empty allow list and cannot import lib, so it keeps an inline spy. Its production logs are untagged (platform/search/index.ts 59, 131)
- [`src/data/convex/client.ts:5-15`](../../src/data/convex/client.ts#L5-L15) — Production console forwarder for the Convex client logger, not a test spy
- `src/scripts/*:various` — CLI scripts print untagged output by design and are outside the test-spy scope

</details>

**Home.** `src/lib/__tests__/console-tags.ts (new, beside the existing src/lib/__tests__/module-path.ts)`

**Boundary check.** The home is in zone lib (src/lib/**). Every zone with an unasserted spy may import lib: api (`api` allow 'lib'), app (`app` allow 'lib'), composition (`composition` allow 'lib'), data (`data` allow 'lib'), convex (`convex` allow 'lib'; convex tests already import '@/lib/...', e.g. convex/engine.test.ts), platform/auth (allow 'lib'), platform/esi (allow 'lib'), transport (allow 'lib'), and lib itself. Zones that cannot import lib, so their tests keep inline spies: ui (allow []), platform/search ([]), platform/purge ([]), platform/owner-sync (['platform/esi']), config ([]). Of these, only platform/search/search.test.ts currently has a console spy. Importing vitest from a __tests__ helper has precedent in src/db/__tests__/support/reserved-connection-mock.ts.

**API sketch.**

```ts
import { vi, type MockInstance } from 'vitest';
type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';
export type ConsolePrefix = string | RegExp; // string = startsWith on the first argument
export function silenceConsolePrefixes<L extends ConsoleLevel>(level: L, prefixes: readonly ConsolePrefix[]): MockInstance<Console[L]>;
// Behavior: throws if console[level] is already a mock (prevents self-recursion). It captures the real method,
// swallows calls whose first argument is a string matching any prefix, and forwards every other call to the real method.
// It returns the spy so the test can assert, e.g. expect(spy).toHaveBeenCalledWith('[housekeeping] usage_logs failed', expect.any(Error)).
// Restore through the returned spy or vi.restoreAllMocks().
```

**Migration steps.**

1. Ask docs-researcher (Vitest) to confirm vi.spyOn/MockInstance typing and restore semantics in vitest 4.1.11.
2. Add src/lib/__tests__/console-tags.ts. Name it silenceConsolePrefixes, or keep silenceConsoleTags if preferred, but accept string and RegExp. Add src/lib/__tests__/console-tags.test.ts.
3. Migrate the 26 never-asserted files first, one file per change. Replace the blanket spy with silenceConsolePrefixes(level, ['[tag]']). Where the log is part of the contract, add the assertion, e.g. housekeeping's `[housekeeping] <task> failed` with expect.any(Error), or parse the JSON scope as cron-gate.test.ts:320 does. For the cron route tests, match `'{"scope":"cron:'` or assert the parsed scope.
4. Fix data/maps/purge.db.test.ts:216 at the same time: scope the spy and restore it (or add afterEach(vi.restoreAllMocks)) so it stops muting later tests.
5. Where the swallowed output is untagged (industry-rules 'Industry rules parse:', universe 'Universe parse:', admin/characters/reassign uses `[admin/characters/reassign]`), prefer adding a stable `[tag]` to the production log over matching prose.
6. Then convert the 3 partially asserted files (convex/engine.test.ts, convex/mapAuthoringSweep.test.ts, owner-transfer.test.ts). Leave the ~33 fully asserted files for opportunistic cleanup, since their spies already pin the expected call.
7. Leave platform/search/search.test.ts on an inline spy because its zone cannot import lib. Run `pnpm check` through test-runner after each batch.

**Tests.** New: src/lib/__tests__/console-tags.test.ts. It temporarily replaces console.error with a plain recording function (not a vi mock), then checks that a matching string prefix and a RegExp are swallowed, a non-matching or non-string first argument is forwarded to the original, the returned spy records every call, and calling it on an already-mocked method throws. Existing guards: every migrated test file must stay green. Newly forwarded output that appears in the run is the intended signal of a previously hidden log.

**Notes.** Unasserted files I found (heuristic: the spy variable or console.<level> never appears in expect() or .mock.calls): convex/characterLocationAccess.test.ts; src/app/(site)/admin/admin-console.test.ts; cron routes daily-batch, drain-esi-refresh-jobs, purge-maps, refresh-industry-indices, refresh-prices, refresh-sde, refresh-wh-statics; internal/eve-characters and internal/eve-token route tests; market-history/refresh route test; composition/account-lifecycle account-purge.db, account-purge and tracking-merge-retry.db tests; composition character-authorization, map-affiliation-access, map-character-scoping and pipelines/housekeeping tests; data/eve-data/industry-rules.test.ts; data/maps/purge.db.test.ts; data/telemetry/cost-metrics.test.ts; lib/service-auth.test.ts; platform/auth/affiliation.test.ts; platform/esi/authed-read.test.ts; platform/esi/index.test.ts. Forwarding rather than failing on unexpected calls is deliberate. It matches the principle's wording and cannot break a green suite; a strict mode can come later. Note that market-history/refresh logs `console.warn(JSON.stringify({ scope: 'market-history/refresh', ... }))`, so its test needs the JSON prefix too. The vitest config has no restoreMocks, so the helper must not assume automatic restoration.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p342"></a>

## P342: Build valid problem fixtures with problemBody/serializeProblem and replace local jsonResponse helpers with Response.json

- **Status:** [ ] not started
- **Category:** testing · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -110 / +25
- **Depends on:** —
- **Existing primitive:** `src/lib/problem.ts:problemBody,serializeProblem; src/lib/failure.ts failure factories`

**Problem.** Client-side tests hand-write RFC 9457 problem bodies instead of using src/lib/problem.ts. Some of those literals have drifted from the wire format: wrong type slugs ('not-found', 'dependency-unavailable', 'test'), application/json instead of application/problem+json, and a 500 status carrying code 'unauthenticated'. Two Convex suites carry identical copies of problemResponse. 10 test files each define a local jsonResponse that re-implements Response.json, and two of those omit the content-type header.

**Verifier revision.** Partly confirmed. 10 local jsonResponse(body, status) helpers re-implement Response.json, which 19 test files already use; two of them omit content-type. Valid problem fixtures are hand-written in about 7 client-side tests, and two of them carry type slugs production never emits ('problems/not-found' and 'problems/dependency-unavailable' instead of not_found and dependency_unavailable), plus 'problems/test'. The two Convex suites hold byte-identical copies of a problemResponse that builds the type from the code ('problems/reauth_required', title 'Request failed') and pairs code 'unauthenticated' with status 500. Two claims are refuted. In api-client.test.ts, problemResponseBody's status parameter is never passed, so there is no disagreement. In decode.test.ts, a second copy the finders missed, the body/wire mismatch at line 137 is deliberate: it tests that the decoder rejects a problem body whose status disagrees with the wire status. Negative fixtures therefore cannot come from the serializer. auth-client needs statusText 'Too Many Requests' (asserted at line 52), which serializeProblem cannot set. Revised design: no new helper module. Call the existing problemBody, serializeProblem and failure factories inline for valid fixtures. Keep the transport decoder tests' hand-built bodies as independent oracles.

**Sites (15).**

- [`src/lib/problem.ts:63-88`](../../src/lib/problem.ts#L63-L88) — Existing pure problemBody and serializeProblem (sets application/problem+json and Retry-After)
- [`src/lib/failure.ts:31-87`](../../src/lib/failure.ts#L31-L87) — Existing failure factories, including dependencyUnavailableFailure(code, 502\|503)
- [`src/platform/auth/service-client.test.ts:31-35, 92-103`](../../src/platform/auth/service-client.test.ts#L31-L35) — Local jsonResponse; drifted type 'problems/not-found' served as application/json
- [`src/features/maps/map-creation-client.test.ts:13-18, 73-86, 159-171`](../../src/features/maps/map-creation-client.test.ts#L13-L18) — Local jsonResponse; drifted 'problems/dependency-unavailable' in both a Response and an outcome object
- [`src/platform/auth/auth-client.test.ts:20-41, 50-55`](../../src/platform/auth/auth-client.test.ts#L20-L41) — Hand-written rate_limited body equal to problemBody(rateLimitedFailure(23)); the Response also sets statusText, which is asserted
- [`src/platform/auth/account-actions.test.ts:13-36`](../../src/platform/auth/account-actions.test.ts#L13-L36) — jsonResponse wrapping Response.json; rateLimitedResponse is exactly serializeProblem(problemBody(rateLimitedFailure(10), 'test-correlation-id'))
- [`src/features/feedback/components/feedback-view.test.ts:30-70`](../../src/features/feedback/components/feedback-view.test.ts#L30-L70) — 'problems/test' bodies; feedbackErrorMessage (feedback-view.ts:27-43) reads only status and detail
- [`src/transport/api-client.test.ts:14-18, 77-84`](../../src/transport/api-client.test.ts#L14-L18) — jsonResponse copy; problemResponseBody is only ever called with the default status
- [`src/transport/decode.test.ts:15-27, 135-145`](../../src/transport/decode.test.ts#L15-L27) — Missed copy of jsonResponse and problemResponseBody; line 137 serves a 409 body on a 400 wire on purpose
- [`convex/lib/characterSync.test.ts:14-24, 61, 69, 76-77, 133`](../../convex/lib/characterSync.test.ts#L14-L24) — problemResponse(code, status) builds the type from the code; it.each pairs 500 with 'unauthenticated'
- [`convex/characterLocationSync.test.ts:38-53, 468`](../../convex/characterLocationSync.test.ts#L38-L53) — Byte-identical problemResponse; jsonResponse(body, headers, status) is an ESI fake without content-type
- [`src/platform/auth/affiliation-source.test.ts:19-24`](../../src/platform/auth/affiliation-source.test.ts#L19-L24) — jsonResponse copy
- [`src/app/api/maps/search-characters/route.test.ts:59-64`](../../src/app/api/maps/search-characters/route.test.ts#L59-L64) — jsonResponse copy
- [`src/data/industry-indices/source.test.ts:17-19`](../../src/data/industry-indices/source.test.ts#L17-L19) — jsonResponse without content-type; goes through esiFetch, which only records Content-Type into ETag cache meta, and these responses carry no ETag
- [`src/data/eve-data/station-names.db.test.ts:31-36`](../../src/data/eve-data/station-names.db.test.ts#L31-L36) — jsonResponse copy

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/transport/decode.test.ts:21-27, 135-160`](../../src/transport/decode.test.ts#L21-L27) — Negative decoder cases need deliberately malformed bodies (status mismatch, code outside the vocabulary); keep them hand-built as independent oracles
- [`src/transport/api-client.test.ts:198-202`](../../src/transport/api-client.test.ts#L198-L202) — Adds a forbidden 'stack' field to test strict-schema rejection; must stay hand-built
- [`src/lib/problem.test.ts:whole file`](../../src/lib/problem.test.ts) — The serializer's own tests must keep literal expectations
- [`src/transport/api-response.test.ts:121-127`](../../src/transport/api-response.test.ts#L121-L127) — Literal expected body (oracle), not an input fixture
- [`src/app/api/mutation-route.test.ts:97-101`](../../src/app/api/mutation-route.test.ts#L97-L101) — Expected-output literal (oracle)
- [`src/app/api/admin/esi-jobs/retry/route.test.ts:101-104`](../../src/app/api/admin/esi-jobs/retry/route.test.ts#L101-L104) — Expected-output literal (oracle)
- [`src/transport/api-response.ts:74-77`](../../src/transport/api-response.ts#L74-L77) — The production problemResponse has side effects (stashFailure, request-scoped correlation id) and convex cannot import transport; do not use it for client-side fixtures

</details>

**Home.** `Existing src/lib/problem.ts (problemBody, serializeProblem) and src/lib/failure.ts factories; the platform Response.json. No new module.`

**Boundary check.** Home zone: lib. Consumers: platform/auth (service-client, auth-client, account-actions, affiliation-source) may import lib per rule from:platform/auth. features (map-creation-client, feedback-view) may per from:features. transport (api-client, decode) may per from:transport (allow: ['lib']). data (industry-indices, eve-data) may per from:data. api (maps/search-characters) may per from:api. convex (characterSync, characterLocationSync) may per from:convex (allow includes lib), and characterSync.test.ts already imports '@/lib/problem'. Response.json is a runtime global available in both node and edge-runtime.

**API sketch.**

````ts
No new API. Usage:
```ts
fetchMock.mockResolvedValue(serializeProblem(problemBody(notFoundFailure(), 'correlation-id')));
const error = problemBody(dependencyUnavailableFailure('map_projection_unavailable'), 'correlation-id');
// auth-client: keep its own init for statusText
new Response(JSON.stringify(problemBody(rateLimitedFailure(23), 'test-correlation-id')), { status: 429, statusText: 'Too Many Requests', headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '23' } });
// local jsonResponse(body, status) -> Response.json(body, { status })
```
````

**Migration steps.**

1. Replace each of the 10 local jsonResponse helpers with Response.json(body, { status }), or Response.json(body, { status, headers }) for convex/characterLocationSync.test.ts. account-actions' jsonResponse already wraps Response.json, so inline it.
2. account-actions.test.ts: replace rateLimitedResponse() with serializeProblem(problemBody(rateLimitedFailure(10), 'test-correlation-id')).
3. service-client.test.ts 92-103: use serializeProblem(problemBody(notFoundFailure(), 'correlation-id')).
4. map-creation-client.test.ts: at 73-86 use serializeProblem(problemBody(dependencyUnavailableFailure('map_projection_unavailable'), 'correlation-id')); at 159-171 set error: problemBody(dependencyUnavailableFailure('map_projection_unavailable'), 'correlation-id').
5. auth-client.test.ts 20-41: build the body from problemBody(rateLimitedFailure(23), 'test-correlation-id') but keep the explicit Response init with statusText, which line 52 asserts.
6. Convex: replace both problemResponse copies with serializeProblem(problemBody(failure, 'correlation-id')) and pass a failure per case: notFoundFailure(); conflictFailure('reauth_required'); it.each([[401, unauthenticatedFailure()], [500, unexpectedFailure()], [502, dependencyUnavailableFailure('upstream_error', 502)]]); unauthenticatedFailure().
7. Optional: in feedback-view.test.ts, build errors with problemBody(validationFailure(code, detail)), problemBody(rateLimitedFailure(60)) and problemBody(dependencyUnavailableFailure('linear_failed', 502)), keeping the `as ProblemBody & { code: ... }` casts.
8. Leave decode.test.ts and api-client.test.ts problem bodies hand-built, apart from step 1.

**Tests.** These are fixture-only changes, guarded by the edited suites themselves (service-client, map-creation-client, auth-client, account-actions, feedback-view, characterSync, characterLocationSync, affiliation-source, maps/search-characters, industry-indices/source, station-names.db, api-client, decode). src/lib/problem.test.ts must keep its literal expectations. No new tests.

**Notes.** Correct copy: production problemBody, which builds type `https://lgi.tools/problems/${category}` and the title from the category. The hand-written 'not-found', 'dependency-unavailable', 'test' and `problems/${code}` variants are drift. None of the decoders under test read `type`, so no current test fails because of it, but the fixtures misdescribe the wire. Response.json adds content-type: application/json to the two copies that lacked it. Neither esiFetch nor the convex sync reads content-type except esiFetch's ETag cache meta, and those fixtures carry no ETag, so behavior does not change. Using serializeProblem for input fixtures is not an algorithm echo: the assertions exercise the client-side decoders (serviceFetch, Better Fetch, vendCharacterToken), not the serializer.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p343"></a>

## P343: Adopt the DB harness's resetBetweenTests and expect.poll; drop cargo portrait overrides; pair updatedAt in the harness and add seedAccount

- **Status:** [ ] not started
- **Category:** testing · **Kind:** bypasses-existing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -55 / +12
- **Depends on:** —
- **Existing primitive:** `src/db/__tests__/support/db-test-harness.ts:createDbTestHarness`

**Problem.** createDbTestHarness already provides resetBetweenTests ('delete' or 'truncate') and the seedUser, seedEveAccount and seedCharacter helpers, but some suites work around them. housekeeping and esi-refresh-jobs reset tables by hand. Three suites carry identical hand-rolled waitFor polling loops instead of expect.poll or vi.waitFor. Five suites wrap the seeders, partly to override portraitUrl with a URL that no assertion reads and partly to pair createdAt with updatedAt, which the harness should do itself. Two suites insert a non-EVE account row raw because no generic account seeder exists.

**Verifier revision.** Confirmed in part. housekeeping.db.test.ts hand-rolls a beforeEach that deletes exactly its four harness tables. esi-refresh-jobs.db.test.ts runs 7 start-of-test full-table deletes plus one end-of-test cleanup (line 40), while 43 of 66 harness suites already use resetBetweenTests. Three byte-identical waitFor polling loops each have one caller, and the repo already has precedents for expect.poll (affiliation-store.db.test.ts:365-377) and vi.waitFor (linked-characters.db.test.ts:140). Four wrappers pair createdAt with updatedAt by hand. Revisions: (a) The URL-shaped portraitUrl overrides are cargo. affiliation-store, owner-transfer, account-purge and linked-characters never assert a seeded portrait, and linked-characters line 114 asserts the derived fallback for an unseeded character. Do not change the harness default to a URL, because a non-URL default keeps the stored value distinguishable from linked-characters.ts:88's `r.portraitUrl ?? portraitUrl(characterId)` fallback. Delete the overrides instead. (b) The wrappers mainly bind harness.db and a suite USER_ID, so they shrink rather than disappear. (c) There are two mid-test deletes in esi-refresh-jobs to keep (187-192), not one. (d) seedAccount has a real second consumer that the finders missed, data/maps/queries.db.test.ts:87-90. (e) The telemetry bulk inserts are excluded, because single-row seeders would be a regression.

**Sites (13).**

- [`src/db/__tests__/support/db-test-harness.ts:25, 79-84, 118-159, 253-263`](../../src/db/__tests__/support/db-test-harness.ts#L25) — resetBetweenTests option and reset; seedEveAccount sets updatedAt to now even when createdAt is overridden (136-145); portrait default `portrait-${id}` at 156
- [`src/composition/pipelines/housekeeping.db.test.ts:10-13, 25-31`](../../src/composition/pipelines/housekeeping.db.test.ts#L10-L13) — Harness without a reset; the beforeEach deletes exactly the 4 harness tables
- [`src/data/esi-refresh-jobs/esi-refresh-jobs.db.test.ts:15-19, 40, 77, 100, 128, 143, 167, 187-192, 201, 234`](../../src/data/esi-refresh-jobs/esi-refresh-jobs.db.test.ts#L15-L19) — Start-of-test full deletes at 77/100/128/143/167/201/234; end cleanup at 40; mid-test assertion deletes at 187-192 to keep
- [`src/platform/auth/eve-token-service.concurrency.db.test.ts:30-37, 151`](../../src/platform/auth/eve-token-service.concurrency.db.test.ts#L30-L37) — waitFor loop with a single caller
- [`src/features/owned-assets/queries.db.test.ts:57-64, 132`](../../src/features/owned-assets/queries.db.test.ts#L57-L64) — Identical waitFor with a single caller
- [`src/data/corp-holdings/queries.db.test.ts:71-78, 132`](../../src/data/corp-holdings/queries.db.test.ts#L71-L78) — Identical waitFor with a single caller
- [`src/platform/auth/affiliation-store.db.test.ts:53-65, 364-377`](../../src/platform/auth/affiliation-store.db.test.ts#L53-L65) — Wrapper with a cargo portraitUrl override (never asserted); expect.poll precedent at 365-377
- [`src/composition/account-lifecycle/owner-transfer.db.test.ts:110-139`](../../src/composition/account-lifecycle/owner-transfer.db.test.ts#L110-L139) — Cargo portrait override at 118-122; createdAt/updatedAt pairing at 133-137
- [`src/composition/account-lifecycle/account-purge.db.test.ts:175-192`](../../src/composition/account-lifecycle/account-purge.db.test.ts#L175-L192) — Cargo portrait override; createdAt/updatedAt pairing at 186-188
- [`src/platform/auth/linked-characters.db.test.ts:37-66, 140-142, 150-156`](../../src/platform/auth/linked-characters.db.test.ts#L37-L66) — Wrappers (portrait default at 50 is cargo; pairing at 62-63); vi.waitFor precedent at 140; raw EVE account for another user at 151-156
- [`src/platform/auth/linked-characters.ts:88`](../../src/platform/auth/linked-characters.ts#L88) — Fallback `r.portraitUrl ?? portraitUrl(characterId)`: the reason the harness default should stay non-URL
- [`src/platform/auth/admin-users.db.test.ts:81-102, 239-244`](../../src/platform/auth/admin-users.db.test.ts#L81-L102) — Seed wrappers with pairing at 99-100; raw discord account insert
- [`src/data/maps/queries.db.test.ts:87-90`](../../src/data/maps/queries.db.test.ts#L87-L90) — Missed second raw non-EVE (discord) account insert, with createdAt and updatedAt set by hand

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/telemetry/queries.db.test.ts:137-160, 349-350`](../../src/data/telemetry/queries.db.test.ts#L137-L160) — Bulk multi-row inserts with bespoke createdAt and portrait values; replacing them with single-row seeders adds calls and gains nothing
- [`src/data/gsc/queries.db.test.ts:227-228`](../../src/data/gsc/queries.db.test.ts#L227-L228) — A single start-of-test delete in a suite whose other tests may rely on accumulated rows; a suite-wide reset would change semantics
- [`src/data/eve-data/industry-rules-permissions.db.test.ts:34-55`](../../src/data/eve-data/industry-rules-permissions.db.test.ts#L34-L55) — TRUNCATE there tests runtime privileges; it is not a reset
- [`src/composition/synthetic-pilot-store.db.test.ts:61-64, 142-145`](../../src/composition/synthetic-pilot-store.db.test.ts#L61-L64) — Raw single-row characters inserts that could become seedCharacter(…, overrides); optional, explicit as written

</details>

**Home.** `src/db/__tests__/support/db-test-harness.ts (existing primitive), plus Vitest's built-in expect.poll`

**Boundary check.** The harness lives in the db zone (src/db/**), which may import lib and config; it already imports @/db and @/lib/env. Consumers: composition (housekeeping, owner-transfer, account-purge) may import db per rule from:composition. data (esi-refresh-jobs, corp-holdings, maps/queries) may per from:data. features (owned-assets) may per from:features. platform/auth (eve-token-service.concurrency, affiliation-store, linked-characters, admin-users) may per from:platform/auth. expect.poll is a vitest API with no zone.

**API sketch.**

```ts
export async function seedAccount(
  database: PostgresJsDatabase,
  base: { id: string; accountId: string; providerId: string; userId: string },
  overrides?: Partial<typeof account.$inferInsert>,
): Promise<void>; // createdAt = overrides.createdAt ?? now; updatedAt = overrides.updatedAt ?? createdAt
export function seedEveAccount(
  database: PostgresJsDatabase,
  base: { id: string; characterId: number; userId: string },
  overrides?: Partial<typeof account.$inferInsert>,
): Promise<void>; // = seedAccount(db, { id, accountId: String(characterId), providerId: 'eve', userId }, overrides)
// polling: await expect.poll(() => rawRefreshToken(), { timeout: 3_000, interval: 5 }).toBeNull();
```

**Migration steps.**

1. housekeeping.db.test.ts: add resetBetweenTests: 'delete' to the harness options. Delete the beforeEach at 26-31 and the beforeEach import.
2. esi-refresh-jobs.db.test.ts: add resetBetweenTests: 'delete'. Delete the start-of-test `delete(esiRefreshJobs)` calls at 77, 100, 128, 143, 167, 201 and 234 and the end-of-test cleanup at 40. Keep the status-filtered deletes at 187-192, which are part of the assertion.
3. Replace the three waitFor helpers and their single calls with expect.poll: `await expect.poll(() => rawRefreshToken(), { timeout: 3_000, interval: 5 }).toBeNull()`, `await expect.poll(() => committedRowCount(), {...}).toBe(0)` and `await expect.poll(async () => (await committedNodeIds()).length, {...}).toBe(0)`. Delete the helpers.
4. In the harness, add seedAccount and reimplement seedEveAccount on top of it so that updatedAt defaults to the effective createdAt. Leave the portrait default unchanged.
5. Remove `updatedAt: createdAt` from the four wrappers (linked-characters 63, admin-users 100, owner-transfer 136, account-purge 188).
6. Remove the cargo portraitUrl overrides at affiliation-store 58, owner-transfer 118-122 (inline the wrapper as a seedCharacter(harness.db, id) call), account-purge 175-179, and the default at linked-characters 50. Keep explicit per-test portrait values that are asserted (linked-characters 71-88).
7. Replace the raw inserts: linked-characters 151-156 becomes insertEveAccount(harness.db, { id: 'other', characterId: SECOND_CHAR, userId: 'other-user' }). admin-users 239-244 and data/maps/queries.db.test.ts 87-90 become seedAccount(harness.db, { id: 'discord', accountId: ..., providerId: 'discord', userId: ... }).
8. Keep the remaining suite-local wrappers that only bind harness.db or USER_ID; they are conveniences, not re-implementations.

**Tests.** Guarded by the edited suites: housekeeping, esi-refresh-jobs, eve-token-service.concurrency, owned-assets/queries, corp-holdings/queries, affiliation-store, owner-transfer, account-purge, linked-characters (its oldest-first ordering test relies on createdAt), admin-users (getAccountTotals counts the discord row as a user but not a character) and data/maps/queries. Also run composition/board/board-view.db.test.ts, which overrides createdAt without updatedAt (226-232) and so picks up the new updatedAt default. All of these need Postgres; run them through test-runner with the local DB.

**Notes.** Correct copy for the timestamps: the hand-paired wrappers (updatedAt = createdAt). The harness's now-for-updatedAt default is the drift. For portraits, the harness's non-URL default is correct and the URL overrides are cargo. esi-refresh-jobs test 1 (25-41) deleted its own row at 40 so that test 2 started clean, and the reset makes that unnecessary. resetBetweenTests is a harness-level beforeEach, which is in tension with testing-principles' 'avoid shared beforeEach', but it is the sanctioned convention in 43 of 66 harness suites. expect.poll is preferred over vi.waitUntil because it reports the last observed value on timeout and matches the affiliation-store precedent. vi.waitUntil (vitest 4.1.11) also supports async predicates without overlapping calls.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p349"></a>

## P349: Use createReservedConnectionMock in the four cron route tests that hand-roll the reserved connection

- **Status:** [ ] not started
- **Category:** testing · **Kind:** bypasses-existing-primitive · **Verdict:** confirmed
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -14 lines across 4 files; no additions
- **Depends on:** —
- **Existing primitive:** `src/db/__tests__/support/reserved-connection-mock.ts:createReservedConnectionMock`

**Problem.** src/db/__tests__/support/reserved-connection-mock.ts builds the reserve() mock and the reserved tagged-template with release. refresh-sde, cron-gate and advisory-lock use it. Four cron route tests rebuild the same structure inline instead: refresh-industry-indices, drain-esi-refresh-jobs, refresh-wh-statics (with a separate releaseMock) and purge-maps (with a per-call reserved that also queues an unread unlock row).

**Sites (9).**

- [`src/db/__tests__/support/reserved-connection-mock.ts:1-17`](../../src/db/__tests__/support/reserved-connection-mock.ts#L1-L17) — Existing primitive: reserved = Object.assign(vi.fn(query), { release }), reserve vi.fn, client cast
- [`src/app/api/cron/refresh-sde/route.test.ts:2, 12-15, 36-38`](../../src/app/api/cron/refresh-sde/route.test.ts#L2) — Correct use: lockGot closure query, names aliased to reservedTag/reserveMock, mockClear in beforeEach
- [`src/composition/pipelines/cron-gate.test.ts:8-11`](../../src/composition/pipelines/cron-gate.test.ts#L8-L11) — Correct use
- [`src/db/advisory-lock.test.ts:2, 5-11`](../../src/db/advisory-lock.test.ts#L2) — Correct use with a SQL-text-dispatching query
- [`src/app/api/cron/refresh-industry-indices/route.test.ts:7-12, 27-29, 55-57, 74, 79`](../../src/app/api/cron/refresh-industry-indices/route.test.ts#L7-L12) — Hand-rolled copy identical to the primitive body
- [`src/app/api/cron/drain-esi-refresh-jobs/route.test.ts:9-18, 32, 55, 59, 81, 94, 108`](../../src/app/api/cron/drain-esi-refresh-jobs/route.test.ts#L9-L18) — Hand-rolled copy; static route import plus vi.clearAllMocks
- [`src/app/api/cron/refresh-wh-statics/route.test.ts:13-17, 29-31, 82-88, 222, 252, 291`](../../src/app/api/cron/refresh-wh-statics/route.test.ts#L13-L17) — Hand-rolled copy with a separate releaseMock that tests assert on
- [`src/app/api/cron/purge-maps/route.test.ts:3-7, 12-14, 38-43`](../../src/app/api/cron/purge-maps/route.test.ts#L3-L7) — Hand-rolled reserved per call, with got then unlocked rows; the unlock row is never read
- [`src/db/advisory-lock.ts:7-35`](../../src/db/advisory-lock.ts#L7-L35) — Confirms the unlock result is ignored and release() is always called

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/app/api/cron/daily-batch/route.test.ts:33`](../../src/app/api/cron/daily-batch/route.test.ts#L33) — directClient: {}; the steps are declared lock-free, so nothing is reserved
- [`src/app/api/cron/refresh-prices/route.test.ts:26`](../../src/app/api/cron/refresh-prices/route.test.ts#L26) — directClient: {}; no reserve path exercised
- [`src/app/api/cron/refresh-gsc/route.test.ts:10-28`](../../src/app/api/cron/refresh-gsc/route.test.ts#L10-L28) — Mocks defineCronRoute itself; no lock
- [`src/mapper/canvas/wormhole/host.test.ts:8-12`](../../src/mapper/canvas/wormhole/host.test.ts#L8-L12) — release is a WebGL painter release; unrelated

</details>

**Home.** `src/db/__tests__/support/reserved-connection-mock.ts:createReservedConnectionMock (existing)`

**Boundary check.** The primitive is in the db zone (src/db/**). All four consumers are in the api zone (src/app/api/**), and the api rule's allow list includes "db". refresh-sde/route.test.ts already imports it from the same zone. The primitive's only '@/db' import is type-only (`import type { Sql }`), so it does not trip the tests' vi.mock('@/db').

**API sketch.**

```ts
createReservedConnectionMock(query?: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>): { reserved: Mock & { release: Mock }; reserve: Mock; client: Sql } — unchanged
```

**Migration steps.**

1. refresh-industry-indices/route.test.ts: import the primitive. Replace lines 8-12 with `const { reserved: reservedTag, reserve: reserveMock } = createReservedConnectionMock(() => Promise.resolve([{ got: lockGot }]));`. The vi.mock at 27-29 and the beforeEach mockClear calls at 55-56 stay unchanged.
2. drain-esi-refresh-jobs/route.test.ts: replace lines 10-14 with `const { reserve } = createReservedConnectionMock(() => Promise.resolve([{ got: lockGot }]));`. Keep the vi.mock factory `directClient: { reserve: () => reserve() }`; its closure is lazy, so the hoisted static route import is safe. vi.clearAllMocks (line 55) keeps the vi.fn(impl) implementations.
3. refresh-wh-statics/route.test.ts: replace lines 14-17 with `const { reserved: reservedTag, reserve: reserveMock } = createReservedConnectionMock(() => Promise.resolve([{ got: lockGot }]));` and delete releaseMock. In beforeEach, replace `releaseMock.mockClear()` with `reservedTag.release.mockClear()`; reservedTag.mockClear() does not clear the attached release fn. Change `expect(releaseMock)` at 222, 252 and 291 to `expect(reservedTag.release)`. The drizzle mock at 33-43 still sees a function client.
4. purge-maps/route.test.ts: drop `reserve` from h (line 5). Add a module-scope `const lock = createReservedConnectionMock();`; its default resolves [{ got: true }] on every call, and the unlock row is unread. Change the vi.mock at 12-14 to `directClient: { reserve: (...args: unknown[]) => lock.reserve(...args) }`; the route is imported dynamically after vi.resetModules, so the lazy reference is safe. Replace lines 38-43 with `lock.reserve.mockClear(); lock.reserved.mockClear();`.
5. Run the four route tests plus refresh-sde and cron-gate through test-runner, then pnpm check.

**Tests.** No new tests; the migrated tests themselves are the guard. Run the four migrated cron route tests: refresh-industry-indices (busy path at line 79; no reserve on 401 at line 74), drain-esi-refresh-jobs (reserve called once at line 94; busy at line 108), refresh-wh-statics (release called once at 222, 252 and 291; no reserve before the probe at 104 and 124) and purge-maps. Also run refresh-sde/route.test.ts, cron-gate.test.ts and advisory-lock.test.ts, which already use the primitive.

**Notes.** Behavior to preserve:
(a) refresh-wh-statics asserts release toHaveBeenCalledOnce per test. The primitive's release is a separate vi.fn that reserved.mockClear() does not reset, so clear it explicitly in beforeEach.
(b) purge-maps currently builds a fresh reserved per call. A module-scope mock plus mockClear in beforeEach gives the same per-test isolation.
(c) Do not port purge-maps' [{ unlocked: true }] second row. withAdvisoryLock never reads the unlock result, and adding a custom query would only re-encode a non-contract.
(d) drain's vi.mock drops reserve's arguments (`() => reserve()`). This is harmless and can stay.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p244"></a>

## P244: Add createFakeQueryChain to src/db/__tests__/support and migrate the five hand-built Drizzle chains

- **Status:** [ ] not started
- **Category:** testing · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** -~100 (five inline chains) / +~60 (helper and its test); net about -40
- **Depends on:** —
- **Existing primitive:** `src/db/__tests__/support/reserved-connection-mock.ts:createReservedConnectionMock`

**Problem.** eve-token-service.revoke, admin-users.reassign, purge/orchestrator, account-merge and owner-transfer each build a 10–25-line thenable Drizzle chain in vi.hoisted. Their method lists, counters, `for` semantics and empty-queue results differ. Each new query shape means editing several copies. Only one copy records which table each write hits, so the others can assert only counts.

**Verifier revision.** Confirmed: five unit tests hand-roll the same thenable Drizzle fake inside vi.hoisted. Fallow's duplicate check ignores *.test.ts, so these copies never surface. The copies have drifted in ways that matter for the design. In admin-users.reassign `for` is terminal and resolves [] without using the queue, while in account-merge it chains and consumes a queued result. orchestrator.test always resolves [] and records {op, table}. The others shift a FIFO queue and count update, delete and execute, and admin-users queues an explicit `undefined` and `Promise.reject(...)`. The finders' 'chain.x is not a function' argument is weak, since a loud failure is acceptable. The real payoff is one Drizzle-faithful fake with recording. Revised because the design must choose the faithful `for` semantics, tell an empty queue apart from a queued undefined, and keep rejection propagation. The insert-only fakeDb helpers in the ingest tests are a different shape and stay out.

**Sites (6).**

- [`src/platform/auth/eve-token-service.revoke.test.ts:3-11`](../../src/platform/auth/eve-token-service.revoke.test.ts#L3-L11) — select/from/where/limit; then shifts the queue (undefined when empty)
- [`src/platform/auth/admin-users.reassign.test.ts:3-29`](../../src/platform/auth/admin-users.reassign.test.ts#L3-L29) — `for` is terminal and resolves [] without consuming; counts delete and update; drizzle().transaction(work => work(chain)); queues explicit undefined and Promise.reject
- [`src/composition/purge/orchestrator.test.ts:4-28`](../../src/composition/purge/orchestrator.test.ts#L4-L28) — then always resolves []; records {op, table} for delete and update; counts execute
- [`src/composition/account-lifecycle/account-merge.test.ts:53-78`](../../src/composition/account-lifecycle/account-merge.test.ts#L53-L78) — `for` chains and consumes the queue; counts update, delete and execute; fakeDatabase.transaction(work => work(chain))
- [`src/composition/account-lifecycle/owner-transfer.test.ts:16-40, 49`](../../src/composition/account-lifecycle/owner-transfer.test.ts#L16-L40) — near-copy of the merge chain without `for`; counts delete, update and execute
- [`src/db/__tests__/support/reserved-connection-mock.ts:1-17`](../../src/db/__tests__/support/reserved-connection-mock.ts#L1-L17) — existing sibling fake for the postgres-js reserved connection; the precedent for the home

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/industry-indices/ingest.test.ts:16-25`](../../src/data/industry-indices/ingest.test.ts#L16-L25) — insert→values→onConflictDoUpdate vi.fn fake that asserts written batches; not a thenable query chain
- [`src/data/market-prices/ingest.test.ts:28-33`](../../src/data/market-prices/ingest.test.ts#L28-L33) — same insert-only vi.fn shape; leave as is
- [`src/app/api/cron/refresh-industry-indices/route.test.ts:5, 31`](../../src/app/api/cron/refresh-industry-indices/route.test.ts#L5) — identity placeholder object, not a fake

</details>

**Home.** `src/db/__tests__/support/fake-query-chain.ts`

**Boundary check.** The home is in the db zone, whose rule allows lib and config; the helper needs only types (optionally drizzle-orm's getTableConfig, an npm package). Both consumer zones may import db: platform/auth (eve-token-service.revoke and admin-users.reassign tests) and composition (orchestrator, account-merge and owner-transfer tests). It sits beside reserved-connection-mock.ts and db-test-harness.ts.

**API sketch.**

```ts
export interface FakeQueryOp { readonly op: 'select' | 'insert' | 'update' | 'delete'; readonly table: unknown }
export interface FakeQueryState {
  results: unknown[]; // FIFO; each awaited chain takes one; a queued rejected Promise propagates
  readonly recorded: FakeQueryOp[];
  readonly calls: Record<'select' | 'insert' | 'update' | 'delete' | 'execute' | 'transaction', number>;
}
export function createFakeQueryChain(options?: { whenEmpty?: unknown /* default [] */ }): {
  chain: Record<string, unknown>; // select/insert/update/delete/from/where/set/values/onConflictDoUpdate/onConflictDoNothing/innerJoin/leftJoin/orderBy/limit/returning/for (all chainable), then, execute, transaction(work) => work(chain)
  state: FakeQueryState;
  reset(): void;
};
// usage
const { chain, state, reset } = await vi.hoisted(async () =>
  (await import('@/db/__tests__/support/fake-query-chain')).createFakeQueryChain());
vi.mock('@/db', () => ({ db: chain }));
```

**Migration steps.**

1. Have docs-researcher confirm that Vitest 4.1.11 supports `await vi.hoisted(async () => (await import('@/db/__tests__/support/fake-query-chain')).createFakeQueryChain())` and that the '@' alias resolves inside the hoisted dynamic import.
2. Write fake-query-chain.ts. `then` must call `resolve(state.results.length > 0 ? state.results.shift() : whenEmpty)`. Check the length rather than using `?? whenEmpty` so a queued `undefined` survives, and pass the value straight to resolve so a queued rejected Promise propagates. Make `for` chain like Drizzle does. `from`, `insert`, `update` and `delete` record {op, table}. execute counts and resolves []. transaction(work) counts and returns work(chain). reset() empties results, recorded and calls.
3. Migrate orchestrator.test.ts first: the empty queue already resolves to [], `recorded` keeps the same shape, and executions.count becomes state.calls.execute.
4. Migrate eve-token-service.revoke.test.ts. If any case relied on undefined when the queue was empty, pass { whenEmpty: undefined }.
5. Migrate owner-transfer.test.ts and account-merge.test.ts. In account-merge, replace fakeDatabase with `chain as unknown as PostgresJsDb`, since chain.transaction now exists.
6. Migrate admin-users.reassign.test.ts last. With `for` now consuming the queue, insert a lock result (e.g. [{ id: 'eve-user-2' }]) at the front of each case's results that reaches withLockedUsers. Replace the drizzle mock with `drizzle: () => chain`.
7. Delete the five inline vi.hoisted chain builders.

**Tests.** New src/db/__tests__/support/fake-query-chain.test.ts covering: FIFO consumption, whenEmpty versus a queued undefined, a queued rejection propagating, `for` chaining, recorded {op, table} for select/insert/update/delete, and transaction passing the chain. The five migrated suites must stay green with identical assertions. Where they only count writes, prefer asserting state.recorded table names, as orchestrator.test does.

**Notes.** The drift to reconcile is `for`. admin-users treats it as terminal, merge treats it as chainable. Drizzle's .for() returns the thenable builder, so the merge copy is the faithful one, and the admin-users queue indices shift by one per withLockedUsers call. orchestrator.test relies on every await resolving [], which is the whenEmpty default. Keep vi.mock factories referencing the hoisted `chain` so mock hoisting order is unchanged. P242's lockUserRows test can reuse this fake.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p347"></a>

## P347: Share one registry coverage diff and use reflectedSchemaTables in the purge and ESI registry gates

- **Status:** [ ] not started
- **Category:** testing · **Kind:** simplification · **Verdict:** revised
- **Effort:** S · **Risk:** low · **Payoff:** low · **Size:** About -55 (two identical helpers with their self-tests, two hand-rolled diffs, two Object.values reflections) and +30 (helper and its test): net about -25
- **Depends on:** —
- **Existing primitive:** `src/db/__tests__/support/schema-reflection.ts:reflectedSchemaTables,reflectedSchemaExports; src/composition/__tests__/data-ownership-census.ts:sliceOfPath`

**Problem.** Four schema-registry gates compare the set of schema tables against a declared registry, each with its own code. Purge and ESI use two identically bodied helpers (findUnclaimed, findUnregisteredMirrors) plus inline stale filters. Growth uses a local coverageDiff with deduped, sorted duplicates. Ownership uses an inline diff whose duplicate check does not dedupe. Purge and ESI get the table set from Object.values(drizzle-schema), the other gates from reflectedSchemaTables, so there are two definitions of 'all schema tables'. Today they are equal, but reflection is the superset: it also loads every src/**/schema.ts, so a slice schema missing from drizzle-schema would be seen by the growth and ownership gates but not by the purge and ESI ones.

**Verifier revision.** The low-risk core holds. The coverage diff (expected vs declared, giving missing, stale and duplicate) is written four ways. findUnclaimed (platform/purge/__tests__/coverage.ts 39-45) and findUnregisteredMirrors (esi-datasets/__tests__/checks.ts 24-32) are the same function with different names, and each has its own self-test. table-growth-registry.test.ts and dataset-declarations.test.ts each hand-roll missing, stale and duplicate, and they have drifted. The growth version dedupes and sorts duplicates. The ownership version uses `indexOf !== index`, which lists a table repeated three times twice. The purge and ESI registry tests reflect tables through Object.values(drizzle-schema), while the other gates use the canonical reflectedSchemaTables. Three parts of the proposal are rejected. Deriving `owner` from sliceOfPath: all 78 owners do match their defining slice today, but `owner` is an explicit reviewed declaration consumed by the write-site gate (esi-datasets/__tests__/write-sites.ts 151-177), and SliceId also types the writers' `by` (composition/account-lifecycle, scripts and others), so the union would not shrink. Sharing an SDE list: the growth registry records a growth reason ('replaced from the EVE SDE') and the ownership registry records a transaction boundary (SDE_BATCH), which are different facets. A schemaTableName helper: getTableConfig(t).name is a one-liner, and tableGrowthKey already exists.

**Sites (8).**

- [`src/db/__tests__/support/schema-reflection.ts:1-45`](../../src/db/__tests__/support/schema-reflection.ts#L1-L45) — Canonical reflectedSchemaTables (17-28) and reflectedSchemaExports (30-45); proposed home of the diff
- [`src/composition/table-growth-registry.test.ts:11-35, 41-49, 88-95`](../../src/composition/table-growth-registry.test.ts#L11-L35) — Local duplicates() and coverageDiff() (missing, stale, duplicate; deduped and sorted), its use, and its synthetic self-test
- [`src/esi-datasets/dataset-declarations.test.ts:50-52, 186-200`](../../src/esi-datasets/dataset-declarations.test.ts#L50-L52) — Local tableName and the inline ownership diff. The duplicate check `filter(indexOf !== index)` is not deduped (drift)
- [`src/composition/purge/registry.test.ts:28-37, 78-91, 113-121`](../../src/composition/purge/registry.test.ts#L28-L37) — Object.values(schema) reflection and local tableName, unclaimed via findUnclaimed plus an inline stale filter against the flagged subset, and the findUnclaimed self-test
- [`src/platform/purge/__tests__/coverage.ts:39-45`](../../src/platform/purge/__tests__/coverage.ts#L39-L45) — findUnclaimed: flagged.filter(n => !claimed.has(n) && !retained.has(n))
- [`src/esi-datasets/registry.test.ts:31-43, 100-115, 292-308`](../../src/esi-datasets/registry.test.ts#L31-L43) — Object.values(schema) reflection, the findUnregisteredMirrors self-test, and unregistered plus an inline stale filter against all table names
- [`src/esi-datasets/__tests__/checks.ts:24-32`](../../src/esi-datasets/__tests__/checks.ts#L24-L32) — findUnregisteredMirrors has the same body as findUnclaimed
- [`src/composition/__tests__/table-growth-census.ts:5-7`](../../src/composition/__tests__/table-growth-census.ts#L5-L7) — Existing tableGrowthKey name helper, so no new schemaTableName is needed

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/composition/__tests__/data-ownership-registry.ts:4-33 and every `owner:` field`](../../src/composition/__tests__/data-ownership-registry.ts#L4-L33) — Rejected: owner derivation. All 78 owners currently equal sliceOfPath(defining module), but owner is an explicit reviewed declaration that write-sites.ts 151-177 enforces against, and SliceId also covers non-owner writer slices. If drift protection is wanted, add one assertion (owner === slice of the defining module via reflectedSchemaExports + sliceOfPath) instead of deriving it
- [`src/composition/__tests__/table-growth-registry.ts:187-230`](../../src/composition/__tests__/table-growth-registry.ts#L187-L230) — Rejected: SDE list sharing. The growth 'bounded' reasons and the ownership SDE_BATCH boundary (data-ownership-registry.ts 112-115) record different facets of the same tables, and coupling the registries trades clarity for about 19 identifiers
- [`src/composition/account-lifecycle/account-merge.ts:24-26`](../../src/composition/account-lifecycle/account-merge.ts#L24-L26) — Production SCHEMA_TABLES from drizzle-schema is correct at runtime: import.meta.glob reflection is test-only
- [`src/lib/esi-datasets/entries.ts:310, 329, 343`](../../src/lib/esi-datasets/entries.ts#L310) — Three ESI entries legitimately claim character_sheets, so ESI must ignore the diff's duplicate output

</details>

**Home.** `src/db/__tests__/support/schema-reflection.ts (existing; add registryCoverageDiff next to reflectedSchemaTables)`

**Boundary check.** The home is in zone db (src/db/**), and each consumer zone may import it: composition (table-growth-registry.test.ts, purge/registry.test.ts) via rule `composition` allow [..., 'db', ...]; esi-datasets (dataset-declarations.test.ts, registry.test.ts) via rule `esi-datasets` allow ['composition', 'db', ...]. Both already import schema-reflection. platform/purge/__tests__/coverage.ts may not import db (`platform/purge` allow []), so findUnclaimed is deleted rather than rebuilt on the helper. The diff is pure strings and adds no imports to db.

**API sketch.**

```ts
export interface RegistryCoverageDiff { missing: string[]; stale: string[]; duplicate: string[] } // each sorted; duplicate deduped
export function registryCoverageDiff(expected: Iterable<string>, declared: readonly string[]): RegistryCoverageDiff;
// missing = expected − declared; stale = declared − expected; duplicate = names declared more than once
```

**Migration steps.**

1. Add registryCoverageDiff to src/db/__tests__/support/schema-reflection.ts, using the growth test's dedupe-and-sort semantics, which are the correct ones. Add src/db/__tests__/support/schema-reflection.test.ts and move the synthetic cases there from table-growth-registry.test.ts 88-95, purge/registry.test.ts 113-121 and esi-datasets/registry.test.ts 100-115.
2. table-growth-registry.test.ts: delete duplicates() and coverageDiff(). Call registryCoverageDiff([...tables.map(tableGrowthKey), tableGrowthKey(DRIZZLE_MIGRATIONS_TABLE)], declarationKeys) and keep missingMessage and the per-field expect messages.
3. dataset-declarations.test.ts 188-200: replace the inline duplicate, missing and stale computation with registryCoverageDiff(tables.map(tableName), DATA_OWNERSHIP.map(e => tableName(e.table))). Keep the three domain-specific messages.
4. composition/purge/registry.test.ts: replace the Object.values(schema) filter (28-30) with `const tables = await reflectedSchemaTables()`. Compute diff = registryCoverageDiff(flagged, [...claim names, ...retained names]); use diff.missing for the unclaimed test and diff.stale for the stale test, and assert diff.duplicate is empty. That last check is new but safe: 31 declared names against 31 flagged, no repeats. Delete findUnclaimed from platform/purge/__tests__/coverage.ts 39-45 and drop its import.
5. esi-datasets/registry.test.ts: switch 31-33 to reflectedSchemaTables. Compute missing with registryCoverageDiff(flagged, [...claimed, ...infrastructure]).missing, and stale with registryCoverageDiff(tableNames, [...claimed, ...infrastructure]).stale. Stale is checked against all tables, not the flagged subset: keep that. Ignore `duplicate` because of the character_sheets triple claim. Delete findUnregisteredMirrors from esi-datasets/__tests__/checks.ts 24-32.
6. Remove the now-unused `is`/PgTable imports from the two registry tests, run `pnpm check` through test-runner, and confirm Fallow reports no unused exports in coverage.ts or checks.ts.

**Tests.** New: src/db/__tests__/support/schema-reflection.test.ts for registryCoverageDiff, covering missing, stale, deduped and sorted duplicates, and empty inputs. It replaces the self-tests at purge/registry.test.ts 113-121 and esi-datasets/registry.test.ts 100-115, and the synthetic case at table-growth-registry.test.ts 88-95 can call it directly. Existing guards: the four registry gates (growth, ownership in dataset-declarations, purge, ESI) and the dataset-declarations checklist must stay green with unchanged failure messages.

**Notes.** Behavior that must be preserved. The purge stale check is relative to the flagged user-data subset (claims on non-user-data tables are stale), while the ESI stale check is relative to all tables (claims on non-mirror tables are allowed), so ESI calls the diff with two different expected sets. ESI must ignore duplicates. The ownership duplicate output changes from non-deduped to deduped; the growth behavior is the correct one. Switching purge and ESI to reflection is stricter, not looser: today both sets are identical (every src/**/schema.ts plus auth-schema and deletion-schema is re-exported by drizzle-schema), so no gate result changes. Lead, not part of this change: the purge 'unclaimed', ESI 'unregistered' and growth 'missing' checks are also asserted centrally by dataset-declarations.test.ts checklistFindings (54-80, 108-112) over the same reflected tables. Folding the per-registry missing checks into that checklist would remove a parallel gate, but it would lose their targeted messages.

<sub>Reported by: concern:feature-skeleton.</sub>

<a id="p348"></a>

## P348: Add per-domain test fixture builders for wormhole sites, industry jobs and mapper chain/layout facts

- **Status:** [ ] not started
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** low · **Payoff:** low · **Size:** About -430 lines across about 35 test files and +120 lines in 4 fixture modules: roughly -300 net
- **Depends on:** —
- **Existing primitive:** `src/mapper/chain/__tests__/connection-editor-fixture.ts:connectionEditorFixture`

**Problem.** Domain objects are rebuilt by hand in about 35 test files, with drifting defaults. Adding a required field to SiteDetail means 11 edits today, and IndustryJob needs 9. Specifically:
- SiteDetail: 11 builders (SiteCard, SiteCardHeader, site-card-header-view, site-details-view, site-meta, sort, site-social-card, dev-sample, live-prices, npc-summary, app/(site)/sites/[id]/page.test).
- SiteResource: 5 builders. Wave: 3.
- IndustryJob: 9 builders, three of them identical.
- Mapper LayoutFacts facts(): 4 copies. ChainSnapshot snapshot(): 3 copies. The PlacementAssigner test double sequentialTestAssigner: 2 copies that have drifted.

Two copies encode wrong data: site-meta casts partial waves with `as SiteDetail['waves']`, and site-live-context's default resource breaks the production effectiveIsk invariant.

**Verifier revision.** The core holds. The three IndustryJob builders in job-state, live-derive and job-view are byte-identical. reconciler.test.ts and reconciler-compat.test.ts carry identical snapshot() builders, and properties.test.ts and stability.test.ts carry identical facts(). Eleven SiteDetail builders drift only in their defaults. Fallow's clone check never sees any of this, because .fallowrc.json duplicates.ignore excludes **/*.test.ts. The scope and homes need correcting. The finders missed sites: 2 more SiteResource builders, 3 Wave builders, 4 more IndustryJob builders, a SiteDetail literal in app/(site)/sites/[id]/page.test.ts, factsOf() in reconciler-compat, and a drifted sequentialTestAssigner pair. LayoutFacts belongs under mapper/layout/__tests__ (next to determinism-fixture.ts), not under mapper/chain. Several look-alike builders are a different type and must stay out (SiteSearchEntry, SiteListItem, Convex page rows, the raw ESI payload). There is also one real drift: the SiteResource effectiveIsk invariant.

**Sites (32).**

- [`src/features/wormhole-sites/components/SiteCard.test.ts:45-57`](../../src/features/wormhole-sites/components/SiteCard.test.ts#L45-L57) — SiteDetail builder: id 42, relic/C1, blueLootIsk 12_800_000
- [`src/features/wormhole-sites/components/SiteCardHeader.test.ts:20-32`](../../src/features/wormhole-sites/components/SiteCardHeader.test.ts#L20-L32) — Same as SiteCard except id 1
- [`src/features/wormhole-sites/components/site-card-header-view.test.ts:5-18, 20-33, 35-48`](../../src/features/wormhole-sites/components/site-card-header-view.test.ts#L5-L18) — Wave, SiteDetail (combat/C5, blueLoot 12M) and positional SiteResource(name) builders
- [`src/features/wormhole-sites/components/site-details-view.test.ts:5-18`](../../src/features/wormhole-sites/components/site-details-view.test.ts#L5-L18) — SiteDetail builder, blueLootIsk null
- [`src/features/wormhole-sites/site-meta.test.ts:5-20, 28, 40`](../../src/features/wormhole-sites/site-meta.test.ts#L5-L20) — makeSite; partial waves cast `as SiteDetail['waves']` (unsafe)
- [`src/features/wormhole-sites/sort.test.ts:5-15, 17-31`](../../src/features/wormhole-sites/sort.test.ts#L5-L15) — makeWave plus makeSite that requires siteType
- [`src/features/wormhole-sites/site-social-card.test.ts:5-20`](../../src/features/wormhole-sites/site-social-card.test.ts#L5-L20) — site() with id 100, 'Core Garrison', blueLoot 125.4M (asserted)
- [`src/features/wormhole-sites/dev-sample.test.ts:6-21`](../../src/features/wormhole-sites/dev-sample.test.ts#L6-L21) — makeSite
- [`src/features/wormhole-sites/live-prices.test.ts:19-43, 45-63`](../../src/features/wormhole-sites/live-prices.test.ts#L19-L43) — Positional resource(id, values), which derives effectiveIsk from totalIsk (correct invariant); positional gas site(id, resources, resourceValueIsk)
- [`src/features/wormhole-sites/npc-summary.test.ts:5-25, 27-41, 43-57`](../../src/features/wormhole-sites/npc-summary.test.ts#L5-L25) — mkNpc, mkWave (null EW fields), positional mkSite(waves). Missed by the finders
- [`src/app/(site)/sites/[id]/page.test.ts:72-84`](../../src/app/%28site%29/sites/[id]/page.test.ts#L72-L84) — Inline SiteDetail literal with 'as const' casts. app zone. Missed by the finders
- [`src/features/wormhole-sites/components/resource-row-view.test.ts:9-23`](../../src/features/wormhole-sites/components/resource-row-view.test.ts#L9-L23) — SiteResource builder
- [`src/features/wormhole-sites/components/site-live-context.test.ts:6-22, 32-40`](../../src/features/wormhole-sites/components/site-live-context.test.ts#L6-L22) — SiteResource builder with effectiveIsk 5000 while liveIsk and totalIsk are null (drifted from the invariant; the test deliberately exercises the static seed). Missed by the finders
- [`src/features/wormhole-sites/live-recipes-for-search.test.ts:5-21`](../../src/features/wormhole-sites/live-recipes-for-search.test.ts#L5-L21) — SiteResource gas builder. Missed by the finders
- [`src/features/wormhole-sites/live-prices.ts:30-31`](../../src/features/wormhole-sites/live-prices.ts#L30-L31) — Production invariant effectiveIsk = liveIsk ?? totalIsk (also queries.ts:263, which sets effectiveIsk to totalIsk)
- [`src/features/industry-jobs/job-state.test.ts:7-19, 50`](../../src/features/industry-jobs/job-state.test.ts#L7-L19) — Canonical job() builder. Line 50 relies on the default dates (progress 50%)
- [`src/features/industry-jobs/live-derive.test.ts:8-20`](../../src/features/industry-jobs/live-derive.test.ts#L8-L20) — Identical to job-state
- [`src/features/industry-jobs/job-view.test.ts:16-28, 32, 63, 117`](../../src/features/industry-jobs/job-view.test.ts#L16-L28) — Identical to job-state; asserts on default product 587 ('Type #587')
- [`src/features/industry-jobs/slots.test.ts:9-20`](../../src/features/industry-jobs/slots.test.ts#L9-L20) — Variant that requires job_id and activity_id; bp 999, runs 1
- [`src/features/industry-jobs/flatten-jobs.test.ts:5-16`](../../src/features/industry-jobs/flatten-jobs.test.ts#L5-L16) — Variant that requires job_id and end_date. Missed by the finders
- [`src/features/industry-jobs/corp-refresh.test.ts:19-30`](../../src/features/industry-jobs/corp-refresh.test.ts#L19-L30) — Variant: bp 100, 1-hour job. Missed by the finders
- [`src/features/industry-jobs/components/JobsCard.test.ts:15-26`](../../src/features/industry-jobs/components/JobsCard.test.ts#L15-L26) — Variant: NOW-relative dates, installer_id 7, bp 688, product 638. Missed by the finders
- [`src/components/composition/industry-workspace/workspace-model.test.ts:25-36`](../../src/components/composition/industry-workspace/workspace-model.test.ts#L25-L36) — Positional job(job_id, activity_id, status, installer_id)
- [`src/components/composition/industry-workspace/ProfileWorkspace.test.ts:110-124`](../../src/components/composition/industry-workspace/ProfileWorkspace.test.ts#L110-L124) — Inline IndustryJob rows inside jobsFor(). Missed by the finders
- [`src/mapper/layout/properties.test.ts:11-22`](../../src/mapper/layout/properties.test.ts#L11-L22) — facts(systemIds, connections)
- [`src/mapper/layout/stability.test.ts:27-38`](../../src/mapper/layout/stability.test.ts#L27-L38) — Identical facts()
- [`src/mapper/layout/facts.test.ts:11-24`](../../src/mapper/layout/facts.test.ts#L11-L24) — Superset: connections default [], optional rootSystemId
- [`src/mapper/layout/reconciler-compat.test.ts:18-33, 165-176`](../../src/mapper/layout/reconciler-compat.test.ts#L18-L33) — snapshot(), identical to reconciler.test; nested factsOf(), identical to properties facts(). factsOf missed by the finders
- [`src/mapper/chain/reconciler.test.ts:8-38, 52-67`](../../src/mapper/chain/reconciler.test.ts#L8-L38) — positionOfSlot, slotOfPosition and an occupancy-aware sequentialTestAssigner; snapshot() with a complete flag
- [`src/mapper/chain/nodes.test.ts:24-40, 54-59`](../../src/mapper/chain/nodes.test.ts#L24-L40) — Drifted sequentialTestAssigner that ignores occupied slots; snapshot() variant without the complete flag
- [`src/mapper/chain/__tests__/connection-editor-fixture.ts:1-60`](../../src/mapper/chain/__tests__/connection-editor-fixture.ts#L1-L60) — Precedent: a shared mapper test fixture used by 12 test files
- [`src/mapper/layout/__tests__/determinism-fixture.ts:1-14`](../../src/mapper/layout/__tests__/determinism-fixture.ts#L1-L14) — Precedent for a mapper/layout/__tests__ fixture module

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/features/wormhole-sites/related-sites.test.ts:5-18`](../../src/features/wormhole-sites/related-sites.test.ts#L5-L18) — Builds SiteSearchEntry (a search-index projection), not SiteDetail
- [`src/features/wormhole-sites/search.test.ts:5-11`](../../src/features/wormhole-sites/search.test.ts#L5-L11) — SiteSearchEntry builder; different type
- [`src/features/wormhole-sites/queries.test.ts:53-69`](../../src/features/wormhole-sites/queries.test.ts#L53-L69) — siteRow builds SiteListItem (a DB row without waves or resources); different type
- [`src/features/wormhole-sites/mock-data.ts:1-140`](../../src/features/wormhole-sites/mock-data.ts#L1-L140) — Production preview dataset with a global mutable id counter and derived EW and EHP totals. Not a test fixture; do not reuse it or clone it
- [`src/composition/search/scope-equivalence.test.ts:30-33`](../../src/composition/search/scope-equivalence.test.ts#L30-L33) — Search-entry literals, not SiteDetail
- [`src/features/industry-jobs/refresh.test.ts:9-19`](../../src/features/industry-jobs/refresh.test.ts#L9-L19) — esiJob is a raw ESI wire payload fed through the parser. It must stay an independent literal, not the projected type
- [`src/composition/board/board-assemble.test.ts:117-123`](../../src/composition/board/board-assemble.test.ts#L117-L123) — Inline job rows whose dates are themselves the fields under test. Migrating them is optional
- [`src/mapper/chain/use-map-chain.test.ts:46-60, 181-189`](../../src/mapper/chain/use-map-chain.test.ts#L46-L60) — systems() and connections() build Convex page rows with _id and deletedAt, a different shape from ChainSnapshot; factsFromSnapshot is a single converter
- [`src/mapper/chain/seat-order.test.ts:87-105`](../../src/mapper/chain/seat-order.test.ts#L87-L105) — snapshotOf converts SeatOrderedInput. It is a converter, not a builder

</details>

**Home.** `src/features/wormhole-sites/__tests__/site-fixtures.ts; src/features/industry-jobs/__tests__/job-fixture.ts; src/mapper/layout/__tests__/layout-facts-fixture.ts; src/mapper/chain/__tests__/chain-snapshot-fixture.ts`

**Boundary check.** Each fixture sits in its owning zone, which every consumer may import.
- site-fixtures.ts is in the auto-discovered features zone (features/wormhole-sites). Its consumers are the same zone and src/app/(site)/sites/[id]/page.test.ts, which is in the app zone. The app rule allows "features".
- job-fixture.ts is in features/industry-jobs. Its consumers are the same zone; src/components/composition/industry-workspace/*.test.ts, whose components-composition rule allows "features"; and optionally src/composition/board/board-assemble.test.ts, whose composition rule allows "features".
- Both mapper fixtures are in the single mapper zone (src/mapper/**), so every mapper test may import them.
- No feature imports another feature. The features rule omits "features", and each fixture stays inside its own feature.
- __tests__/ files are excluded from coverage by vitest's coverageConfigDefaults.exclude (vitest.config.ts:24), as the existing connection-editor-fixture.ts already relies on.

**API sketch.**

```ts
// wormhole-sites/__tests__/site-fixtures.ts
export function siteDetail(over: Partial<SiteDetail> = {}): SiteDetail; // neutral: id 1, 'Test Site', combat, C5, 'ABC-123', 'Sheet', null ISK fields, [] waves/resources
export function siteResource(over: Partial<SiteResource> = {}): SiteResource; // effectiveIsk defaults to (over.liveIsk ?? over.totalIsk ?? null) unless given
export function siteWave(over: Partial<Wave> = {}): Wave;
// industry-jobs/__tests__/job-fixture.ts
export function industryJob(over: Partial<IndustryJob> = {}): IndustryJob; // defaults = the job-state/live-derive/job-view triplet
// mapper/layout/__tests__/layout-facts-fixture.ts
export function layoutFacts(systemIds: readonly number[], connections: readonly (readonly [number, number])[] = [], rootSystemId?: number): LayoutFacts;
// mapper/chain/__tests__/chain-snapshot-fixture.ts
export function chainSnapshot(systemIds: readonly number[], connections: readonly ConnectionRow[] = [], complete: { systems?: boolean; connections?: boolean } = {}): ChainSnapshot;
export function positionOfSlot(slot: number): ChainPosition;
export const sequentialTestAssigner: PlacementAssigner; // occupancy-aware version from reconciler.test.ts
```

**Migration steps.**

1. Mapper layout. Create src/mapper/layout/__tests__/layout-facts-fixture.ts with the facts.test.ts superset (connections default [], optional rootSystemId). Migrate properties.test.ts 11-22, stability.test.ts 27-38, facts.test.ts 11-24 and the nested factsOf in reconciler-compat.test.ts 165-176, then delete the local copies. Optionally migrate the inline facts at nodes.test.ts ~251-260.
2. Mapper chain. Create src/mapper/chain/__tests__/chain-snapshot-fixture.ts holding chainSnapshot (the reconciler.test.ts 52-67 form), positionOfSlot, a private slotOfPosition and the occupancy-aware sequentialTestAssigner from reconciler.test.ts 8-38. Migrate reconciler.test.ts, reconciler-compat.test.ts 18-33 and nodes.test.ts 24-40 and 54-59, then delete the local copies.
3. Industry jobs. Create src/features/industry-jobs/__tests__/job-fixture.ts. Copy the defaults of the identical job-state/live-derive/job-view triplet exactly: job_id 1, activity 1, bp 691, product 587, runs 10, active, 2026-06-12T00:00Z to 2026-06-13T00:00Z. job-state.test.ts:50 and job-view.test.ts:63 depend on those defaults. Replace the triplet first.
4. Migrate the IndustryJob variants by passing their differing fields explicitly: slots (job_id, activity_id), flatten-jobs (job_id, end_date), corp-refresh, JobsCard (installer_id 7, bp 688, product 638, runs 2, NOW-relative dates; keep a 1-line local wrapper if it reads better), workspace-model (positional call becomes industryJob({ job_id, activity_id, status, installer_id })) and ProfileWorkspace.test.ts 115-123. Leave refresh.test.ts esiJob as it is.
5. Wormhole sites. Create src/features/wormhole-sites/__tests__/site-fixtures.ts with siteDetail, siteResource and siteWave. siteResource derives effectiveIsk as liveIsk ?? totalIsk, matching live-prices.ts:30 and queries.ts:263.
6. Migrate the SiteDetail sites. Each test now states any field its assertions read. SiteCard and SiteCardHeader pass name 'Forgotten Perimeter Coronation Platform', relic, C1 and blueLootIsk 12_800_000. site-social-card passes id 100, 'Core Garrison', signatureLabel, sourceTab and blueLoot. site-card-header-view passes blueLootIsk 12_000_000. live-prices and npc-summary keep 1-line positional wrappers over siteDetail. Replace the `as SiteDetail['waves']` casts in site-meta.test.ts 28 and 40 with siteWave() calls.
7. Migrate the SiteResource builders: site-card-header-view 35-48, resource-row-view 9-23, live-prices 19-43, live-recipes-for-search 5-21 and site-live-context 6-22. site-live-context must pass effectiveIsk: 5000 explicitly, because it tests the static-seed fallback. Migrate the Wave builders in site-card-header-view 5-18, sort 5-15 and npc-summary 27-41; npc-summary keeps mkNpc local unless a second Npc builder appears.
8. Finally migrate src/app/(site)/sites/[id]/page.test.ts 72-84 to siteDetail({...}) and drop the 'as const' casts. Run pnpm check through test-runner after each of the three domains.

**Tests.** This changes only test-support files; no new behavioral tests. Every migrated test file must stay green with identical assertions. These guard the defaults that change: job-state.test.ts (jobProgress 50 at line 50), job-view.test.ts ('Type #587' at line 63), SiteCard/SiteCardHeader name and blue-loot rendering, site-social-card content, live-prices overlay sums (effectiveIsk derivation), site-live-context static-seed cases, reconciler.test.ts positions (positionOfSlot(0) at 111, 253, 378, 405) and nodes.test.ts node positions at 76 and 91. Fallow must stay clean: the fixtures are not *.test.ts, so they fall under duplicate detection. Keep them structurally unlike mock-data.ts.

**Notes.** Behavior the migration must preserve:
(a) Many tests assert on builder defaults, such as a site name, a blue-loot value, product 587 or the default job dates. Pick neutral fixture defaults and make each test state the fields it reads. The exception is IndustryJob: its fixture copies the identical triplet's defaults so those three files need no new overrides.
(b) SiteResource effectiveIsk must follow the production invariant effectiveIsk = liveIsk ?? totalIsk. live-prices.test.ts is the correct copy. site-live-context.test.ts's default breaks the invariant, but it is deliberate input there, so pass it explicitly.
(c) The two sequentialTestAssigner copies drifted. reconciler.test.ts 20-38 skips slots taken by already-placed systems; nodes.test.ts 28-40 does not. Every nodes.test.ts call starts from EMPTY_CHAIN_STATE, so the occupancy-aware reconciler version is a safe superset and is the correct one.
(d) The nodes.test snapshot() lacks the complete flag. The shared one defaults both flags to true, so nothing changes.
(e) sort.test makeSite and slots/flatten-jobs job() require certain fields at the type level. That strictness is lost; callers already pass those fields.
(f) Wave EW fields default to 0 in three copies and null in npc-summary. Choose one, and have tests that assert EW chips state their values.

Land this as three independent commits (mapper, industry-jobs, wormhole-sites); none depends on another.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p338"></a>

## P338: Extract the shared stateful hook runtime that ~10 hook tests hand-roll, and leave the scripted single-purpose React fakes local

- **Status:** [ ] not started
- **Category:** testing · **Kind:** missing-primitive · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** about -150 across 10 test files / about +70 helper and +60 helper test
- **Depends on:** —
- **Existing primitive:** `src/lib/__tests__/module-path.ts (existing lib test-helper home; no hook runtime exists yet)`

**Problem.** Hook and component tests run without a DOM by mocking 'react'. About ten of them re-implement the same small stateful runtime: useState slots persisted by call order (some with lazy init and functional updates, some without), useMemo and useEffect with deps compared by Object.is, cleanup run before re-run, a per-render cursor reset, and a remount helper. The copies use different state shapes (h.states/h.stateCursor, h.slot(), mocks.cursor, hooks.cursor plus effectCursor). Fallow skips test files for duplicate detection, so nothing stops the copies multiplying, and each new hook test copies whichever variant is nearest.

**Verifier revision.** The 38-file framing and the drift claims do not survive. Most of the 38 react mocks are deliberately scripted single-purpose fakes: a useRef that returns a fixed DOM stub, effects gated by a flag, preset state with vi.fn setter spies that the tests assert on, or a hydration switch for useSyncExternalStore. A general runtime would not serve them. The cited drift is harmless. use-industry-profiles.ts has exactly one useEffect (79-81), which returns nothing, and it never calls setState with a function, so the shared-effectDeps fake is enough. use-settled-margin.ts:12 calls useState(live), which is not lazy. The vi.fn setters in the refresh-on-view and use-live-dataset tests are intentional spies. Each hook is tested by one file, so nothing shows a hook passing under one fake and failing under another. The proposed reference is also wrong: use-planner-profile has no lazy init (33) and crashes on undefined deps (`deps.every`). What is real is a cluster of about 10 files, each hand-building the same stateful hook runtime: slots by call order, cursors reset per render, deps compared with Object.is, cleanup before re-run. Two of them label it 'A tiny hook runtime', and use-account-characters and use-slots-live are verbatim copies. Fallow's duplicates config ignores **/*.test.ts, so CI never flags these copies.

**Sites (11).**

- [`src/features/industry-planner/components/use-planner-profile.test.ts:10-28, 30-55, 159-164, 166-180`](../../src/features/industry-planner/components/use-planner-profile.test.ts#L10-L28) — Per-kind slots, functional updates, deps-checked effects with cleanup and memo. No lazy init, and `deps.every` crashes on undefined deps
- [`src/mapper/windows/MapWindowLayer.card.test.ts:4-24, 27-41, 64-66`](../../src/mapper/windows/MapWindowLayer.card.test.ts#L4-L24) — Comment says 'A tiny hook runtime'. Unified slot(), effect() with optional deps (re-runs when deps are undefined), cleanup before re-run. Its effect semantics are the reference
- [`src/features/custom-structures/components/StructureComposer.actions.test.ts:15-21, 23-38, 89-96`](../../src/features/custom-structures/components/StructureComposer.actions.test.ts#L15-L21) — Lazy init plus functional updates; this is the reference useState. Effects run every call and push cleanups
- [`src/features/industry-planner/profiles/use-industry-profiles.test.ts:6-14, 16-36, 52-56`](../../src/features/industry-planner/profiles/use-industry-profiles.test.ts#L6-L14) — Indexed state, deps-checked memo, one shared effectDeps. Enough for its single-effect hook
- [`src/features/industry-planner/components/use-planner-location-writes.test.ts:6-11, 12-22, 45-48`](../../src/features/industry-planner/components/use-planner-location-writes.test.ts#L6-L11) — Same state slots with functional updates as use-planner-profile
- [`src/features/industry-planner/components/use-component-fee-sources.test.ts:6-12, 14-21, 55-56, 114-174`](../../src/features/industry-planner/components/use-component-fee-sources.test.ts#L6-L12) — `cursor++ % 2` slot hack; the tests seed h.states[1] directly, so the runtime must expose state slots
- [`src/components/composition/map/MapMenu.test.ts:6-14, 18-25, 72-76`](../../src/components/composition/map/MapMenu.test.ts#L6-L14) — State slots over the real React (spreads importOriginal) with renderToStaticMarkup
- [`src/components/composition/industry-workspace/FacilitiesPanel.test.ts:5-10, 12-27, 49-62`](../../src/components/composition/industry-workspace/FacilitiesPanel.test.ts#L5-L10) — Ref slots plus a deps-checked useLayoutEffect with cleanup; useState is a stateless vi.fn, so migrate this one last
- [`src/components/use-account-characters.test.ts:4-19, 31-35, 47-49`](../../src/components/use-account-characters.test.ts#L4-L19) — Single-slot deps-checked useEffect with cleanup, remount(), settle()
- [`src/features/industry-jobs/use-slots-live.test.ts:5-19, 25-29`](../../src/features/industry-jobs/use-slots-live.test.ts#L5-L19) — Verbatim copy of the use-account-characters fake and remount()
- [`src/components/ui/loading-toast.test.ts:4-37`](../../src/components/ui/loading-toast.test.ts#L4-L37) — Comment says 'A tiny hook runtime' (slot() helper). In the ui zone, which allows no imports, so it must stay local

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/data/market-history/use-refresh-on-view.test.ts:10-21, 35-44`](../../src/data/market-history/use-refresh-on-view.test.ts#L10-L21) — vi.fn setters are deliberate spies read via mounted(); a stateful runtime would change what the tests assert
- [`src/data/market-prices/use-refresh-on-view.test.ts:8-19`](../../src/data/market-prices/use-refresh-on-view.test.ts#L8-L19) — Same deliberate spy-setter style
- [`src/components/use-live-dataset.test.ts:14-37`](../../src/components/use-live-dataset.test.ts#L14-L37) — Preset state plus spy setters asserted by the tests; not a state runtime
- [`src/features/feedback/components/FeedbackModal.test.ts:11-21`](../../src/features/feedback/components/FeedbackModal.test.ts#L11-L21) — Preset indexed values with spy setters
- [`src/features/industry-planner/components/use-settled-margin.test.ts:5-10`](../../src/features/industry-planner/components/use-settled-margin.test.ts#L5-L10) — Counts set calls (h.set). The hook's useState(live) is not lazy, so the 'no lazy init' drift does not matter
- [`src/features/industry-planner/components/use-settled-hover.test.ts:3-13`](../../src/features/industry-planner/components/use-settled-hover.test.ts#L3-L13) — Single scripted state plus an external ref
- [`src/components/composition/board/HomeBoardView.test.ts:19-22`](../../src/components/composition/board/HomeBoardView.test.ts#L19-L22) — ViewTransition one-line stub. npm react 19.2.8 lacks the export, but importing a shared stub inside a mock factory would cost more lines than it saves
- [`src/components/composition/board/HomeBoardView.focus.test.ts:14-25`](../../src/components/composition/board/HomeBoardView.focus.test.ts#L14-L25) — Scripted: no-op setters, no-op useEffect, captured layout effect
- [`src/components/composition/industry-workspace/IndustryShell.test.ts:33-42`](../../src/components/composition/industry-workspace/IndustryShell.test.ts#L33-L42) — Flag-gated effects plus the ViewTransition stub
- [`src/components/composition/industry-workspace/ProfileWorkspace.test.ts:27-30`](../../src/components/composition/industry-workspace/ProfileWorkspace.test.ts#L27-L30) — ViewTransition stub only
- [`src/components/composition/industry-workspace/StructuresManager.test.ts:30-33`](../../src/components/composition/industry-workspace/StructuresManager.test.ts#L30-L33) — Flag-gated effects
- [`src/mapper/canvas/SystemNode.hover.test.ts:13-23`](../../src/mapper/canvas/SystemNode.hover.test.ts#L13-L23) — Fixed DOM ref and context, scripted hover state
- [`src/mapper/windows/SystemIntelligenceBody.effect.test.ts:8-14`](../../src/mapper/windows/SystemIntelligenceBody.effect.test.ts#L8-L14) — Wraps the real useState
- [`src/features/industry-planner/recent-blueprints.test.ts:5-10`](../../src/features/industry-planner/recent-blueprints.test.ts#L5-L10) — Hydration switch for useSyncExternalStore
- [`src/components/ui/url-sync.test.ts:10-16`](../../src/components/ui/url-sync.test.ts#L10-L16) — Fixed root ref; ui zone
- [`src/mapper/windows/MapWindow.input.test.ts:7-12`](../../src/mapper/windows/MapWindow.input.test.ts#L7-L12) — Fixed DOM ref, effects always run

</details>

**Home.** `src/lib/__tests__/hook-runtime.ts (next to the existing lib test helper module-path.ts)`

**Boundary check.** The lib zone may import only config, and the helper imports only vitest and `import type` from react (npm packages, not zones). Consumers: features/* (the features rule allows lib), components (src/components/*.ts; the components rule allows lib), components-composition (allows lib), mapper (allows lib). The ui zone (allow: []) cannot import it, so loading-toast.test.ts and url-sync.test.ts stay local. There is precedent for vitest-importing helpers under __tests__ (src/db/__tests__/support/db-test-harness.ts) and for an `@/lib/__tests__` helper imported across zones (module-path.ts, used by composition, esi-datasets and db).

**API sketch.**

```ts
export interface HookRuntime {
  react: {
    useState<T>(init: T | (() => T)): [T, (next: T | ((prev: T) => T)) => void];
    useRef<T>(initial: T): { current: T };
    useMemo<T>(make: () => T, deps?: readonly unknown[]): T;
    useCallback<T>(fn: T, deps?: readonly unknown[]): T;
    useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void; // runs synchronously at call, like today's fakes
    useLayoutEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
    useSyncExternalStore<T>(subscribe: unknown, getSnapshot: () => T): T;
  };
  render<R>(component: () => R): R; // resets per-kind cursors, then calls
  unmount(): void;                  // runs live cleanups, clears all slots (remount)
  readonly states: unknown[];       // i-th useState slot, for tests that seed or inspect state
}
export function createHookRuntime(): HookRuntime;
export const settle: () => Promise<void>; // setTimeout(0) flush, only if adopted by >=2 consumers
// Usage: import { createHookRuntime } from '@/lib/__tests__/hook-runtime';
// const rt = await vi.hoisted(async () => (await import('@/lib/__tests__/hook-runtime')).createHookRuntime());
// vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), ...rt.react }));
```

**Migration steps.**

1. Have docs-researcher (Vitest 4.1) confirm the async vi.hoisted plus dynamic-import pattern, and that a helper loaded from inside the vi.mock('react') factory is not itself subject to the mock. The helper must use only `import type` from 'react', or it will recurse into the mocked module.
2. Write hook-runtime.ts with per-kind cursors (so states[i] is the i-th useState, which use-component-fee-sources needs). useState from StructureComposer (lazy init plus functional update). Effects from MapWindowLayer.card: per-slot deps, re-run when deps are undefined or any dep differs by Object.is or the length changes, previous cleanup first. useMemo with the same deps rule.
3. Add src/lib/__tests__/hook-runtime.test.ts pinning lazy init, functional updates, deps compare including undefined deps, cleanup-before-rerun, unmount running cleanups, and render resetting cursors.
4. Migrate use-account-characters.test.ts and use-slots-live.test.ts first; they are verbatim copies with the smallest surface. remount() becomes rt.unmount().
5. Migrate the planner cluster: use-planner-profile, use-industry-profiles, use-planner-location-writes, use-component-fee-sources (replace the `% 2` hack and seed via rt.states).
6. Migrate StructureComposer.actions, MapMenu (keeps the real React spread) and MapWindowLayer.card.
7. Migrate FacilitiesPanel last: its stateless vi.fn useState becomes stateful, so check that no render path depends on state not persisting.
8. Delete each file's h.states/cursor/effects fields and per-file reset code as it migrates. Leave the excluded scripted fakes and the ui-zone copies alone.

**Tests.** New: src/lib/__tests__/hook-runtime.test.ts (semantics listed above). Existing guards: every migrated test file must pass unchanged in its assertions. If a stricter runtime (cleanup-before-rerun, per-slot deps) makes a test fail, treat it as a possible hook bug, not as a reason to weaken the runtime. Run focused tests per migrated file through test-runner.

**Notes.** All current fakes run effects synchronously during the hook call rather than after commit; keep that, or the existing tests change meaning. Drift found: use-planner-profile.test.ts:41 and MapWindowLayer.card.test.ts:18 compare deps with `every` and no length check (React re-runs when the length changes); use-planner-profile throws on undefined deps. The runtime should get both right. Two files label their copy 'A tiny hook runtime' (loading-toast:4, MapWindowLayer.card:4), which supports a shared home. Fallow's duplicates.ignore excludes **/*.test.ts, so these clones are invisible to the CI gate.

<sub>Reported by: concern:tests-fixtures.</sub>

<a id="p339"></a>

## P339: Add one source-scan test helper (file listing, route listing, comment strip, pattern match, value-import extraction and resolution) and migrate the rail, census and contract tests to it

- **Status:** [ ] not started
- **Category:** testing · **Kind:** duplicate-implementation · **Verdict:** revised
- **Effort:** M · **Risk:** medium · **Payoff:** medium · **Size:** about -220 across 17 files / about +100 helper and +70 helper test
- **Depends on:** —
- **Existing primitive:** `src/lib/__tests__/module-path.ts:normalizeModulePath`

**Problem.** Gate suites that pin repo-wide invariants (API contracts, authz markers, capability, same-origin and idempotency coverage, vendor resilience, first-party transport, UI adoption, reduced motion, stylesheet contract, widget hosting, server-only boundary, mapper surface, convex module map) each re-implement source discovery with their own extension list, skip set, test-file predicate and path format (absolute, cwd-relative, API-relative, POSIX or not). Three copies of filesMatching differ on resetting RegExp.lastIndex. Comment stripping exists in two strengths, and import extraction and local resolution exist twice with different type-only handling. These are load-bearing gates, so each divergence is a chance for one gate to quietly scan a different surface than its neighbours.

**Verifier revision.** The duplication is real and wider than cited. Fifteen test and helper files each hand-write a recursive readdirSync walker; three more define filesMatching(pattern), five comment strippers exist, and five route walkers exist. Two sites the finders missed: stylesheet-contract.test.ts and the codeOnly stripper in convex/mapChain.test.ts. Fallow ignores *.test.ts for duplicates, so CI never sees these. Several drift claims are only latent or wrong. (a) There are no route.js/mts/mjs files (find found only 77 route.ts), so the route-pattern split changes no results today. (b) The over-eager `//.*$` strip in ui-adoption matches no current line, since a grep for URL lines carrying the scanned tags or attributes found none. (c) write-sites does handle inline `type` bindings (addNamedBindings skips them at 62). Its .ts-only walk and resolver are by design, because exportsByModule keys come from schema-reflection's `**/schema.ts` glob. So write-sites should adopt only the walker. The import-extraction and resolution part applies to server-only-boundary and widget-host-census only. widget-host-census does count `import { type X }` and `export type {..} from` as value imports, which fails closed. server-only-boundary's isTypeOnlyClause is the correct version.

**Sites (18).**

- [`src/lib/__tests__/module-path.ts:1-9`](../../src/lib/__tests__/module-path.ts#L1-L9) — Existing normalizeModulePath; the home directory
- [`src/lib/server-only-boundary.test.ts:5-7, 144-226`](../../src/lib/server-only-boundary.test.ts#L5-L7) — Canonical isTypeOnlyClause, valueImportSpecifiers (static, side-effect, dynamic, export-from) and resolveLocalImport (base, ext, index). Does not strip comments first
- [`src/composition/__tests__/widget-host-census.ts:9-96`](../../src/composition/__tests__/widget-host-census.ts#L9-L96) — Walker plus skip set, withoutComments (full-line only, correct), IMPORT/EXPORT_FROM/DYNAMIC patterns that treat `{ type X }` and `export type {} from` as value imports, fs-based resolveHostSpecifier
- [`src/esi-datasets/__tests__/write-sites.ts:13-48`](../../src/esi-datasets/__tests__/write-sites.ts#L13-L48) — Walker (.ts only, deliberately) and a .ts-only resolveImportPath matched against reflected schema.ts keys. Keep the resolver and adopt only the walker
- [`src/esi-datasets/ui-adoption.test.ts:8-42, 88-100`](../../src/esi-datasets/ui-adoption.test.ts#L8-L42) — Walker that skips 'ui' dirs (deliberate), filesMatching with an over-eager `//.*$` strip, allStylesheets
- [`src/app/reduced-motion.test.ts:4-15`](../../src/app/reduced-motion.test.ts#L4-L15) — allStylesheets, identical to ui-adoption:88-100
- [`src/app/stylesheet-contract.test.ts:8-12`](../../src/app/stylesheet-contract.test.ts#L8-L12) — Missed site: CSS listing via readdirSync recursive, excludes .module.css
- [`src/esi-datasets/vendor-resilience.test.ts:58-86`](../../src/esi-datasets/vendor-resilience.test.ts#L58-L86) — collectSources over src+convex (keeps __tests__ helpers on purpose; see TEST_SUPPORT_POSTGRES_SITES) and filesMatching with no lastIndex reset (its patterns have no /g today)
- [`src/app/api/first-party-transport.test.ts:19-42`](../../src/app/api/first-party-transport.test.ts#L19-L42) — productionSources (keeps .d.ts and __tests__) and filesMatching that resets lastIndex, needed because its patterns at 11 and 13 have /g
- [`src/esi-datasets/idempotency.test.ts:28-44`](../../src/esi-datasets/idempotency.test.ts#L28-L44) — Route walker, route.ts only, POST filter
- [`src/app/api/api-contracts.test.ts:43-53`](../../src/app/api/api-contracts.test.ts#L43-L53) — findFiles with route.(ts\|js\|mts\|mjs)
- [`src/app/api/authz-markers.test.ts:12-25`](../../src/app/api/authz-markers.test.ts#L12-L25) — Route walker, route.(ts\|js\|mts\|mjs)
- [`src/app/api/capability-coverage.test.ts:31-45`](../../src/app/api/capability-coverage.test.ts#L31-L45) — Route walker, route.ts only, cwd-relative labels
- [`src/app/api/same-origin-coverage.test.ts:120-135`](../../src/app/api/same-origin-coverage.test.ts#L120-L135) — Route walker, route.ts only, mutating-method filter
- [`src/mapper/authoring/surface.test.ts:6-16`](../../src/mapper/authoring/surface.test.ts#L6-L16) — Recursive readdir plus full-line comment strip
- [`src/mapper/chain/surface.test.ts:7-22`](../../src/mapper/chain/surface.test.ts#L7-L22) — Same, plus a `__tests__/` filter applied before backslash normalisation
- [`convex/__tests__/modules.test.ts:5-23, 36-55`](../../convex/__tests__/modules.test.ts#L5-L23) — Two walkers in one file; the first rewrites paths to a '../' prefix
- [`convex/mapChain.test.ts:535-537`](../../convex/mapChain.test.ts#L535-L537) — Missed site: codeOnly(), the same full-line comment strip

<details><summary>Excluded sites (not the same concept)</summary>

- [`src/esi-datasets/__tests__/write-sites.ts:43-48, 50-91`](../../src/esi-datasets/__tests__/write-sites.ts#L43-L48) — resolveImportPath and buildSymbolTable parse binding clauses against reflected schema.ts exports. That is a different job from listing module edges, and the .ts-only resolution is correct for it
- [`src/esi-datasets/dataset-declarations.test.ts:265-269`](../../src/esi-datasets/dataset-declarations.test.ts#L265-L269) — A flat readdirSync('drizzle') of .sql migrations, not a recursive source walk
- [`src/db/__tests__/support/schema-reflection.ts:5-9`](../../src/db/__tests__/support/schema-reflection.ts#L5-L9) — Uses import.meta.glob for module loading, not a file walk
- [`scripts/assert-routes-present.mjs:(whole file)`](../../scripts/assert-routes-present.mjs) — A Node .mjs script outside src that cannot import TS test helpers through the alias

</details>

**Home.** `src/lib/__tests__/source-scan.ts (next to module-path.ts)`

**Boundary check.** The lib zone may import only config; source-scan uses node:fs and node:path plus ./module-path, all inside lib. Consumers: app (reduced-motion, stylesheet-contract; the app rule allows lib), api (api-contracts, authz-markers, capability-coverage, same-origin-coverage, first-party-transport; the api rule allows lib), composition (widget-host-census; allows lib), esi-datasets (ui-adoption, vendor-resilience, idempotency, write-sites; allows lib), mapper (surface tests; allows lib), convex (modules.test.ts, mapChain.test.ts; the convex rule allows lib, and convex tests already import '@/lib/...', e.g. convex/engine.test.ts:11), lib (server-only-boundary.test.ts, same zone).

**API sketch.**

```ts
export interface ListSourceOptions {
  roots: readonly string[];                 // repo-relative, e.g. ['src','convex']
  extensions: readonly string[];            // e.g. ['.ts','.tsx'] or ['.css']
  skipDirectories?: readonly string[];      // directory names never descended
  skipSuffixes?: readonly string[];         // e.g. ['.test.ts','.test.tsx','.d.ts']
}
export function listSourceFiles(o: ListSourceOptions): string[];   // POSIX, repo-relative, sorted; withFileTypes walk so skipped dirs are not entered
export const ROUTE_FILE: RegExp;                                       // /^route\.(?:ts|js|mts|mjs)$/
export function listRouteFiles(apiRoot?: string): string[];          // default 'src/app/api'
export function stripComments(source: string): string;               // block comments + full-line // only
export function filesMatching(files: readonly string[], pattern: RegExp, read?: (f: string) => string): string[]; // resets lastIndex
export function valueImportSpecifiers(source: string): string[];     // lifted from server-only-boundary (type-only aware, side-effect, dynamic, export-from)
export function resolveLocalImport(fromFile: string, specifier: string, exists: (path: string) => boolean, extensions?: readonly string[]): string | null; // '@/' and relative; base, base+ext, base/index+ext via normalizeModulePath
```

**Migration steps.**

1. Write source-scan.ts. Lift isTypeOnlyClause, valueImportSpecifiers and resolveLocalImport from server-only-boundary.test.ts:165-226, generalising the resolver to take an `exists` predicate (Map.has for server-only-boundary, an isFile check for widget-host-census). Export only what a consumer uses, because fallow's unused-exports rule is set to error.
2. Add src/lib/__tests__/source-scan.test.ts. Pin: `import { type A }` and `export type {..} from` are not value imports while `{ type A, B }` is; side-effect and dynamic imports are found; stripComments keeps 'https://x' inside strings; filesMatching works with /g patterns across files; output is POSIX and sorted; a skipped directory is never entered.
3. Before migrating each consumer, capture its current file list or count. After migrating, the list must be identical; any delta is a real finding to investigate, not something to re-baseline.
4. Route walkers: switch idempotency, api-contracts, authz-markers, capability-coverage and same-origin-coverage to listRouteFiles(), keeping each file's own method filter and its label format (API-relative or repo-relative).
5. CSS: switch ui-adoption:88-100, reduced-motion:4-15 and stylesheet-contract:8-12 to listSourceFiles({ roots:['src'], extensions:['.css'] }). stylesheet-contract keeps its .module.css and entry exclusions.
6. Production-source walkers, each passing its current skip set explicitly: ui-adoption (adds 'ui', and switches its strip to stripComments), vendor-resilience (src+convex, keeps __tests__), first-party-transport (decide explicitly whether .d.ts stays in scope; count check at 45-47), mapper surfaces (root = their dir), convex/modules (map to the '../' prefix afterwards), write-sites (walker only, .ts only).
7. Imports: replace widget-host-census's withoutComments, IMPORT/EXPORT_FROM/DYNAMIC patterns, importSpecifiers and resolveHostSpecifier with valueImportSpecifiers(stripComments(src)) and resolveLocalImport(..., isFile). server-only-boundary imports the lifted functions; consider stripping comments before extraction there too.
8. Delete each local copy as it migrates. Keep module-path.ts as is, or fold it into source-scan only if every importer moves.

**Tests.** New: src/lib/__tests__/source-scan.test.ts (cases above). Existing guards: every migrated gate suite (api-contracts, authz-markers, capability-coverage, same-origin-coverage, idempotency, first-party-transport, vendor-resilience, ui-adoption, reduced-motion, stylesheet-contract, server-only-boundary, widget-host-registry.test.ts, write-sites.test.ts, dataset-declarations.test.ts, mapper/*/surface.test.ts, convex/__tests__/modules.test.ts) must pass with unchanged expected lists. The vacuity guards (authz-markers 'finds at least one route', first-party-transport '> 500 sources', mapper 'walks the whole mapper zone') must stay.

**Notes.** Correct copies: import extraction and resolution follow server-only-boundary:165-226. Comment stripping follows the full-line form (widget-host-census:53, mapper surfaces, convex/mapChain.test.ts:536), not ui-adoption:37-38, whose `//.*$` would delete URL text and anything after it on the line; that risk is latent, with no current match. Route discovery follows /^route\.(ts|js|mts|mjs)$/ (api-contracts:53, authz-markers:18), a superset that fails closed; no non-.ts route files exist today. filesMatching must reset lastIndex as first-party-transport:39 does. Scan scopes are deliberate and must stay per-consumer options: ui-adoption skips the 'ui' primitive layer, vendor-resilience and first-party-transport include __tests__ helpers, write-sites is .ts only. widget-host-census treating `{ type X }` as a value import is a real but fail-closed drift; adopting the shared extractor fixes it. Do not use readdirSync({recursive:true}) in the shared walker, since it enters skipped directories; walk with withFileTypes.

<sub>Reported by: concern:feature-skeleton, concern:tests-fixtures.</sub>

← [Wave 1: Quick wins: delete dead code, fix small correctness and perf bugs](wave-01-quick-wins-delete-dead-code-fix-small.md) · [Index](README.md#roadmap) · [Wave 3: src/lib primitives: collections, math, async, errors, browser](wave-03-src-lib-primitives-collections-math-async.md) →
