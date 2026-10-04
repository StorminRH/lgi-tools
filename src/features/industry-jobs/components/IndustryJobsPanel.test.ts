import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';
import type { PanelCharacter } from '@/platform/auth/panel-character';
import type { ViewerJobs } from '../live-derive';

const h = vi.hoisted(() => ({
  dimmed: [] as number[],
  live: vi.fn(),
  retry: vi.fn(),
}));

vi.mock('../use-jobs-live', () => ({ useJobsLive: h.live }));
vi.mock('@/components/PreferencesProvider', () => ({
  usePreference: () => [h.dimmed, vi.fn()],
}));
vi.mock('@/components/character-strip', () => ({
  CharacterStrip: () => createElement('div', { 'data-strip': true }),
}));
vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) => createElement('img', { alt: name }),
}));
vi.mock('@/components/type-icon', () => ({
  TypeIcon: () => createElement('i'),
}));

import { IndustryJobsPanel } from './IndustryJobsPanel';

const NOW = Date.UTC(2026, 8, 27, 14, 5);
const characters: PanelCharacter[] = [
  { characterId: 1, name: 'Pilot One', portraitUrl: '/one.png', needsReconnect: false },
  { characterId: 2, name: 'Pilot Two', portraitUrl: '/two.png', needsReconnect: false },
  { characterId: 3, name: 'Reconnect Pilot', portraitUrl: '/three.png', needsReconnect: true },
];

function live(overrides: Partial<ReturnType<typeof import('../use-jobs-live').useJobsLive>> = {}) {
  h.live.mockReturnValue({
    jobsByCharacter: new Map<number, ViewerJobs>(),
    names: { '638': 'Raven' },
    now: NOW,
    loading: false,
    failed: false,
    retry: h.retry,
    ...overrides,
  });
}

function render(strip = false) {
  return renderToStaticMarkup(createElement(IndustryJobsPanel, {
    characters,
    strip: strip ? { surfaceId: 'jobs' } : undefined,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.dimmed = [];
  live();
});

test('renders visible pilots while syncing every eligible pilot, including hidden ones', () => {
  h.dimmed = [2, 3];
  const html = render(true);
  expect(html).toContain('Personal jobs');
  expect(html).toContain('Pilot One');
  expect(html).not.toContain('Pilot Two');
  expect(html).toContain('Reconnect Pilot');
  expect(h.live).toHaveBeenCalledWith([1, 2]);
  expect(render()).toContain('Pilot Two');
});

test('a reconnect notice and settings link replace the reconnect pilot’s loading skeleton', () => {
  live({ loading: true });
  h.dimmed = [1, 2];
  const html = render(true);
  expect(html).toContain('missing the industry scope');
  expect(html).toContain('href="/settings/characters"');
  expect(html).toContain('Nothing synced for this character.');
  expect(html).not.toContain('aria-label="Loading jobs"');
});

test('eligible pilots show loading skeletons until their first sync', () => {
  live({ loading: true });
  expect(render()).toContain('aria-label="Loading jobs"');
  expect(render()).not.toContain('Awaiting first sync.');
  live();
  expect(render()).toContain('Awaiting first sync.');
});

test('live jobs and empty boards use the right pilot, names, progress and sync time', () => {
  live({
    jobsByCharacter: new Map<number, ViewerJobs>([
      [1, {
        characterId: 1,
        lastRefreshedAt: NOW - 60_000,
        data: { jobs: [{
          job_id: 1,
          installer_id: 1,
          activity_id: 1,
          blueprint_type_id: 688,
          product_type_id: 638,
          runs: 2,
          status: 'active',
          start_date: new Date(NOW - 3_600_000).toISOString(),
          end_date: new Date(NOW + 3_600_000).toISOString(),
        }] },
      }],
      [2, { characterId: 2, lastRefreshedAt: NOW - 60_000, data: { jobs: [] } }],
    ]),
  });
  const html = render();
  expect(html).toContain('Raven');
  expect(html).toContain('×2 · Manufacturing');
  expect(html).toContain('next done in');
  expect(html).toContain('as of');
  expect(html.indexOf('Raven')).toBeLessThan(html.indexOf('Pilot Two'));
  expect(html).toContain('No industry jobs running.');
});

test('failed reads show one retry notice and suppress every character card', () => {
  live({ failed: true });
  const html = render();
  expect(html).toContain('Industry jobs didn&#x27;t load');
  expect(html).toContain('Retry loading industry jobs');
  expect(html).not.toContain('Pilot One');
  expect(html).not.toContain('Reconnect Pilot');
  expect(html).not.toContain('Awaiting first sync.');

  const panel = IndustryJobsPanel({ characters });
  const failure = panel.props.failure as ReactElement<{ onRetry: () => void }>;
  failure.props.onRetry();
  expect(h.retry).toHaveBeenCalledOnce();
});
