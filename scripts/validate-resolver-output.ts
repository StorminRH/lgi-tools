/**
 * 3.3.2 SDE migration — output-level validation gate.
 *
 * The SDE source/schema was redesigned from Fuzzwork's flat CSV tables to CCP's
 * native nested JSONL (3.3.2). The old "identical raw tables" proof no longer
 * applies, so correctness is asserted at the OUTPUT layer instead: the resolver's
 * final output (the build trees + flat materials the Industry Planner consumes)
 * and the sleeper combat stats (npc-stats) must match what the pre-migration
 * pipeline produced for a pinned reference set.
 *
 * The golden fixtures are captured ONCE from the pre-migration (Fuzzwork) pipeline
 * and committed:
 *   - __fixtures__/blueprint-flat-materials.json  (already committed; the cost basis)
 *   - __fixtures__/blueprint-trees.json           (nested TreeNode[] per blueprint)
 *   - __fixtures__/npc-combat-stats.json          (CombatStats for a sleeper set)
 *
 * After the migration this script re-reads the same outputs from a CCP-native
 * pipeline and asserts equality. A divergence is a REAL CCP-vs-Fuzzwork data
 * difference (or a reshaping bug) — investigate and get operator sign-off before
 * regenerating any fixture; never paper over it.
 *
 * Equality is order-INDEPENDENT: material/tree-input ordering reflects the source
 * row order (CSV rows vs JSONL array elements) and is not semantically meaningful,
 * so both sides are canonicalised (object keys sorted, tree inputs sorted by
 * typeId) before comparison. Quantities, structure, producedBy markers, and every
 * combat-stat number are compared exactly.
 *
 * Usage:
 *   pnpm tsx scripts/validate-resolver-output.ts            # check against fixtures (CI/preview/local)
 *   pnpm tsx scripts/validate-resolver-output.ts --capture  # (re)write the trees + sleeper fixtures
 *   DOTENV_PATH=.env.production.local pnpm tsx scripts/validate-resolver-output.ts
 *
 * Reads only resolved-output tables (blueprint_trees, blueprint_flat_materials)
 * plus the public npc-stats query — all of which are schema-stable across the
 * migration — so the same script captures (pre-migration) and checks (post).
 */

import { config } from 'dotenv';
config({ path: process.env.DOTENV_PATH ?? '.env.local' });

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { blueprintFlatMaterials, blueprintTrees } from '@/data/eve-data/schema';
import type { TreeNode } from '@/data/eve-data/tree-resolver';
import { getCombatStatsBatch } from '@/data/npc-stats/queries';
import type { CombatStats } from '@/data/npc-stats/types';

// Reference blueprints spanning the algorithm complexity spread (keys match the
// committed flat-materials fixture). 691 Rifter (T1 frigate, no recursion),
// 24699 Drake (shallow T1 components), 23758 Archon (deep capital recursion),
// 29987 Legion (T3 — the whole-run-overbuild canary).
const REFERENCE_BLUEPRINTS: Record<string, number> = {
  Rifter: 691,
  Drake: 24699,
  Archon: 23758,
  Legion: 29987,
};

// Sleeper NPC types (the "Sleepless" line) — a representative armor-tanked
// wormhole-site set whose combat stats must be unchanged by the dogma reshape.
const SLEEPER_TYPE_IDS = [
  30188, 30189, 30190, 30191, 30192, 30193, 30194, 30195, 30196, 30197,
];

const FIXTURE_DIR = join('src', 'data', 'eve-data', '__fixtures__');
const FLAT_FIXTURE = join(FIXTURE_DIR, 'blueprint-flat-materials.json');
const TREES_FIXTURE = join(FIXTURE_DIR, 'blueprint-trees.json');
const SLEEPER_FIXTURE = join(FIXTURE_DIR, 'npc-combat-stats.json');

// ---- Canonicalisation ----------------------------------------------

// Deterministic JSON with recursively sorted object keys; array order preserved
// (callers pre-sort arrays whose order is not meaningful).
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

// Sort a tree's nodes (and every nested inputs[] array) by typeId so sibling
// order from the source row stream doesn't register as a difference.
function sortTree(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .map((n) => ({ ...n, inputs: sortTree(n.inputs) }))
    .sort((a, b) => a.typeId - b.typeId);
}

// ---- DB reads (resolved output only) -------------------------------

type FlatMap = Record<string, number>; // rawTypeId(string) -> qty

async function readFlatMaterials(): Promise<Record<string, FlatMap>> {
  const ids = Object.values(REFERENCE_BLUEPRINTS);
  const rows = await db
    .select({
      blueprintTypeId: blueprintFlatMaterials.blueprintTypeId,
      rawMaterialTypeId: blueprintFlatMaterials.rawMaterialTypeId,
      totalQuantity: blueprintFlatMaterials.totalQuantity,
    })
    .from(blueprintFlatMaterials)
    .where(inArray(blueprintFlatMaterials.blueprintTypeId, ids));

  const byBlueprint = new Map<number, FlatMap>();
  for (const r of rows) {
    const map = byBlueprint.get(r.blueprintTypeId) ?? {};
    map[String(r.rawMaterialTypeId)] = Number(r.totalQuantity);
    byBlueprint.set(r.blueprintTypeId, map);
  }
  const out: Record<string, FlatMap> = {};
  for (const [name, bpId] of Object.entries(REFERENCE_BLUEPRINTS)) {
    out[name] = byBlueprint.get(bpId) ?? {};
  }
  return out;
}

async function readTrees(): Promise<Record<string, TreeNode[]>> {
  const ids = Object.values(REFERENCE_BLUEPRINTS);
  const rows = await db
    .select({
      blueprintTypeId: blueprintTrees.blueprintTypeId,
      treeJson: blueprintTrees.treeJson,
    })
    .from(blueprintTrees)
    .where(inArray(blueprintTrees.blueprintTypeId, ids));

  const byBlueprint = new Map<number, TreeNode[]>();
  for (const r of rows) byBlueprint.set(r.blueprintTypeId, r.treeJson as TreeNode[]);
  const out: Record<string, TreeNode[]> = {};
  for (const [name, bpId] of Object.entries(REFERENCE_BLUEPRINTS)) {
    out[name] = sortTree(byBlueprint.get(bpId) ?? []);
  }
  return out;
}

async function readSleeperStats(): Promise<Record<string, CombatStats>> {
  const stats = await getCombatStatsBatch(SLEEPER_TYPE_IDS);
  const out: Record<string, CombatStats> = {};
  for (const id of SLEEPER_TYPE_IDS) {
    const s = stats.get(id);
    if (s) out[String(id)] = s;
  }
  return out;
}

// ---- Compare -------------------------------------------------------

let failures = 0;

function compare(label: string, expected: unknown, actual: unknown): void {
  const e = stableStringify(expected);
  const a = stableStringify(actual);
  if (e === a) {
    console.log(`  ${label}: PASS`);
    return;
  }
  failures++;
  console.error(`  ${label}: FAIL`);
  console.error(`    expected: ${e.slice(0, 400)}${e.length > 400 ? '…' : ''}`);
  console.error(`    actual:   ${a.slice(0, 400)}${a.length > 400 ? '…' : ''}`);
}

function readFixture<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  const capture = process.argv.includes('--capture');

  const [flat, trees, sleeper] = await Promise.all([
    readFlatMaterials(),
    readTrees(),
    readSleeperStats(),
  ]);

  // Flat materials: the committed fixture is keyed by name with a `materials`
  // object. It is the frozen pre-migration truth and is NEVER rewritten by this
  // script — even in capture mode we only assert the DB still matches it.
  const flatFixture = readFixture<
    Record<string, { materials: FlatMap } | unknown>
  >(FLAT_FIXTURE);

  if (capture) {
    console.log('[capture] writing trees + sleeper fixtures from current DB');
    writeFileSync(TREES_FIXTURE, JSON.stringify(trees, null, 2) + '\n');
    writeFileSync(SLEEPER_FIXTURE, JSON.stringify(sleeper, null, 2) + '\n');
    console.log(`  wrote ${TREES_FIXTURE}`);
    console.log(`  wrote ${SLEEPER_FIXTURE}`);
    console.log('[capture] sanity-checking DB flat materials against committed fixture');
    for (const name of Object.keys(REFERENCE_BLUEPRINTS)) {
      const expected = (flatFixture[name] as { materials: FlatMap }).materials;
      compare(`flat:${name}`, expected, flat[name]);
    }
    if (failures > 0) {
      console.error(
        '[capture] DB flat materials DIVERGE from the committed fixture — ' +
          'capture aborted; the source DB is not the expected pre-migration state.',
      );
      process.exit(1);
    }
    console.log('[capture] DONE');
    process.exit(0);
  }

  console.log('[check] flat materials (cost basis)');
  for (const name of Object.keys(REFERENCE_BLUEPRINTS)) {
    const expected = (flatFixture[name] as { materials: FlatMap }).materials;
    compare(`flat:${name}`, expected, flat[name]);
  }

  console.log('[check] build trees');
  const treesFixture = readFixture<Record<string, TreeNode[]>>(TREES_FIXTURE);
  for (const name of Object.keys(REFERENCE_BLUEPRINTS)) {
    compare(`tree:${name}`, sortTree(treesFixture[name] ?? []), trees[name]);
  }

  console.log('[check] sleeper combat stats');
  const sleeperFixture = readFixture<Record<string, CombatStats>>(SLEEPER_FIXTURE);
  for (const id of SLEEPER_TYPE_IDS) {
    compare(`sleeper:${id}`, sleeperFixture[String(id)], sleeper[String(id)]);
  }

  if (failures > 0) {
    console.error(
      `\n[check] FAILED — ${failures} divergence(s). Investigate (real CCP data ` +
        `difference vs reshaping bug) and get operator sign-off before updating any fixture.`,
    );
    process.exit(1);
  }
  console.log('\n[check] PASSED — resolver output + sleeper stats match pre-migration.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[validate-resolver-output] crashed:', err);
  process.exit(1);
});
