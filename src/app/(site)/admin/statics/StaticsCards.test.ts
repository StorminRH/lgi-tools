import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { whStaticsAdminFormSchema } from '@/data/wh-statics/api-contract';
import type { PendingWhStaticsReview } from '@/data/wh-statics/queries';
import { postedForm, postedForms } from '@/lib/__tests__/posted-forms';

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

test('keeps only the version and size of the promoted copy, or says none is promoted', async () => {
  mocks.statics.mockResolvedValue({ version: '41', systems: [{ systemId: 1, codes: [] }, { systemId: 2, codes: [] }] });

  const copy = await loadServingCopy();

  expect(copy).toEqual({ version: '41', systemCount: 2 });
  expect(renderToStaticMarkup(createElement(ServingCopy, { copy }))).toContain('v41 · 2 systems');
  expect(renderToStaticMarkup(createElement(ServingCopy, { copy: { version: '', systemCount: 0 } }))).toContain(
    'No promoted snapshot.',
  );
});

test('reviews a pending snapshot and posts promote and reject as the route parses them', () => {
  expect(renderToStaticMarkup(createElement(PendingReview, { snapshot: null }))).toContain('No pending snapshot.');

  const html = renderToStaticMarkup(createElement(PendingReview, { snapshot: review }));

  expect(html).toContain('Lineage disagreements');
  expect(html).toContain('1 system matches independent lineage.');
  expect(html).toContain('None.');
  expect(html).toContain('31000001: C247');
  expect(html).toContain('Complete lineage comparison (1 structural difference)');
  expect(html).toContain('Promote snapshot');
  expect(html).toContain('Reject snapshot');
  const forms = postedForms(html);
  expect(forms.map((form) => form.action)).toEqual(['/api/admin/wh-statics', '/api/admin/wh-statics']);
  expect(forms.map((form) => whStaticsAdminFormSchema.parse(form.fields))).toEqual([
    { action: 'promote', snapshotId: 7 },
    { action: 'reject', snapshotId: 7 },
  ]);

  const empty = renderToStaticMarkup(createElement(PendingReview, { snapshot: { ...review, systemCount: 0 } }));
  expect(empty).toMatch(/<button[^>]*disabled=""[^>]*>Empty snapshot cannot be promoted/);
  expect(empty).not.toContain('Promote snapshot');
});

test('posts a refresh without a snapshot id', () => {
  const html = renderToStaticMarkup(createElement(StaticsActionForm, { action: 'refresh', label: 'Check feed now' }));

  const refresh = postedForm(html);
  expect(refresh.fields).toEqual({ action: 'refresh' });
  expect(whStaticsAdminFormSchema.parse(refresh.fields)).toEqual({ action: 'refresh' });
});
