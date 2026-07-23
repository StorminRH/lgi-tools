import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CronWakeClass } from '@/composition/pipelines/cron-gate';
import { drainEsiRefreshJobsDeclaration } from './drain-esi-refresh-jobs/declaration';
import { refreshAffiliationsDeclaration } from './refresh-affiliations/declaration';
import { refreshGscDeclaration } from './refresh-gsc/declaration';
import { refreshIndustryIndicesDeclaration } from './refresh-industry-indices/declaration';
import { refreshPricesDeclaration } from './refresh-prices/declaration';
import { refreshSdeDeclaration } from './refresh-sde/declaration';
import { syncSweeperDeclaration } from './sync-sweeper/declaration';

type CronSpec = {
  path: string;
  schedule: string;
};

type CronRegistryEntry =
  | { declaration: { wakeClass: CronWakeClass } }
  | { justification: string };

const cronRegistry = {
  '/api/cron/drain-esi-refresh-jobs': {
    declaration: drainEsiRefreshJobsDeclaration,
  },
  '/api/cron/refresh-affiliations': {
    declaration: refreshAffiliationsDeclaration,
  },
  '/api/cron/refresh-gsc': { declaration: refreshGscDeclaration },
  '/api/cron/refresh-industry-indices': {
    declaration: refreshIndustryIndicesDeclaration,
  },
  '/api/cron/refresh-prices': { declaration: refreshPricesDeclaration },
  '/api/cron/refresh-sde': { declaration: refreshSdeDeclaration },
  '/api/cron/sync-sweeper': { declaration: syncSweeperDeclaration },
} satisfies Record<string, CronRegistryEntry>;

const vercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
) as { crons: CronSpec[] };

function isSubDaily(schedule: string): boolean {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected a five-field cron schedule: ${schedule}`);
  }
  const fixedField = /^\d+$/;
  return (
    !fixedField.test(fields[0] ?? '') ||
    !fixedField.test(fields[1] ?? '')
  );
}

function scheduleFindings(
  crons: CronSpec[],
  registry: Record<string, CronRegistryEntry>,
): string[] {
  const findings: string[] = [];
  for (const cron of crons) {
    const entry = registry[cron.path];
    if (!entry) {
      findings.push(`${cron.path}: missing declaration or justification`);
      continue;
    }
    if (
      isSubDaily(cron.schedule)
      && 'declaration' in entry
      && entry.declaration.wakeClass !== 'idle-silent'
    ) {
      findings.push(
        `${cron.path}: sub-daily schedule requires idle-silent, got ${entry.declaration.wakeClass}`,
      );
    }
  }
  return findings;
}

describe('cron schedule registry', () => {
  it('maps every live Vercel cron and satisfies the wake-class gate', () => {
    expect(new Set(Object.keys(cronRegistry))).toEqual(
      new Set(vercelConfig.crons.map((cron) => cron.path)),
    );
    expect(scheduleFindings(vercelConfig.crons, cronRegistry)).toEqual([]);
  });

  it('flags a seeded sub-daily cron with no registry entry', () => {
    expect(
      scheduleFindings(
        [{ path: '/api/cron/unmapped', schedule: '*/15 * * * *' }],
        {},
      ),
    ).toEqual([
      '/api/cron/unmapped: missing declaration or justification',
    ]);
  });

  it('flags a seeded sub-daily cron declared as batch', () => {
    const path = '/api/cron/batch-too-fast';
    expect(
      scheduleFindings(
        [{ path, schedule: '0 */2 * * *' }],
        {
          [path]: { declaration: refreshAffiliationsDeclaration },
        },
      ),
    ).toEqual([
      `${path}: sub-daily schedule requires idle-silent, got batch`,
    ]);
  });

  it('flags a minute-repeating cron even when its hour is fixed', () => {
    const path = '/api/cron/repeating-within-one-hour';
    expect(
      scheduleFindings(
        [{ path, schedule: '*/15 11 * * *' }],
        {
          [path]: { declaration: refreshAffiliationsDeclaration },
        },
      ),
    ).toEqual([
      `${path}: sub-daily schedule requires idle-silent, got batch`,
    ]);
  });
});
