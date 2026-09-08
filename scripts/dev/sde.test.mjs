import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(), end: vi.fn(), refresh: vi.fn(), getMeta: vi.fn(), setMeta: vi.fn(), remote: vi.fn(), counts: vi.fn(), source: vi.fn(),
}));
vi.mock('node:child_process', () => ({ execFileSync: mocks.refresh }));
vi.mock('postgres', () => ({ default: () => ({ end: mocks.end }) }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: () => ({ execute: mocks.execute }) }));
vi.mock('../../src/data/eve-data/meta', () => ({ getSdeMetaValue: mocks.getMeta, setSdeMetaValue: mocks.setMeta }));
vi.mock('../../src/data/eve-data/source', () => ({ getRemoteSdeVersion: mocks.remote }));
vi.mock('../../src/scripts/sde-ingest-io', () => ({ readSdeSentinelCounts: mocks.counts }));
vi.mock('./source-identity.mjs', async (importOriginal) => ({ ...await importOriginal(), sourceIdentity: mocks.source }));

let version;
let identity;
let originalExitCode;
let originalArgv;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  originalExitCode = process.exitCode;
  originalArgv = process.argv;
  process.exitCode = undefined;
  process.argv = process.argv.filter((arg) => arg !== '--check');
  version = '123';
  identity = 'source:123';
  mocks.source.mockReturnValue('source');
  mocks.remote.mockResolvedValue('123');
  mocks.getMeta.mockImplementation(async (_db, key) => key === 'dev_bootstrap_sde_identity' ? identity : version);
  mocks.execute.mockResolvedValue([{ present: true }]).mockResolvedValueOnce([{ major: 16 }]);
  mocks.counts.mockResolvedValue({ typeDogma: 1, npcStations: 1, systemJumps: 1 });
  mocks.refresh.mockImplementation(() => { version = '123'; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = originalExitCode;
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

async function run() {
  await import('./sde.ts');
  await vi.waitFor(() => expect(mocks.end).toHaveBeenCalledOnce());
}

test('a complete matching baseline verifies without refreshing or rewriting identity', async () => {
  await run();
  expect(process.exitCode).toBeUndefined();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.setMeta).not.toHaveBeenCalled();
  expect(console.log).toHaveBeenCalledWith('SDE baseline verified: source source, version 123');
});

test.each(['source', 'version', 'sentinels', 'prices'])('%s mismatch refreshes and stamps identity only after verification', async (mismatch) => {
  if (mismatch === 'source') identity = 'previous-source:123';
  if (mismatch === 'version') version = '122';
  if (mismatch === 'sentinels') mocks.counts.mockResolvedValueOnce({ typeDogma: 1, npcStations: 0, systemJumps: 1 });
  if (mismatch === 'prices') mocks.execute.mockResolvedValueOnce([{ present: false }]);
  await run();
  expect(process.exitCode).toBeUndefined();
  expect(mocks.refresh).toHaveBeenCalledWith('pnpm', ['db:refresh-sde', '--force'], { stdio: 'inherit', env: process.env });
  expect(mocks.setMeta).toHaveBeenCalledWith(expect.anything(), 'dev_bootstrap_sde_identity', 'source:123');
  expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.setMeta.mock.invocationCallOrder[0]);
});

test('check mode fails stale identity without fetching the manifest or writing', async () => {
  process.argv.push('--check');
  identity = 'old:123';
  await run();
  expect(process.exitCode).toBe(1);
  expect(mocks.remote).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.setMeta).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith('SDE baseline needs reconciliation');
});

test.each(['manifest', 'refresh', 'sentinels', 'version', 'stamp'])('%s failure cannot stamp a successful baseline', async (failure) => {
  identity = 'old:123';
  if (failure === 'manifest') mocks.remote.mockResolvedValue(null);
  if (failure === 'refresh') mocks.refresh.mockImplementation(() => { throw new Error('refresh failed'); });
  if (failure === 'sentinels') mocks.counts.mockResolvedValue({ typeDogma: 0, npcStations: 1, systemJumps: 1 });
  if (failure === 'version') mocks.refresh.mockImplementation(() => { version = '122'; });
  if (failure === 'stamp') mocks.setMeta.mockRejectedValue(new Error('identity write failed'));
  await run();
  expect(process.exitCode).toBe(1);
  expect(console.log).not.toHaveBeenCalled();
  if (failure !== 'stamp') expect(mocks.setMeta).not.toHaveBeenCalled();
  else expect(console.error).toHaveBeenCalledWith('identity write failed');
});

test('wrong PostgreSQL major stops before inspecting or mutating SDE', async () => {
  mocks.execute.mockReset().mockResolvedValue([{ major: 17 }]);
  await run();
  expect(process.exitCode).toBe(1);
  expect(mocks.source).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledWith('Development database must use PostgreSQL 16');
});
