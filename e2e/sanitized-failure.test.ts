import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  persistSanitizedFailure,
  persistSanitizedFailureAttachment,
  sanitizedFailurePayload,
} from './sanitized-failure.mjs';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('sanitized-failure persistence', () => {
  it('keeps only scenario, lane, diagnostics and classification', () => {
    const payload = sanitizedFailurePayload({
      scenario: 'atlas-access',
      lane: 'local-mutation',
      diagnostics: [{ kind: 'page-error', disposition: 'unexpected' }],
      classification: 'failure',
      storageState: { cookies: ['sensitive-cookie=secret'] },
      auth: '/private/auth.json',
    });
    expect(payload).toEqual({
      scenario: 'atlas-access',
      lane: 'local-mutation',
      diagnostics: [{ kind: 'page-error', disposition: 'unexpected' }],
      classification: 'failure',
    });
    expect(JSON.stringify(payload)).not.toMatch(/sensitive-cookie|secret|auth\.json/);
  });

  it('writes uploadable JSON beside a report directory', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'lgi-sanitized-failure-'));
    directories.push(directory);
    const dest = persistSanitizedFailure(sanitizedFailurePayload({
      scenario: 'atlas-access',
      lane: 'mandatory-production',
      diagnostics: [],
      classification: 'failure',
    }), { directory, id: 'case-1' });
    expect(dest).toBe(path.join(directory, 'atlas-access-case-1.json'));
    expect(existsSync(dest)).toBe(true);
    expect(JSON.parse(readFileSync(dest, 'utf8'))).toEqual({
      scenario: 'atlas-access',
      lane: 'mandatory-production',
      diagnostics: [],
      classification: 'failure',
    });
  });

  it('persists a body-only Playwright attachment to a file path', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'lgi-sanitized-failure-'));
    directories.push(directory);
    const dest = persistSanitizedFailureAttachment({
      name: 'sanitized-failure',
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        scenario: 'atlas-access',
        lane: 'local-mutation',
        diagnostics: [{ kind: 'http', url: 'http://127.0.0.1/atlas', method: 'GET', status: 500, disposition: 'unexpected' }],
        classification: 'failure',
        storageState: { cookies: ['secret'] },
      })),
    }, { directory, id: 'body-only' });
    expect(dest).toBe(path.join(directory, 'atlas-access-body-only.json'));
    const persisted = readFileSync(dest!, 'utf8');
    expect(JSON.parse(persisted)).toEqual({
      scenario: 'atlas-access',
      lane: 'local-mutation',
      diagnostics: [{ kind: 'http', url: 'http://127.0.0.1/atlas', method: 'GET', status: 500, disposition: 'unexpected' }],
      classification: 'failure',
    });
    expect(persisted).not.toMatch(/secret|storageState|cookies/);
  });
});
