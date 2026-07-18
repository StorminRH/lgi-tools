# Primitive Ledger

This is the living, overwrite-in-place record of LGI.tools primitives and
their lifecycle verdicts. It records current state, not an append-only history:
future audits update the map and verdict statuses in place, preserve permanent
`PL-NNN` IDs, and never renumber rows.

Part 1 uses one row per decision an agent must get right. Members of a family
share a row when they hide the same decision behind the same rail. `Rail`
names an enforcing lint selector or restricted-import rule, Fallow
zone/boundary, or registry-gate test; `none` makes an unrailed primitive
explicit rather than implying enforcement.

Part 2 uses the fixed lifecycle classes `create`, `combine`, `delete`,
`expand`, and `keep`. Status is one of `Delivered`, `Proposed`,
`Approved (3.9.2.N)`, `Backlog`, or `Rejected (reason)`.

## Part 1 — Primitive map

### UI/design

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Semantic design-token layer | `src/app/globals.css` | Use the terminal/EVE palette, typography, spacing, radii, motion, elevation, and four stacking tiers through named tokens rather than local visual values. | Raw-color, inline-style, arbitrary-text-size, and arbitrary-radius selector families in `eslint.config.mjs` |
| Domain-neutral UI component library | `src/components/ui/` | Consume the shared control, disclosure, feedback, and layout seams instead of binding feature code directly to Base UI or sonner. | UI import boundary in `.fallowrc.json`; scoped Base UI/sonner `no-restricted-imports` rail in `eslint.config.mjs` |
| EVE image rendering seam | `src/components/eve-image.tsx` | Render remote EVE imagery through the configured image component with the repository's loading and fallback behavior. | `@next/next/no-img-element` plus the `next/image` restricted-import rule in `eslint.config.mjs` |
| EVE image URL builders | `src/lib/eve-image.ts` | Construct canonical character, corporation, alliance, type, and skin image URLs and supported sizes in one place. | none |
| Abstract UI tone maps | `src/components/ui/tones.ts` | Translate domain-neutral tone names into the sanctioned token classes while leaving domain meaning in the caller. | Raw-color selector families in `eslint.config.mjs` |
| Tailwind class merge configuration | `src/components/ui/cn.ts` | Merge conditional utility classes with the repository's conflict semantics instead of ad hoc string resolution. | none |
| Chart rendering and geometry family | `src/components/ui/chart/`, `src/components/ui/bar-chart.tsx`, `src/components/ui/trend-chart.tsx`, `src/components/ui/annotated-daily-chart.tsx` | Keep axes, hover state, CSSOM overlays, and reusable geometry in the UI layer while callers supply domain data and labels. | UI import boundary in `.fallowrc.json`; inline-style and raw-color selector families in `eslint.config.mjs` |

### API/backend

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Typed endpoint and client transport | `src/lib/api-client.ts` | Pair method, path, request, and response types and apply the shared JSON/error transport contract. | Raw `/api` fetch and inline-endpoint selector families in `eslint.config.mjs` |
| Route-body parser | `src/lib/route-body.ts` | Parse JSON once and translate Zod failures into the shared invalid-request response shape. | Owning-schema consumption checks in `src/app/api/api-contracts.test.ts` |
| Owning API contract modules | `src/features/*/api-contract.ts`, `src/data/*/api-contract.ts` | Keep request schemas, response types, and endpoint objects with the slice that owns the operation. | `src/app/api/api-contracts.test.ts` |
| Mutation-route pipeline | `src/app/api/mutation-route.ts` | Apply the shared same-origin, session, authorization, body-validation, and response sequence to state-changing routes. | `src/app/api/same-origin-coverage.test.ts` and `src/app/api/mutation-route.test.ts` |
| Cron route declaration and shell | `src/db/cron-gate.ts`, `src/app/api/cron/` | Declare schedule, auth, lock, wake policy, and telemetry once while route modules supply only the job body. | `src/app/api/cron/registry.test.ts` plus cron restricted imports in `eslint.config.mjs` |
| ESI request gateway | `src/lib/esi/` | Construct ESI URLs and apply shared budget, retry, timeout, and failure behavior to every ESI request. | ESI-host and direct-ESI-fetch selector families in `eslint.config.mjs` |
| Typed server environment access | `src/lib/env.ts` | Centralize presence, parsing, and secret-required semantics for server configuration. | Server `process.env` selector family in `eslint.config.mjs` and `.agent-local/check_env_example.py` |
| Outbound fetch timeout | `src/lib/fetch-with-timeout.ts` | Bound external calls and normalize caller-owned timeout behavior without duplicating abort plumbing. | none |
| Shared rate limiting | `src/lib/rate-limit.ts` | Apply one local/Upstash-compatible allowance contract while keeping policy keys and limits with callers. | none |

### Data

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Slice import architecture | `src/features/`, `src/data/`, `src/lib/`, `src/components/ui/`, `src/search/` | Keep feature, data, UI, and library ownership directional and place cross-slice composition above participating slices. | Autodiscovered zones and direction rules in `.fallowrc.json` |
| ESI dataset registry and freshness gate | `src/lib/esi-datasets/` | Declare dataset home, trigger policy, TTL, and exact stale-boundary semantics before callers fetch or vend data. | `src/esi-datasets/registry.test.ts` plus dataset-TTL and feature-staleness selector families in `eslint.config.mjs` |
| Dataset declaration cross-index | `src/db/dataset-declarations.test.ts` | Join schema tables to purge, growth, ESI, and policy declarations so every persisted dataset has a complete operational story. | `src/db/dataset-declarations.test.ts` |
| Personal-data purge registry | `src/purge/` | Compose slice-owned deletion contributors without allowing the purge orchestrator to know slice internals. | `src/purge/registry.test.ts` and purge coverage in `src/db/dataset-declarations.test.ts` |
| Table-growth registry | `src/db/table-growth-registry.ts` | Classify retained tables by growth behavior and retention mechanism so unbounded storage is never implicit. | `src/db/table-growth-registry.test.ts` and growth coverage in `src/db/dataset-declarations.test.ts` |
| SDE composition junction | `src/db/sde-pipeline.ts` | Compose EVE-data ingest and derivation with market-price seeding above both isolated data slices, exposing one idempotent pipeline to deploy, CLI, and cron callers. | none |
| Search source registry and junction | `src/search/`, `src/search/register-all.ts` | Let slices define independent search sources while one composition layer owns registration, scopes, and result joining. | Search boundaries in `.fallowrc.json` and search scope-equivalence tests |
| Page-settings registry and junction | `src/page-settings/`, `src/page-settings/register-all.ts` | Let features contribute settings controls while one neutral layer owns account resolution and registered composition. | `src/page-settings/page-settings.test.ts` |
| Typed preferences registry and reconciliation | `src/lib/preferences.ts`, `src/components/PreferencesProvider.tsx`, `src/data/preferences/` | Define each preference's key, schema, default, SSR readability, and local/cookie/Neon reconciliation once so storage tiers cannot drift. | `src/lib/preferences.test.ts`, `src/page-settings/page-settings.test.ts`, and `src/app/api/api-contracts.test.ts` |
| Tool catalogue registry | `src/data/tools/registry.ts` | Keep tool identity, navigation, availability, and search metadata in one authoritative catalogue. | `src/data/tools/registry.test.ts` |
| Operational telemetry store | `src/data/telemetry/` | Record high-volume usage, health, performance, and cost measurements for aggregation and bounded retention. | Data-slice boundaries in `.fallowrc.json`; vocabulary exclusivity is none |
| Durable domain-event ledger | `src/data/domain-events/` | Record low-volume privacy-safe state transitions for operational diagnosis with append-only semantics and longer retention. | Data-slice boundaries in `.fallowrc.json`; vocabulary exclusivity is none |

### Infra/platform

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Lazy database proxies | `src/db/index.ts` | Defer database connection creation until an operation actually uses the database and keep imports side-effect-free. | none |
| Session advisory lock | `src/db/advisory-lock.ts` | Reserve a direct unpooled connection, acquire one session lock, and release both in `finally` without spanning network work in a transaction. | Cron direct-lock restricted imports in `eslint.config.mjs`; broader exclusivity is none |
| Real-Postgres test harness | `src/db/test-support/db-test-harness.ts` | Own reachability gating, disposable migrated-schema clones, request-path steering, identity seeds, reset, and teardown for DB suites. | Direct-Postgres and embedded-connection-string selector families in `eslint.config.mjs` |
| Per-owner ESI sync engine | `src/lib/owner-sync/`, `src/db/owner-sync-port.ts` | Orchestrate owner enumeration, freshness, token or director resolution, ESI planning, and write-behind while slices supply policy ports. | Library and data direction boundaries in `.fallowrc.json` |
| Presence sync policy and Convex driver | `src/lib/sync-engine.ts`, `convex/engine.ts` | Separate pure cadence/liveness policy from the Convex runtime that drives work pools, heartbeats, and scans for the same presence-sync story. | Convex-home coverage in `src/esi-datasets/registry.test.ts` |
| Live owned-dataset reconciler | `src/lib/live-dataset.ts`, `src/components/use-live-dataset.ts`, `src/db/live-dataset-view.ts` | Reconcile stale Neon-owned datasets on view, keep rendering local, and perform one bounded delayed re-read after a refresh request. | Library/UI direction boundaries in `.fallowrc.json` |
| Route presence and render classification | `scripts/route-classification.json`, `scripts/assert-routes-present.mjs`, `scripts/assert-route-classification.mjs` | Make every route's existence and most-static-honest render mode explicit and mechanically checked. | `pnpm assert:routes-present` in CI and `pnpm build:vercel` post-merge |

### Agent tools/workflow

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Lifecycle resolver | `.agent-local/resolve_development_state.py` | Validate live roadmap, contract, plan, git, audit, and archive state and emit the sole next-handler directive. | `.agent-local/test_development_state.py` |
| Stage-specific lifecycle skills | `.agents/skills/`, `.claude/skills/` | Keep planning, execution, review, close-out, and audit stages separate while returning control to the resolver. | Paired-skill and required-marker checks in `.agent-local/check_agent_drift.py` |
| Shared policy manifest and drift gate | `.agent-local/policy-manifest.json`, `.agent-local/check_agent_drift.py` | Derive the cross-runtime policy surface, revision, paired skills, hooks, probes, and mandatory checker wiring from one manifest. | `.agent-local/test_agent_drift.py` |
| Shared checker substrate | `.agent-local/checker_common.py` | Give reporting-only workspace checkers one repository-root, Markdown, JSON, and diagnostic contract. | `.agent-local/test_checker_common.py` and checker-fixture wiring in `.agent-local/check_agent_drift.py` |
| Release-consistency gate | `.agent-local/check_release_consistency.py` | Compare app version, changelog, roadmap, contract, branch, and merge evidence against named lifecycle states. | `.agent-local/test_release_consistency.py` and required start/close-out invocation |
| PR privacy and clean-merge tooling | `.agent-local/scrub_pr_body.py`, `.agent-local/poll_pr_gate.py`, `.agent-local/merge_clean_pr.py` | Scrub public metadata, read the current-head review state, and permit only a fully green clean merge. | `.agent-local/test_scrub_pr_body.py` plus close-out workflow gates |
| Archive verifier | `.agent-local/verify_archive.py` | Validate version bundle completeness and manifest integrity before and after archival without mutating the archive. | `.agent-local/test_verify_archive.py` and resolver archive states |
| UX probe harness | `scripts/ux-capture.mjs`, `scripts/ux-capture-args.mjs`, `.agents/skills/ux-check/` | Derive route probes from changed UI scope and capture desktop/mobile console, network, and screenshot evidence consistently. | Probe-layout and paired-skill checks in `.agent-local/check_agent_drift.py` plus `scripts/ux-capture-args.test.mjs` |
| Graphify-first guard | `.agent-local/graphify_guard.py`, `.codex/hooks.json`, `.claude/settings.json` | Require structural queries before broad source search while allowing targeted confirmation after the graph narrows scope. | Hook parity and path checks in `.agent-local/check_agent_drift.py` |

### Auth/trust

| Primitive | Owning module | Decision it hides | Rail |
| --- | --- | --- | --- |
| Better Auth identity spine | `src/features/auth/auth.ts` | Represent one human as one user, link EVE characters as accounts, and centralize provider, session, callback, and account-hook policy. | Auth-surface boundaries in `.fallowrc.json` and auth integration tests |
| Session identity and route guards | `src/features/auth/session.ts`, `src/features/auth/session-identity.ts`, `src/features/auth/route-guards.ts` | Resolve the current human once and apply user, character, admin, or linked-account requirements consistently. | Co-located session and route-guard tests |
| EVE SSO scope and JWT contract | `src/features/auth/eve-sso.ts` | Keep requested scope vocabulary, callback identity verification, and provider-specific claims in one auth-owned contract. | `src/features/auth/eve-sso.test.ts` |
| EVE token custody and vending | `src/features/auth/token-crypto.ts`, `src/features/auth/eve-token-service.ts` | Encrypt tokens at rest, serialize refresh ownership, and vend only a validated access token or typed failure to trusted callers. | Token crypto, refresh-concurrency, and token-service tests |
| Linked-character ownership and transfer | `src/features/auth/owner-reconcile.ts`, `src/features/auth/owner-transfer.ts`, `src/features/auth/linked-characters.ts` | Reconcile character ownership to one human and make transfer or conflict outcomes explicit before dependent data moves. | Co-located ownership, reconciliation, and transfer-route tests |
| Service bearer gates | `src/lib/service-auth.ts`, `convex/lib/bearerAuth.ts` | Authenticate trusted service-to-service calls with timing-safe Node verification or a Convex-runtime-compatible equivalent. | Co-located Node and Convex service-auth tests |
| Same-origin mutation observer | `src/features/auth/same-origin.ts`, `src/app/api/mutation-route.ts` | Reject cross-origin state changes before authentication or body work and make every mutation route opt into the shared observer. | `src/app/api/same-origin-coverage.test.ts` |
| Convex JWT trust bridge | `convex/auth.config.ts` | Trust Better Auth's issuer and JWKS identity without introducing a second identity system or Convex-to-Neon authority. | none |

## Part 2 — Verdict table

| ID | Area | Class | Evidence | Proposed end-state | Est. size | Status |
| --- | --- | --- | --- | --- | --- | --- |
| PL-001 | Infra/platform | expand | DB suites repeated reachability, schema-clone, steering, seed, reset, and teardown work; 3.9.2.1 promoted the shared harness and migrated consumers in PR #254. | All real-Postgres suites use `createDbTestHarness`; direct clients and embedded connection strings are lint-blocked. | L | Delivered |
| PL-002 | API/backend | expand | Cron routes repeated auth, lock, wake, and telemetry policy; AF-009's clone never tripped its promotion trigger, while the actual wake regression drove the shared shell in PR #255 and hotfix #256. | Cron jobs declare policy in the registry and run through one shell; the superseded cron-shell clone finding stays closed by this evidence. | L | Delivered |
| PL-003 | Data | create | ESI-backed surfaces repeated cache-home, TTL, staleness, and trigger decisions; 3.9.2.3 created the registry/freshness primitive and migrated declared consumers in PR #257. | Every ESI dataset declares its authoritative home and freshness policy, and callers use the shared exact-boundary gate. | L | Delivered |
| PL-004 | API/backend | expand | Endpoint contracts already existed but routes could drift from their owning schemas; 3.9.2.4 expanded the contract gate across the route surface in PR #258. | Each API route is mechanically tied to one owning schema/endpoint contract, with explicit no-body markers where applicable. | M | Delivered |
| PL-005 | Agent tools/workflow | combine | UX capture route inference, probe arguments, and evidence checks were split across workflow prose and scripts; 3.9.2.5 combined them into one probe harness in PR #259. | `ux-check` derives and runs consistent desktop/mobile route probes through the shared capture contract. | M | Delivered |
| PL-006 | Data | keep | Purge, growth, ESI, and dataset declarations answer different operational questions; 3.9.2.6 kept the registries separate and added a completeness cross-index in PR #260. | Preserve focused registries and enforce their agreement through `dataset-declarations.test.ts` rather than merging vocabularies. | M | Delivered |
| PL-007 | Data | keep | Telemetry has broad, high-volume usage/health/cost writers and 180-day aggregation retention; domain events have five typed low-volume state-transition events, six physical writer sites, append-only semantics, and 400-day retention. A few jobs intentionally dual-write because both views matter. | Keep telemetry for aggregate operation measurements and domain events for durable state-transition evidence; allow intentional dual-writes at the boundary. | XS | Delivered |
| PL-008 | Infra/platform | keep | `src/lib/sync-engine.ts` is the pure policy leaf and `convex/engine.ts` its presence-sync runtime driver; `live-dataset.ts` is an on-view Neon reconciliation shell, while `owner-sync/` orchestrates durable per-owner ESI-to-Neon work. Their stores, triggers, and caller contracts differ. | Treat the policy leaf plus Convex driver as one presence-sync primitive; keep live-dataset reconciliation and owner-sync orchestration as distinct primitives. | XS | Delivered |
| PL-009 | Data | keep | The 3.9.2.3 comparison recorded three deliberately separate trigger layers: market-price fetch/fallback coalescing, persisted market-history expiry, and durable owner-sync retry. Combining them would produce a flag-driven temporal shell. | Preserve the three trigger layers and share only dataset declarations and exact freshness semantics. | XS | Delivered |
| PL-010 | API/backend | keep | The P3 sweep found no pure rename: `requireCronAuth` owns env and bearer policy, `swallow` owns best-effort failure isolation/logging, EVE URL builders own canonical host/path/size policy, and `defineCronRoute` is consumed by all cron routes. | Keep the flagged wrappers because each hides a real decision used by multiple callers; do not create a pass-through cleanup slice. | XS | Delivered |
| PL-011 | UI/design | expand | `src/lib/esi-datasets/freshness.ts` owns the exact `staleAfter <= now` boundary, but `src/features/industry-planner/industry-styles.ts` repeats the comparison for confidence and aggregate counts. The planner intentionally refreshes the whole price set on view and that behavior must remain. | Move planner price-staleness derivation onto the shared freshness semantics without changing its always-confirm-on-view behavior or widening the AF-005 pricing contexts. | S–M | Delivered |
| PL-012 | UI/design | expand | The current tree keeps Base UI and sonner imports inside `src/components/ui/`, and policy names that directory as the sole seam, but ESLint restricts only direct `next/image`; no rail prevents a future feature import of Base UI or sonner. | Add scoped restricted-import enforcement for Base UI and sonner outside the shared UI wrappers, with seeded lint fixtures and wrapper exemptions. | S | Delivered |
| PL-013 | Auth/trust | delete | `EveTokenOkResponse.scopes` is returned by the internal token-vend route but discarded by its only production consumer in `convex/lib/characterSync.ts`. Its private whitespace-only parser also diverges from the comma-or-space stored-scope decoder in `scope-health.ts`; full Fallow found zero unused files or exports, making this field-level dead contract the sole zero-consumer candidate. | Remove the unused token-vend `scopes` field and redundant parser, update the route contract/tests, and keep `scope-health.ts` as the sole stored-scope decoder. | S | Delivered |

## Audit evidence

- Survey snapshot: branch `codex/3.9.2.7-primitives-audit-ledger` at
  `4ef51f7`; Graphify reported 6,150 nodes and 16,521 edges before targeted
  source confirmation.
- Rail catalogue: 13 restricted-syntax selector families, three
  restricted-import families, 35 expanded Fallow zones/rules, and the named
  registry/gate tests above.
- Granularity exclusions are intentional only when a module is an implementation
  member of an already mapped decision. `src/lib/upstash.ts` is therefore
  covered behind the ESI gateway and shared rate-limiting rows rather than
  mapped as an independent primitive. Preferences are mapped separately because
  their typed registry owns a distinct cross-tier decision.
- Zero-consumer method: full Fallow dead-code analysis reported 468 entry
  points, zero unused files, and zero unused exports. Targeted Graphify and
  source-consumer probes then found the field-level PL-013 candidate.
- The operator approved PL-011, PL-012, and PL-013 on 2026-07-17. All three
  were delivered by 3.9.2.8–10.
