import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PendingWhStaticsReview } from '@/data/wh-statics/queries';

const mocks = vi.hoisted(() => ({ statics: vi.fn() }));

vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: mocks.statics }));

import { loadServingCopy, PendingReview, ServingCopy, StaticsActionForm } from './StaticsCards';

const review: PendingWhStaticsReview = {
  id: 7,
  feedVersion: '42',
  etag: null,
  systemCount: 2604,
  createdAt: new Date('2026-10-08T00:00:00Z'),
  difference: {
    systemsAdded: [{ systemId: 31000001, codes: ['C247'] }],
    systemsRemoved: [],
    systemsChanged: [],
    codesAdded: ['C247'],
    codesRemoved: [],
    totalDifferences: 1,
  },
  crossCheck: { agreedSystems: 1, disagreements: [], lineageOnlySystems: [], feedOnlySystems: [31000009] },
};

describe('serving copy', () => {
  it('keeps only the version and size of the promoted copy', async () => {
    mocks.statics.mockResolvedValue({ version: '41', systems: [{ systemId: 1, codes: [] }, { systemId: 2, codes: [] }] });

    const copy = await loadServingCopy();

    expect(copy).toEqual({ version: '41', systemCount: 2 });
    expect(renderToStaticMarkup(createElement(ServingCopy, { copy }))).toContain('v41 · 2 systems');
  });

  it('uses the same empty state as an empty review', () => {
    const serving = renderToStaticMarkup(createElement(ServingCopy, { copy: { version: '', systemCount: 0 } }));
    const pending = renderToStaticMarkup(createElement(PendingReview, { snapshot: null }));

    expect(serving).toContain('No promoted snapshot.');
    expect(pending).toContain('No pending snapshot.');
    expect(serving.replace('promoted', 'pending')).toBe(pending);
  });
});

describe('PendingReview', () => {
  const html = renderToStaticMarkup(createElement(PendingReview, { snapshot: review }));

  it('shows the four figures as tiles and the agreed systems in the singular', () => {
    expect(html).toContain('<dl');
    expect(html).toContain('Lineage disagreements');
    expect(html).toContain('1 system matches independent lineage.');
  });

  it('titles each list as a sub-heading and says None in place of an empty one', () => {
    expect(html).toContain('<h4 class="mb-2 font-ui text-ui text-muted">Systems removed, with the codes they lose</h4>');
    expect(html).toContain('None.');
    expect(html).not.toContain('<p class="font-ui text-ui text-muted">None.</p>');
    expect(html).toContain('31000001: C247');
    expect(html).toContain('Complete lineage comparison (1 structural difference)');
  });

  it('insets every body at the card padding', () => {
    expect(html).not.toContain('px-4');
  });

  it('offers promote and reject for the snapshot', () => {
    expect(html).toContain('Promote snapshot');
    expect(html).toContain('Reject snapshot');
    expect(html).toContain('name="snapshotId" value="7"');
  });

  it('will not promote an empty snapshot', () => {
    const empty = renderToStaticMarkup(createElement(PendingReview, { snapshot: { ...review, systemCount: 0 } }));

    expect(empty).toContain('Empty snapshot cannot be promoted');
    expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Empty snapshot cannot be promoted/);
  });
});

describe('StaticsActionForm', () => {
  it('posts a refresh without a snapshot id', () => {
    const html = renderToStaticMarkup(createElement(StaticsActionForm, { action: 'refresh', label: 'Check feed now' }));

    expect(html).toContain('name="action" value="refresh"');
    expect(html).not.toContain('snapshotId');
  });
});
