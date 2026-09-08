import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import AcceptanceReporter from './reporter.cjs';

const testCase = {
  id: 'case-1', title: '[atlas-access] desktop', expectedStatus: 'passed',
  parent: { project: () => ({ name: 'local-mutation' }) },
};
const attempt = {
  status: 'passed', retry: 0, startTime: new Date(), duration: 1,
  annotations: [{ type: 'browser', description: 'chromium-test' }],
  attachments: [], errors: [],
};

function reportResult(run: (reporter: AcceptanceReporter) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), 'lgi-acceptance-report-'));
  const file = path.join(directory, 'report.json');
  try {
    const reporter = new AcceptanceReporter({ outputFile: file });
    reporter.onBegin({ metadata: { lane: 'local-mutation', deployment: 'test-deployment' } }, {
      allTests: () => [testCase],
    });
    run(reporter);
    const result = reporter.onEnd({ status: 'passed', startTime: new Date(), duration: 1 });
    const json = readFileSync(file, 'utf8');
    const report = JSON.parse(json);
    const evidenceFiles = Object.fromEntries((report.attempts ?? []).flatMap((attempt: { evidence?: { path?: string }[] }) =>
      (attempt.evidence ?? [])
        .filter((item) => item.path && existsSync(item.path))
        .map((item) => [item.path as string, readFileSync(item.path as string, 'utf8')])));
    return { result, json, report, evidenceFiles };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

describe('acceptance report outcomes', () => {
  it('records the tested revision, selected and unselected inventory without claiming visual acceptance', () => {
    const result = reportResult((reporter) => reporter.onTestEnd(testCase, attempt));
    expect(result.result).toBeUndefined();
    expect(result.json).toContain('READY_FOR_REVIEW');
    expect(result.json).toContain('pending-operator');
    expect(result.json).toMatch(/"revision": "[0-9a-f]{40}"/);
    expect(result.json).toContain('outside-explicit-selection');
  });

  it('makes skipped, blocked and unexecuted selected scenarios nonzero', () => {
    for (const status of ['skipped', 'interrupted', 'failed']) {
      const result = reportResult((reporter) => reporter.onTestEnd(testCase, {
        ...attempt, status, errors: [{ message: 'BLOCKED prerequisite: sensitive-cookie=secret' }],
        attachments: [{ name: 'auth-state', path: '/private/auth.json' }],
      }));
      expect(result.result).toEqual({ status: 'failed' });
      expect(result.json).toContain('BLOCKED');
      expect(result.json).not.toMatch(/sensitive-cookie|secret|auth.json/);
    }
    expect(reportResult(() => {}).result).toEqual({ status: 'failed' });
  });

  it('does not accept expected failures or a later retry as a clean gate', () => {
    expect(reportResult((reporter) => reporter.onTestEnd({ ...testCase, expectedStatus: 'failed' }, attempt)).result)
      .toEqual({ status: 'failed' });
    expect(reportResult((reporter) => reporter.onTestEnd(testCase, { ...attempt, retry: 1 })).result)
      .toEqual({ status: 'failed' });
  });

  it('persists a body-only sanitized-failure into the report directory', () => {
    const result = reportResult((reporter) => reporter.onTestEnd(testCase, {
      ...attempt,
      status: 'failed',
      errors: [{ message: 'expected true to be false' }],
      attachments: [{
        name: 'sanitized-failure',
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify({
          scenario: 'atlas-access',
          lane: 'local-mutation',
          diagnostics: [{ kind: 'page-error', disposition: 'unexpected' }],
          classification: 'failure',
          storageState: { cookies: ['sensitive-cookie=secret'] },
        })),
      }],
    }));
    const evidence = result.report.attempts[0].evidence;
    expect(evidence).toHaveLength(1);
    expect(evidence[0].path).toMatch(/sanitized-failures\/atlas-access-case-1\.json$/);
    const persisted = result.evidenceFiles[evidence[0].path];
    expect(persisted).toBeDefined();
    expect(JSON.parse(persisted)).toEqual({
      scenario: 'atlas-access',
      lane: 'local-mutation',
      diagnostics: [{ kind: 'page-error', disposition: 'unexpected' }],
      classification: 'failure',
    });
    expect(`${result.json}${persisted}`).not.toMatch(/sensitive-cookie|secret|auth\.json/);
  });

  it('records a path attachment after copying it beside the report', () => {
    const sourceDir = mkdtempSync(path.join(tmpdir(), 'lgi-sanitized-source-'));
    try {
      const source = path.join(sourceDir, 'incoming.json');
      writeFileSync(source, JSON.stringify({
        scenario: 'atlas-access',
        lane: 'local-mutation',
        diagnostics: [],
        classification: 'failure',
      }));
      const result = reportResult((reporter) => reporter.onTestEnd(testCase, {
        ...attempt,
        status: 'failed',
        attachments: [{ name: 'sanitized-failure', contentType: 'application/json', path: source }],
      }));
      const evidence = result.report.attempts[0].evidence;
      expect(evidence[0].path).toMatch(/sanitized-failures\/atlas-access-case-1\.json$/);
      expect(evidence[0].path).not.toBe(source);
      expect(JSON.parse(result.evidenceFiles[evidence[0].path])).toEqual({
        scenario: 'atlas-access',
        lane: 'local-mutation',
        diagnostics: [],
        classification: 'failure',
      });
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
