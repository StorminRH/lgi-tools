import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CronWakeClass } from '@/composition/pipelines/cron-gate';
import { refreshGscDeclaration } from './refresh-gsc/declaration';
import { refreshPricesDeclaration } from './refresh-prices/declaration';
import { refreshSdeDeclaration } from './refresh-sde/declaration';

type CronSpec = {
  path: string;
  schedule: string;
};

type CronRegistryEntry =
  | { declaration: { wakeClass: CronWakeClass } }
  | { justification: string };

const cronRegistry = {
  '/api/cron/daily-batch': {
    justification:
      'Runs the purge-maps, prices, industry-indices, net worth revalue, Monday wh-statics, and housekeeping batch declarations in order.',
  },
  '/api/cron/refresh-gsc': { declaration: refreshGscDeclaration },
  '/api/cron/refresh-sde': { declaration: refreshSdeDeclaration },
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

/** Minutes past midnight UTC for a fixed daily schedule; throws for anything else. */
function dailyMinuteOf(schedule: string): number {
  const [minute, hour] = schedule.trim().split(/\s+/);
  if (isSubDaily(schedule) || !minute || !hour) {
    throw new Error(`Expected a fixed daily cron schedule: ${schedule}`);
  }
  return Number(hour) * 60 + Number(minute);
}

function scheduleOf(path: string): string {
  const cron = vercelConfig.crons.find((entry) => entry.path === path);
  if (!cron) throw new Error(`No Vercel cron for ${path}`);
  return cron.schedule;
}

/** CCP's published daily downtime ends at 11:30 UTC (starts 11:00, ESI off from ~10:55). */
const DOWNTIME_END_MINUTE = 11 * 60 + 30;

describe('cron schedule registry', () => {
  it('fires the SDE refresh once downtime ends and before the daily batch', () => {
    const sdeMinute = dailyMinuteOf(scheduleOf('/api/cron/refresh-sde'));
    const batchMinute = dailyMinuteOf(scheduleOf('/api/cron/daily-batch'));
    expect(sdeMinute).toBeGreaterThanOrEqual(DOWNTIME_END_MINUTE);
    expect(sdeMinute).toBeLessThan(batchMinute);
  });

  it('rejects a sub-daily schedule as a daily minute', () => {
    expect(() => dailyMinuteOf('*/15 11 * * *')).toThrow('fixed daily cron schedule');
  });

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
          [path]: { declaration: refreshPricesDeclaration },
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
          [path]: { declaration: refreshPricesDeclaration },
        },
      ),
    ).toEqual([
      `${path}: sub-daily schedule requires idle-silent, got batch`,
    ]);
  });
});
