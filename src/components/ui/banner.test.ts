import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Banner } from './banner';

const render = (props: Partial<Parameters<typeof Banner>[0]>) =>
  renderToStaticMarkup(Banner({ tone: 'warn', children: 'Fees did not load', ...props }));

test('a plain notice is not clickable', () => {
  const html = render({});
  expect(html).toContain('role="alert"');
  expect(html).not.toContain('data-retry');
  expect(html).not.toContain('<button');
});

test('a notice that can retry covers itself in one labelled button and marks it with the arrow', () => {
  const html = render({ onRetry: vi.fn(), retryLabel: 'Retry system fees' });
  expect(html).toContain('data-retry=""');
  expect(html).toMatch(/<button type="button" aria-label="Retry system fees" class="banner-retry-hit"><\/button>/);
  expect(html).toContain('class="banner-retry"');
});

test('a retry notice has a default label and still offers dismissal', () => {
  const html = render({ tone: 'info', onRetry: vi.fn(), onDismiss: vi.fn() });
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Try again"');
  expect(html).toContain('aria-label="Dismiss notice"');
});
