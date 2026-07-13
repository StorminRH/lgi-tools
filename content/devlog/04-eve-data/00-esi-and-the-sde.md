## ESI and the SDE
<!-- updated: 2026-06-30 -->

This is where LGI.tools stops being a generic web app and becomes an EVE tool.

EVE data does not come from one place, and that was one of the first lessons I had to encode into the architecture. There is the static shape of the game, and there is the live state of the game. Those are different problems.

The static side is the SDE, EVE’s Static Data Export. That is where the app gets the durable universe model: item types, groups, categories, dogma attributes, blueprints, map data, stations, and the raw facts that make the planner and combat calculations possible. The SDE is not something I want a page to nibble from while a user is waiting. The repo treats it as a bulk archive: download it, extract only the files the app actually needs, parse it, store it locally, and query the local database afterward.<sup><a href="#code-eve-sde-source">1</a></sup>

The live side is ESI, EVE’s HTTP API. That is where the app gets data that changes outside the static export: market orders, authenticated character data, corporation data, online status, jobs, assets, and similar records. ESI is not a one-time archive. It has cache windows, rate limits, error limits, authentication rules, response-shape risk, and player-specific privacy boundaries. So the app does not treat ESI as “just fetch a URL.” It treats ESI as a boundary that every caller has to approach through shared code.<sup><a href="#code-eve-esi-posture">2</a></sup>

A mistake I made early was thinking mostly about whether the data arrived, not enough about how the app identified itself and what contract it was asking for. [PR #37](https://github.com/StorminRH/lgi-tools/pull/37) tightened that posture. Every outbound EVE-facing call now uses one self-identifying User-Agent, and the ESI base URL avoids the moving `/latest` label. Instead, the repo pins the compatibility date in one config constant. That means an ESI route shape should change only when I deliberately review and bump the date, not because a provider-side label drifted while the app was asleep.<sup><a href="#code-eve-user-agent">3</a></sup><sup><a href="#code-eve-esi-config">4</a></sup>

[PR #48](https://github.com/StorminRH/lgi-tools/pull/48) added the other half of that boundary: outside services do not get to hold a serverless function forever, and their response bodies do not become trusted just because the HTTP status was 200. The shared timeout wrapper now sits in front of outbound calls, while Zod schemas validate the pieces of external responses the app actually consumes. That includes market responses and fallback responses. The pattern is simple: fail fast at the edge, then let the caller choose the existing fallback or degradation path.<sup><a href="#code-eve-market-boundary">5</a></sup>

The SDE has its own shape. [PR #71](https://github.com/StorminRH/lgi-tools/pull/71) moved the project away from third-party-shaped flat SDE files and onto CCP’s first-party JSONL export. That is the right long-term source, but it also meant the pipeline had to respect the size of the data. The source module downloads the latest JSONL zip, streams it to disk with atomic renames, and extracts only the selected files the app uses. It does not inflate the whole archive into memory just because that would be easier to ask an AI agent to write.<sup><a href="#code-eve-sde-source">1</a></sup>

The ingest layer keeps the same discipline. Large JSONL files are read line by line and written in batches. The universe parser runs before the database transaction opens, because parsing a large file is CPU-bound work and should not hold a database transaction or pinned connection hostage. Only after the download and parse work is done does the pipeline start the database write. That is a small detail, but it reflects the same rule that shows up elsewhere in the project: do not mix slow network or parsing work with scarce database coordination unless there is a reason.<sup><a href="#code-eve-sde-ingest">6</a></sup>

ESI has the opposite problem. It is not huge in one request, but it is easy to waste calls. Public market data can be cached or fall back when degraded. Authenticated reads need a different posture because they carry a player or corporation token. The shared authenticated reader handles the ordinary mechanics once: attach the bearer token, replay the held ETag when there is one, understand `304 Not Modified`, walk paginated collections, and return soft errors for owner-specific 4xx responses. The later ESI gate section goes into the budget and caching machinery; the point here is that every ESI consumer should not rediscover conditional and paginated reads for itself.<sup><a href="#code-eve-authed-read">7</a></sup>

That distinction changed how I direct feature work. If a feature needs item definitions, blueprint activities, dogma stats, or map facts, the right question is usually: “is the SDE pipeline storing the right local shape?” If a feature needs current market state or player-owned data, the right question is: “which ESI path owns the request, the cache window, the auth boundary, and the fallback behavior?” Those questions keep AI from turning every missing value into a new ad hoc fetch.

So this chapter is the bridge between the source material and the machinery. The SDE is bulk, static, first-party, and local after ingest. ESI is live, budgeted, conditional, and sometimes authenticated. Treating them as the same thing would make the code simpler for one session and worse for every session after that.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-eve-sde-source" file="src/data/eve-data/source.ts" lines="19-41,91-124,151-171" lang="ts" -->
```ts
// CCP first-party SDE (JSON Lines) — the ACTIVE source.
//
// CCP publishes the Static Data Export straight from the Tranquility build
// pipeline as one zip of `.jsonl` files (one JSON object per line). This module
// owns only "bytes → the files we need on disk"; parsing those lines into
// rows is the ingest layer's job.

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
  // ...
}

// Extract just the files we need out of the zip on disk, streaming each
// entry to its own atomically-renamed `.tmp`.
export async function downloadSdeJsonl(): Promise<SdeJsonlPaths> {
  await mkdir(JSONL_CACHE_DIR, { recursive: true });
  // ...
  await downloadZipTo(zipPath);
  try {
    await extractEntries(zipPath, paths);
  } finally {
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}
```

<!-- uth:code id="code-eve-esi-posture" file="src/lib/esi/index.ts" lines="66-82" lang="ts" -->
```ts
// Label-less by design: CCP warns against the `/latest` label (it can shift
// behavior when they bump what it points at), so we drop it and pin the
// contract via the X-Compatibility-Date header instead (src/config/esi.ts).
const ESI_BASE_URL = 'https://esi.evetech.net';

// The only sanctioned way to construct an ESI URL — the host literal is
// lint-banned outside this slice so every consumer arrives here, where
// esiFetch (and the shared budget) is the only dispatch on offer.
export function esiUrl(path: string): string {
  return `${ESI_BASE_URL}${path}`;
}

export async function esiFetch(
  url: string,
  init?: RequestInit,
  opts?: EsiFetchOptions,
): Promise<Response> {
  // ...
}
```

<!-- uth:code id="code-eve-user-agent" file="src/config/user-agent.ts" lines="5-14" lang="ts" -->
```ts
// Maintainer contact for outbound API etiquette. CCP's ESI guidelines and
// Fuzzwork both want a reachable contact so they can warn before throttling
// rather than cut us off.
const OUTBOUND_CONTACT = 'https://lgi.tools/contact';

// Sent on every outbound third-party call (ESI, Fuzzwork). Conventional ESI
// User-Agent shape `App/<version> (<contact>)`.
export const OUTBOUND_USER_AGENT = `LGI.tools/${APP_VERSION} (${OUTBOUND_CONTACT})`;
```

<!-- uth:code id="code-eve-esi-config" file="src/config/esi.ts" lines="1-8" lang="ts" -->
```ts
// ESI request posture. The base URL is label-less (no /latest, /dev, /legacy);
// this reviewed date pins the API contract so a CCP-side `latest` bump can't
// silently reshape what we parse. Sent as a forced header on every ESI call.
export const ESI_COMPATIBILITY_DATE = '2025-08-26';
```

<!-- uth:code id="code-eve-market-boundary" file="src/data/market-prices/source.ts" lines="28-47,75-86" lang="ts" -->
```ts
// ESI's /markets/{region}/orders/ response item shape — only the fields
// we actually use. Boundary schema: ESI sends more keys; z.object ignores
// the unknown ones, so an upstream addition can't break parsing, but a
// changed/missing consumed field rejects the body at the boundary.
const esiOrderSchema = z.object({
  type_id: z.number(),
  is_buy_order: z.boolean(),
  price: z.number(),
  volume_remain: z.number(),
});

function parseEsiOrders(body: unknown): EsiOrder[] {
  const result = esiOrdersSchema.safeParse(body);
  if (!result.success) throw new EsiContractError();
  return result.data;
}

// Bounded-concurrency worker pool. If any worker throws, a shared `cancelled`
// flag short-circuits the other workers' next iteration.
```

<!-- uth:code id="code-eve-sde-ingest" file="src/data/eve-data/ingest.ts" lines="51-83,86-123" lang="ts" -->
```ts
// Generic streaming pipeline: JSONL file → one parsed object per line → batched
// insert. `types.jsonl` is ~149 MB / 52k lines, so we read line-by-line via
// readline and never buffer the whole file.
async function streamInsert<T extends Record<string, unknown>>(
  path: string,
  mapRow: (row: Record<string, unknown>) => T | null,
  flush: (batch: T[]) => Promise<void>,
): Promise<number> {
  // ...
}

export async function runIngest(
  db: PostgresJsDatabase,
  opts: IngestOptions = {},
): Promise<IngestSummary> {
  const paths: SdeJsonlPaths = await downloadSdeJsonl();

  // Parse the universe files into the in-memory dataset BEFORE opening the
  // transaction: parsing is CPU-bound and touches no DB, so it must not hold a
  // pinned connection / open transaction.
  const universe = await parseUniverse(paths);

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`TRUNCATE TABLE ${blueprintFlatMaterials}, ${blueprintTrees}, ${industryBlueprints}, ${typeDogma}, ${dgmAttributeTypes}, ${eveTypes}, ${eveGroups}, ${eveCategories} RESTART IDENTITY CASCADE`,
      );
      // ...
    });
  } finally {
    // ...
  }
}
```

<!-- uth:code id="code-eve-authed-read" file="src/lib/esi/authed-read.ts" lines="3-23,44-60,109-138" lang="ts" -->
```ts
// Authed ESI reads — the ONE shared conditional + paginated reader for every
// per-owner ESI consumer.
//
// The gate's own ETag cache is unauthenticated-only, so an authed reader replays
// its own held ETag and the raw 304 passes straight through.
//
// 5xx / 420 / budget-exhaustion throw out of esiFetch. A 4xx (403 a missing
// role, 404 a vanished owner) is a soft 'error' result, not a throw.

export async function readEsiAuthed(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl?: RlSnapshot,
): Promise<EsiAuthedRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  if (res.status === 304) return { kind: 'unchanged', expiresAt };
  if (res.status === 200) {
    return { kind: 'fresh', body: (await res.json()) as unknown, etag: res.headers.get('ETag'), expiresAt };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

export async function readEsiPagedAuthed(
  basePath: string,
  accessToken: string,
  heldEtags: string[],
  rl?: RlSnapshot,
): Promise<EsiPagedRead> {
  const first = await fetchPage(basePath, 1, heldEtags[0] ?? null, accessToken, rl);
  // ...
}
```
<!-- uth:code-excerpts:end -->
