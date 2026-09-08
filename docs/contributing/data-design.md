# Data design

Read this when adding or changing stored state, domain representations, queries,
sync, or lifecycle behavior. Review the changed domain and affected producers and
consumers. A feature change needs a bounded design argument, not a database-wide
audit.

## Five review lenses

1. Represent valid states directly. Name the states and allowed transitions.
   Couple a state tag to its valid payload rather than independent flags and
   optional fields that admit contradictory combinations. Enforce invariants
   across writers with boundary validation and appropriate database constraints.
   Keep historical timestamps when they record useful facts alongside canonical
   state.
2. Give each fact an owner. Identify canonical storage, derived values, caches,
   and projections. A projection needs a source, freshness or rebuild mechanism,
   and failure behavior. Follow [Convex placement and the mapper durability
   exception](../CONVEX.md#data-model). Similar names across stores are an
   investigation lead, not proof of duplicated authority.
3. Choose representations for actual operations. Trace reads, writes, ordering,
   cardinality, growth, and access checks. Prefer bounded indexed reads and
   coherent transactions. Investigate repeated scans, sorting, or parallel
   structures maintained to compensate for an awkward representation. Justify
   denormalization with an access benefit and a consistency owner. Add indexes
   and table splits for demonstrated needs.
4. Make updates and sync coherent. Account for concurrency, retries, partial
   failure, stale generations, replay, deletion, and reconnect. Separate
   ephemeral coordination from durable truth. Follow the existing [sync engine
   and I/O rules](../CONVEX.md#the-sync-engine). Optimistic client state must
   reconcile or roll back against authoritative outcomes and access changes.
5. Define the whole lifetime. Name ownership, authorization, provenance,
   freshness, purge or retention, and migration compatibility. Show how existing
   records and old/new readers and writers coexist, how backfill is verified,
   and what evidence permits retirement of old storage.

Apply all five lenses to a selected domain seam. A boolean, JSON field,
projection, bounded collection read, or separate table is not itself a defect.
A finding needs a concrete invalid state, duplicated authority, or evidenced
access or sync problem, and an explanation of how the proposed model reduces
that problem. Green tests alone cannot supply that argument.

## Existing owners

Use the existing declarations when a change touches these responsibilities.
Update their owning slice and registered contract instead of adding a second
registry.

| Responsibility | Source |
| --- | --- |
| Neon table ownership, permitted writers, authorization decisions, transaction boundaries | [DATA_OWNERSHIP](../../src/composition/__tests__/data-ownership-registry.ts) and the schema exports in [drizzle-schema](../../src/composition/drizzle-schema.ts) |
| ESI placement, refresh owner, freshness and durable mirrors | [ESI_DATASET_ENTRIES](../../src/lib/esi-datasets/entries.ts) |
| Growth and retention | [TABLE_GROWTH_STORIES](../../src/composition/__tests__/table-growth-registry.ts) |
| Account and character purge contributors | [PURGE_CONTRIBUTORS](../../src/composition/purge/register-all.ts) and [account lifecycle](../../src/composition/account-lifecycle/account-purge.ts) |
| Convex placement, mapper durability, authorization, sync and I/O | [CONVEX.md](../CONVEX.md), [scoped rules](../../convex/AGENTS.md), and [schema](../../convex/schema.ts) |
| SQL migrations and local database setup | [migration files](../../drizzle), [database code](../../src/db), and [local development](../../README.md#local-development) |
| Verification choice | [Testing principles](testing-principles.md) and [browser test selection](end-to-end-testing.md) |

## Migration evidence

A storage contraction needs producer and consumer evidence across jobs, deployed
versions, rollback versions, and stale clients. Use expand, migrate, verify,
then contract where those versions must coexist. A source schema edit does not
prove that a hosted deployment has migrated.

Record the target environment and migration identity separately from the source
SHA. Verify a backfill with its first run, an idempotent rerun, and a census of
remaining incompatible records. Cursor exhaustion after skipped work is not
completion. Keep legacy role handling and old-client compatibility until their
retirement conditions are met. An empty table or a search with no matches does
not authorize a drop.

[LGI-111](https://linear.app/lgitools/issue/LGI-111) owns the pending hosted cleanup
catalog. Reconcile its rows before proposing another cleanup. The deferred
`0061_drop_characters_role_preferences.sql` removal is not an invitation to
reintroduce or execute that contraction without new compatibility evidence.

## Completion evidence

The ordinary PR or design note records the invariant, canonical owner, relevant
access pattern, affected producers and consumers, migration implications, and
focused behavioral evidence. Explain any remaining gap and the decision it
blocks. Use the lightest verification that can falsify the behavior, following
the existing testing principles. Prose-only guidance does not need an application
test asserting that the guidance exists.

Recurring reviews use the [data-design audit workflow](../workflows/data-design-audit.md)
for selection and checkpointing. The design criteria stay here.
