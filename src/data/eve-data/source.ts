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

const CCP_SDE_BASE = 'https://developers.eveonline.com/static-data';

const CCP_SDE_LATEST_ZIP_URL = `${CCP_SDE_BASE}/eve-online-static-data-latest-jsonl.zip`;

const CCP_SDE_LATEST_MANIFEST_URL = `${CCP_SDE_BASE}/tranquility/latest.jsonl`;

export type SdeJsonlName =
  | 'categories'
  | 'groups'
  | 'types'
  | 'dogmaAttributes'
  | 'typeDogma'
  | 'blueprints'
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

export type SdeJsonlPaths = Record<SdeJsonlName, string>;

const JSONL_CACHE_DIR = join(tmpdir(), 'lgi-sde-jsonl');

function localJsonlPathFor(name: SdeJsonlName): string {
  return join(JSONL_CACHE_DIR, `${name}.jsonl`);
}

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
    await unlink(zipPath).catch(() => undefined);
  }
  return paths;
}

export async function cleanupSdeJsonl(paths: SdeJsonlPaths): Promise<void> {
  await Promise.all(
    Object.values(paths).map((p) => unlink(p).catch(() => undefined)),
  );
}

const sdeBuildRecord = z.object({
  _key: z.literal('sde'),
  buildNumber: z.number(),
});

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

const FUZZWORK_BASE = 'https://www.fuzzwork.co.uk/dump/latest';

export type SdeDumpName =
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
  await streamToFileAtomic(res.body, dest);
  return dest;
}

export async function downloadDumps(): Promise<SdeDumpPaths> {
  await mkdir(CACHE_DIR, { recursive: true });
  const entries = await Promise.all(
    SDE_DUMPS.map(async (name) => [name, await downloadOne(name)] as const),
  );
  return Object.fromEntries(entries) as SdeDumpPaths;
}

