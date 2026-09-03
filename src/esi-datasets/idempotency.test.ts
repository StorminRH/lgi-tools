import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IDEMPOTENCY_REGISTRY,
  type IdempotencyEntry,
} from '@/composition/__tests__/idempotency-registry';
import { vendorResilienceRegistry } from '@/composition/__tests__/vendor-resilience-registry';

const ROOT = process.cwd();

function exists(relative: string): boolean {
  return existsSync(path.join(ROOT, relative));
}

const vercelCronPaths: string[] = (
  JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    crons?: { path: string }[];
  }
).crons?.map((cron) => cron.path) ?? [];

const convexCronNames = [
  ...readFileSync(path.join(ROOT, 'convex/crons.ts'), 'utf8').matchAll(
    /crons\.\w+\(\s*'([^']+)'/g,
  ),
].map((match) => match[1] ?? '');

function postRouteFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') {
        const source = readFileSync(full, 'utf8');
        if (/export (async function |function |const )POST\b/.test(source)) {
          found.push(path.relative(ROOT, full));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src/app/api'));
  return found.sort();
}

const routeEntries = IDEMPOTENCY_REGISTRY.filter((entry) => entry.route !== undefined);

describe('idempotency registry', () => {
  it('gives every entry a stable id exactly once', () => {
    const ids = IDEMPOTENCY_REGISTRY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('resolves every declared module against the tree', () => {
    for (const entry of IDEMPOTENCY_REGISTRY) {
      if (entry.module === undefined) continue;
      expect(exists(entry.module), `${entry.id} declares a missing module`).toBe(true);
    }
  });

  it('resolves every declared route against the tree', () => {
    for (const entry of routeEntries) {
      expect(exists(entry.route as string), `${entry.id} declares a missing route`).toBe(true);
    }
  });

  it('resolves every vendor cross-reference against the outbound registry', () => {
    const known = new Set(Object.keys(vendorResilienceRegistry));
    for (const entry of IDEMPOTENCY_REGISTRY) {
      if (entry.vendor === undefined) continue;
      expect(known.has(entry.vendor), `${entry.id} names an unknown vendor`).toBe(true);
    }
  });

  it('carries an entry for every Vercel cron', () => {
    const declared = new Set(
      IDEMPOTENCY_REGISTRY.map((entry) => entry.cronPath).filter(
        (value): value is string => value !== undefined,
      ),
    );
    expect(vercelCronPaths.length).toBeGreaterThan(0);
    for (const cronPath of vercelCronPaths) {
      expect(declared.has(cronPath), `no entry for cron ${cronPath}`).toBe(true);
    }
    for (const cronPath of declared) {
      expect(vercelCronPaths).toContain(cronPath);
    }
  });

  it('carries an entry for every Convex cron job', () => {
    expect(convexCronNames.length).toBeGreaterThan(0);
    const convexEntries = IDEMPOTENCY_REGISTRY.filter(
      (entry) => entry.workKind === 'convex-cron',
    );
    for (const name of convexCronNames) {
      expect(
        convexEntries.some((entry) => entry.id.includes(name)),
        `no entry for Convex cron ${name}`,
      ).toBe(true);
    }
  });

  it('carries exactly one entry for every POST-bearing route', () => {
    const routes = postRouteFiles();
    const declared = new Set(routeEntries.map((entry) => entry.route as string));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      expect(declared.has(route), `no idempotency entry for ${route}`).toBe(true);
    }
    expect(routeEntries).toHaveLength(routes.length);
  });

  it('covers the queue, its recovery, its requeue, and the outbound alert paths', () => {
    const ids = new Set(IDEMPOTENCY_REGISTRY.map((entry) => entry.id));
    for (const required of [
      'queue/enqueue',
      'queue/process-job',
      'queue/recover-stranded',
      'queue/requeue-dead-lettered',
      'alert/esi-refresh-dead-letter',
      'alert/public-esi-budget-exhaustion',
      'alert/price-source-degradation',
    ]) {
      expect(ids.has(required), `missing required entry ${required}`).toBe(true);
    }
  });

  it('keeps the LGI-06 revocation outbox cited but unowned', () => {
    const lgi06 = IDEMPOTENCY_REGISTRY.find((entry) => entry.id.startsWith('LGI-06'));
    expect(lgi06?.verdict).toBe('coordinated-elsewhere');
    expect(lgi06?.module).toBeUndefined();
    expect(lgi06?.route).toBeUndefined();
  });
});

describe('idempotency registry verdicts', () => {
  it('gives every entry a verdict, a redelivery source, and real evidence', () => {
    for (const entry of IDEMPOTENCY_REGISTRY) {
      expect(
        ['inherently-idempotent', 'key-protected', 'accepted-risk', 'coordinated-elsewhere'],
        `${entry.id} verdict`,
      ).toContain(entry.verdict);
      expect(entry.redeliverySource.length, `${entry.id} redelivery source`).toBeGreaterThan(20);
      expect(entry.evidence.length, `${entry.id} evidence`).toBeGreaterThan(40);
    }
  });

  it('records an empty at-risk set as the terminal outcome', () => {
    const atRisk = IDEMPOTENCY_REGISTRY.filter(
      (entry) => (entry.verdict as string) === 'at-risk',
    );
    expect(atRisk).toEqual([]);
  });

  it('cites the live protection for every key-protected entry', () => {
    const protectedEntries = IDEMPOTENCY_REGISTRY.filter(
      (entry) => entry.verdict === 'key-protected',
    );
    expect(protectedEntries.length).toBeGreaterThan(0);
    for (const entry of protectedEntries) {
      expect(
        /lock|unique|CTE|atomic|lease|token/i.test(entry.evidence),
        `${entry.id} claims key protection without naming it`,
      ).toBe(true);
    }
  });

  it('justifies every accepted risk rather than merely asserting it', () => {
    const accepted = IDEMPOTENCY_REGISTRY.filter((entry) => entry.verdict === 'accepted-risk');
    expect(accepted.length).toBeGreaterThan(0);
    for (const entry of accepted) {
      expect(entry.evidence.length, `${entry.id} accepted risk`).toBeGreaterThan(80);
    }
  });

  it('names the queue’s unique index as the enqueue protection', () => {
    const enqueue = IDEMPOTENCY_REGISTRY.find(
      (entry: IdempotencyEntry) => entry.id === 'queue/enqueue',
    );
    expect(enqueue?.evidence).toMatch(/esi_refresh_jobs_live_key_unique/);
    const schema = readFileSync(
      path.join(ROOT, 'src/data/esi-refresh-jobs/schema.ts'),
      'utf8',
    );
    expect(schema).toMatch(/esi_refresh_jobs_live_key_unique/);
  });

  it('names the generation guard for the scheduled Convex sync action', () => {
    const locationAction = IDEMPOTENCY_REGISTRY.find(
      (entry) => entry.id === 'convex/characterLocationSync:syncUser',
    );
    expect(locationAction?.evidence).toMatch(/generation.?guard/i);
    expect(locationAction?.evidence).toMatch(/workId/i);
    expect(locationAction?.redeliverySource).toMatch(/scheduled Convex action/i);
    expect(locationAction?.redeliverySource).toMatch(/at most once/i);
    expect(readFileSync(path.join(ROOT, 'convex/convex.config.ts'), 'utf8')).not.toMatch(
      /[Ww]orkpool/,
    );
  });

  it('rests the route verdicts on the absence of a retry in the API client', () => {
    const client = readFileSync(path.join(ROOT, 'src/transport/api-client.ts'), 'utf8');
    expect(client).not.toMatch(/\bretry\b|\bretries\b|attempt\s*<|backoff/i);
    for (const entry of routeEntries) {
      expect(entry.redeliverySource).toMatch(/no retry/i);
    }
  });
});
