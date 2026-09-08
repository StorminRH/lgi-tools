import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const { probeRegistry, journeys } = JSON.parse(readFileSync(new URL('./probe-registry.json', import.meta.url), 'utf8'));

const mandatory = ['home-public', 'atlas-guest', 'route-home', 'route-industry', 'route-atlas',
  'route-skills', 'route-jobs', 'route-structures'];
const reportPath = 'docs/ux-check/captures/e2e-report.json';
const safeLabel = (value) => /^[\w .:@/-]{1,150}$/.test(value ?? '') ? value : '[redacted]';

export default class AcceptanceReporter {
  selected = [];
  attempts = [];
  errors = 0;
  config;
  outputFile;

  constructor({ outputFile = reportPath } = {}) { this.outputFile = outputFile; }

  onBegin(config, suite) {
    this.config = config;
    this.selected = suite.allTests().map((test) => ({
      id: this.scenario(test), testId: test.id, project: test.parent.project()?.name,
    }));
    console.log(`Selected ${this.selected.length} acceptance cases (${config.metadata.lane}).`);
  }

  scenario(test) {
    return test.title.match(/^\[([\w-]+)\]/)?.[1] ?? 'unregistered-scenario';
  }

  onTestEnd(test, result) {
    const blocked = result.errors.some((error) => /BLOCKED[: ]|E2E_PREREQUISITE/.test(error.message ?? ''));
    const status = blocked || ['skipped', 'interrupted'].includes(result.status)
      ? 'BLOCKED' : result.status === 'passed' && test.expectedStatus === 'passed' ? 'PASS' : 'FAIL';
    const metadata = result.annotations.filter((item) =>
      ['browser', 'auth-role', 'fixture', 'cleanup', 'device'].includes(item.type))
      .map((item) => ({ type: item.type, description: safeLabel(item.description) }));
    this.attempts.push({
      id: this.scenario(test), testId: test.id, status,
      project: test.parent.project()?.name, retry: result.retry,
      time: result.startTime.toISOString(), durationMs: result.duration,
      metadata, classification: blocked ? 'prerequisite' : status === 'PASS' ? 'clean' : 'assertion-or-diagnostics',
      evidence: result.attachments.filter((item) => item.name === 'sanitized-failure')
        .map((item) => ({ name: item.name, path: item.path })),
    });
    console.log(`${status} ${this.scenario(test)}`);
  }

  onError() { this.errors += 1; }

  onEnd(result) {
    if (process.argv.includes('--list')) return;
    const selectedIds = new Set(this.selected.map((item) => item.id));
    const inventory = [...mandatory, ...journeys.map((item) => item.id)];
    const skipped = [...new Set(inventory)].filter((id) => !selectedIds.has(id))
      .map((id) => ({ id, reason: 'outside-explicit-selection' }));
    const blocked = [
      ...this.selected.filter((item) => !this.attempts.some((attempt) => attempt.testId === item.testId))
        .map((item) => ({ id: item.id, reason: 'not-executed' })),
      ...this.attempts.filter((attempt) => attempt.status === 'BLOCKED')
        .map((attempt) => ({ id: attempt.id, reason: attempt.classification })),
    ];
    const clean = result.status === 'passed' && this.selected.length > 0 && this.errors === 0 &&
      blocked.length === 0 && this.attempts.every((attempt) => attempt.status === 'PASS' && attempt.retry === 0);
    try {
      const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
      mkdirSync(path.dirname(this.outputFile), { recursive: true });
      writeFileSync(this.outputFile, `${JSON.stringify({
        status: clean ? 'READY_FOR_REVIEW' : 'BLOCKED', visualAcceptance: 'pending-operator',
        revision, dirty, deployment: safeLabel(this.config?.metadata.deployment),
        lane: this.config?.metadata.lane, time: result.startTime.toISOString(),
        durationMs: result.duration, selected: this.selected, skipped, blocked,
        attempts: this.attempts, discoveryErrors: this.errors, coverage: probeRegistry,
        artifactPolicy: 'sanitized failure diagnostics only; no auth, cookies, raw console, DOM or network bodies',
      }, null, 2)}\n`);
    } catch {
      console.error('BLOCKED: acceptance report could not be written.');
      return { status: 'failed' };
    }
    console.log(`${clean ? 'READY_FOR_REVIEW' : 'BLOCKED'}: ${this.outputFile}`);
    return clean ? undefined : { status: 'failed' };
  }
}
