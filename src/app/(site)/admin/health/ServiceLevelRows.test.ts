import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FailureGroup } from '@/data/telemetry/capability-stats';
import { SECTION_LOAD_FAILED } from '../load-section';
import { AdminTrendChart } from '../charts';
import { deriveServiceLevels, type ServiceLevelRow } from './health-view';
import { ServiceLevelRows, type ServiceLevelDetails } from './ServiceLevelRows';

vi.mock('../charts', () => ({
  AdminTrendChart: vi.fn(() => null),
}));

const rows = deriveServiceLevels(
  { readSuccess: 0.9, mutationSuccess: 0.98, latencyP95: 2000, esiSuccess: 0.9 },
);

const range = {
  from: new Date('2026-09-19T00:00:00Z'),
  to: new Date('2026-09-21T00:00:00Z'),
};

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
    read: { range, groups: [], daily: [] },
    mutation: { range, groups: [], daily: [] },
    slowest: [],
    esi: [],
    esiClientErrors: { errors: 0, calls: 0, rate: null, groups: [] },
  };
}

function render(id: ServiceLevelRow['id'], details: ServiceLevelDetails): string {
  return renderToStaticMarkup(createElement(ServiceLevelRows, {
    rows: rows.filter((row) => row.id === id),
    details,
  }));
}

beforeEach(() => vi.clearAllMocks());

describe('service level rows', () => {
  it('reads like the overview: verdict spoken, value in the value column, target under the title', () => {
    const html = render('read_success_rate', emptyDetails());

    expect(html).toContain('<span class="sr-only">Critical</span>');
    expect(html).toContain('Tracked read success');
    expect(html).toContain('target ≥ 99%');
    expect(html).toContain('90.0%');
    expect(html).toContain(rows[0]!.responseAction);
  });
});

describe('service level details', () => {
  it.each([
    ['read_success_rate', 'read'],
    ['mutation_success_rate', 'mutation'],
  ] as const)('shows the failures and daily trend for %s', (id, detailKey) => {
    const details = emptyDetails();
    details.read = { range, groups: [failure('read-preferences')], daily: [] };
    details.mutation = { range, groups: [failure('save-preferences')], daily: [] };
    const operation = detailKey === 'read' ? 'read-preferences' : 'save-preferences';
    const collapsedCode = { ...failure(operation), code: 'unexpected' };
    const unnamedClass = {
      ...failure(operation),
      outcome: 'dependency_unavailable',
      code: 'projection_unavailable',
      errorClass: null,
    };
    details[detailKey] = {
      range,
      groups: [failure(operation), collapsedCode, unnamedClass],
      daily: [{ day: '2026-09-19', failures: 0 }, { day: '2026-09-20', failures: 4 }],
      validationRejected: 1500,
    };

    const html = render(id, details);

    expect(html).toContain(`account · ${operation}`);
    expect(html).not.toContain(detailKey === 'read' ? 'save-preferences' : 'read-preferences');
    expect(html).toContain('unexpected · save_failed · 23502');
    expect(html).toContain('unexpected · 23502');
    expect(html).toContain('dependency_unavailable · projection_unavailable');
    expect(html).toContain('aria-label="Top failure groups"');
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
      range,
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

  it('keeps quiet days between failures and at the selected range boundaries', () => {
    const details = emptyDetails();
    details.mutation = {
      range: {
        from: new Date('2026-09-19T00:00:00Z'),
        to: new Date('2026-09-24T00:00:00Z'),
      },
      groups: [failure('save-preferences')],
      daily: [{ day: '2026-09-20', failures: 1 }, { day: '2026-09-22', failures: 3 }],
    };

    expect(render('mutation_success_rate', details)).toContain('Failures by day');
    expect(AdminTrendChart).toHaveBeenCalledWith(expect.objectContaining({
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 3, y: 3 }, { x: 4, y: 0 }],
      labels: ['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
    }), undefined);
  });

  it.each(rows.map((row) => [row.id] as const))('keeps %s available when its detail query fails', (id) => {
    const html = render(id, {
      read: SECTION_LOAD_FAILED,
      mutation: SECTION_LOAD_FAILED,
      slowest: SECTION_LOAD_FAILED,
      esi: SECTION_LOAD_FAILED,
      esiClientErrors: SECTION_LOAD_FAILED,
    });

    expect(html).toContain('>target ');
    expect(html).toContain('Details unavailable.');
    expect(AdminTrendChart).not.toHaveBeenCalled();
  });

  it('shows slow-operation timing and its slowest dependency', () => {
    const details = emptyDetails();
    expect(render('critical_latency_p95', details)).toContain('No operations in this period.');
    details.slowest = [{
      feature: 'planner', operation: 'read-owned-assets', p95Ms: 2400,
      count: 1, slowestDependency: null, slowestShare: null, untimedShare: null,
    }];
    expect(render('critical_latency_p95', details)).toContain('1 run');
    details.slowest = [{
      feature: 'planner', operation: 'read-owned-assets', p95Ms: 2400,
      count: 1200, slowestDependency: 'esi', slowestShare: 0.62, untimedShare: 0.2,
    }];

    const html = render('critical_latency_p95', details);

    expect(html).toContain('aria-label="Slowest operations"');
    expect(html).toContain('planner · read-owned-assets');
    expect(html).toContain('2,400 ms');
    expect(html).toContain('1,200 runs · mostly esi (62%) · 20% untimed');

    // A dependency that takes a sliver of the run is named, not called "mostly".
    details.slowest = [{
      feature: 'feedback', operation: 'submit-feedback', p95Ms: 900,
      count: 3, slowestDependency: 'redis', slowestShare: 0.02, untimedShare: 0.98,
    }];
    expect(render('critical_latency_p95', details)).toContain('3 runs · redis 2% · 98% untimed');
  });

  it('shows ESI failures and 4xx answers under their own tables, or the clear states', () => {
    const details = emptyDetails();
    details.esi = [failure('refresh-assets')];

    const failures = render('esi_success_rate', details);

    expect(failures).toContain('aria-label="Top ESI failure groups"');
    expect(failures).toContain('account · refresh-assets');
    expect(failures).not.toContain('Failures by day');
    expect(failures).toContain('No 4xx answers from ESI in this period.');
    expect(failures).not.toContain('aria-label="ESI 4xx answers"');

    details.esiClientErrors = {
      errors: 7,
      calls: 200,
      rate: 0.035,
      groups: [{
        feature: 'maps', operation: 'search-characters', errors: 7, calls: 200,
        lastSeen: new Date('2026-09-21T10:00:00Z'),
      }, {
        feature: 'planner', operation: 'read-owned-assets', errors: 1, calls: 2_500,
        lastSeen: new Date('2026-09-20T10:00:00Z'),
      }],
    };

    const html = render('esi_success_rate', details);

    expect(html).not.toContain('No 4xx answers from ESI in this period.');
    expect(html).toContain('aria-label="ESI 4xx answers"');
    expect(html).toContain('maps · search-characters');
    expect(html).toContain('3.5%');
    expect(html).toContain('2026-09-21');
    // One 4xx in 2,500 calls still reads as a share, not as none.
    expect(html).toContain('&lt;0.1%');
  });
});
