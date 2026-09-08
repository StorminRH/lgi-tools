import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, vi } from 'vitest';
import { assertLocalEnvironment, effectiveEnvironment, localProcessEnvironment, prepareEnvironment } from './environment.mjs';
import { validateJwks } from './jwks.mjs';
import { baselineMatches, sourceIdentity } from './source-identity.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lgi-bootstrap-test-'));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('every effective database override fails closed without disclosing credentials', () => {
  for (const key of ['LGI_DATABASE_URL', 'LGI_DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_MIGRATION_URL']) {
    for (const value of ['postgres://lgi:sensitive@remote.example:5433/lgi_tools', 'postgres://lgi:x@localhost:5433/lgi_tools?host=remote.example', 'postgres://lgi:x@localhost:5432/lgi_tools', 'not-a-url']) {
      assert.throws(() => assertLocalEnvironment({ [key]: value }), (error) => error.message.includes(key) && !error.message.includes('sensitive'));
    }
  }
  assert.doesNotThrow(() => assertLocalEnvironment({ DATABASE_URL: 'postgres://lgi:lgi@127.0.0.1:5433/lgi_tools' }));
});

test('Next dotenv precedence and LGI overrides cannot bypass the guard', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, '.env.local'), 'DATABASE_URL=postgres://lgi:lgi@localhost:5433/lgi_tools\n');
  writeFileSync(join(root, '.env.development.local'), 'LGI_DATABASE_URL=postgres://lgi:hidden@remote.example:5433/lgi_tools\n');
  assert.throws(() => assertLocalEnvironment(effectiveEnvironment(root, {})), /LGI_DATABASE_URL/);
  assert.equal(effectiveEnvironment(root, { LGI_DATABASE_URL: 'override' }).LGI_DATABASE_URL, 'override');
});

test('guard rejects before executing a write command', (t) => {
  const root = fixture(t);
  const marker = join(root, 'must-not-exist');
  const script = fileURLToPath(new URL('./run-local.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, process.execPath, '-e', 'require("node:fs").writeFileSync(process.argv[1], "unsafe")', marker], {
    cwd: root, encoding: 'utf8', env: { ...process.env, LGI_DATABASE_URL: 'postgres://lgi:hidden@remote.example:5433/lgi_tools' },
  });
  assert.equal(result.status, 1);
  assert.equal(existsSync(marker), false);
  assert.doesNotMatch(result.stderr, /hidden/);
});

test('local subprocesses neutralize inherited hosted Convex selectors', (t) => {
  const env = localProcessEnvironment(fixture(t), { CONVEX_DEPLOY_KEY: 'production-key', CONVEX_DEPLOYMENT: 'prod:hosted', CONVEX_SELF_HOSTED_URL: 'https://hosted.example', CONVEX_SELF_HOSTED_ADMIN_KEY: 'key' });
  assert.equal(env.CONVEX_DEPLOY_KEY, '');
  assert.equal(env.CONVEX_DEPLOYMENT, '');
  assert.equal(env.CONVEX_SELF_HOSTED_URL, '');
  assert.equal(env.CONVEX_SELF_HOSTED_ADMIN_KEY, '');
  assert.equal(env.CONVEX_AGENT_MODE, 'anonymous');
  assert.equal(env.NEXT_PUBLIC_CONVEX_URL, 'http://127.0.0.1:3210');
});

test('preparation creates reusable local secrets and removes hosted selection', (t) => {
  const root = fixture(t);
  t.onTestFinished(() => vi.unstubAllEnvs());
  for (const key of ['LGI_DATABASE_URL', 'LGI_DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_MIGRATION_URL', 'DOTENV_PATH', 'LOCAL_DB_DRIVER', 'BETTER_AUTH_URL']) vi.stubEnv(key, undefined);
  writeFileSync(join(root, '.env.local'), 'CONVEX_DEPLOYMENT=prod:old\n');
  prepareEnvironment(root);
  const first = effectiveEnvironment(root, {});
  prepareEnvironment(root);
  assert.equal(first.CONVEX_SERVICE_SECRET, effectiveEnvironment(root, {}).CONVEX_SERVICE_SECRET);
  assert.equal(first.CONVEX_DEPLOYMENT, undefined);
  assert.equal(first.CONVEX_SERVICE_SECRET.length, 64);
});

test('readiness rejects placeholder, malformed, private, and empty JWKS', () => {
  for (const body of ['{}', '{"keys":[]}', 'not-json', '{"keys":[{"kty":"EC","crv":"P-256","kid":"a"}]}']) assert.throws(() => validateJwks(body));
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const key = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'local-test' };
  assert.match(validateJwks(JSON.stringify({ keys: [key] })), /^data:text\/plain;charset=utf-8;base64,/);
  assert.throws(() => validateJwks(JSON.stringify({ keys: [{ ...pair.privateKey.export({ format: 'jwk' }), kid: 'private' }] })));
});

test('warm baseline requires matching source, current CCP version, and complete sentinels', () => {
  assert.equal(baselineMatches('source', '123', 'source:123', true, '123'), true);
  for (const args of [
    ['changed-source', '123', 'source:123', true, '123'],
    ['source', '124', 'source:123', true, '124'],
    ['source', '123', 'source:123', false, '123'],
    ['source', null, 'source:', true, '123'],
    ['source', '123', 'source:123', true, '124'],
    ['source', '123', 'source:123', true, null],
  ]) assert.equal(baselineMatches(...args), false);
});

test('branch SDE changes invalidate identity while prose changes do not', (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'src/data/eve-data'), { recursive: true });
  const source = join(root, 'src/data/eve-data/source.ts');
  writeFileSync(source, 'first');
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  const initial = sourceIdentity(root);
  writeFileSync(join(root, 'README.md'), 'prose change');
  assert.equal(sourceIdentity(root), initial);
  writeFileSync(source, 'changed source');
  assert.notEqual(sourceIdentity(root), initial);
});

test('Postgres ownership rejects wrong versions and stops only a cluster it starts', (t) => {
  const root = fixture(t);
  const bin = join(root, 'bin');
  const data = join(root, 'data');
  mkdirSync(bin); mkdirSync(data);
  writeFileSync(join(data, 'PG_VERSION'), '16\n');
  const events = join(root, 'events');
  writeFileSync(join(bin, 'pg_ctl'), '#!/usr/bin/env bash\nif [[ "$*" == *status* ]]; then if [[ -f "$FAKE_EVENTS" ]]; then exit 0; fi; exit "$FAKE_STATUS"; fi\nprintf "%s\\n" "$*" >> "$FAKE_EVENTS"\n', { mode: 0o755 });
  writeFileSync(join(bin, 'psql'), '#!/usr/bin/env bash\nprintf "%s|%s\\n" "$PGDATA" "$FAKE_MAJOR"\n', { mode: 0o755 });
  const script = fileURLToPath(new URL('./postgres.sh', import.meta.url));
  const run = (status, major) => spawnSync('bash', ['-c', 'set -euo pipefail; source "$1"; PGBIN="$2"; PGDATA="$3"; export PGDATA; started_pg=0; trap pg_stop_owned EXIT; pg_start', 'test', script, bin, data], { encoding: 'utf8', env: { ...process.env, FAKE_STATUS: status, FAKE_MAJOR: major, FAKE_EVENTS: events } });
  assert.equal(run('0', '16').status, 0);
  assert.equal(existsSync(events), false);
  assert.equal(run('0', '17').status, 1);
  assert.equal(existsSync(events), false);
  assert.equal(run('1', '16').status, 0);
  assert.equal(existsSync(events), true);
  writeFileSync(join(data, 'PG_VERSION'), '17\n');
  assert.equal(run('0', '16').status, 1);
});
