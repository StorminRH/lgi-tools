## The SDE Pipeline

The SDE pipeline is the quieter half of EVE integration. ESI is live and budgeted; the SDE is bulk, static, and heavy. It is the game’s reference dump: types, groups, categories, dogma attributes, blueprints, map data, stations, and the raw facts that the planner and combat calculations stand on.

The mistake would be treating that as just another API response.

The first serious SDE pipeline in the repo came from [PR #32](https://github.com/StorminRH/lgi-tools/pull/32). At that point the goal was practical: give the Industry Planner enough static data to understand blueprint recipes, compute build trees, and seed the market-price table with every type the planner would later need. The app used third-party-shaped flat data because it was available and easy to reason about. That let the planner move forward, but it also meant the app was shaped around someone else’s flattening of CCP’s data.

That changed in [PR #71](https://github.com/StorminRH/lgi-tools/pull/71). I directed the pipeline toward CCP’s first-party JSONL export and kept the database close to CCP’s native records. A blueprint is no longer split first into a set of flat activity tables just because that was the old shape. The SDE source module downloads CCP’s latest archive, streams it to disk, extracts only the files LGI.tools actually uses, and returns file paths to the ingest layer. The important rail is that large files stay large-file work: stream to disk, extract selected entries, read JSONL line by line, and avoid buffering the world into memory because that was the easiest code to generate.<sup><a href="#code-sde-source">1</a></sup>

The ingest layer keeps network, parsing, and database work separated. It downloads and extracts first. It parses the universe files before opening the database transaction. Only then does it truncate and refill the SDE-backed tables. That order matters. A slow download or CPU-bound parse should not hold a database transaction or a pinned session open. This is the same lesson that shows up in the rest of the repo: scarce coordination belongs around the part that needs coordination, not around everything that happens to be nearby.<sup><a href="#code-sde-ingest">2</a></sup>

The pipeline itself is deliberately above the feature slices. It composes the EVE data ingest, the blueprint tree resolver, market-price type seeding, and station-name resolution from one orchestration layer instead of making those slices import each other. That boundary matters because the SDE is not “an Industry Planner thing.” The planner uses it heavily, but wormhole NPC stats, search, map data, station names, and price tracking all touch pieces of the same static foundation.<sup><a href="#code-sde-pipeline">3</a></sup>

The blueprint resolver is where the SDE work became more than importing rows. EVE blueprints are a graph. A finished item can require intermediate components, those components can require more components, and reactions sit beside manufacturing. The resolver materializes two outputs: nested build trees and flat raw-material totals. Those outputs are stored in Postgres because computing the entire graph on every page view would turn static data into request-time work.

The first resolver also taught me not to trust a high-level assumption just because it sounds like game logic. I had treated cycle warnings as if the SDE contained legitimate self-referential recipes. [PR #33](https://github.com/StorminRH/lgi-tools/pull/33) proved that was wrong. Those rows were deprecated non-recipes where an item was listed as an ingredient of itself. The fix was not to ignore cycles in general. The repo now drops that narrow self-reference shape, demotes a blueprint whose whole recipe was self-referential, and still fails loudly if any unexpected cycle appears. That is the kind of correction I want in the dev log: I did not just patch the symptom; the rule changed.<sup><a href="#code-sde-tree-index">4</a></sup><sup><a href="#code-sde-tree-write">5</a></sup>

[PR #72](https://github.com/StorminRH/lgi-tools/pull/72) tightened the resolver after the CCP-native migration. The earlier CCP-native pipeline still flattened each blueprint’s nested activity object into intermediate row lists because that matched the old resolver. That was safe, but it was also needless translation. The resolver now builds indexes directly from the native `activities` JSON. The validation gate proved the output stayed byte-identical, so the refactor removed overhead without changing the user-facing result.<sup><a href="#code-sde-tree-index">4</a></sup>

Validation is the part that made the source migration possible. Once the schema moved from third-party flat files to CCP-native JSONL, raw-table equality stopped being a useful proof. The repo needed to prove the output instead. The validation script compares flat materials, nested trees, and sleeper combat stats against committed fixtures. When those differ, the script does not silently bless the new result. It forces the difference into the open: real CCP data change or reshaping bug. The Archon divergence during the migration is the example that made that rule feel worth it. The gate found a real recipe change, not a parser failure, and that difference had to be signed off instead of hidden inside a “successful” import.<sup><a href="#code-sde-validation">6</a></sup>

The SDE refresh path also has to serialize. A full re-ingest is a destructive rewrite of shared reference tables, followed by derived tree rebuilding and seeding. [PR #34](https://github.com/StorminRH/lgi-tools/pull/34) fixed the advisory-lock path after I learned that session-scoped locks do not protect anything if they run through Neon’s pooled endpoint. For the SDE pipeline, that is not theoretical. Two overlapping ingests can leave the app in a torn state. So cron and build-time callers use the direct, unpooled connection and fail closed if the lock connection would be unsafe.

The daily SDE cron owns real drift. It checks the stored SDE version against CCP’s manifest, exits quickly when the version matches, records the “remote unreachable” case without doing doomed work, takes the SDE advisory lock only when needed, runs the full pipeline, updates the stored version, and revalidates the cached blueprint structure tag. That last step matters because much of the planner reads SDE-backed structure through long-lived caches. A no-deploy SDE update still needs to invalidate those static reads.<sup><a href="#code-sde-cron">7</a></sup>

The biggest operational correction came later in [PR #149](https://github.com/StorminRH/lgi-tools/pull/149). I had allowed the deploy-time SDE step to re-ingest when CCP published a new SDE build. That sounded safe because the code was idempotent. In practice it failed a production deploy: the build-time gate ran a write-heavy SDE import immediately before `next build` prerendered pages that also needed the database, and the prerender hit a timeout. The fix was to narrow the deploy-time job to bootstrap only. If a preview branch or first production deploy has empty SDE tables, the build loads the data because the pages need it. If the database is already populated and CCP has drifted, the deploy stands down and lets the daily cron handle the refresh.<sup><a href="#code-sde-bootstrap">8</a></sup>

That is a good example of how “idempotent” is not the same as “safe anywhere.” A heavy operation can be logically repeatable and still be the wrong thing to run in the middle of a deploy.

So the SDE pipeline’s final shape is more specific than “import game data.” Download only the needed CCP files. Stream and parse them without holding database coordination. Store CCP-native structures where that preserves meaning. Materialize expensive derived outputs once. Validate output, not just inputs. Serialize destructive rewrites on a real session lock. Let cron own drift. Let deploys bootstrap empty databases, not surprise production with a full re-ingest at build time.

That is the version of SDE work that fits an AI-built project: every broad instruction becomes a set of rails, and every mistake that was easy for AI to repeat becomes a rule the repo can enforce.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-sde-source" file="src/data/eve-data/source.ts" lines="19-41,91-124,151-171" lang="ts" -->
```ts id="k9j7rm"
// CCP first-party SDE (JSON Lines) — the ACTIVE source.
//
// CCP publishes the Static Data Export straight from the Tranquility build
// pipeline as one zip of `.jsonl` files. This module owns only
// "bytes → the files we need on disk"; parsing those lines into rows is the
// ingest layer's job.
const CCP_SDE_BASE = 'https://developers.eveonline.com/static-data';
const CCP_SDE_LATEST_ZIP_URL = `${CCP_SDE_BASE}/eve-online-static-data-latest-jsonl.zip`;
const CCP_SDE_LATEST_MANIFEST_URL = `${CCP_SDE_BASE}/tranquility/latest.jsonl`;

// Stream the zip to a `.tmp` file then atomically rename. A mid-stream network
// drop would otherwise leave a partial zip at `dest`, and Vercel reuses /tmp
// across warm Lambda invocations.
async function downloadZipTo(dest: string): Promise<void> {
  const res = await fetchWithTimeout(
    CCP_SDE_LATEST_ZIP_URL,
    { headers: { 'User-Agent': OUTBOUND_USER_AGENT } },
    SDE_DOWNLOAD_TIMEOUT_MS,
  );
  const tmp = `${dest}.tmp`;
  await pipeline(Readable.fromWeb(res.body as NodeWebReadableStream<Uint8Array>), createWriteStream(tmp));
  await rename(tmp, dest);
}

// Extract just the files we need out of the zip on disk, streaming each entry
// to its own atomically-renamed `.tmp`.
export async function downloadSdeJsonl(): Promise<SdeJsonlPaths> {
  await mkdir(JSONL_CACHE_DIR, { recursive: true });
  const zipPath = join(JSONL_CACHE_DIR, 'sde-jsonl.zip');
  await downloadZipTo(zipPath);
  try {
    await extractEntries(zipPath, paths);
  } finally {
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}
```

<!-- uth:code id="code-sde-ingest" file="src/data/eve-data/ingest.ts" lines="51-83,86-123" lang="ts" -->
```ts id="p4nfxe"
// Generic streaming pipeline: JSONL file → one parsed object per line → batched
// insert. `types.jsonl` is ~149 MB / 52k lines, so we read line-by-line via
// readline and never buffer the whole file.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  let batch: T[] = [];
  for await (const line of rl) {
    const mapped = mapRow(JSON.parse(line.trim()) as Record<string, unknown>);
    if (!mapped) continue;
    batch.push(mapped);
    if (batch.length >= BATCH_SIZE) {
      await flush(batch);
      batch = [];
    }
  }
  if (batch.length > 0) await flush(batch);
}

export async function runIngest(db: PostgresJsDatabase): Promise<IngestSummary> {
  const paths = await downloadSdeJsonl();

  // Parse the universe files into the in-memory dataset BEFORE opening the
  // transaction: parsing is CPU-bound and touches no DB, so it must not hold a
  // pinned connection / open transaction.
  const universe = await parseUniverse(paths);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}, ${industryBlueprints}, ${typeDogma}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
    );
    // streaming inserts follow...
  });
}
```

<!-- uth:code id="code-sde-pipeline" file="src/db/sde-pipeline.ts" lines="43-106" lang="ts" -->
```ts id="s3r0uu"
// Seed market_prices with one row per tracked type ID that isn't already
// present. NULL prices, epoch staleness, source 'esi' — the next price-refresh
// cron tick (or on-demand request) fills them in.
export async function seedTrackedTypes(db: AnyPgDb): Promise<SeedSummary> {
  const tracked = await listTrackedTypeIds(db);
  const missing = await listMissingTypeIds(db, tracked);
  if (missing.length === 0) return { tracked: tracked.length, missing: 0, inserted: 0 };

  for (let i = 0; i < rows.length; i += BATCH) {
    const written = await db
      .insert(marketPrices)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoNothing()
      .returning({ typeId: marketPrices.typeId });
    inserted += written.length;
  }

  return { tracked: tracked.length, missing: missing.length, inserted };
}

export async function runSdePipeline(db: AnyPgDb): Promise<SdePipelineSummary> {
  const ingest = await runIngest(db);
  const resolve = await resolveAllTrees(db);
  const seed = await seedTrackedTypes(db);
  const stationNames = await resolveNpcStationNames(db);
  return { ingest, resolve, seed, stationNames, durationMs: Date.now() - start };
}
```

<!-- uth:code id="code-sde-tree-index" file="src/data/eve-data/tree-resolver.ts" lines="112-133,149-220" lang="ts" -->
```ts id="hv6s4w"
export function activitiesToRows(
  blueprintTypeId: number,
  activities: BlueprintActivities,
): { mats: MaterialRow[]; prods: ProductRow[] } {
  const mats: MaterialRow[] = [];
  const prods: ProductRow[] = [];
  for (const name of INDUSTRY_ACTIVITY_NAMES) {
    const act = activities?.[name];
    if (!act) continue;
    for (const m of act.materials ?? []) {
      mats.push({ blueprintTypeId, materialTypeId: m.typeID, quantity: m.quantity });
    }
    for (const p of act.products ?? []) {
      prods.push({ blueprintTypeId, productTypeId: p.typeID, quantity: p.quantity });
    }
  }
  return { mats, prods };
}

export function buildIndexesFromActivities(rows: BlueprintActivityRow[]): Indexes {
  const ordered = [...rows].sort((a, b) => {
    const au = a.published === false ? 1 : 0;
    const bu = b.published === false ? 1 : 0;
    return au - bu || a.blueprintTypeId - b.blueprintTypeId;
  });

  for (const { blueprintTypeId, activities } of ordered) {
    const { mats, prods } = activitiesToRows(blueprintTypeId, activities);
    const ownProducts = new Set(prods.map((p) => p.productTypeId));
    const realMaterials = mats
      .filter((m) => !ownProducts.has(m.materialTypeId))
      .map((m) => ({ typeId: m.materialTypeId, quantity: m.quantity }));
    if (realMaterials.length > 0) blueprintMaterials.set(blueprintTypeId, realMaterials);

    const degenerate = mats.length > 0 && realMaterials.length === 0;
    if (degenerate) continue;
    for (const p of prods) {
      if (productToBlueprint.has(p.productTypeId)) continue;
      productToBlueprint.set(p.productTypeId, { blueprintTypeId, quantityPerRun: p.quantity });
    }
  }

  return { blueprintMaterials, productToBlueprint };
}
```

<!-- uth:code id="code-sde-tree-write" file="src/data/eve-data/tree-resolver.ts" lines="25-43,160-170,239-296,520-575" lang="ts" -->
```ts id="v54c19"
// How many runs of a producing blueprint a parent's need represents, as a
// FRACTION — `quantity / quantityPerRun`, deliberately NOT rounded up.
function runsFor(quantity: number, quantityPerRun: number): number {
  if (quantityPerRun === 0) throw new Error('runsFor: quantityPerRun is zero');
  return quantity / quantityPerRun;
}

// Content hash of the blueprint recipe data, the resolver's idempotency gate.
// Sensitive to recipe edits in the reference blueprints plus global edge counts.
export async function computeTreeResolverHash(db: AnyPgDb): Promise<string> {
  // ...folds algorithm version, blueprint count, edge counts, reference samples,
  // and published flags into one hash...
}

export async function resolveAllTrees(db: AnyPgDb): Promise<ResolveSummary> {
  const hashBefore = await getSdeMetaValue(db, SDE_META_KEY_TREE_HASH);
  const hashAfter = await computeTreeResolverHash(db);
  if (!forceRebuild && hashBefore === hashAfter && (await hasResolvedTrees(db))) {
    return { skipped: true, hashBefore, hashAfter, durationMs: Date.now() - start, /* ... */ };
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}`);
    // write flat materials and trees in batches...

    const { cycleWarnings } = resolver.stats();
    if (cycleWarnings.length > 0) {
      throw new Error(
        `tree resolver detected ${cycleWarnings.length} unexpected cycle(s); ` +
          `first few: ${cycleWarnings.slice(0, 5).join(' | ')}`,
      );
    }

    await setSdeMetaValue(tx, SDE_META_KEY_TREE_HASH, hashAfter);
  });
}
```

<!-- uth:code id="code-sde-validation" file="scripts/validate-resolver-output.ts" lines="3-37,52-67,172-205,211-236" lang="ts" -->
```ts id="m9u3hf"
/**
 * The SDE source/schema was redesigned from Fuzzwork's flat CSV tables to CCP's
 * native nested JSONL. The old "identical raw tables" proof no longer applies,
 * so correctness is asserted at the OUTPUT layer instead.
 *
 * The golden fixtures are captured ONCE from the pre-migration pipeline and
 * committed. After the migration this script re-reads the same outputs from a
 * CCP-native pipeline and asserts equality.
 */
const REFERENCE_BLUEPRINTS = {
  Rifter: 691,
  Drake: 24699,
  Archon: 23758,
  Legion: 29987,
};
const SLEEPER_TYPE_IDS = [30188, 30189, 30190, 30191, 30192, 30193, 30194, 30195, 30196, 30197];

async function main(): Promise<void> {
  const [flat, trees, sleeper] = await Promise.all([
    readFlatMaterials(),
    readTrees(),
    readSleeperStats(),
  ]);

  console.log('[check] flat materials (cost basis)');
  // compare fixtures...

  if (failures > 0) {
    console.error(
      `[check] FAILED — ${failures} divergence(s). Investigate (real CCP data ` +
        `difference vs reshaping bug) and get operator sign-off before updating any fixture.`,
    );
    process.exit(1);
  }
}
```

<!-- uth:code id="code-sde-cron" file="src/app/api/cron/refresh-sde/route.ts" lines="30-43,55-87,89-133" lang="ts" -->
```ts id="eu5t8z"
// On drift (stored sde_version != CCP's current build number), acquires the
// SDE advisory lock and runs the full pipeline inline: JSONL ingest → tree
// resolver → tracked-types seeding.
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const db = drizzle(directClient);
  const storedVersion = await getSdeMetaValue(db, SDE_META_KEY_VERSION);
  const remoteVersion = await getRemoteSdeVersion();

  if (remoteVersion !== null && storedVersion === remoteVersion) {
    await logSdeCronEvent({ outcome: 'up-to-date', sdeVersion: storedVersion });
    return Response.json({ status: 'up-to-date', sdeVersion: storedVersion });
  }

  if (storedVersion !== null && remoteVersion === null) {
    await logSdeCronEvent({ outcome: 'remote-unreachable', sdeVersion: storedVersion });
    return Response.json({ status: 'remote-unreachable', sdeVersion: storedVersion });
  }

  const reserved = await directClient.reserve();
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) return Response.json({ status: 'busy' });

    const summary = await runSdePipeline(db);
    if (remoteVersion) await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
    revalidateTag(BLUEPRINT_STRUCTURE_TAG, 'max');
    const marketPrices = await summarizeMarketPricesRowCount(db);
    return Response.json({ status: 'reingested', summary, marketPrices });
  } finally {
    try {
      await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
    } finally {
      reserved.release();
    }
  }
}
```

<!-- uth:code id="code-sde-bootstrap" file="src/db/ingest-sde-if-empty.ts" lines="3-21,91-155,169-174" lang="ts" -->
```ts id="pe7gns"
// Deploy-time SDE BOOTSTRAP. Runs on every `pnpm vercel-build`, but only
// ingests when the eve-data tables are empty or incomplete — a brand-new branch
// or the first prod deploy that ships these tables.
//
// It deliberately does NOT re-ingest on CCP version DRIFT. A full pipeline run
// is a ~15s burst of DB writes, and running it immediately before prerender
// loads the DB enough to stall the prerender's own reads.

const hasRows =
  Number(rowCount) > 0 &&
  Number(universeRowCount) > 0 &&
  Number(jumpsRowCount) > 0;

if (!hasRows) {
  console.log('Auto-ingesting SDE (eve-data tables empty or incomplete on this branch)…');
  const summary = await runSdePipeline(db);
  if (remoteVersion) await setSdeMetaValue(db, SDE_META_KEY_VERSION, remoteVersion);
  console.log('SDE pipeline complete.');
  console.log(JSON.stringify(summary, null, 2));
  return;
}

const drifted = remoteVersion !== null && storedVersion !== remoteVersion;
console.log(
  drifted
    ? `SDE re-ingest deferred to the daily cron (drift: stored=${storedVersion ?? '<none>'} remote=${remoteVersion}; ${rowCount} attribute rows present).`
    : `SDE ingest skipped (already at SDE version "${storedVersion}", ${rowCount} attribute rows present).`,
);

const resolve = await resolveAllTrees(db);
```
<!-- uth:code-excerpts:end -->

