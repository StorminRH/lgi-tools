import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

// Fuzzwork SDE dump URLs. Swapping to CCP's official SDE later means
// replacing this module only — nothing in ingest.ts or queries.ts knows
// where the bytes come from.
const FUZZWORK_BASE = 'https://www.fuzzwork.co.uk/dump/latest';

export type SdeDumpName =
  | 'invCategories'
  | 'invGroups'
  | 'invTypes'
  | 'dgmAttributeTypes'
  | 'dgmTypeAttributes';

export const SDE_DUMPS: readonly SdeDumpName[] = [
  'invCategories',
  'invGroups',
  'invTypes',
  'dgmAttributeTypes',
  'dgmTypeAttributes',
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
