import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  downloadDumps,
  downloadSdeJsonl,
  getRemoteSdeVersion,
  parseSdeBuildNumber,
} from './source';

// Mirrors source.ts' hardcoded cache locations. The download helpers
// short-circuit on existsSync, and Vercel reuses /tmp across warm Lambdas — so a
// stale file from a prior run would skip the fetch and break the header
// assertions. Clean both dirs before AND after each case.
const CACHE_DIR = join(tmpdir(), 'lgi-sde');
const JSONL_CACHE_DIR = join(tmpdir(), 'lgi-sde-jsonl');

// A real (tiny) web ReadableStream so Readable.fromWeb + the pipeline complete
// and the tmp file renames to dest. Fresh per call: a stream body is single-
// consumption, so downloadDumps' fan-out needs a new Response each time.
function streamingResponse(): Response {
  return new Response(new Blob([Uint8Array.of(0x42)]).stream(), { status: 200 });
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

    // The fake (single-byte) body is not a valid zip, so extraction throws —
    // we only assert the download request carried the right URL + User-Agent.
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
    // GET now (no method override), not the old Fuzzwork HEAD probe.
    expect(init?.method ?? 'GET').toBe('GET');
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('returns null when the manifest probe request fails', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await getRemoteSdeVersion()).toBeNull();
  });

  // Fuzzwork CSV download is parked but still present (backs CSV ingest until
  // 3.3.2b); its User-Agent contract still holds.
  it('sends the outbound User-Agent on the legacy Fuzzwork dump download', async () => {
    fetchSpy.mockImplementation(async () => streamingResponse());

    await downloadDumps();

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
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
