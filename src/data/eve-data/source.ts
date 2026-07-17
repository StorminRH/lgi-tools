import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import yauzl from 'yauzl';
import type { Entry } from 'yauzl';
import { z } from 'zod';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  fetchWithTimeout,
  SDE_DOWNLOAD_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout';

// ===========================================================================
// CCP first-party SDE (JSON Lines) — the ACTIVE source.
//
// CCP publishes the Static Data Export straight from the Tranquility build
// pipeline as one zip of `.jsonl` files (one JSON object per line). This module
// owns only "bytes → the files we need on disk"; parsing those lines into
// rows is the ingest layer's job (3.3.2b). Swapping the data source means
// touching this module only — nothing downstream knows where the bytes come
// from. The legacy Fuzzwork CSV source is parked at the bottom of this file and
// still backs the CSV ingest until 3.3.2b lands the JSONL parser.
// ===========================================================================

const CCP_SDE_BASE = 'https://developers.eveonline.com/static-data';

// Always-latest zip; 302-redirects to the build-pinned
// `…/tranquility/eve-online-static-data-<build>-jsonl.zip` (Node `fetch`
// follows redirects by default). ~84 MB compressed, 60 files at the archive
// root, ~532 MB uncompressed.
const CCP_SDE_LATEST_ZIP_URL = `${CCP_SDE_BASE}/eve-online-static-data-latest-jsonl.zip`;

// 80-byte JSONL version manifest. Its `sde` record carries the current build
// number; ETag/Last-Modified supported, cached 5 min.
const CCP_SDE_LATEST_MANIFEST_URL = `${CCP_SDE_BASE}/tranquility/latest.jsonl`;

type SdeJsonlName =
  | 'categories'
  | 'groups'
  | 'types'
  | 'dogmaAttributes'
  | 'typeDogma'
  | 'blueprints'
  // Universe (map + NPC station) files — 3.5.1a, plus `mapStargates` for the
  // jump graph in 3.7.2.2. Small (6.5KB–5MB); the huge mapMoons/mapPlanets are
  // deliberately not requested. Each name maps directly to `<name>.jsonl` in the
  // archive.
  | 'mapRegions'
  | 'mapConstellations'
  | 'mapSolarSystems'
  | 'mapStargates'
  | 'npcStations'
  | 'stationOperations'
  | 'stationServices';

const SDE_JSONL_NAMES: readonly SdeJsonlName[] = [
  'categories',
  'groups',
  'types',
  'dogmaAttributes',
  'typeDogma',
  'blueprints',
  'mapRegions',
  'mapConstellations',
  'mapSolarSystems',
  'mapStargates',
  'npcStations',
  'stationOperations',
  'stationServices',
] as const;

/**
 * The download interface 3.3.2b inherits: a map of name → on-disk path of the
 * extracted `.jsonl` file. Each file is one JSON object per line; the `_key`
 * field is the entity id (typeID/groupID/…), and `types.jsonl`'s `name` is a
 * localized object (`{en, de, …}`), NOT a flat string. `types.jsonl` is the
 * large one (~149 MB / 52k lines) — read it line-by-line, never whole.
 */
export type SdeJsonlPaths = Record<SdeJsonlName, string>;

const JSONL_CACHE_DIR = join(tmpdir(), 'lgi-sde-jsonl');

function localJsonlPathFor(name: SdeJsonlName): string {
  return join(JSONL_CACHE_DIR, `${name}.jsonl`);
}

// Stream a web response body to a `.tmp` file then atomically rename onto `dest`,
// removing the partial on failure. A mid-stream network drop would otherwise
// leave a corrupt file at `dest`, and Vercel reuses /tmp across warm Lambda
// invocations — the next call would feed that corrupt file straight to its
// parser. Atomic rename means a partial write never becomes `dest`.
async function streamToFileAtomic(
  body: ReadableStream<Uint8Array>,
  dest: string,
): Promise<void> {
  const tmp = `${dest}.tmp`;
  try {
    await pipeline(
      Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>),
      createWriteStream(tmp),
    );
    await rename(tmp, dest);
  } catch (err) {
    await unlink(tmp).catch(() => undefined);
    throw err;
  }
}

// Stream the zip to a `.tmp` file then atomically rename (see streamToFileAtomic).
async function downloadZipTo(dest: string): Promise<void> {
  const res = await fetchWithTimeout(
    CCP_SDE_LATEST_ZIP_URL,
    { headers: { 'User-Agent': OUTBOUND_USER_AGENT } },
    SDE_DOWNLOAD_TIMEOUT_MS,
  );
  if (!res.ok || !res.body) {
    throw new Error(
      `Fetch failed for SDE JSONL zip: ${res.status} ${res.statusText}`,
    );
  }
  await streamToFileAtomic(res.body, dest);
}

// Extract just the files we need out of the zip on disk, streaming each
// entry to its own atomically-renamed `.tmp`. yauzl reads the central directory
// (so the zip must be on disk) and streams one entry at a time under
// `lazyEntries`, so peak memory is the inflate buffers — never the 149 MB
// uncompressed `types.jsonl`. Stops once all of them are found rather than
// walking the remaining archive entries.
async function extractEntries(
  zipPath: string,
  paths: SdeJsonlPaths,
): Promise<void> {
  const remaining = new Map<string, string>(
    SDE_JSONL_NAMES.map((name) => [`${name}.jsonl`, paths[name]]),
  );

  await new Promise<void>((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openErr, zipfile) => {
      if (openErr || !zipfile) {
        reject(openErr ?? new Error('yauzl: failed to open zip'));
        return;
      }

      const fail = (err: unknown) => {
        zipfile.close();
        reject(err);
      };

      zipfile.on('error', fail);

      zipfile.on('entry', (entry: Entry) => {
        const dest = remaining.get(entry.fileName);
        if (!dest) {
          zipfile.readEntry();
          return;
        }
        zipfile.openReadStream(entry, (rsErr, readStream) => {
          if (rsErr || !readStream) {
            fail(rsErr ?? new Error('yauzl: failed to open read stream'));
            return;
          }
          readStream.on('error', fail);
          const tmp = `${dest}.tmp`;
          pipeline(readStream, createWriteStream(tmp))
            .then(() => rename(tmp, dest))
            .then(() => {
              remaining.delete(entry.fileName);
              if (remaining.size === 0) {
                zipfile.close();
                resolve();
              } else {
                zipfile.readEntry();
              }
            })
            .catch((pErr) => {
              unlink(tmp).catch(() => undefined);
              fail(pErr);
            });
        });
      });

      zipfile.on('end', () => {
        if (remaining.size > 0) {
          reject(
            new Error(
              `SDE zip missing expected entries: ${[...remaining.keys()].join(', ')}`,
            ),
          );
        } else {
          resolve();
        }
      });

      zipfile.readEntry();
    });
  });
}

/**
 * Download CCP's latest SDE JSONL zip and extract the files the ingest
 * layer needs, returning their on-disk paths. Idempotent within a run: if all
 * are already cached (warm /tmp), reuses them; callers run cleanupSdeJsonl
 * after ingest so a later drift-triggered run re-downloads fresh.
 */
export async function downloadSdeJsonl(): Promise<SdeJsonlPaths> {
  await mkdir(JSONL_CACHE_DIR, { recursive: true });
  const paths = Object.fromEntries(
    SDE_JSONL_NAMES.map((name) => [name, localJsonlPathFor(name)]),
  ) as SdeJsonlPaths;

  if (SDE_JSONL_NAMES.every((name) => existsSync(paths[name]))) return paths;

  const zipPath = join(JSONL_CACHE_DIR, 'sde-jsonl.zip');
  await downloadZipTo(zipPath);
  try {
    await extractEntries(zipPath, paths);
  } finally {
    // Reclaim the 84 MB archive immediately; the extracted files are ~181 MB.
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}

/** Deletes downloaded temporary SDE JSONL files after ingest; missing files are ignored. */
export async function cleanupSdeJsonl(paths: SdeJsonlPaths): Promise<void> {
  await Promise.all(
    Object.values(paths).map((p) => unlink(p).catch(() => undefined)),
  );
}

// The manifest's `sde` record. Other records (other `_key`s) safe-parse-fail
// and are skipped. `buildNumber` is an integer; we store it as text in
// `eve_data_meta.sde_version`.
const sdeBuildRecord = z.object({
  _key: z.literal('sde'),
  buildNumber: z.number(),
});

/**
 * Pure, testable: find the `sde` record in a JSONL manifest body and return its
 * build number as a string, or null if absent/malformed. Validates at the
 * boundary (the body is an external response) rather than casting.
 */
export function parseSdeBuildNumber(body: string): string | null {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const result = sdeBuildRecord.safeParse(parsed);
    if (result.success) return String(result.data.buildNumber);
  }
  return null;
}

/**
 * Drift probe: GET the 80-byte manifest and return CCP's current build number.
 * The daily cron + the build-time gate compare this against the stored
 * `sde_version`. Returns null when the request fails or the body is malformed —
 * callers treat null as "version unknown, assume no drift" rather than as a hard
 * error, so a transient CCP outage never blocks a deploy.
 */
export async function getRemoteSdeVersion(): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(CCP_SDE_LATEST_MANIFEST_URL, {
      headers: { 'User-Agent': OUTBOUND_USER_AGENT },
    });
    if (!res.ok) return null;
    return parseSdeBuildNumber(await res.text());
  } catch {
    return null;
  }
}

// ===========================================================================
// LEGACY Fuzzwork CSV source — PARKED (no longer wired into the pipeline).
//
// Fuzzwork re-packages CCP's SDE into per-table `.csv.bz2` dumps. As of 3.3.2b
// the ingest reads CCP's JSONL (above) and no longer calls these — they're kept
// only as a quick-revert fallback. NOTE: the CSV *parser* and its `csv-parse` /
// `unbzip2-stream` deps were removed with that swap, so re-enabling a Fuzzwork
// CSV ingest means restoring those too, not just calling downloadDumps(). The
// drift probe was migrated to CCP's manifest above — the old Fuzzwork
// HEAD/Last-Modified probe is preserved as a commented fallback at the very
// bottom in case the CCP probe ever needs to be backed out.
// ===========================================================================

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

/** Temporary local JSONL paths for every downloaded SDE source required by ingest. */
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
  const res = await fetchWithTimeout(
    url,
    { headers: { 'User-Agent': OUTBOUND_USER_AGENT } },
    SDE_DOWNLOAD_TIMEOUT_MS,
  );
  if (!res.ok || !res.body) {
    throw new Error(`Fetch failed for ${name}: ${res.status} ${res.statusText}`);
  }
  // existsSync(dest) above would serve a corrupt partial from warm-Lambda /tmp
  // reuse, so the write is atomic (see streamToFileAtomic).
  await streamToFileAtomic(res.body, dest);
  return dest;
}

/**
 * Downloads and expands the required SDE datasets into temporary JSONL paths, replacing any prior
 * incomplete files.
 */
export async function downloadDumps(): Promise<SdeDumpPaths> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entries = await Promise.all(
    SDE_DUMPS.map(async (name) => [name, await downloadOne(name)] as const),
  );
  return Object.fromEntries(entries) as SdeDumpPaths;
}

// Legacy Fuzzwork drift probe, superseded by getRemoteSdeVersion() above.
// `invTypes.csv.bz2`'s Last-Modified was the "did CCP patch the SDE?" marker
// (all Fuzzwork dumps share a rebuild timestamp). Kept as a fallback reference
// only — restore here if the CCP manifest probe ever needs to be backed out.
//
//   const SDE_VERSION_PROBE_NAME: SdeDumpName = 'invTypes';
//
//   export async function getRemoteSdeVersionFromFuzzwork(): Promise<string | null> {
//     try {
//       const res = await fetchWithTimeout(urlFor(SDE_VERSION_PROBE_NAME), {
//         method: 'HEAD',
//         headers: { 'User-Agent': OUTBOUND_USER_AGENT },
//       });
//       if (!res.ok) return null;
//       return res.headers.get('last-modified');
//     } catch {
//       return null;
//     }
//   }
