## Borrowed vs. Built

A lot of this project starts with other people’s work.

That is not a weakness. EVE is too large to rebuild from memory, and the web has already solved plenty of problems I should not ask AI to invent again. The harder question is where borrowing stops. A spreadsheet, a community API, a library, or a first-party export can be a good starting point, but if the app depends on that thing for correctness, I eventually need to decide whether LGI.tools owns the rule or is just reflecting someone else’s snapshot.

The first version of the wormhole-sites data came from a community-maintained Google Sheet. That was the right early move. It let the site get a useful feature on screen before I had native tooling for every piece of EVE data behind it. But it also created a hidden problem: the Sheet was still shaped like the source of truth. A routine ingest could wipe out any local correction the next time it ran. [PR #1](https://github.com/StorminRH/lgi-tools/pull/1) changed that boundary. The Sheet became a historical seed, and Postgres became authoritative for the site catalogue. The schema still remembers some of the Sheet’s vocabulary, like source tabs and signature labels, because that is useful provenance. But the app no longer treats the Sheet as something it must keep asking for permission.<sup><a href="#code-borrowed-site-schema">1</a></sup>

That same pattern repeated with combat math. The Sheet carried precomputed sleeper DPS, EHP, and EWAR values. Those numbers were useful, but they were also frozen outputs. If the formulas were wrong, stale, or based on old game data, the database would faithfully preserve the mistake. [PR #2](https://github.com/StorminRH/lgi-tools/pull/2) moved that work into code. The repo now keeps pure combat-stat formulas that take raw EVE attributes and compute the values directly. The old Sheet snapshot became a test fixture, not the runtime authority. That is the difference I care about: borrowed data can verify the implementation, but it should not silently own the implementation forever.<sup><a href="#code-borrowed-npc-math">2</a></sup>

Prices had a similar transition. Fuzzwork was a practical source for market aggregates, and keeping it was better than pretending the app could absorb every upstream failure cleanly. But once the app needed better control over freshness, source attribution, and order-book behavior, the primary path moved to EVE’s official market API in [PR #28](https://github.com/StorminRH/lgi-tools/pull/28). Fuzzwork stayed, but as a fallback path with explicit attribution. That matters because “this price came from the official source” and “this price came from the circuit breaker” are not the same claim. The row records that difference, and the fallback code is isolated enough that it can be removed later if the project stops needing it.<sup><a href="#code-borrowed-market-source">3</a></sup><sup><a href="#code-borrowed-fuzzwork-fallback">4</a></sup>

The bigger version of this lesson is the SDE, EVE’s Static Data Export. Early on, the app used third-party-shaped SDE data because it was available and easy to ingest. That was fine while the project was proving itself. But as the Industry Planner and combat calculations became more important, the translation layer became a liability. [PR #71](https://github.com/StorminRH/lgi-tools/pull/71) moved the pipeline to CCP’s first-party JSONL and reshaped the database around CCP’s records instead of around the old flat files. The later SDE section goes into the ingest pipeline and validation gates; the important point here is ownership. If CCP is the permanent source, the repo should store the data in CCP’s shape and make any app-specific transformation explicit.<sup><a href="#code-borrowed-eve-schema">5</a></sup>

That is the pattern I try to follow now. Borrow the source when it helps me learn the domain. Borrow the library when the problem is generic. Keep the fallback when removing it would make the app brittle. But once a borrowed thing becomes load-bearing, I try to move the rule into the repo: a schema, a parser, a test fixture, a validator, a source-attribution field, or a narrow adapter with a clear deletion path.

This is especially important because the codebase is AI-built. An AI agent will happily build around whatever looks authoritative. If a stale snapshot sits in the database, it may treat that snapshot as truth. If a third-party response shape is consumed without validation, it may build features on assumptions nobody reviewed. If two sources produce similar data with no provenance, it may merge them as if they mean the same thing.

So “what I borrowed” and “what I built” is not a moral distinction. It is an ownership boundary. Borrowed sources helped LGI.tools move quickly. Built boundaries are what keep those sources from becoming invisible dependencies.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-borrowed-site-schema" file="src/features/wormhole-sites/schema.ts" lines="11-23,45-67,83-99" lang="ts" -->
```ts
// Raw labels from the Sheet's row-2 col-B "signature label".
// Kept distinct from `site_type` because the Sheet's wording is its own source of truth.
export const SIGNATURE_LABELS = [
  'Anomaly',
  'Relic Signature',
  'Data Signature',
  'Gas Signature',
  'Ore Signature',
] as const;

export const sites = pgTable('sites', {
  id: serial('id').primaryKey(),
  sourceTab: text('source_tab').notNull(),
  name: text('name').notNull(),
  siteType: siteTypeEnum('site_type').notNull(),
  signatureLabel: text('signature_label').notNull(),
  wormholeClass: wormholeClassEnum('wormhole_class'),
  blueLootIsk: bigint('blue_loot_isk', { mode: 'number' }),
  resourceValueIsk: bigint('resource_value_isk', { mode: 'number' }),
});

// Per-NPC combat stats are computed live from raw EVE SDE attributes via
// src/data/npc-stats as of 2.7.1. The columns that used to cache them are
// dropped in drizzle/0009. `type_id` is the new join key.
export const npcs = pgTable('npcs', {
  sleeperName: text('sleeper_name').notNull(),
  sleeperClassCode: text('sleeper_class_code').notNull(),
  typeId: integer('type_id').notNull(),
});
```

<!-- uth:code id="code-borrowed-npc-math" file="src/data/npc-stats/math.ts" lines="3-12,16-61,98-107" lang="ts" -->
```ts
// Pure formulas for per-NPC combat stats. No DB imports — takes a flat
// `{ attrId: value }` map and returns typed shapes. Spec is the
// historical snapshot fixtures + spot-checks recorded in math.test.ts.
//
// SDE attribute IDs that show up here are real CCP IDs from dgmAttributeTypes.

const ATTR = {
  rateOfFire: 51,
  turretDamageMult: 64,
  damageEm: 114,
  damageTherm: 116,
  damageKin: 117,
  damageExp: 118,
  structureHp: 9,
  shieldHp: 263,
  armorHp: 265,
  webSpeedFactor: 20,
  warpScramCount: 105,
  neutAmount: 97,
  rrepAmount: 1455,
} as const;

function computeTurretDps(attrs: AttrMap) {
  const mult = val(attrs, ATTR.turretDamageMult);
  const rofMs = val(attrs, ATTR.rateOfFire);
  if (mult <= 0 || rofMs <= 0) return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  const alpha = scaleDamage(damageQuad(attrs), mult);
  const dps = divideDamage(alpha, rofMs / 1000);
  return { dps, alpha };
}
```

<!-- uth:code id="code-borrowed-market-source" file="src/data/market-prices/source.ts, src/data/market-prices/types.ts" lines="22-31,42-47" lang="ts" -->
```ts
// ESI source dispatcher. Above BULK_THRESHOLD types stale at once, the
// region-dump path streams every order in The Forge and filters in memory.
// Below the threshold, per-type calls are cheaper. Either way, a Fuzzwork
// fallback covers ESI degradation — preserving the per-row staleness
// contract so the next cron tick gets a fresh attempt.

// ESI's /markets/{region}/orders/ response item shape — only the fields
// we actually use. Boundary schema: ESI sends more keys; z.object ignores
// the unknown ones, so an upstream addition can't break parsing.

export type PriceSource = 'esi' | 'fuzzwork-fallback' | 'fuzzwork';
```

<!-- uth:code id="code-borrowed-fuzzwork-fallback" file="src/data/market-prices/source-fallback.ts" lines="9-17,26-47,76-82" lang="ts" -->
```ts
// Fuzzwork fallback path. Retained as a circuit-breaker target for the ESI
// source in source.ts: if ESI bulk returns 5xx or the per-type calls fail,
// the dispatcher reaches into this file for one batch round-trip and rewrites
// the source attribution to 'fuzzwork-fallback' on the way out.
//
// This file is intentionally self-contained — the dispatcher in source.ts is
// the only consumer. When Fuzzwork is eventually retired, the entire file
// deletes cleanly.

const FUZZWORK_AGGREGATES = 'https://market.fuzzwork.co.uk/aggregates/';

const fuzzworkSideSchema = z.object({
  weightedAverage: z.string(),
  max: z.string(),
  min: z.string(),
  percentile: z.string(),
});

// Source attribution is 'fuzzwork' here. The dispatcher in source.ts
// rewrites to 'fuzzwork-fallback' when calling this as a circuit-breaker
// target.
```

<!-- uth:code id="code-borrowed-eve-schema" file="src/data/eve-data/schema.ts" lines="17-23,88-104,116-124" lang="ts" -->
```ts
// Eve Static Data Export (SDE) tables. Sourced from CCP's first-party SDE,
// published straight from the Tranquility build pipeline as one zip of `.jsonl`
// files. The tables are shaped to CCP's native records rather than a flat
// per-table remap.

// typeDogma — every type's dogma attributes, one JSONB row per type, mirroring
// CCP's `typeDogma.jsonl` record (`{ _key: typeID, dogmaAttributes: [...] }`).
export const typeDogma = pgTable('type_dogma', {
  typeId: integer('type_id').primaryKey(),
  attributes: jsonb('attributes').notNull(),
});

// Industry blueprints — one JSONB document per blueprint, mirroring CCP's
// `blueprints.jsonl` record. `activities` holds CCP's whole nested object verbatim.
export const industryBlueprints = pgTable('industry_blueprints', {
  blueprintTypeId: integer('blueprint_type_id').primaryKey(),
  maxProductionLimit: integer('max_production_limit').notNull(),
  activities: jsonb('activities').notNull(),
});
```
<!-- uth:code-excerpts:end -->

