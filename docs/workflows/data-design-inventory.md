# Data-design coverage inventory

This is a starting queue for the [audit workflow](data-design-audit.md), derived
from source at `167f4db5` on 2026-09-08. It is an inventory, not a completed audit.
The source declares 61 app-owned Neon public tables and 17 Convex tables.
Each table below has one primary family; cross-family dependencies stay linked.
A row is a candidate seam and may need smaller named slices.

## Inventory authority

Derive the current Neon inventory from schema exports in
[drizzle-schema](../../src/composition/drizzle-schema.ts), joining actual SQL
names to [DATA_OWNERSHIP](../../src/composition/__tests__/data-ownership-registry.ts).
That registry owns the write/read allowances and transaction claims. Derive
Convex table names from [schema](../../convex/schema.ts), then trace function
producers, subscribed queries, and consuming client state for the selected seam.
Use [ESI_DATASET_ENTRIES](../../src/lib/esi-datasets/entries.ts) for dataset
ownership and refresh paths, [TABLE_GROWTH_STORIES](../../src/composition/__tests__/table-growth-registry.ts)
for lifetime claims, and [PURGE_CONTRIBUTORS](../../src/composition/purge/register-all.ts)
for deletion coverage. Their existing gates own completeness; this document
must not become another runtime registry.

At the start of a cycle, compare those sources with the Linear index. Queue
every newly declared table and materially changed consumer. Reconcile removals
against deployment and migration evidence before marking them retired. Record
unmatched deployed objects as explicit inventory gaps with an owner.

The [September 8 design record](https://linear.app/lgitools/document/rotating-data-design-audit-shared-standards-and-cursor-automation-f743e92dbd68)
reported nine managed `neon_auth` tables and one Drizzle migration table in Neon
main. That historical observation is not current deployed verification. Names
of those nine managed tables remain unverified in this preparation. Treat
`neon_auth` as provider-managed authentication metadata and
`drizzle.__drizzle_migrations` as migration bookkeeping, outside automatic app
remediation. Enumerate and classify their actual names through authorized
metadata access before claiming deployed inventory coverage. No live Convex
schema was verified here. Source SHA and deployed schema identity are separate
checkpoint fields.

## 1. Identity, access and lifecycle

Ten Neon tables and two Convex tables.

| Candidate slice | Tables | Producer, consumer, and client trail |
| --- | --- | --- |
| Auth identity and ownership transfer | Neon `user`, `session`, `account`, `verification`, `jwks`, `characters`, `corp_access_audit` | Better Auth adapter and `platform/auth`; affiliation refresh; `composition/account-lifecycle`; active-character and authorization consumers. Include unlink, transfer, and purge before identity deletion. |
| Preferences | Neon `user_preferences` | `data/preferences` queries, mutations, and purge; `PreferencesProvider` and consuming features. |
| Map creation, grants, lifecycle and projection | Neon `maps`, `map_access`; Convex `mapAccess`, `mapAccessProjectionWatermarks` | `createProjectedMap` → `createMapAtomic` → `projectStagedMapAccess` → `projectMapAccess` / `reconcileMapClaims` → `publishCreatedMap`; `applyMapAccessUpdate` → `applyAuthorizedMapGrantChange`; catalogue, switcher, access editor/dialogs, lifecycle dialogs, and `watchMapAccess`. |

Entry owners are [auth schema](../../src/db/auth-schema.ts),
[map storage](../../src/data/maps), [access projection](../../src/composition/map-access-projection.ts),
and [Convex access projection](../../convex/mapAccessProjection.ts).
Reconcile LGI-71/73 and LGI-111 before lifecycle contraction. Hidden map creation
and grants must remain coherent through projection failure and cleanup.

## 2. Collaborative Atlas representation

Seven Convex tables.

| Candidate slice | Tables | Producer, consumer, and client trail |
| --- | --- | --- |
| Systems and connection states | `mapSystems`, `mapConnections`, `mapJumpBookkeeping` | `mapAuthoringHome`, `mapAuthoringFields`, collapse/tombstone/sweep and jump helpers; `watchMapSystems`, `watchMapConnections`, `watchMapUnresolvedHoles`; `useMapChainPages` → `useMapChain` / `useMapChainMergeChainState`, optimistic rows and editors. |
| Signatures, notes and activity | `mapSignatures`, `mapNotes`, `mapSignatureActivity` | `mapScan`, `mapStatics`, signature helpers; `watchMapSignatures` / `watchMapSystemSignatures`; scanner and system-panel state. |
| Event representation and retention | `mapEvents` | Map mutation event writers; `watchMapEvents`; events panel and chain purge. Check kind/payload coupling while retaining useful history. |

Entry owners are [Convex functions](../../convex), [shared map contracts](../../src/data/maps),
and [mapper clients](../../src/mapper). The [mapper durability exception](../CONVEX.md#data-model)
authorizes primary collaborative state here. It cannot be classified as a cache
and deleted on the premise that Neon can rebuild it. Reconcile LGI-109 and its
existing Origin draft 152 before signature lookup work.

## 3. Live presence and synchronization

Eight Convex tables.

| Candidate slice | Tables | Producer, consumer, and client trail |
| --- | --- | --- |
| Engine presence and legacy online cutover | `syncSubjects`, `syncPresence`, `characterOnline` | `useSyncSubject` → engine heartbeat and browser channel coordination → scan/sweep → dispatch; `PresenceProvider` and live status consumers. Reconcile LGI-57/49 before retiring legacy storage. |
| Tracking, location, coverage and token leases | `mapTracking`, `characterLocation`, `characterLocationCovered`, `characterLocationOnline`, `characterLocationAccess` | `characterLocationSync.syncUser` → Neon token door / ESI → `applySyncResults` → `mapTrackingLive.forMap` / coverage; tracking controls, `useTrackedSystem`, `useMapCoverage`, `JumpDoorbellObserver`. |

Entry owners are [engine](../../convex/engine.ts), [engine core](../../convex/lib/engineCore.ts),
[browser sync](../../src/lib/sync-engine.ts), and [location tracking](../../src/data/location-tracking).
Follow generation fencing through lease acquisition, apply, revocation, and
purge. `mapTracking` shares the documented durability exception. Reconcile
LGI-105/106, LGI-110 and in-flight access or sync work before changing consumers.

## 4. ESI ingestion and personal industry data

Eighteen Neon tables.

| Candidate slice | Tables | Producer, consumer, and client trail |
| --- | --- | --- |
| Skills and industry jobs | `character_skills`, `character_skill_syncs`, `character_industry_jobs`, `character_industry_job_syncs`, `corp_industry_jobs`, `corp_industry_job_syncs` | Deferred dataset worker → owning `skill-queue` / `industry-jobs` feature → live skills, jobs and slot views; freshness and purge declarations. Split by dataset. |
| Assets and blueprints | `owned_assets`, `owned_asset_syncs`, `owned_blueprints`, `owned_blueprint_syncs` | Dataset refresh → encrypted snapshot → parsed projection → freshness stamp; owned-data readers and planner contexts. Include snapshot references and stale refresh races. |
| Structures and saved planning | `corp_structures`, `corp_structure_syncs`, `corp_structure_sharing`, `corp_structure_rigs`, `custom_structures`, `saved_plans` | `refreshCorpStructuresForUser`, owning feature queries/mutations, sharing authorization; planner contexts, `SavedPlansManager`, `CustomStructureBuilder`. Split ESI mirrors from app-authored plans. |
| Snapshot and refresh queue lifetime | `esi_snapshots`, `esi_refresh_jobs` | `data/esi-refresh-jobs` claims/retries → worker → dataset owner; snapshot encryption and retention, projection completion, freshness-last behavior and purge. |

Use the dataset and purge registries above to select actual refresh, read, and
cleanup paths. The same owner's raw response, parsed projection, and freshness
record can have different purposes. Trace their failure behavior before calling
them duplicated truth.

## 5. Shared reference data and operational records

Thirty-three Neon tables.

| Candidate slice | Tables | Producer, consumer, and client trail |
| --- | --- | --- |
| SDE types and blueprint derivation | `eve_categories`, `eve_groups`, `eve_types`, `dgm_attribute_types`, `type_dogma`, `industry_blueprints`, `blueprint_trees`, `blueprint_flat_materials` | SDE pipeline and transactional rebuild → search/planner data; raw blueprint recipe → derived trees/materials. Establish derivation and rebuild ownership before simplification. |
| SDE geography and client assets | `eve_regions`, `eve_constellations`, `eve_solar_systems`, `eve_station_operations`, `eve_npc_stations`, `eve_system_jumps`, `eve_data_meta` | SDE pipeline → versioned universe assets and geography consumers; revision/freshness and cache invalidation. |
| Wormhole site catalog | `sites`, `waves`, `npcs`, `site_resources`, `escalations` | Seed migration → `features/wormhole-sites` readers and site views. Seed-only ownership is explicit in DATA_OWNERSHIP. |
| Market and industry reference | `market_prices`, `market_history`, `market_history_meta`, `adjusted_prices`, `industry_cost_indices` | Market/industry refresh owners → planner pricing and `PricingProvider`; retention and freshness boundaries. |
| Wormhole observations and promoted statics | `wh_observations`, `wh_statics_snapshots`, `wh_system_statics` | Observation writers; `recordSnapshot` → operator `promoteSnapshot` → wormhole codex / Atlas statics. Separate reviewable snapshots from serving truth. |
| Operational and search records | `usage_logs`, `domain_events`, `gsc_search_analytics`, `gsc_sitemaps`, `gsc_url_inspection` | Telemetry/event writers and GSC refresh → admin/search consumers; retention and attribution. Split by owner. |

Entry owners are the corresponding `src/data` and `src/features` slices named by
DATA_OWNERSHIP. Use growth stories for reference corpora, historical rows, and
operational queues rather than assuming every growing table needs the same TTL.

## Historical probes

These preparation walkthroughs inspect repository history and current source.
They are static evidence at `167f4db5`; no runtime test, hosted migration, or
Cursor automation execution is claimed.

| Probe | Evidence inspected and preparation result |
| --- | --- |
| Historical invalid lifecycle states | Commit `e7d38891` describes the former independent timestamp representation and adds an exclusive lifecycle status with compatibility writes. This supports a concrete representation finding in the historical scope. Commit `0c4d4ec0` then holds its CHECK for a later land, so the first change alone cannot prove deployed constraint enforcement. |
| Already-fixed state representation | Current `src/data/maps/lifecycle-contract.ts` declares five exclusive statuses and status-specific constructors. The historical proposal must deduplicate against that implementation and LGI-71/73. Remaining hosted contraction requires LGI-111 evidence; source inspection cannot mark it complete. |
| Legitimate access projection | `src/composition/map-access-projection.ts` reserves a revision and derives claims from Neon; `convex/mapAccessProjection.ts` rejects older revisions and records a watermark. This supports distinct authority and projection roles, not a finding based only on duplicate-looking map access names. It is not a full runtime consistency audit. |
| Compatibility and clean bounded helper | Commit `5be9f6b3` adds `currentRolesFromStored`; current `convex/lib/mapEntityContracts.ts` retains legacy `owner` decoding to `admin`, and `convex/lib/mapAccess.ts` applies capability checks to normalized roles. For that compatibility helper, the five lenses find no new actionable issue in static scope: current role values are canonical, stored legacy values have a migration purpose, normalization is bounded to the claim's role list, reads reconcile old and current representations, and retirement remains gated. No cleanup PR follows. |
| Premature contraction | Commit `5be9f6b3` removes `0061_drop_characters_role_preferences.sql`. A missing source migration or zero-row census cannot justify restoring the drop; serving, rollback and stale-client evidence remains required. |

Activation still needs recorded workflow dry-runs for missing live access,
interruption/resume, overlapping draft detection, checkpoint persistence, and a
clean result that advances without creating a PR. Simulations can establish
instruction behavior; only an actual Cursor run can establish its access,
model binding, usage settings, and supported concurrency behavior.
