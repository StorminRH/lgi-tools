export const meta = {
  name: 'primitive-extraction-audit',
  description: 'Audit the codebase for shared-primitive extraction, simplification, efficiency, and duplicated implementations; verify and plan',
  phases: [
    { title: 'Find', detail: 'area finders, cross-cutting concern finders, near-duplicate triage' },
    { title: 'Gaps', detail: 'completeness critic, then targeted gap finders' },
    { title: 'Consolidate', detail: 'merge overlapping findings into opportunities per category bucket' },
    { title: 'Verify', detail: 'adversarial verification and design per opportunity batch' },
    { title: 'Plan', detail: 'sequence confirmed opportunities into waves' },
  ],
}

// Reference copy of the workflow that produced this guide (run 2026-10-09 in a Claude Code
// cloud session). Its paths (REPO /home/user/lgi-tools and the scratchpad S) are that
// container's: change them before re-running. Re-running costs hundreds of agents.

const S = '/tmp/claude-0/-home-user-lgi-tools/b12ce8e0-babf-5711-a0df-e559d035e19f/scratchpad'

const CATEGORIES = ['ui-component', 'css-styling', 'react-hook', 'client-data', 'formatting', 'generic-utility', 'error-handling', 'api-route', 'server-pipeline', 'esi-sync', 'convex', 'persistence', 'contracts-validation', 'feature-skeleton', 'efficiency', 'simplification', 'testing']
const KINDS = ['duplicate-implementation', 'bypasses-existing-primitive', 'missing-primitive', 'simplification', 'efficiency']
const LEVEL = ['high', 'medium', 'low']

const SITE = { type: 'object', properties: { file: { type: 'string' }, lines: { type: 'string' }, note: { type: 'string' } }, required: ['file', 'lines', 'note'] }

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Imperative, e.g. "Extract a shared useInterval hook"' },
          category: { type: 'string', enum: CATEGORIES },
          kind: { type: 'string', enum: KINDS },
          summary: { type: 'string', description: 'What is duplicated or wrong, how the sites differ, and why it matters' },
          sites: { type: 'array', items: SITE, description: 'Every site you verified by reading it. At least 2 for duplication.' },
          existingPrimitive: { type: 'string', description: 'path:export of an existing primitive to reuse, or empty' },
          proposal: { type: 'string', description: 'Primitive or refactor: name, home directory that satisfies .fallowrc.json boundaries for every consumer, API sketch' },
          siteCountEstimate: { type: 'integer' },
          impact: { type: 'string', enum: LEVEL },
          confidence: { type: 'string', enum: LEVEL },
          risks: { type: 'string' },
        },
        required: ['title', 'category', 'kind', 'summary', 'sites', 'existingPrimitive', 'proposal', 'siteCountEstimate', 'impact', 'confidence', 'risks'],
      },
    },
    coverageNotes: { type: 'string', description: 'What you read, what you skipped, and leads you could not finish' },
  },
  required: ['findings', 'coverageNotes'],
}

const PREAMBLE = `You are auditing LGI.tools (an EVE Online multi-tool: a non-standard Next.js App Router version, React, Convex, Drizzle/Postgres, Base UI, React Flow) at /home/user/lgi-tools for PRIMITIVE EXTRACTION opportunities. "Primitive" means any feature, function, hook, component, server pipeline, data access pattern, validator, or test helper that is implemented in several places and should exist once — not only UI primitives. Also report code that bypasses an existing shared primitive, clear simplifications, and real efficiency problems.

Rules:
- READ-ONLY. Do not edit or create files in the repo. Do not run pnpm, builds, tests, or the dev servers. Use Grep, Glob, Read, and read-only shell (grep, rg, find, sed -n, wc).
- Evidence only. Every site you cite must be a real path with a line range you actually read. No speculation. If you only suspect something, put it in coverageNotes as a lead.
- AGENTS.md rule: "Use existing primitives; extract shared code for a real second consumer." Duplication findings need at least 2 real sites. Prefer reusing an existing primitive over inventing a new one.
- Architecture boundaries live in /home/user/lgi-tools/.fallowrc.json (boundaries.zones and boundaries.rules). A proposed primitive must live in a zone that every consumer may import (e.g. src/components/ui may import nothing; src/lib may import only config; src/transport only lib; features may import data, lib, ui, components, platform/*). Say which zone and why it is legal for all consumers.
- Fallow already fails CI on token-identical clones of 50+ tokens, so look for SEMANTIC duplication: the same concept implemented differently, parallel modules with the same shape, ad-hoc local versions of something that has (or deserves) a canonical home, copy-adapted logic with drifted details (drift itself is a finding: note which copy is right).
- Ignore generated code (convex/_generated, drizzle/), docs/, e2e/, and *.d.ts.
- Be exhaustive within your scope, but report only findings worth acting on. Typical output is 6-20 findings. Merge closely related sites into one finding rather than many tiny ones.

Signals you can use (all read-only text files):
- ${S}/primitive-inventory.txt — exported symbols of the existing shared modules (src/lib, src/components/ui, src/components/*, src/transport, src/db, src/config, src/data/convex, src/platform, convex/lib, src/composition/pipelines|sync, src/data/tools). Check it before proposing anything new.
- ${S}/dupes-grouped.txt — fallow semantic near-duplicate groups (identifier-blind, min 30 tokens). Many groups are trivial boilerplate; treat as leads only. grep it for your paths.
- ${S}/health-targets.txt — fallow hotspots and "refactoring-target" lines.
`

const AREA_TASK = `Your scope is the AREA below. Read every non-test source file in it (skim very large ones, but open every file). Look for:
1. logic repeated inside the area;
2. logic in the area that duplicates code elsewhere in the repo (grep the rest of the repo for the same concept and cite those sites too);
3. code in the area that re-implements an existing shared primitive from the inventory;
4. general-purpose code living in the area that other areas also need (or already copied) and should be promoted to a shared zone;
5. simplifications (dead indirection, pass-through wrappers, over-complex functions, near-identical files) and efficiency problems (N+1 reads, sequential awaits that could be concurrent, repeated work, redundant subscriptions or fetches, heavy work on every render).
Skip *.test.ts(x) and __tests__ files; a separate agent covers tests.

AREA:
`

const CONCERN_TASK = `Your scope is ONE CROSS-CUTTING CONCERN across the whole repo (src/, convex/, scripts/). Grep broadly for every implementation of the concern, read each one, and group them. Report places where the concern is implemented more than once, where code bypasses the canonical primitive for it, and where a shared primitive is missing. Skip test files unless your concern is tests.

CONCERN:
`

const AREAS = [
  ['mapper-surface', 'src/mapper/canvas, src/mapper/layout, src/mapper/halo, src/mapper/motion, src/mapper/fog, src/mapper/windows, src/mapper/lib, src/mapper/log, and the files directly in src/mapper/ (index.ts, map-frosted-surface.ts, jump-client.ts).'],
  ['mapper-chain', 'src/mapper/chain, src/mapper/authoring, src/mapper/tracking.'],
  ['mapper-signatures', 'src/mapper/signatures and src/features/maps.'],
  ['app-site', 'src/app/(site)/** (pages, layouts, route-local components and helpers; admin and preview are large), plus src/app/*.tsx|ts files at the app root (layout, not-found, sitemap, robots, opengraph-image, _social-card).'],
  ['app-api', 'src/app/api/** (route handlers and the shared helpers at src/app/api/*.ts such as mutation-route.ts, capability-route.ts, admin-mutation.ts, rate-limit-preflight.ts, market-refresh-route.ts, owned-data-telemetry.ts) plus src/proxy.ts and src/instrumentation*.ts.'],
  ['ui-components', 'src/components/ui/** (the UI primitive layer, including ui/chart) and the shared components directly in src/components/ (*.ts, *.tsx, *.css) and src/components/telemetry. Focus on overlapping primitives (two components doing the same job), primitives with ad-hoc reimplementations elsewhere in the repo (grep consumers), and CSS duplicated across the *.css files.'],
  ['components-composition', 'src/components/composition/** (board, industry-workspace, account, map, telemetry, and the root files).'],
  ['composition', 'src/composition/** (server-side composition: map access, sessions, route guards, sync, pipelines, purge, search, account-lifecycle, board, jump-resolver, signature-elimination, page-settings).'],
  ['convex', 'convex/** excluding convex/_generated (functions, http actions, crons, schema, convex/lib). Read convex/AGENTS.md first for local rules.'],
  ['platform', 'src/platform/** (auth, esi, owner-sync, search, purge, page-settings).'],
  ['industry-planner', 'src/features/industry-planner/** (including components/ and profiles/).'],
  ['features-sites-misc', 'src/features/wormhole-sites, src/features/changelog, src/features/feedback, src/features/search-recents, src/features/net-worth.'],
  ['features-owned', 'src/features/industry-jobs, src/features/skill-queue, src/features/custom-structures, src/features/owned-assets, src/features/owned-blueprints, src/features/owned-structures, src/features/character-sheet. These features share a shape (ESI-backed per-character data); compare them side by side.'],
  ['data-eve', 'src/data/eve-data, src/data/maps, src/data/wh-statics, src/data/wh-observations, src/data/npc-stats, src/data/industry-math, src/data/industry-indices.'],
  ['data-services', 'src/data/convex, src/data/corp-holdings, src/data/domain-events, src/data/esi-refresh-jobs, src/data/esi-snapshots, src/data/eve-status, src/data/gsc, src/data/location-tracking, src/data/market-history, src/data/market-prices, src/data/online-status, src/data/preferences, src/data/telemetry, src/data/tools.'],
  ['lib-infra', 'src/lib/** (including src/lib/format and src/lib/esi-datasets), src/transport, src/db, src/config, src/scripts, src/esi-datasets, and the top-level scripts/ directory. Besides duplication inside, check whether each lib helper is actually used where it should be (grep for hand-rolled equivalents across the repo).'],
]

const CONCERNS = [
  ['formatting', 'Display formatting: numbers, ISK, compact numbers, percentages, durations, relative and absolute dates/times, EVE names, pluralization, units (m3, AU, ly), security status. Find every Intl.NumberFormat / toLocaleString / toFixed / manual date math / string templates for these, compare with src/lib/format/* and other format helpers, and report bypasses and parallel formatters (including ones that drifted).'],
  ['client-hooks', 'Client-side React hooks and state plumbing: fetch-in-effect, polling and intervals, timers, debounce/throttle, localStorage/sessionStorage, preferences, hydration guards, media queries, visibility, clipboard/copy feedback, keyboard shortcuts, click-outside, resize/intersection observers, URL query sync, optimistic updates, Convex live hooks (src/data/convex/use-*). Report ad-hoc hooks or effects that duplicate an existing hook or each other.'],
  ['ui-patterns', 'UI composition patterns OUTSIDE src/components/ui: hand-built tables, sortable/filterable lists, toolbars and filter bars, tabs, empty/loading/error states, skeletons, page headers and shells, cards, stat tiles/KPIs, badges/pills/chips, tooltips, dialogs, inline number inputs, EVE entity rows (portrait + name + ticker), type icons. Also repeated long Tailwind class strings and duplicated CSS rules across *.css files. Report reimplementations of existing ui primitives and recurring patterns that deserve a new primitive.'],
  ['request-pipeline', 'Server request handling: Next route handlers, server actions, and Convex HTTP actions — auth/session lookup, same-origin checks, admin and capability guards, rate limiting, body parsing and validation, problem/error responses, caching headers, telemetry wrappers, cron authentication. Compare every handler against the shared wrappers (src/app/api/*.ts, src/composition/route-guards.ts, src/lib/problem.ts, convex/lib/httpAuth.ts, src/lib/service-auth.ts, src/lib/convex-*-door.ts) and report bypasses and parallel wrappers.'],
  ['esi-sync', 'ESI and owner/character data pipelines: token acquisition and refresh, ESI fetch (pagination, ETag/expires, error limits, retries, timeouts), per-character dataset sync, snapshots, refresh jobs, scheduling, convex location sync, corp holdings, market and industry index refresh, SDE ingestion. Compare src/platform/esi, src/platform/owner-sync, src/composition/sync, src/composition/pipelines, src/data/esi-*, src/data/market-*, convex/lib/characterSync.ts, convex/characterLocation*, src/scripts. Report parallel implementations of the same pipeline step.'],
  ['persistence', 'Persistence patterns: Drizzle queries (upsert, conflict handling, batched delete, pagination, retention/purge, transactions, advisory locks, Neon cold-start retry, row mapping) and Convex data access (index queries, unique lookups, access checks, pagination/drain, validators, tombstones, purge sweeps). Report repeated query shapes that deserve a helper, and code bypassing existing helpers (src/lib/batched-delete.ts, src/db/*, convex/lib/indexedQuery.ts, convex/lib/mapAccess.ts, etc.).'],
  ['contracts-types', 'Contracts, validation, and types: api-contract.ts files, zod (or other) schemas, Convex validators, request/response DTOs, EVE id and entity types, enums and string-literal unions, constants (ESI scopes, role names, limits, TTLs, time constants like 60_000 or 86_400_000). Report the same shape or constant defined in several places, validators duplicated between client, route, and Convex, and types that drifted.'],
  ['feature-skeleton', 'Feature-module skeleton: compare the module shapes across src/features/* and src/data/* (api-contract.ts, queries.ts, schema.ts, purge.ts, search.ts, page-settings.ts, widget.tsx, use-*.ts, *-view.ts view models, coverage.test.ts) and the registries that wire them (purge registry, data-ownership registry, table-growth/retention registry, widget host registry, search registry, page settings). Report boilerplate each feature re-implements that a shared factory or helper could own, and registries with parallel hand-maintained lists.'],
  ['generic-utils', 'Generic utilities: array/collection helpers (groupBy, partition, uniq, chunk, keyBy, sum, sort comparators, stable sort, top-N), Map/Set helpers, key building (pair keys, composite ids), string normalization and matching/search scoring, clamp/round/math, geometry, ids, time constants, Result/error wrapping, retry/backoff/timeout, concurrency limiting (fan-out), memoization and caches (Map caches, TTL caches, module-level singletons), abort handling. Compare against src/lib/array.ts, src/lib/fan-out.ts, src/lib/fetch-with-timeout.ts, src/lib/best-effort.ts, src/lib/failure.ts and similar.'],
  ['efficiency', 'Efficiency across server and client. Server: N+1 database or Convex reads in loops, sequential awaits that are independent, the same data fetched several times per request, over-fetching columns/rows, missing batching, unbounded scans, repeated expensive computations that could be cached. Client: duplicate subscriptions or fetches of the same data across components, expensive derivations recomputed every render, state duplicated across components, large client bundles from server-only code. Only report problems you can show in code, with the fix.'],
  ['tests-fixtures', 'Tests and fixtures (*.test.ts(x), __tests__/, *.db.test.ts, test fixtures and fakes). Fallow dupes ignores test files, so look for duplicated test helpers, data builders/factories, DB setup/teardown, Convex test harness setup, mocks of fetch/ESI/session, and the coverage.test.ts boilerplate repeated in many directories. Read docs/principles/testing-principles.md first and keep proposals consistent with it. Propose shared test utilities with a home that the test files can import.'],
]

const DUPES = [
  ['dupes-triage-1', `${S}/dupes-triage-1.txt`],
  ['dupes-triage-2', `${S}/dupes-triage-2.txt`],
]
const DUPES_TASK = (file) => `Your input is a list of fallow semantic near-duplicate groups that span more than one area of the codebase: ${file}. Each "##" header is a clone group (identifier-blind, so many are trivial: import blocks, prop destructuring, JSX boilerplate, test-like scaffolding). Work through the groups from the top. For each group open the listed ranges and decide whether it is a real shared concept worth a primitive or a trivial structural coincidence. Report only real opportunities (merge groups that are the same concept into one finding). In coverageNotes, say how many groups you reviewed and summarize the kinds of trivial groups you dismissed.`

function finder(label, prompt) {
  return () => agent(PREAMBLE + prompt, { label, phase: 'Find', schema: FINDINGS })
    .then(r => r ? r.findings.map(f => ({ ...f, source: label })).concat([]) : [])
    .then(fs => ({ label, findings: fs }))
}

phase('Find')
const finderRuns = await parallel([
  ...AREAS.map(([label, scope]) => finder(`area:${label}`, AREA_TASK + scope)),
  ...CONCERNS.map(([label, c]) => finder(`concern:${label}`, CONCERN_TASK + c)),
  ...DUPES.map(([label, file]) => finder(label, DUPES_TASK(file))),
])
const runs = finderRuns.filter(Boolean)
let findings = runs.flatMap(r => r.findings)
const failed = [...AREAS.map(a => `area:${a[0]}`), ...CONCERNS.map(c => `concern:${c[0]}`), ...DUPES.map(d => d[0])].filter(l => !runs.some(r => r.label === l))
log(`Find: ${findings.length} findings from ${runs.length} finders${failed.length ? `; failed: ${failed.join(', ')}` : ''}`)

phase('Gaps')
const digest = runs.map(r => `### ${r.label} (${r.findings.length})\n` + r.findings.map(f => `- [${f.category}/${f.kind}] ${f.title} — ${f.sites.length} sites: ${[...new Set(f.sites.map(s => s.file))].slice(0, 6).join(', ')}`).join('\n')).join('\n\n')
const GAPS = {
  type: 'object',
  properties: {
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'kebab-case' },
          scope: { type: 'string', description: 'Precise instruction for a finder: which concept or files to search, and why the first pass likely missed it' },
        },
        required: ['label', 'scope'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['gaps', 'reasoning'],
}
const critic = await agent(PREAMBLE + `You are the COMPLETENESS CRITIC for this audit. ${runs.length} finders ran (by area, by cross-cutting concern, and over near-duplicate leads).${failed.length ? ` These finders FAILED and returned nothing: ${failed.join(', ')} — their scope must be re-covered.` : ''} Below is every finding title with its sites. Independently sample the codebase (directory listings, grep for common concepts) and decide what is MISSING: directories nobody covered well, concepts that obviously recur in this kind of codebase but got no finding (e.g. EVE entity resolution, image URLs, pagination, search, map geometry, time windows, role checks, telemetry events), or areas whose finder returned suspiciously few findings. Return up to 6 targeted gap searches, most valuable first. Return an empty list if coverage is genuinely complete.\n\nFINDINGS SO FAR:\n${digest}`, { label: 'critic', phase: 'Gaps', schema: GAPS })
const gapList = critic ? critic.gaps.slice(0, 6) : []
if (critic && critic.gaps.length > 6) log(`Critic proposed ${critic.gaps.length} gaps; running the first 6`)
const gapRuns = (await parallel(gapList.map(g => finder(`gap:${g.label}`, `This is a GAP SEARCH after a first pass. Do not re-report these existing findings:\n${digest}\n\nYOUR TARGETED SCOPE:\n${g.scope}`)))).filter(Boolean)
const gapFindings = gapRuns.flatMap(r => r.findings)
findings = findings.concat(gapFindings)
log(`Gaps: ${gapFindings.length} more findings from ${gapRuns.length} gap finders; total ${findings.length}`)

phase('Consolidate')
const byCat = {}
findings.forEach((f, i) => { (byCat[f.category] = byCat[f.category] || []).push({ ...f, fid: `F${i + 1}` }) })
const ORDER = ['ui-component', 'css-styling', 'react-hook', 'client-data', 'formatting', 'generic-utility', 'error-handling', 'api-route', 'server-pipeline', 'esi-sync', 'convex', 'persistence', 'contracts-validation', 'feature-skeleton', 'efficiency', 'simplification', 'testing']
const buckets = []
let cur = []
for (const c of ORDER) {
  const items = byCat[c] || []
  if (cur.length && cur.length + items.length > 45) { buckets.push(cur); cur = [] }
  cur = cur.concat(items)
}
if (cur.length) buckets.push(cur)

const OPPS = {
  type: 'object',
  properties: {
    opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          kind: { type: 'string', enum: KINDS },
          problem: { type: 'string' },
          sites: { type: 'array', items: SITE },
          existingPrimitive: { type: 'string' },
          proposal: { type: 'string' },
          siteCountEstimate: { type: 'integer' },
          impact: { type: 'string', enum: LEVEL },
          sourceFindings: { type: 'array', items: { type: 'string' }, description: 'fid values merged into this opportunity' },
        },
        required: ['title', 'category', 'kind', 'problem', 'sites', 'existingPrimitive', 'proposal', 'siteCountEstimate', 'impact', 'sourceFindings'],
      },
    },
    dropped: {
      type: 'array',
      items: { type: 'object', properties: { fid: { type: 'string' }, reason: { type: 'string' } }, required: ['fid', 'reason'] },
    },
  },
  required: ['opportunities', 'dropped'],
}

const consolidated = await parallel(buckets.map((b, i) => () => agent(PREAMBLE + `You are CONSOLIDATING raw audit findings (bucket ${i + 1} of ${buckets.length}, categories: ${[...new Set(b.map(f => f.category))].join(', ')}). Different finders often reported the same opportunity from different angles. Merge findings that describe the same primitive or refactor into ONE opportunity: union their sites (dedupe by file and overlapping lines), keep the strongest proposal, reconcile conflicting proposals (say which you chose and why), and list every merged fid in sourceFindings. Keep distinct opportunities separate. Drop findings that are clearly not worth doing (one real site, trivial boilerplate, purely cosmetic, or contradicted by the code) and list them in dropped with a reason. You may open files to settle conflicts, but full verification happens in the next stage. Every input fid must appear in exactly one opportunity's sourceFindings or in dropped.\n\nFINDINGS (JSON):\n${JSON.stringify(b)}`, { label: `consolidate:${i + 1}`, phase: 'Consolidate', schema: OPPS })))
let opps = []
const dropped = []
consolidated.forEach((c, i) => {
  if (!c) { log(`Consolidator ${i + 1} failed; passing its ${buckets[i].length} findings through unmerged`); buckets[i].forEach(f => opps.push({ title: f.title, category: f.category, kind: f.kind, problem: f.summary, sites: f.sites, existingPrimitive: f.existingPrimitive, proposal: f.proposal, siteCountEstimate: f.siteCountEstimate, impact: f.impact, sourceFindings: [f.fid] })); return }
  opps.push(...c.opportunities)
  dropped.push(...c.dropped.map(d => ({ ...d, stage: 'consolidate' })))
})
opps = opps.map((o, i) => ({ ...o, id: `P${String(i + 1).padStart(3, '0')}` }))
log(`Consolidate: ${opps.length} opportunities from ${findings.length} findings; ${dropped.length} dropped`)

const MERGES = {
  type: 'object',
  properties: {
    merges: {
      type: 'array',
      items: { type: 'object', properties: { keep: { type: 'string' }, absorb: { type: 'array', items: { type: 'string' } }, reason: { type: 'string' } }, required: ['keep', 'absorb', 'reason'] },
    },
  },
  required: ['merges'],
}
const oppDigest = opps.map(o => `${o.id} [${o.category}] ${o.title} :: ${o.proposal.slice(0, 220)} :: files ${[...new Set(o.sites.map(s => s.file))].slice(0, 5).join(', ')}`).join('\n')
const mergePlan = await agent(`These audit opportunities were consolidated in separate category buckets, so the same opportunity may appear in more than one bucket (for example a formatting helper also reported as a UI component, or a hook also reported as client data). Identify ONLY true duplicates — the same primitive or refactor over the same code — and return merges (keep one id, absorb the others). Do not merge opportunities that are merely related. Return an empty list if none.\n\n${oppDigest}`, { label: 'cross-bucket-merge', phase: 'Consolidate', schema: MERGES })
if (mergePlan) {
  const byId = Object.fromEntries(opps.map(o => [o.id, o]))
  const absorbed = new Set()
  for (const m of mergePlan.merges) {
    const k = byId[m.keep]
    if (!k || absorbed.has(m.keep)) continue
    for (const a of m.absorb) {
      const x = byId[a]
      if (!x || a === m.keep || absorbed.has(a)) continue
      k.sites = k.sites.concat(x.sites)
      k.sourceFindings = k.sourceFindings.concat(x.sourceFindings)
      k.problem += `\n\nMerged from ${a} (${x.title}): ${x.problem}`
      k.proposal += `\n\nAlternative from ${a}: ${x.proposal}`
      absorbed.add(a)
    }
  }
  opps = opps.filter(o => !absorbed.has(o.id))
  log(`Cross-bucket merge absorbed ${absorbed.size}; ${opps.length} opportunities to verify`)
}

phase('Verify')
const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'revised', 'rejected'] },
          reason: { type: 'string', description: 'Why it survives or dies; for revised, what changed' },
          title: { type: 'string', description: 'Final imperative title' },
          problem: { type: 'string', description: 'Final problem statement grounded in the verified sites' },
          verifiedSites: { type: 'array', items: SITE, description: 'Sites you opened and confirmed, with exact current line ranges' },
          excludedSites: { type: 'array', items: SITE, description: 'Cited sites that are NOT the same concept, with why' },
          home: { type: 'string', description: 'Target path for the primitive (or the existing primitive to adopt)' },
          boundaryCheck: { type: 'string', description: 'Zone of the home and of every consumer zone, citing the .fallowrc.json rule that permits each import; or the boundary problem' },
          apiSketch: { type: 'string', description: 'TypeScript signature(s) or component props of the primitive, concise' },
          migrationSteps: { type: 'array', items: { type: 'string' } },
          tests: { type: 'string', description: 'Tests to add or move, and existing tests that guard the behavior' },
          effort: { type: 'string', enum: ['S', 'M', 'L'] },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          payoff: { type: 'string', enum: ['high', 'medium', 'low'] },
          locDelta: { type: 'string', description: 'Rough estimate of lines removed/added' },
          dependsOn: { type: 'array', items: { type: 'string' }, description: 'ids of other opportunities in this batch or named elsewhere that should land first' },
          notes: { type: 'string', description: 'Behavior differences between sites that the migration must preserve or reconcile, and drift bugs found' },
        },
        required: ['id', 'verdict', 'reason', 'title', 'problem', 'verifiedSites', 'excludedSites', 'home', 'boundaryCheck', 'apiSketch', 'migrationSteps', 'tests', 'effort', 'risk', 'payoff', 'locDelta', 'dependsOn', 'notes'],
      },
    },
  },
  required: ['verdicts'],
}

const vBatches = []
for (let i = 0; i < opps.length; i += 4) vBatches.push(opps.slice(i, i + 4))
const VERIFY = (batch) => PREAMBLE + `You are an ADVERSARIAL VERIFIER and DESIGNER for ${batch.length} proposed refactors. For EACH opportunity:
1. Try to REFUTE it. Open every cited site. Are they really the same concept with the same semantics, or do they differ in ways that make one primitive wrong (different edge cases, error handling, server vs client, different invariants)? Is there already a primitive that covers it (check the inventory and grep)? Would the extraction add indirection that costs more than it saves? Is the efficiency problem real at realistic data sizes? Default to rejected when the evidence is weak; "revised" when the core is real but the scope, sites, or design must change.
2. Grep the repo for additional sites the finders missed and add them to verifiedSites.
3. For survivors, design it: pick the home so every consumer import is legal under .fallowrc.json boundaries (cite the rules), sketch the API, write concrete migration steps an implementer can follow (which primitive first, which sites in which order, what to delete), name the tests, and note behavior differences between sites that the migration must preserve (if one copy has a bug or drifted, say which is correct).
Line ranges must be the current ones you read. Return one verdict per input id.

OPPORTUNITIES (JSON):
${JSON.stringify(batch)}`

const verified = await pipeline(vBatches, (batch, _o, i) => agent(VERIFY(batch), { label: `verify:${batch.map(b => b.id).join(',')}`, phase: 'Verify', schema: VERDICTS }).then(r => {
  if (!r) return batch.map(b => ({ id: b.id, verdict: 'unverified', reason: 'verifier failed', title: b.title }))
  const ids = new Set(batch.map(b => b.id))
  const got = r.verdicts.filter(v => ids.has(v.id))
  const missing = batch.filter(b => !got.some(v => v.id === b.id)).map(b => ({ id: b.id, verdict: 'unverified', reason: 'verifier returned no verdict', title: b.title }))
  return got.concat(missing)
}))
const verdicts = verified.filter(Boolean).flat()
const oppById = Object.fromEntries(opps.map(o => [o.id, o]))
const confirmed = verdicts.filter(v => v.verdict === 'confirmed' || v.verdict === 'revised').map(v => ({ ...v, category: oppById[v.id] ? oppById[v.id].category : '', kind: oppById[v.id] ? oppById[v.id].kind : '', existingPrimitive: oppById[v.id] ? oppById[v.id].existingPrimitive : '' }))
const rejected = verdicts.filter(v => v.verdict === 'rejected')
const unverified = verdicts.filter(v => v.verdict === 'unverified')
log(`Verify: ${confirmed.length} confirmed/revised, ${rejected.length} rejected, ${unverified.length} unverified`)

phase('Plan')
const PLAN = {
  type: 'object',
  properties: {
    executiveSummary: { type: 'string', description: 'Markdown, 2-4 paragraphs: state of the codebase, the biggest themes, expected payoff' },
    themes: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, summary: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } } }, required: ['name', 'summary', 'ids'] } },
    waves: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          goal: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' }, description: 'In implementation order' },
        },
        required: ['name', 'goal', 'ids'],
      },
    },
    dependencies: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, dependsOn: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } }, required: ['id', 'dependsOn', 'why'] } },
    conflicts: { type: 'array', items: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } }, issue: { type: 'string' }, resolution: { type: 'string' } }, required: ['ids', 'issue', 'resolution'] }, description: 'Opportunities that overlap or propose incompatible homes/APIs, and how to reconcile' },
    implementerGuidance: { type: 'string', description: 'Markdown bullets: how to execute an item safely in this repo' },
  },
  required: ['executiveSummary', 'themes', 'waves', 'dependencies', 'conflicts', 'implementerGuidance'],
}
const planInput = confirmed.map(v => ({ id: v.id, title: v.title, category: v.category, kind: v.kind, home: v.home, effort: v.effort, risk: v.risk, payoff: v.payoff, locDelta: v.locDelta, dependsOn: v.dependsOn, problem: v.problem.slice(0, 400), apiSketch: v.apiSketch.slice(0, 400), files: [...new Set(v.verifiedSites.map(s => s.file))] }))
const plan = await agent(`You are planning the execution of a verified refactoring backlog for LGI.tools (work targets the development branch; every commit must pass pnpm check: typecheck, lint, related tests, static Fallow incl. boundaries, dupes, health/CRAP; .fallowrc.json defines layer boundaries). Below are ${planInput.length} verified opportunities. Group them into ordered WAVES that an implementer can land as independent PRs: foundations first (shared primitives other items depend on), quick high-payoff low-risk wins early, risky or large migrations later, and items that touch the same files sequenced to avoid conflicts. Every id must appear in exactly one wave. Identify dependencies (including ones the verifiers missed: a later item that would consume a primitive an earlier item creates) and conflicts (overlapping scope or incompatible homes/APIs) with a resolution. Write an executive summary, cross-cutting themes, and implementer guidance specific to this repo (use docs-researcher before touching framework APIs, repo-mapper for blast radius, test-runner for pnpm check, no threshold raises or suppressions, merge commits).\n\nOPPORTUNITIES (JSON):\n${JSON.stringify(planInput)}`, { label: 'planner', phase: 'Plan', schema: PLAN })

return {
  stats: { finders: runs.length, failedFinders: failed, gapFinders: gapRuns.length, findings: findings.length, opportunities: opps.length, confirmed: confirmed.length, rejected: rejected.length, unverified: unverified.length, droppedAtConsolidate: dropped.length },
  oppIds: opps.map(o => ({ id: o.id, category: o.category, kind: o.kind, existingPrimitive: o.existingPrimitive, sourceFindings: o.sourceFindings })),
  waves: plan ? plan.waves.map(w => ({ name: w.name, ids: w.ids })) : null,
  confirmedTitles: confirmed.map(v => `${v.id} ${v.verdict} ${v.effort}/${v.risk}/${v.payoff} ${v.title}`),
  unverified: unverified.map(v => v.id),
}
