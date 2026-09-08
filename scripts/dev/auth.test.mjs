import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '✔ set' })),
}));

import { configureAuth } from './auth.mjs';

function publicJwks() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return JSON.stringify({ keys: [{ ...pair.publicKey.export({ format: 'jwk' }), kid: 'local-test' }] });
}

function envFile(deployment) {
  const root = mkdtempSync(join(tmpdir(), 'lgi-auth-'));
  const path = join(root, '.env.local');
  writeFileSync(path, `CONVEX_DEPLOYMENT=${deployment}\n`);
  return { path, root };
}

async function withSecret(run, secret = 'a'.repeat(32)) {
  const previous = process.env.CONVEX_SERVICE_SECRET;
  const previousDeployment = process.env.CONVEX_DEPLOYMENT;
  process.env.CONVEX_SERVICE_SECRET = secret;
  process.env.CONVEX_DEPLOYMENT = '';
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.CONVEX_SERVICE_SECRET;
    else process.env.CONVEX_SERVICE_SECRET = previous;
    if (previousDeployment === undefined) delete process.env.CONVEX_DEPLOYMENT;
    else process.env.CONVEX_DEPLOYMENT = previousDeployment;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(spawnSync).mockReset();
  vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: '', stderr: '✔ set' });
});

test('rejects a missing service secret after an anonymous deployment is selected', async () => {
  const fixture = envFile('anonymous:anonymous-agent');
  const previous = process.env.CONVEX_SERVICE_SECRET;
  delete process.env.CONVEX_SERVICE_SECRET;
  try {
    await expect(configureAuth({ envFile: fixture.path })).rejects.toThrow(/CONVEX_SERVICE_SECRET must contain at least 32 characters/);
    expect(spawnSync).not.toHaveBeenCalled();
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
    if (previous === undefined) delete process.env.CONVEX_SERVICE_SECRET;
    else process.env.CONVEX_SERVICE_SECRET = previous;
  }
});

test('rejects a hosted .env.local selector before spawn', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const selector of ['prod:happy-animal-123', 'dev:happy-animal-123', 'preview:happy-animal-123', 'local:local-lgi', 'happy-animal-123']) {
    const fixture = envFile(selector);
    try {
      await expect(configureAuth({ envFile: fixture.path })).rejects.toThrow(/anonymous: deployment from the local backend/);
      expect(spawnSync).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  }
});

test('passes the written anonymous: deployment and omits --deployment', async () => {
  const fixture = envFile('anonymous:anonymous-agent');
  await withSecret(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => publicJwks() })));
    await configureAuth({ envFile: fixture.path });
    expect(spawnSync).toHaveBeenCalled();
    for (const [command, args, options] of vi.mocked(spawnSync).mock.calls) {
      expect(command).toBe('pnpm');
      expect(args.slice(0, 4)).toEqual(['exec', 'convex', 'env', 'set']);
      expect(args).not.toContain('--deployment');
      expect(options.env.CONVEX_DEPLOYMENT).toBe('anonymous:anonymous-agent');
      expect(options.env.CONVEX_AGENT_MODE).toBe('anonymous');
      expect(options.env.CONVEX_DEPLOY_KEY).toBe('');
      expect(options.env.CONVEX_DEPLOYMENT_TOKEN).toBe('');
    }
    expect(vi.mocked(spawnSync).mock.calls.map(([, args]) => args[4])).toEqual([
      'AUTH_ISSUER_URL',
      'SITE_URL',
      'AUTH_JWKS',
      'CONVEX_SERVICE_SECRET',
    ]);
  });
  rmSync(fixture.root, { recursive: true, force: true });
});

test('redacts an echoed non-hex service secret from CLI diagnostics', async () => {
  const secret = 'not-a-hex-secret!!-and-more-padding-here';
  const fixture = envFile('anonymous:anonymous-agent');
  await withSecret(async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => publicJwks() })));
    vi.mocked(spawnSync).mockImplementation((command, args) => {
      if (args[4] === 'CONVEX_SERVICE_SECRET') {
        return { status: 1, stdout: '', stderr: `CLI echoed ${secret} onto stderr\n` };
      }
      return { status: 0, stdout: '', stderr: '✔ set' };
    });
    const error = await configureAuth({ envFile: fixture.path }).then(
      () => { throw new Error('expected configureAuth to fail'); },
      (thrown) => thrown,
    );
    expect(error.message).toContain('Local Convex environment update failed for CONVEX_SERVICE_SECRET');
    expect(error.message).toContain('<redacted-value>');
    expect(error.message).not.toContain(secret);
  }, secret);
  rmSync(fixture.root, { recursive: true, force: true });
});
