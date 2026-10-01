import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FailureGroup } from '@/data/telemetry/sli-breakdown';
import { SECTION_LOAD_FAILED } from '../load-section';
import { AdminTrendChart } from '../charts';
import { deriveServiceLevels, type ServiceLevelRow } from './health-view';
import { ServiceLevelRows, type ServiceLevelDetails } from './ServiceLevelRows';

vi.mock('../charts', () => ({
  AdminTrendChart: vi.fn(() => null),
}));

const rows = deriveServiceLevels(
  { readSuccess: 0.97, mutationSuccess: 0.98, latencyP95: 2000, esiSuccess: 0.9 },
  { due: 4, deadLettered: 1, oldestDueHours: 1 },
);

function failure(operation: string): FailureGroup {
  return {
    feature: 'account',
    operation,
    outcome: 'unexpected',
    code: 'save_failed',
    errorClass: '23502',
    count: 1200,
    lastSeen: new Date('2026-09-20T18:04:00Z'),
  };
}

function emptyDetails(): ServiceLevelDetails {
  return {
    read: { groups: [], daily: [] },
    mutation: { groups: [], daily: [] },
    slowest: [],
    esi: [],
    queue: [],
    deadLetters: [],
  };
}

function render(id: ServiceLevelRow['id'], details: ServiceLevelDetails): string {
  return renderToStaticMarkup(createElement(ServiceLevelRows, {
    rows: rows.filter((row) => row.id === id),
    details,
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('service level details', () => {
  it.each([
    ['read_success_rate', 'read'],
    ['mutation_success_rate', 'mutation'],
  ] as const)('shows the failures and daily trend for %s', (id, detailKey) => {
    const details = emptyDetails();
    details.read = { groups: [failure('read-preferences')], daily: [] };
    details.mutation = { groups: [failure('save-preferences')], daily: [] };
    const operation = detailKey === 'read' ? 'read-preferences' : 'save-preferences';
    details[detailKey] = {
      groups: [failure(operation)],
      daily: [{ day: '2026-09-19', failures: 0 }, { day: '2026-09-20', failures: 4 }],
      validationRejected: 1500,
    };

    const html = render(id, details);

    expect(html).toContain(`account · ${operation}`);
    expect(html).not.toContain(detailKey === 'read' ? 'save-preferences' : 'read-preferences');
    expect(html).toContain('unexpected · save_failed · 23502');
    expect(html).toContain('1,200');
    expect(html).toContain('2026-09-20');
    expect(html).toContain('1,500 rejected as invalid input, not counted.');
    expect(AdminTrendChart).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 0, y: 0 }, { x: 1, y: 4 }],
      labels: ['2026-09-19', '2026-09-20'],
      unit: 'count',
      tone: 'red',
      ariaLabel: 'Failures by day',
    }), undefined);
  });

  it.each([undefined, 0])('omits the trend and invalid-input note when counts are absent or zero (%s)', (validationRejected) => {
    const details = emptyDetails();
    details.mutation = {
      groups: [],
      daily: [{ day: '2026-09-20', failures: 0 }],
      validationRejected,
    };

    const html = render('mutation_success_rate', details);

    expect(html).toContain('No failures in this period.');
    expect(html).not.toContain('Failures by day');
    expect(html).not.toContain('rejected as invalid input');
    expect(AdminTrendChart).not.toHaveBeenCalled();
  });

  it.each(rows.map((row) => [row.id] as const))('keeps %s available when its detail query fails', (id) => {
    const html = render(id, {
      read: SECTION_LOAD_FAILED,
      mutation: SECTION_LOAD_FAILED,
      slowest: SECTION_LOAD_FAILED,
      esi: SECTION_LOAD_FAILED,
      queue: SECTION_LOAD_FAILED,
      deadLetters: SECTION_LOAD_FAILED,
    });

    expect(html).toContain('Target ');
    expect(html).toContain('Details unavailable.');
    expect(AdminTrendChart).not.toHaveBeenCalled();
  });

  it('shows slow-operation timing and its slowest dependency', () => {
    const details = emptyDetails();
    expect(render('critical_latency_p95', details)).toContain('No operations in this period.');
    details.slowest = [{
      feature: 'planner', operation: 'read-owned-assets', p95Ms: 2400,
      count: 1200, slowestDependency: 'esi',
    }];

    const html = render('critical_latency_p95', details);

    expect(html).toContain('aria-label="Slowest operations"');
    expect(html).toContain('planner · read-owned-assets');
    expect(html).toContain('2,400 ms');
    expect(html).toContain('1,200 runs · mostly esi');
  });

  it('shows ESI failures under the ESI-specific table label', () => {
    const details = emptyDetails();
    details.esi = [failure('refresh-assets')];

    const html = render('esi_success_rate', details);

    expect(html).toContain('aria-label="Rate limited or failed by ESI"');
    expect(html).toContain('account · refresh-assets');
    expect(html).not.toContain('Failures by day');
  });

  it('shows queue counts, dead-letter timing and the queue link', () => {
    const details = emptyDetails();
    expect(render('job_backlog', details)).toContain('No dead-lettered jobs.');
    details.queue = [{ status: 'queued', count: 4, oldestCreatedAt: new Date('2026-09-20T18:00:00Z') }];
    details.deadLetters = [{
      id: 1, dataset: 'owned_assets', ownerType: 'character', ownerId: 42,
      resource: '/characters/42/assets/', budgetReason: null, lastErrorCode: 'esi_503',
      attemptCount: 3, createdAt: new Date('2026-09-19T10:00:00Z'),
      finishedAt: new Date('2026-09-20T18:04:00Z'),
    }];

    const html = render('job_backlog', details);

    expect(html).toContain('Queued &amp; running 4');
    expect(html).toContain('Latest dead letters');
    expect(html).toContain('owned assets · character 42');
    expect(html).toContain('esi_503');
    expect(html).toContain('2026-09-20 18:04 UTC');
    expect(html).toContain('href="/admin/queue"');
  });
});
