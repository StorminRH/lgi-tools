import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  cleanupSdeJsonl,
  downloadSdeJsonl,
  getRemoteSdeVersion,
  parseSdeBuildNumber,
  type SdeJsonlPaths,
} from './source';

const CACHE_DIR = join(tmpdir(), 'lgi-sde');
const JSONL_CACHE_DIR = join(tmpdir(), 'lgi-sde-jsonl');

function streamingResponse(): Response {
  return new Response(new Blob([Uint8Array.of(0x42)]).stream(), { status: 200 });
}

function extractPaths(): SdeJsonlPaths {
  const file = (name: string) => join(JSONL_CACHE_DIR, `${name}.jsonl`);
  return {
    categories: file('categories'),
    groups: file('groups'),
    types: file('types'),
    dogmaAttributes: file('dogmaAttributes'),
    typeDogma: file('typeDogma'),
    blueprints: file('blueprints'),
    mapRegions: file('mapRegions'),
    mapConstellations: file('mapConstellations'),
    mapSolarSystems: file('mapSolarSystems'),
    mapStargates: file('mapStargates'),
    npcStations: file('npcStations'),
    stationOperations: file('stationOperations'),
    stationServices: file('stationServices'),
  };
}

describe('eve-data source outbound headers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(JSONL_CACHE_DIR, { recursive: true, force: true });
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(JSONL_CACHE_DIR, { recursive: true, force: true });
  });

  it('sends the outbound User-Agent on the CCP SDE JSONL zip download', async () => {
    fetchSpy.mockImplementation(async () => streamingResponse());

    await expect(downloadSdeJsonl()).rejects.toThrow();

    expect(fetchSpy).toHaveBeenCalled();
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toContain('eve-online-static-data-latest-jsonl.zip');
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('reads CCP’s build number from the JSONL manifest probe (GET)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        '{"_key": "sde", "buildNumber": 3374020, "releaseDate": "2026-06-03T12:42:22Z"}',
        { status: 200 },
      ),
    );

    const version = await getRemoteSdeVersion();

    expect(version).toBe('3374020');
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toContain('tranquility/latest.jsonl');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('returns null when the manifest probe request fails', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await getRemoteSdeVersion()).toBeNull();
  });
});

describe('cleanupSdeJsonl', () => {
  beforeEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(JSONL_CACHE_DIR, { recursive: true, force: true });
    await mkdir(CACHE_DIR, { recursive: true });
    await mkdir(JSONL_CACHE_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(CACHE_DIR, { recursive: true, force: true });
    await rm(JSONL_CACHE_DIR, { recursive: true, force: true });
  });

  it('unlinks given JSONL extracts and swallows a missing path', async () => {
    const paths = extractPaths();
    const present = [paths.categories, paths.groups, paths.types] as const;
    await Promise.all(present.map((path) => writeFile(path, 'row\n')));

    await expect(cleanupSdeJsonl(paths)).resolves.toBeUndefined();

    for (const path of present) {
      expect(existsSync(path)).toBe(false);
    }
  });

  it('does not unlink a file under a dump-cache dir', async () => {
    const paths = extractPaths();
    await writeFile(paths.categories, 'row\n');
    const leftover = join(CACHE_DIR, 'invTypes.csv.bz2');
    await writeFile(leftover, 'dump\n');

    await expect(cleanupSdeJsonl(paths)).resolves.toBeUndefined();

    expect(existsSync(paths.categories)).toBe(false);
    expect(existsSync(leftover)).toBe(true);
  });
});

describe('parseSdeBuildNumber', () => {
  it('extracts the build number from the sde record', () => {
    expect(parseSdeBuildNumber('{"_key": "sde", "buildNumber": 3374020}')).toBe(
      '3374020',
    );
  });

  it('finds the sde record among other lines', () => {
    const body =
      '{"_key": "other", "buildNumber": 1}\n{"_key": "sde", "buildNumber": 42}\n';
    expect(parseSdeBuildNumber(body)).toBe('42');
  });

  it('returns null for empty, malformed, or missing records', () => {
    expect(parseSdeBuildNumber('')).toBeNull();
    expect(parseSdeBuildNumber('not json')).toBeNull();
    expect(parseSdeBuildNumber('{"_key": "sde"}')).toBeNull();
    expect(parseSdeBuildNumber('{"_key": "other", "buildNumber": 5}')).toBeNull();
  });
});
