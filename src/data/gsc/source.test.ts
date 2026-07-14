import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GSC_SCOPE, URL_INSPECTION_ENDPOINT } from './constants';
import { inspectUrl } from './source';

const authState = vi.hoisted(() => ({ options: null as Record<string, unknown> | null }));

vi.mock('google-auth-library', () => ({
  JWT: class {
    constructor(options: Record<string, unknown>) {
      authState.options = options;
    }

    async getAccessToken() {
      return { token: 'test-token' };
    }
  },
}));

describe('inspectUrl', () => {
  beforeEach(() => {
    vi.stubEnv(
      'GSC_SERVICE_ACCOUNT_JSON',
      JSON.stringify({ client_email: 'test@example.com', private_key: 'test-key' }),
    );
    vi.stubEnv('GSC_SITE_URL', 'sc-domain:lgi.tools');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('preserves the read-only URL Inspection request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          inspectionResult: { indexStatusResult: { verdict: 'PASS' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(inspectUrl('https://lgi.tools/sites/3')).resolves.toEqual({ verdict: 'PASS' });
    expect(authState.options?.scopes).toEqual([GSC_SCOPE]);
    expect(fetchMock).toHaveBeenCalledWith(
      URL_INSPECTION_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          inspectionUrl: 'https://lgi.tools/sites/3',
          siteUrl: 'sc-domain:lgi.tools',
        }),
      }),
    );
  });

  it('returns null for a successful response without index status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ inspectionResult: {} }), { status: 200 }),
      ),
    );

    await expect(inspectUrl('https://lgi.tools/')).resolves.toBeNull();
  });
});
