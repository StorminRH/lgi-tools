import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { AttentionList } from './AdminOverviewCards';
import type { AdminSignals } from './signals';

const NOW = new Date('2026-09-26T12:00:00Z');

function signals(overrides: Partial<AdminSignals> = {}): AdminSignals {
  return {
    now: NOW,
    crons: {
      lastRuns: [
        { action: 'cron_prices', timestamp: new Date('2026-09-26T09:00:00Z'), outcome: 'refreshed' },
        { action: 'cron_sde', timestamp: new Date('2026-09-26T07:00:00Z'), outcome: 'up-to-date' },
        { action: 'cron_housekeeping', timestamp: new Date('2026-09-26T08:00:00Z'), outcome: 'cleaned' },
      ],
      priceOutcomes: [],
      sdeOutcomes: [],
      gscOutcomes: [],
      housekeepingOutcomes: [],
      gscConfigured: false,
      gscLastSyncedAt: null,
    },
    budget: { effectiveRemaining: 87, selfCount: 2, echo: 90, source: 'shared' },
    fallback: { esi: 100, fallback: 0, perDay: [] },
    budgetExhaustions: 0,
    sli: { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 },
    statics: null,
    releases: [],
    ...overrides,
  };
}

function render(s: AdminSignals): string {
  return renderToStaticMarkup(createElement(AttentionList, { signals: s }));
}

test('AttentionList says all clear when nothing needs you, and otherwise lists each item with its verdict and action', () => {
  const clear = render(signals());
  expect(clear).toContain('All clear');
  expect(clear).not.toContain('<ul>');

  const html = render(signals({ budget: null, statics: { feedVersion: '42', totalDifferences: 1 } }));

  expect(html).not.toContain('All clear');
  expect(html).toMatch(/^<ul><li /);
  expect(html).toContain('<span class="sr-only">Critical</span>');
  expect(html).toContain('<span class="sr-only">Warning</span>');
  expect(html).toContain('>Error budget: unavailable</span>');
  expect(html).toContain('>scoreboard unavailable · dispatch paused</span>');
  expect(html).toContain('>1 assignment difference</span>');
  expect(html).toContain('href="/admin/esi"');
  expect(html).toContain('Review snapshot <span aria-hidden="true">→</span></a>');
});
