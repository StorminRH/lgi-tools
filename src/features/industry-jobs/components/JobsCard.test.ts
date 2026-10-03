import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('@/components/type-icon', () => ({
  TypeIcon: ({ mono }: { mono: string }) => createElement('i', { 'data-icon': mono }),
}));

import type { IndustryJob } from '../esi-projection';
import { JobsCard, JobsCardSkeleton } from './JobsCard';

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const SYNCED_AT = NOW - 60_000;

const job = (over: Partial<IndustryJob> = {}): IndustryJob => ({
  job_id: 1,
  installer_id: 7,
  activity_id: 1,
  blueprint_type_id: 688,
  product_type_id: 638,
  runs: 2,
  status: 'active',
  start_date: new Date(NOW - 3_600_000).toISOString(),
  end_date: new Date(NOW + 3_600_000).toISOString(),
  ...over,
});

function render(overrides: Partial<Parameters<typeof JobsCard>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(JobsCard, {
      avatar: createElement('img', { alt: '' }),
      title: 'Aurel Vantesse',
      data: { jobs: [job()] },
      lastSyncedAt: SYNCED_AT,
      names: { '638': 'Raven' },
      now: NOW,
      loading: false,
      noDataText: 'Awaiting first sync.',
      emptyRowsText: 'No industry jobs running.',
      ...overrides,
    }),
  );
}

test('lists a board’s jobs under its owner, with the summary, sync time and blue progress', () => {
  const html = render();
  expect(html).toContain('Aurel Vantesse');
  expect(html).toContain('1 job');
  expect(html).toContain('next done in');
  expect(html).toContain('as of');
  expect(html).toContain('Raven');
  expect(html).toContain('×2 · Manufacturing');
  expect(html).toContain('data-tone="evb"');

  const runner = render({ runnerFor: () => createElement('span', { 'data-runner': '' }, 'Hauler Alt') });
  expect(runner).toContain('data-runner');

  expect(render({ data: { jobs: [] } })).toContain('No industry jobs running.');
});

test('stands in for missing rows by load state, or lets the notice speak alone', () => {
  const loading = render({ data: null, loading: true });
  expect(loading).toContain('aria-label="Loading jobs"');
  expect(loading).not.toContain('Awaiting first sync.');

  const waiting = render({ data: null });
  expect(waiting).toContain('Awaiting first sync.');
  expect(waiting).not.toContain('as of');

  const noticeOnly = render({
    data: null,
    noDataText: undefined,
    notice: createElement('p', { 'data-notice': '' }, 'Role needed'),
  });
  expect(noticeOnly).toContain('data-notice');
  expect(noticeOnly).not.toContain('Industry jobs');

  expect(renderToStaticMarkup(createElement(JobsCardSkeleton))).toContain('aria-label="Loading jobs"');
});
