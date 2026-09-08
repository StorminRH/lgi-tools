import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

test('schema callback writes a private marker and stays alive for Convex', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'lgi-schema-test-'));
  t.onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const marker = join(directory, 'schema');
  vi.stubEnv('LGI_SCHEMA_READY_FILE', marker);
  vi.useFakeTimers();
  vi.resetModules();
  await import('./schema-ready.mjs');
  expect(readFileSync(marker, 'utf8')).toBe('ready\n');
  expect(statSync(marker).mode & 0o777).toBe(0o600);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(60000);
  expect(vi.getTimerCount()).toBe(1);
});

test('missing marker destination fails before starting the keepalive', async () => {
  vi.stubEnv('LGI_SCHEMA_READY_FILE', undefined);
  vi.useFakeTimers();
  vi.resetModules();
  await expect(import('./schema-ready.mjs')).rejects.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});
