/**
 * 3.0.4 spike — recursive blueprint tree resolver validation.
 *
 * Goal: prove the resolver produces flat material totals that match
 * Adam4EVE's manufacturing calculator (and a cross-check source for
 * Rifter) for three reference blueprints — BEFORE any 3.0.4 schema
 * code lands in src/. After 3.0.4 ships, the resolver's output IS the
 * ground truth; this is the only chance to catch first-time
 * correctness bugs.
 *
 * Reference blueprints (Fuzzwork-confirmed type IDs):
 *   - Rifter Blueprint     691    (T1 frigate, shallow, minerals only)
 *   - Drake Blueprint    24699    (BC, mid-depth, T1 components)
 *   - Archon Blueprint   23758    (Carrier, deep capital recursion)
 *
 * Run: `pnpm tsx scripts/spike-tree-resolver.ts`
 *
 * No DB. No production code dependencies. Self-contained.
 */

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { parse as parseCsv } from 'csv-parse';
import unbzip2Stream from 'unbzip2-stream';

const FUZZWORK_BASE = 'https://www.fuzzwork.co.uk/dump/latest';
const CACHE_DIR = join(tmpdir(), 'lgi-sde-spike');

const DUMPS = [
  'industryBlueprints',
  'industryActivity',
  'industryActivityMaterials',
  'industryActivityProducts',
] as const;
type DumpName = (typeof DUMPS)[number];

// Activity IDs we care about. 1 = manufacturing, 11 = reactions.
// Invention (8), copying (5), research (3, 4) are deliberately excluded
// per design doc non-goals — invention chance complicates the tree.
const INDUSTRY_ACTIVITY_IDS = new Set<number>([1, 11]);

const REFERENCE_BLUEPRINTS = {
  Rifter: 691,
  Drake: 24699,
  Archon: 23758,
} as const;

// ---- Download ------------------------------------------------------

function urlFor(name: DumpName): string {
  return `${FUZZWORK_BASE}/${name}.csv.bz2`;
}

function localPathFor(name: DumpName): string {
  return join(CACHE_DIR, `${name}.csv.bz2`);
}

async function downloadOne(name: DumpName): Promise<string> {
  const dest = localPathFor(name);
  if (existsSync(dest)) return dest;
  const url = urlFor(name);
  console.log(`  fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Fetch failed for ${name}: ${res.status} ${res.statusText}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
    createWriteStream(dest),
  );
  return dest;
}

async function downloadAll(): Promise<Record<DumpName, string>> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entries = await Promise.all(
    DUMPS.map(async (name) => [name, await downloadOne(name)] as const),
  );
  return Object.fromEntries(entries) as Record<DumpName, string>;
}

// ---- CSV streaming -------------------------------------------------

async function streamCsv(
  path: string,
  onRow: (row: Record<string, string>) => void,
): Promise<number> {
  const parser = createReadStream(path)
    .pipe(unbzip2Stream())
    .pipe(parseCsv({ columns: true, skip_empty_lines: true, relax_quotes: true }));
  let total = 0;
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    onRow(row);
    total++;
  }
  return total;
}

function toInt(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'None') return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// ---- Indexes -------------------------------------------------------

type Material = { typeId: number; quantity: number };
type Indexes = {
  // blueprintTypeId -> materials for activity 1 (manufacturing only —
  // reaction blueprints have their inputs under 11; we keep them
  // separate but a single map keyed by blueprintId is fine because
  // each blueprint has one of the two, not both).
  blueprintMaterials: Map<number, Material[]>;
  // outputTypeId -> { blueprintTypeId, quantityPerRun }
  // i.e. given a material we need, who produces it and how many per run?
  productToBlueprint: Map<number, { blueprintTypeId: number; quantityPerRun: number }>;
};

async function buildIndexes(paths: Record<DumpName, string>): Promise<Indexes> {
  const blueprintMaterials = new Map<number, Material[]>();
  const productToBlueprint = new Map<
    number,
    { blueprintTypeId: number; quantityPerRun: number }
  >();

  let matRows = 0;
  await streamCsv(paths.industryActivityMaterials, (r) => {
    const bpId = toInt(r.typeID);
    const activityId = toInt(r.activityID);
    const matId = toInt(r.materialTypeID);
    const qty = toInt(r.quantity);
    if (bpId === null || activityId === null || matId === null || qty === null) return;
    if (!INDUSTRY_ACTIVITY_IDS.has(activityId)) return;
    matRows++;
    const list = blueprintMaterials.get(bpId);
    if (list) list.push({ typeId: matId, quantity: qty });
    else blueprintMaterials.set(bpId, [{ typeId: matId, quantity: qty }]);
  });

  let prodRows = 0;
  let prodCollisions = 0;
  await streamCsv(paths.industryActivityProducts, (r) => {
    const bpId = toInt(r.typeID);
    const activityId = toInt(r.activityID);
    const prodId = toInt(r.productTypeID);
    const qty = toInt(r.quantity);
    if (bpId === null || activityId === null || prodId === null || qty === null) return;
    if (!INDUSTRY_ACTIVITY_IDS.has(activityId)) return;
    prodRows++;
    const existing = productToBlueprint.get(prodId);
    if (existing) {
      // Multiple blueprints / activities producing the same output. Real
      // case: a type can drop as a product of activity 1 (manufacturing)
      // AND be a reaction output of activity 11. Take whichever we see
      // first deterministically — both should yield the same flat
      // materials when walked. Logged so we know the count.
      prodCollisions++;
    } else {
      productToBlueprint.set(prodId, { blueprintTypeId: bpId, quantityPerRun: qty });
    }
  });

  console.log(
    `  indexed ${matRows} material rows, ${prodRows} product rows ` +
      `(${blueprintMaterials.size} blueprints, ${productToBlueprint.size} produceable types, ` +
      `${prodCollisions} multi-source products)`,
  );
  return { blueprintMaterials, productToBlueprint };
}

// ---- Recursive walker ----------------------------------------------

type FlatTotals = Map<number, bigint>;

function mergeInto(dst: FlatTotals, src: FlatTotals, multiplier: bigint): void {
  for (const [typeId, qty] of src) {
    const cur = dst.get(typeId) ?? BigInt(0);
    dst.set(typeId, cur + qty * multiplier);
  }
}

class TreeResolver {
  private memo = new Map<number, FlatTotals>();
  private cycleWarnings: string[] = [];
  private memoHits = 0;
  private memoMisses = 0;

  constructor(private indexes: Indexes) {}

  /**
   * Flat raw materials for exactly one run of the given blueprint.
   * Memoized.
   */
  private walkOneRun(blueprintId: number, visited: Set<number>): FlatTotals {
    const memoed = this.memo.get(blueprintId);
    if (memoed) {
      this.memoHits++;
      return memoed;
    }
    this.memoMisses++;

    if (visited.has(blueprintId)) {
      this.cycleWarnings.push(
        `cycle detected at blueprint ${blueprintId}, path: [${[...visited].join(' -> ')}]`,
      );
      return new Map();
    }
    visited.add(blueprintId);

    const materials = this.indexes.blueprintMaterials.get(blueprintId);
    const result: FlatTotals = new Map();
    if (!materials) {
      // Blueprint exists in industry_blueprints but has no materials —
      // odd but not fatal. Treat as zero-cost (caller will accumulate
      // nothing).
      this.memo.set(blueprintId, result);
      visited.delete(blueprintId);
      return result;
    }

    for (const mat of materials) {
      const child = this.indexes.productToBlueprint.get(mat.typeId);
      if (!child) {
        // Leaf — raw mineral, moon goo, PI input, loot, etc.
        const cur = result.get(mat.typeId) ?? BigInt(0);
        result.set(mat.typeId, cur + BigInt(mat.quantity));
        continue;
      }
      // We need mat.quantity units of this material. The child blueprint
      // produces child.quantityPerRun per run, so we need ceil(N / Q) runs.
      const runsNeeded = ceilDiv(BigInt(mat.quantity), BigInt(child.quantityPerRun));
      const childPerRun = this.walkOneRun(child.blueprintTypeId, visited);
      mergeInto(result, childPerRun, runsNeeded);
    }

    this.memo.set(blueprintId, result);
    visited.delete(blueprintId);
    return result;
  }

  resolve(blueprintId: number): FlatTotals {
    return this.walkOneRun(blueprintId, new Set());
  }

  stats(): { memoHits: number; memoMisses: number; cycleWarnings: string[] } {
    return {
      memoHits: this.memoHits,
      memoMisses: this.memoMisses,
      cycleWarnings: this.cycleWarnings,
    };
  }
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === BigInt(0)) throw new Error('ceilDiv: divisor is zero');
  return (a + b - BigInt(1)) / b;
}

// ---- Comparison ----------------------------------------------------

type KnownGoodEntry = {
  blueprintTypeId: number;
  outputTypeId: number;
  notes?: string;
  materials: Record<string, number>; // rawTypeId (as string for JSON keys) -> qty
};
type KnownGoodFile = Record<string, KnownGoodEntry>;

function totalsToJson(totals: FlatTotals): Record<string, number> {
  const out: Record<string, number> = {};
  const sortedKeys = [...totals.keys()].sort((a, b) => a - b);
  for (const k of sortedKeys) {
    const v = totals.get(k);
    if (v === undefined) continue;
    // Safe to cast — all real EVE blueprint totals fit comfortably in
    // a JS Number (Archon's tritanium needs are billions, not 2^53).
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`overflow on type ${k}: ${v}`);
    }
    out[String(k)] = Number(v);
  }
  return out;
}

type DiffResult = {
  blueprint: string;
  ok: boolean;
  missing: Array<{ typeId: number; expectedQty: number }>;
  extra: Array<{ typeId: number; actualQty: number }>;
  mismatched: Array<{ typeId: number; expectedQty: number; actualQty: number }>;
};

function diff(name: string, expected: KnownGoodEntry, actual: FlatTotals): DiffResult {
  const result: DiffResult = {
    blueprint: name,
    ok: true,
    missing: [],
    extra: [],
    mismatched: [],
  };
  const expectedKeys = new Set(Object.keys(expected.materials).map(Number));
  const actualKeys = new Set([...actual.keys()]);

  for (const k of expectedKeys) {
    const exp = expected.materials[String(k)];
    const act = actual.get(k);
    if (act === undefined) {
      result.missing.push({ typeId: k, expectedQty: exp });
      result.ok = false;
    } else if (BigInt(exp) !== act) {
      result.mismatched.push({
        typeId: k,
        expectedQty: exp,
        actualQty: Number(act),
      });
      result.ok = false;
    }
  }
  for (const k of actualKeys) {
    if (!expectedKeys.has(k)) {
      result.extra.push({ typeId: k, actualQty: Number(actual.get(k) ?? BigInt(0)) });
      result.ok = false;
    }
  }
  return result;
}

// ---- Main ----------------------------------------------------------

async function main(): Promise<void> {
  const start = Date.now();
  console.log('[spike] download');
  const paths = await downloadAll();

  console.log('[spike] index');
  const indexes = await buildIndexes(paths);

  console.log('[spike] resolve');
  const resolver = new TreeResolver(indexes);

  const output: KnownGoodFile = {};
  for (const [name, bpId] of Object.entries(REFERENCE_BLUEPRINTS)) {
    const totals = resolver.resolve(bpId);
    // Look up the produced type for documentation.
    let outputTypeId = -1;
    for (const [productId, src] of indexes.productToBlueprint) {
      if (src.blueprintTypeId === bpId) {
        outputTypeId = productId;
        break;
      }
    }
    output[name] = {
      blueprintTypeId: bpId,
      outputTypeId,
      materials: totalsToJson(totals),
    };
    console.log(
      `  ${name} (BP ${bpId} -> type ${outputTypeId}): ${totals.size} raw materials`,
    );
  }

  const stats = resolver.stats();
  console.log(
    `[spike] memo hits=${stats.memoHits} misses=${stats.memoMisses} cycles=${stats.cycleWarnings.length}`,
  );
  if (stats.cycleWarnings.length > 0) {
    console.warn('[spike] CYCLES DETECTED:');
    for (const w of stats.cycleWarnings) console.warn(`  ${w}`);
  }

  // Write output.
  const outputPath = join('scripts', 'spike-output.json');
  await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`[spike] wrote ${outputPath}`);

  // Compare against known-good if present.
  const knownGoodPath = join('scripts', 'spike-known-good.json');
  if (!existsSync(knownGoodPath)) {
    console.log(
      `[spike] no ${knownGoodPath} yet — review spike-output.json and pin known-good values from Adam4EVE before re-running.`,
    );
    console.log(`[spike] DONE in ${Date.now() - start}ms (no comparison)`);
    return;
  }

  const knownGood = JSON.parse(await readFile(knownGoodPath, 'utf8')) as KnownGoodFile;
  const diffs: DiffResult[] = [];
  for (const name of Object.keys(REFERENCE_BLUEPRINTS) as Array<
    keyof typeof REFERENCE_BLUEPRINTS
  >) {
    const expected = knownGood[name];
    if (!expected) {
      diffs.push({
        blueprint: name,
        ok: false,
        missing: [],
        extra: [],
        mismatched: [],
      });
      console.error(`[spike] no known-good entry for ${name}`);
      continue;
    }
    const totals = new Map<number, bigint>();
    for (const [k, v] of Object.entries(output[name].materials)) {
      totals.set(Number(k), BigInt(v));
    }
    const d = diff(name, expected, totals);
    diffs.push(d);
  }

  let allOk = true;
  for (const d of diffs) {
    if (d.ok) {
      console.log(`[spike] ${d.blueprint}: PASS`);
    } else {
      allOk = false;
      console.error(`[spike] ${d.blueprint}: FAIL`);
      if (d.missing.length > 0) {
        console.error(
          `  missing materials (expected, not produced): ${JSON.stringify(d.missing)}`,
        );
      }
      if (d.extra.length > 0) {
        console.error(
          `  extra materials (produced, not expected): ${JSON.stringify(d.extra)}`,
        );
      }
      if (d.mismatched.length > 0) {
        console.error(`  mismatched quantities: ${JSON.stringify(d.mismatched)}`);
      }
    }
  }

  const elapsed = Date.now() - start;
  console.log(`[spike] elapsed ${elapsed}ms`);
  if (!allOk) {
    console.error('[spike] FAILED');
    process.exit(1);
  }
  if (elapsed > 90_000) {
    console.warn(`[spike] WARNING: ran ${elapsed}ms — over 90s budget`);
  }
  console.log('[spike] PASSED');
}

main().catch((e) => {
  console.error('[spike] crashed:', e);
  process.exit(1);
});
