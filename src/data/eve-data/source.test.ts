import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import { downloadDumps, getRemoteSdeVersion } from './source';

// Mirrors source.ts' hardcoded cache location. downloadOne short-circuits on
// existsSync(dest), and Vercel reuses /tmp across warm Lambdas — so a stale
// file from a prior run would skip the fetch and break the header assertion.
// Clean the dir before AND after each case.
const CACHE_DIR = join(tmpdir(), 'lgi-sde');

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
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await rm(CACHE_DIR, { recursive: true, force: true });
  });

  it('sends the outbound User-Agent on the SDE dump download', async () => {
    fetchSpy.mockImplementation(async () => streamingResponse());

    await downloadDumps();

    expect(fetchSpy).toHaveBeenCalled();
    const [, init] = fetchSpy.mock.calls[0];
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });

  it('sends the outbound User-Agent on the SDE HEAD version probe', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { 'last-modified': 'x' } }),
    );

    await getRemoteSdeVersion();

    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toContain('invTypes.csv.bz2');
    expect(init?.method).toBe('HEAD');
    expect(new Headers(init?.headers).get('User-Agent')).toBe(
      OUTBOUND_USER_AGENT,
    );
  });
});
