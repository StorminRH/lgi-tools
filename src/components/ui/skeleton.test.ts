import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { Skeleton, SkeletonGroup } from './skeleton';

test('an unlabelled skeleton is decoration and a labelled one is a loading status', () => {
  expect(renderToStaticMarkup(createElement(Skeleton, { className: 'h-3 w-16' }))).toBe(
    '<span aria-hidden="true" class="skeleton-shimmer block h-3 w-16"></span>',
  );
  expect(
    renderToStaticMarkup(createElement(Skeleton, { label: 'Loading account', className: 'size-8' })),
  ).toBe('<span role="status" aria-label="Loading account" class="skeleton-shimmer block size-8"></span>');
});

test('a skeleton group is the one named, busy status around its bars', () => {
  const html = renderToStaticMarkup(
    createElement(
      SkeletonGroup,
      { label: 'Loading jobs', className: 'flex flex-col' },
      createElement(Skeleton, { className: 'h-3' }),
      createElement(Skeleton, { className: 'h-1' }),
    ),
  );

  expect(html).toMatch(
    /^<div role="status" aria-label="Loading jobs" aria-busy="true" class="flex flex-col"><span aria-hidden="true"/,
  );
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
});
