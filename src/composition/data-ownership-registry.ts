// DATA OWNERSHIP REGISTRY (3.10.2.3) — the sibling of table-growth-registry.ts.
// The growth registry answers "why does this table not grow without bound?";
// this one answers "who owns it, who else may touch it, what does Postgres
// itself enforce, what is the write's transaction boundary, and what
// authorization model guards it". Two registries rather than one wide entry
// shape because growth policy and ownership policy change on different axes.
//
// Test-only, exactly like its sibling: no runtime route, the DB proxy, or a
// migration imports this module; the dataset-declaration census
// (src/esi-datasets/dataset-declarations.test.ts) is its only consumer.
import { is, SQL } from 'drizzle-orm';
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './drizzle-schema';

/**
 * The slices this registry reasons about: every table owner plus every slice declared as a
 * permitted cross-owner writer. Deliberately narrower than the repository's Fallow zone map, which
 * remains the mechanical authority for file-to-zone ownership.
 */
type SliceId =
  | 'data/domain-events'
  | 'data/esi-refresh-jobs'
  | 'data/esi-snapshots'
  | 'data/eve-data'
  | 'data/gsc'
  | 'data/industry-indices'
  | 'data/market-history'
  | 'data/market-prices'
  | 'data/maps'
  | 'data/preferences'
  | 'data/telemetry'
  | 'data/wh-observations'
  | 'data/wh-statics'
  | 'features/custom-structures'
  | 'features/industry-jobs'
  | 'features/industry-planner'
  | 'features/owned-assets'
  | 'features/owned-blueprints'
  | 'features/owned-structures'
  | 'features/skill-queue'
  | 'features/wormhole-sites'
  | 'platform/auth'
  | 'composition/account-lifecycle'
  | 'composition/pipelines'
  | 'scripts';

/** The auth tables live in one shared module rather than a slice directory; this is their owner. */
const AUTH_SCHEMA_PATH = 'src/db/auth-schema.ts';
const AUTH_SLICE: SliceId = 'platform/auth';
const ZONED_ROOTS = ['data', 'features', 'platform', 'composition'] as const;

/**
 * Derives a production file's owning slice from its path: `<root>/<slice>` inside the zoned roots,
 * the bare root elsewhere, with the shared auth schema aliased to its semantic owner. Returns the
 * structural id rather than a `SliceId` so an unrecognised slice fails the cross-owner-write check
 * loudly instead of forcing this module to mirror the Fallow zone map.
 */
export function sliceOfPath(filePath: string): string {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized.endsWith(AUTH_SCHEMA_PATH) || normalized === 'db/auth-schema.ts') {
    return AUTH_SLICE;
  }
  const segments = normalized.replace(/^src\//, '').split('/');
  const [root, second] = segments;
  if (root === undefined) return '';
  const zoned = (ZONED_ROOTS as readonly string[]).includes(root);
  return zoned && second !== undefined && segments.length > 1 ? `${root}/${second}` : root;
}

/**
 * The authorization data classes. Every persisted table resolves to exactly one, and the
 * row-level-security decision is recorded per class rather than per table so the actual decision
 * axes stay visible.
 */
type DataClassId =
  | 'global-reference'
  | 'identity-credential'
  | 'personal'
  | 'corp-shared'
  | 'operational';

/** One data class's recorded authorization decision, its justification, and what would reopen it. */
interface DataClassDecision {
  readonly decision: 'application-authorization-only' | 'application-plus-rls';
  readonly justification: string;
  readonly reviewTrigger: string;
}

// Every class resolves the same way today for one measured reason, so the shared half of each
// justification is declared once (docs/security/db-privilege-runbook.md §2, §5, §8).
const NO_DB_IDENTITY =
  'the runtime holds one shared database role (today neondb_owner, post-cutover lgi_runtime) with no per-request database identity, so an RLS policy would have no subject to bind to';
const IDENTITY_CAMPAIGN =
  'the backlogged RLS tenant-isolation campaign, which propagates per-request identity to the database connection';

/**
 * The per-data-class authorization decision resolved against the live role model in
 * `docs/security/db-privilege-runbook.md`. All five classes are application-authorization-only
 * today; the census asserts that no migration, table, or policy contradicts that.
 */
export const DATA_CLASS_DECISIONS: Record<DataClassId, DataClassDecision> = {
  'global-reference': {
    decision: 'application-authorization-only',
    justification: `Catalogue and market data is identical for every viewer and carries no tenant axis to isolate; ${NO_DB_IDENTITY}.`,
    reviewTrigger: 'A per-viewer or licensed subset of the reference corpus is introduced.',
  },
  'identity-credential': {
    decision: 'application-authorization-only',
    justification: `Better Auth reaches these tables through its own adapter on the shared runtime role, so a policy would filter the authenticator itself; ${NO_DB_IDENTITY}.`,
    reviewTrigger: `${IDENTITY_CAMPAIGN}, or adopting an auth adapter that connects as the authenticated subject.`,
  },
  personal: {
    decision: 'application-authorization-only',
    justification: `Every read and write is scoped by a user id or resolved owner key in the owning slice's query layer; ${NO_DB_IDENTITY}.`,
    reviewTrigger: `${IDENTITY_CAMPAIGN}, or exposing these tables to any client-reachable database endpoint.`,
  },
  'corp-shared': {
    decision: 'application-authorization-only',
    justification: `Corporation visibility is a role- and sharing-decision join the application resolves per request, which is richer than a row predicate can express; ${NO_DB_IDENTITY}.`,
    reviewTrigger: `${IDENTITY_CAMPAIGN}, or corporation sharing gaining a delegation model the application layer cannot resolve alone.`,
  },
  operational: {
    decision: 'application-authorization-only',
    justification: `Snapshots, queued jobs, and domain events are infrastructure rows read by operators and background workers rather than by tenants; ${NO_DB_IDENTITY}.`,
    reviewTrigger: `${IDENTITY_CAMPAIGN}, or surfacing raw operational rows to non-admin users.`,
  },
};

const dialect = new PgDialect();

function renderPredicate(predicate: SQL): string {
  return dialect.sqlToQuery(predicate, 'indexes').sql.replaceAll(/\s+/g, ' ').trim();
}

function indexColumnName(column: unknown): string {
  if (is(column, SQL)) return renderPredicate(column);
  return (column as { name?: string }).name ?? '?';
}

function joinNames(columns: readonly { name: string }[]): string {
  return columns.map((column) => column.name).join(',');
}

function uniqueIndexInvariant(index: ReturnType<typeof getTableConfig>['indexes'][number]): string {
  const columns = index.config.columns.map(indexColumnName).join(',');
  const predicate = index.config.where;
  if (predicate === undefined) return `unique(${columns})`;
  return `partial-unique(${columns}) where(${renderPredicate(predicate)})`;
}

function foreignKeyInvariant(
  foreignKey: ReturnType<typeof getTableConfig>['foreignKeys'][number],
): string {
  const reference = foreignKey.reference();
  const target = getTableConfig(reference.foreignTable).name;
  return `fk(${joinNames(reference.columns)}→${target}.${joinNames(reference.foreignColumns)})`;
}

/**
 * The invariants Postgres itself enforces for one table, as normalized comparable strings
 * (`pk(...)`, `unique(...)`, `partial-unique(...) where(...)`, `fk(...)`, `check(...)`). Reads live
 * Drizzle metadata, including the column-level `.primaryKey()`/`.unique()` flags that never reach
 * `primaryKeys`/`uniqueConstraints`, so the census can diff declarations against the real schema in
 * both directions.
 */
export function describeDbInvariants(table: PgTable): string[] {
  const config = getTableConfig(table);
  const columnPrimaries = config.columns.filter((column) => column.primary);
  const invariants = [
    ...columnPrimaries.map((column) => `pk(${column.name})`),
    ...config.primaryKeys.map((key) => `pk(${joinNames(key.columns)})`),
    ...config.columns.filter((column) => column.isUnique).map((column) => `unique(${column.name})`),
    ...config.uniqueConstraints.map((constraint) => `unique(${joinNames(constraint.columns)})`),
    ...config.indexes.filter((index) => index.config.unique).map(uniqueIndexInvariant),
    ...config.foreignKeys.map(foreignKeyInvariant),
    ...config.checks.map((check) => `check(${check.name})`),
  ];
  return [...invariants].sort();
}

/** How a write to one table reaches Postgres, and therefore what atomicity its callers may assume. */
interface TransactionBoundary {
  readonly kind:
    | 'single-statement'
    | 'transactional-batch'
    | 'ordered-sequence'
    | 'adapter-managed'
    | 'read-only';
  readonly note: string;
}

/** A slice permitted to read a table it does not own, and the purpose that permits it. */
interface CrossOwnerRead {
  readonly by: SliceId;
  readonly purpose: string;
}

/** A slice permitted to write a table it does not own, and the reason that permits it. */
interface CrossOwnerWrite {
  readonly by: SliceId;
  readonly reason: string;
}

/**
 * One table's ownership, access, invariant, boundary, and data-class declaration; the
 * dataset-declaration census enforces exact cover and truth against live schema metadata.
 */
export interface DataOwnershipEntry {
  readonly table: PgTable;
  readonly owner: SliceId;
  readonly reads: 'open' | readonly CrossOwnerRead[];
  readonly writers?: readonly CrossOwnerWrite[];
  readonly invariants: readonly string[];
  readonly boundary: TransactionBoundary;
  readonly dataClass: DataClassId;
}

// Boundary notes repeated across sibling tables are declared once so 56 entries stay a
// declaration list rather than 56 near-identical prose blocks.
const SDE_BATCH = {
  kind: 'transactional-batch',
  note: 'Rebuilt by the SDE ingest inside one postgres-js `db.transaction`: TRUNCATE … CASCADE then a chunked refill, so readers never observe a half-replaced corpus. Runs only from the scripts/cron path, never the neon-http request path.',
} as const satisfies TransactionBoundary;

const SEED_ONLY = {
  kind: 'read-only',
  note: 'Seeded by migration `0006_historical_seed.sql` and never written at runtime; no production module holds a write to it.',
} as const satisfies TransactionBoundary;

const KEYED_UPSERT = {
  kind: 'single-statement',
  note: 'Each write is one keyed `insert … on conflict do update`, so a concurrent refresh of the same key is last-writer-wins with no torn row. Batches are independent statements, not a transaction.',
} as const satisfies TransactionBoundary;

const REPLACE_ALL = {
  kind: 'ordered-sequence',
  note: 'Replace-all per owner on the transaction-free neon-http driver: delete the owner\'s rows, insert the fresh set, then stamp the sync row LAST. Stamping last makes a partial failure self-healing — the owner stays stale and the next view refetches — but the sequence is not atomic, so a database constraint is the only guard against a concurrent refresh interleaving.',
} as const satisfies TransactionBoundary;

const SYNC_STAMP = {
  kind: 'single-statement',
  note: 'One freshness row per owner, written as a keyed upsert at the end of its dataset\'s replace-all sequence; it is the staleness gate the next on-view refresh reads.',
} as const satisfies TransactionBoundary;

const AUTH_ADAPTER = {
  kind: 'adapter-managed',
  note: 'Better Auth owns the row lifecycle through its own Drizzle adapter, which this registry\'s scanner cannot see. The slice\'s own direct writes (admin merges, EVE token rotation, active-character moves) are single statements guarded by compare-and-swap predicates rather than transactions.',
} as const satisfies TransactionBoundary;

const APP_SINGLE = {
  kind: 'single-statement',
  note: 'One user-scoped statement per call (insert, keyed upsert, or delete); no multi-statement invariant spans this table.',
} as const satisfies TransactionBoundary;

const SNAPSHOT_ID_FK =
  'The owned-assets snapshot foreign key is the retention pipeline\'s reference check.';

const WH_STATICS_SNAPSHOT_BATCH = {
  kind: 'transactional-batch',
  note: 'Snapshot creation takes a table lock, reuses an identical latest non-rejected ETag and digest, or supersedes the previous pending row and inserts its replacement in one postgres-js transaction. A rejected observation remains eligible for a later pending review. Promotion replaces the serving copy and marks its source snapshot promoted in one transaction; reject and retention paths change only snapshot state or remove eligible history.',
} as const satisfies TransactionBoundary;

const WH_STATICS_PROMOTE_BATCH = {
  kind: 'transactional-batch',
  note: 'Operator-only promotion deletes the prior serving copy, inserts every normalized assignment bound to the selected snapshot, and marks that snapshot promoted in one postgres-js transaction.',
} as const satisfies TransactionBoundary;

/**
 * Every persisted Neon table's owning slice, cross-owner access contract, database-enforced
 * invariants, transaction boundary, and data class. The dataset-declaration census enforces exact
 * cover against live schema reflection and diffs `invariants` against live Drizzle metadata in both
 * directions, so a schema change that is not reflected here fails the suite.
 */
export const DATA_OWNERSHIP = [
  // ---------------------------------------------------------------------------
  // data/eve-data — the shared EVE reference core every slice may read.
  // ---------------------------------------------------------------------------
  {
    table: schema.eveCategories,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveGroups,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['fk(category_id→eve_categories.id)', 'pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveTypes,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['fk(group_id→eve_groups.id)', 'pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.dgmAttributeTypes,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.typeDogma,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(type_id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.industryBlueprints,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(blueprint_type_id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.blueprintTrees,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: [
      'fk(blueprint_type_id→industry_blueprints.blueprint_type_id)',
      'pk(blueprint_type_id)',
    ],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.blueprintFlatMaterials,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: [
      'fk(blueprint_type_id→industry_blueprints.blueprint_type_id)',
      'pk(blueprint_type_id,raw_material_type_id)',
    ],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveRegions,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveConstellations,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['fk(region_id→eve_regions.id)', 'pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveSolarSystems,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: [
      'fk(constellation_id→eve_constellations.id)',
      'fk(region_id→eve_regions.id)',
      'pk(id)',
    ],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveStationOperations,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(id)'],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveNpcStations,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: [
      'fk(operation_id→eve_station_operations.id)',
      'fk(solar_system_id→eve_solar_systems.id)',
      'pk(id)',
    ],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveSystemJumps,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: [
      'fk(from_system_id→eve_solar_systems.id)',
      'fk(to_system_id→eve_solar_systems.id)',
      'pk(from_system_id,to_system_id)',
    ],
    boundary: SDE_BATCH,
    dataClass: 'global-reference',
  },
  {
    table: schema.eveDataMeta,
    owner: 'data/eve-data',
    reads: 'open',
    invariants: ['pk(key)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },

  // ---------------------------------------------------------------------------
  // features/wormhole-sites — the migration-seeded public catalogue.
  // ---------------------------------------------------------------------------
  {
    table: schema.sites,
    owner: 'features/wormhole-sites',
    reads: 'open',
    invariants: ['pk(id)', 'unique(source_tab,name)'],
    boundary: SEED_ONLY,
    dataClass: 'global-reference',
  },
  {
    table: schema.waves,
    owner: 'features/wormhole-sites',
    reads: 'open',
    invariants: ['fk(site_id→sites.id)', 'pk(id)', 'unique(site_id,wave_number)'],
    boundary: SEED_ONLY,
    dataClass: 'global-reference',
  },
  {
    table: schema.npcs,
    owner: 'features/wormhole-sites',
    reads: 'open',
    invariants: ['fk(wave_id→waves.id)', 'pk(id)', 'unique(wave_id,order_in_wave)'],
    boundary: SEED_ONLY,
    dataClass: 'global-reference',
  },
  {
    table: schema.siteResources,
    owner: 'features/wormhole-sites',
    reads: 'open',
    invariants: ['fk(site_id→sites.id)', 'pk(id)', 'unique(site_id,order_in_site)'],
    boundary: SEED_ONLY,
    dataClass: 'global-reference',
  },
  {
    table: schema.escalations,
    owner: 'features/wormhole-sites',
    reads: 'open',
    invariants: ['pk(id)', 'unique(name)'],
    boundary: SEED_ONLY,
    dataClass: 'global-reference',
  },

  // ---------------------------------------------------------------------------
  // Global market and index snapshots — one latest row per external key.
  // ---------------------------------------------------------------------------
  {
    table: schema.marketPrices,
    owner: 'data/market-prices',
    reads: 'open',
    writers: [
      {
        by: 'composition/pipelines',
        reason:
          'The SDE pipeline seeds a price row per newly imported type so the planner has a baseline before the first market refresh; a cross-slice pipeline may not live inside either slice.',
      },
    ],
    invariants: ['pk(type_id)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },
  {
    table: schema.marketHistory,
    owner: 'data/market-history',
    reads: 'open',
    invariants: ['pk(type_id,date)'],
    boundary: {
      kind: 'ordered-sequence',
      note: 'Per type: upsert the fetched daily rows in batches, prune rows past the retention cutoff, then stamp the freshness row. Not atomic; a failure mid-sequence leaves the type stale and the next refresh repeats it idempotently.',
    },
    dataClass: 'global-reference',
  },
  {
    table: schema.marketHistoryMeta,
    owner: 'data/market-history',
    reads: 'open',
    invariants: ['pk(type_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'global-reference',
  },
  {
    table: schema.adjustedPrices,
    owner: 'data/industry-indices',
    reads: 'open',
    invariants: ['pk(type_id)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },
  {
    table: schema.industryCostIndices,
    owner: 'data/industry-indices',
    reads: 'open',
    invariants: ['pk(solar_system_id,activity)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },

  // ---------------------------------------------------------------------------
  // data/gsc — Search Console reporting, admin-only but tenant-free.
  // ---------------------------------------------------------------------------
  {
    table: schema.gscSearchAnalytics,
    owner: 'data/gsc',
    reads: 'open',
    invariants: ['pk(date,dimension,key)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },
  {
    table: schema.gscSitemaps,
    owner: 'data/gsc',
    reads: 'open',
    invariants: ['pk(path)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },
  {
    table: schema.gscUrlInspection,
    owner: 'data/gsc',
    reads: 'open',
    invariants: ['pk(inspection_date,url)'],
    boundary: KEYED_UPSERT,
    dataClass: 'global-reference',
  },

  // ---------------------------------------------------------------------------
  // data/wh-observations — privacy-safe retained D16 signal corpus.
  // ---------------------------------------------------------------------------
  {
    table: schema.whObservations,
    owner: 'data/wh-observations',
    reads: 'open',
    invariants: [
      'check(wh_observations_attributable_type)',
      'check(wh_observations_hour_coarse)',
      'unique(dedupe_key)',
    ],
    boundary: KEYED_UPSERT,
    dataClass: 'operational',
  },

  // ---------------------------------------------------------------------------
  // data/wh-statics — community reference data with an operational holding pen.
  // ---------------------------------------------------------------------------
  {
    table: schema.whStaticsSnapshots,
    owner: 'data/wh-statics',
    reads: 'open',
    invariants: [
      "partial-unique(status) where(\"status\" = 'pending')",
      'pk(id)',
    ],
    boundary: WH_STATICS_SNAPSHOT_BATCH,
    dataClass: 'operational',
  },
  {
    table: schema.whSystemStatics,
    owner: 'data/wh-statics',
    reads: 'open',
    invariants: [
      'fk(source_snapshot_id→wh_statics_snapshots.id)',
      'pk(system_id,code)',
    ],
    boundary: WH_STATICS_PROMOTE_BATCH,
    dataClass: 'global-reference',
  },

  // ---------------------------------------------------------------------------
  // platform/auth — the identity and credential core (src/db/auth-schema.ts).
  // ---------------------------------------------------------------------------
  {
    table: schema.user,
    owner: 'platform/auth',
    reads: [
      {
        by: 'composition/account-lifecycle',
        purpose:
          'Resolves the human whose last linked character is being removed, so the deletion decision is made above both slices.',
      },
    ],
    writers: [
      {
        by: 'composition/account-lifecycle',
        reason:
          'Owns the whole-account deletion that must run after every slice purge contributor; sequencing it inside the auth slice would invert the composition direction.',
      },
    ],
    invariants: ['pk(id)', 'unique(email)'],
    boundary: AUTH_ADAPTER,
    dataClass: 'identity-credential',
  },
  {
    table: schema.session,
    owner: 'platform/auth',
    reads: [],
    invariants: ['fk(user_id→user.id)', 'pk(id)', 'unique(token)'],
    boundary: AUTH_ADAPTER,
    dataClass: 'identity-credential',
  },
  {
    table: schema.account,
    owner: 'platform/auth',
    reads: [
      {
        by: 'composition/account-lifecycle',
        purpose:
          'Reads the EVE character link being transferred between users to decide whether a transfer or a deletion is correct.',
      },
    ],
    writers: [
      {
        by: 'composition/account-lifecycle',
        reason:
          'Re-points an EVE character link to a different user during owner transfer, a decision that spans auth and the owning slices and therefore composes above them.',
      },
    ],
    invariants: ['fk(user_id→user.id)', 'pk(id)', 'unique(provider_id,account_id)'],
    boundary: AUTH_ADAPTER,
    dataClass: 'identity-credential',
  },
  {
    table: schema.verification,
    owner: 'platform/auth',
    reads: [],
    invariants: ['pk(id)'],
    boundary: AUTH_ADAPTER,
    dataClass: 'identity-credential',
  },
  {
    table: schema.jwks,
    owner: 'platform/auth',
    reads: [],
    invariants: ['pk(id)'],
    boundary: AUTH_ADAPTER,
    dataClass: 'identity-credential',
  },
  {
    table: schema.characters,
    owner: 'platform/auth',
    reads: [
      {
        by: 'data/telemetry',
        purpose:
          'Joins the character profile onto usage-log rows for the admin activity readout; telemetry holds the foreign key and never writes back.',
      },
    ],
    invariants: ['pk(character_id)'],
    boundary: {
      kind: 'single-statement',
      note: 'One keyed upsert per character on link or affiliation refresh, plus a single blanking update when a link is removed. `user.active_character_id` deliberately carries no foreign key to this table (documented write-ordering rationale at the column) and is repaired by a self-healing resolver instead.',
    },
    dataClass: 'identity-credential',
  },
  {
    table: schema.corpAccessAudit,
    owner: 'platform/auth',
    reads: [],
    invariants: ['pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'Append-only: one insert per corporation-access decision, plus the retention prune. No row is ever updated.',
    },
    dataClass: 'identity-credential',
  },

  // ---------------------------------------------------------------------------
  // Personal per-character and per-user datasets.
  // ---------------------------------------------------------------------------
  {
    table: schema.maps,
    owner: 'data/maps',
    reads: [],
    writers: [
      {
        by: 'scripts',
        reason:
          'The dev-only map replay tool (src/scripts/map-replay.ts) seeds one disposable local map row so a generated corpus chain has a home to replay into; the user-facing creation path is owned separately by data/maps.',
      },
    ],
    invariants: ['fk(user_id→user.id)', 'pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'User-facing creation inserts a hidden purge-queued map plus selected map_access grants in one atomic CTE before one-way access projection, then publishes by clearing both markers. Compensation retries deletion and cascades grants; exhausted cleanup stays hidden for the later purge owner. Credential-tier deletion and the dev-only replay seed remain separate owned paths.',
    },
    dataClass: 'personal',
  },
  {
    table: schema.mapAccess,
    owner: 'data/maps',
    reads: [],
    invariants: [
      'fk(map_id→maps.id)',
      'unique(map_id,owner_type,owner_id)',
    ],
    boundary: {
      kind: 'single-statement',
      note: 'Creation writes explicitly selected grants inside the same atomic CTE as the map row; compensation and account teardown delete them through the map foreign-key cascade. Grant edits atomically require admin authority on an unarchived, untombstoned map and apply one composite-keyed upsert or exact revoke, then reconverge the complete one-way Convex projection only after the guarded write succeeds.',
    },
    dataClass: 'personal',
  },
  {
    table: schema.characterSkills,
    owner: 'features/skill-queue',
    reads: [],
    invariants: ['pk(character_id)'],
    boundary: REPLACE_ALL,
    dataClass: 'personal',
  },
  {
    table: schema.characterSkillSyncs,
    owner: 'features/skill-queue',
    reads: [],
    invariants: ['pk(character_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'personal',
  },
  {
    table: schema.characterIndustryJobs,
    owner: 'features/industry-jobs',
    reads: [],
    invariants: ['pk(character_id)'],
    boundary: REPLACE_ALL,
    dataClass: 'personal',
  },
  {
    table: schema.characterIndustryJobSyncs,
    owner: 'features/industry-jobs',
    reads: [],
    invariants: ['pk(character_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'personal',
  },
  {
    table: schema.ownedAssets,
    owner: 'features/owned-assets',
    reads: [
      {
        by: 'composition/pipelines',
        purpose: `Snapshot retention checks whether a snapshot is still referenced before deleting it. ${SNAPSHOT_ID_FK}`,
      },
    ],
    invariants: [
      'fk(snapshot_id→esi_snapshots.id)',
      'pk(id)',
      'unique(owner_type,owner_id,type_id,location_id,location_flag,location_type)',
    ],
    boundary: {
      kind: 'ordered-sequence',
      note: `${REPLACE_ALL.note} Here that guard exists: the ESI projection aggregates by the natural key before every write, so the natural-key unique index rejects only already-invalid rows and turns an interleaved concurrent refresh into a caught unique violation ('superseded') rather than a silently doubled ledger. Honest residual: two racing sets that share no natural key still merge into their union — the index can reject a duplicate, not arbitrate which set wins.`,
    },
    dataClass: 'personal',
  },
  {
    table: schema.ownedAssetSyncs,
    owner: 'features/owned-assets',
    reads: [],
    invariants: ['pk(owner_type,owner_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'personal',
  },
  {
    table: schema.ownedBlueprints,
    owner: 'features/owned-blueprints',
    reads: [],
    invariants: ['pk(id)'],
    boundary: {
      kind: 'ordered-sequence',
      note: `${REPLACE_ALL.note} Residual, recorded rather than fixed: this table shares the owned-assets replace-all race but has no natural key to constrain — rows are raw per-item blueprint stacks, so two identical rows are legitimate data and no unique index can express the invariant.`,
    },
    dataClass: 'personal',
  },
  {
    table: schema.ownedBlueprintSyncs,
    owner: 'features/owned-blueprints',
    reads: [],
    invariants: ['pk(owner_type,owner_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'personal',
  },
  {
    table: schema.savedPlans,
    owner: 'features/industry-planner',
    reads: [],
    invariants: ['fk(user_id→user.id)', 'pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'One insert, update, or delete per user action. The per-user plan cap is application-enforced (count, then insert) and cannot be expressed as a plain constraint; its compensating delete over-corrects under concurrency and is recorded in docs/backlog.md rather than fixed here.',
    },
    dataClass: 'personal',
  },
  {
    table: schema.customStructures,
    owner: 'features/custom-structures',
    reads: [],
    invariants: ['fk(user_id→user.id)', 'pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'One insert, update, or delete per user action. The per-user structure cap is application-enforced with no compensating recount, so two concurrent saves at the cap can both succeed; recorded in docs/backlog.md rather than fixed here, since a cardinality rule needs a trigger or counter column this contract does not authorize.',
    },
    dataClass: 'personal',
  },
  {
    table: schema.userPreferences,
    owner: 'data/preferences',
    reads: [],
    invariants: ['fk(user_id→user.id)', 'pk(user_id,key)'],
    boundary: {
      kind: 'single-statement',
      note: 'One keyed upsert per user and preference key. `key` stays JS-validated against the registered preference vocabulary by documented design rather than a database check.',
    },
    dataClass: 'personal',
  },
  {
    table: schema.usageLogs,
    owner: 'data/telemetry',
    reads: [],
    invariants: ['fk(character_id→characters.character_id)', 'pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'Append-only: one insert per recorded tool use, plus the retention prune. No row is ever updated.',
    },
    dataClass: 'personal',
  },

  // ---------------------------------------------------------------------------
  // Corporation-shared datasets, visible through role and sharing decisions.
  // ---------------------------------------------------------------------------
  {
    table: schema.corpIndustryJobs,
    owner: 'features/industry-jobs',
    reads: [],
    invariants: ['pk(user_id,corporation_id)'],
    boundary: REPLACE_ALL,
    dataClass: 'corp-shared',
  },
  {
    table: schema.corpIndustryJobSyncs,
    owner: 'features/industry-jobs',
    reads: [],
    invariants: ['pk(user_id,corporation_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'corp-shared',
  },
  {
    table: schema.corpStructures,
    owner: 'features/owned-structures',
    reads: [],
    invariants: ['pk(corporation_id,structure_id)'],
    boundary: REPLACE_ALL,
    dataClass: 'corp-shared',
  },
  {
    table: schema.corpStructureSyncs,
    owner: 'features/owned-structures',
    reads: [],
    invariants: ['pk(corporation_id)'],
    boundary: SYNC_STAMP,
    dataClass: 'corp-shared',
  },
  {
    table: schema.corpStructureSharing,
    owner: 'features/owned-structures',
    reads: [],
    invariants: ['pk(corporation_id)'],
    boundary: APP_SINGLE,
    dataClass: 'corp-shared',
  },
  {
    table: schema.corpStructureRigs,
    owner: 'features/owned-structures',
    reads: [],
    invariants: ['pk(corporation_id,structure_id)'],
    boundary: {
      kind: 'single-statement',
      note: 'One keyed upsert per authored structure rig set. Rig-array length and tax bounds are Zod-validated on every write path, so concurrency cannot produce an out-of-range value; they are application-validated by design rather than CHECK constraints.',
    },
    dataClass: 'corp-shared',
  },

  // ---------------------------------------------------------------------------
  // Operational infrastructure — snapshots, queue, and events.
  // ---------------------------------------------------------------------------
  {
    table: schema.esiSnapshots,
    owner: 'data/esi-snapshots',
    reads: [],
    writers: [
      {
        by: 'composition/pipelines',
        reason:
          'Retention must know which snapshots the owning feature slices still reference, a cross-slice read the snapshot slice may not perform, so the prune composes above both.',
      },
    ],
    invariants: ['pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'One insert per retained raw ESI response, and one delete on the orphan-cleanup or retention path. The snapshot insert and the projection write it accompanies are NOT atomic — the caller compensates by deleting its own snapshot when the projection write does not stand.',
    },
    dataClass: 'operational',
  },
  {
    table: schema.esiRefreshJobs,
    owner: 'data/esi-refresh-jobs',
    reads: [],
    invariants: [
      'partial-unique(idempotency_key) where("status" in (\'queued\', \'running\', \'deferred_for_budget\', \'failed_retryable\'))',
      'pk(id)',
    ],
    boundary: {
      kind: 'single-statement',
      note: 'Enqueue and claim are single statements; the partial unique index over live statuses is the race authority that makes enqueue idempotent, and the loser of a claim race is coalesced from its unique violation rather than retried.',
    },
    dataClass: 'operational',
  },
  {
    table: schema.domainEvents,
    owner: 'data/domain-events',
    reads: [],
    invariants: ['pk(id)'],
    boundary: {
      kind: 'single-statement',
      note: 'Append-only: one insert per emitted event, plus the retention prune. Emission is deliberately outside the emitting write\'s failure path, so an event is only emitted once that write has stood.',
    },
    dataClass: 'operational',
  },
] as const satisfies readonly DataOwnershipEntry[];
