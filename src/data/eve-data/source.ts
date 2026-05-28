import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

// Fuzzwork SDE dump URLs. Swapping to CCP's official SDE later means
// replacing this module only — nothing in ingest.ts or queries.ts knows
// where the bytes come from.
const FUZZWORK_BASE = 'https://www.fuzzwork.co.uk/dump/latest';

type SdeDumpName =
  | 'invCategories'
  | 'invGroups'
  | 'invTypes'
  | 'dgmAttributeTypes'
  | 'dgmTypeAttributes'
  | 'industryBlueprints'
  | 'industryActivity'
  | 'industryActivityMaterials'
  | 'industryActivityProducts';

const SDE_DUMPS: readonly SdeDumpName[] = [
  'invCategories',
  'invGroups',
  'invTypes',
  'dgmAttributeTypes',
  'dgmTypeAttributes',
  'industryBlueprints',
  'industryActivity',
  'industryActivityMaterials',
  'industryActivityProducts',
] as const;

// `invTypes.csv.bz2` is the canonical "did CCP patch the SDE?" marker.
// All Fuzzwork dumps share the same modification timestamp when CCP
// rebuilds, so any one of them would work; invTypes is the largest and
// stablest. Drift-detection lives in the weekly cron + the build-time
// gate in `ingest-sde-if-empty.ts`.
const SDE_VERSION_PROBE_NAME: SdeDumpName = 'invTypes';

export type SdeDumpPaths = Record<SdeDumpName, string>;

const CACHE_DIR = join(tmpdir(), 'lgi-sde');

function urlFor(name: SdeDumpName): string {
  return `${FUZZWORK_BASE}/${name}.csv.bz2`;
}

function localPathFor(name: SdeDumpName): string {
  return join(CACHE_DIR, `${name}.csv.bz2`);
}

async function downloadOne(name: SdeDumpName): Promise<string> {
  const dest = localPathFor(name);
  if (existsSync(dest)) return dest;
  const url = urlFor(name);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Fetch failed for ${name}: ${res.status} ${res.statusText}`);
  }
  // Write to .tmp and rename on success. A mid-stream network drop
  // would otherwise leave a partial bz2 at `dest`, and Vercel reuses
  // /tmp across warm Lambda invocations — the next call's
  // `existsSync(dest)` would return true and feed the corrupt file
  // straight to the CSV parser. Atomic rename means a partial write
  // never becomes the cached path.
  const tmp = `${dest}.tmp`;
  try {
    await pipeline(
      Readable.fromWeb(res.body as unknown as NodeWebReadableStream<Uint8Array>),
      createWriteStream(tmp),
    );
    await rename(tmp, dest);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
  return dest;
}

export async function downloadDumps(): Promise<SdeDumpPaths> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entries = await Promise.all(
    SDE_DUMPS.map(async (name) => [name, await downloadOne(name)] as const),
  );
  return Object.fromEntries(entries) as SdeDumpPaths;
}

export async function cleanupDumps(paths: SdeDumpPaths): Promise<void> {
  await Promise.all(
    Object.values(paths).map((p) => unlink(p).catch(() => undefined)),
  );
}

// HEAD the version-probe dump and return its Last-Modified header verbatim.
// The weekly cron + the build-time gate compare this against the stored
// `sde_version` in `eve_data_meta`. Returns null when the header is absent
// or the request fails — callers treat null as "version unknown, assume
// drift" rather than as a hard error so a transient Fuzzwork outage never
// blocks a deploy.
export async function getRemoteSdeVersion(): Promise<string | null> {
  try {
    const res = await fetch(urlFor(SDE_VERSION_PROBE_NAME), { method: 'HEAD' });
    if (!res.ok) return null;
    return res.headers.get('last-modified');
  } catch {
    return null;
  }
}
