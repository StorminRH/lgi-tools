import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import AcceptanceReporter from './reporter.mjs';

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
    return { result, json: readFileSync(file, 'utf8') };
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
});
