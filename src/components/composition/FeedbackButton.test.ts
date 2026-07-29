import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false }),
}));

vi.mock('@/features/feedback/components/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

describe('FeedbackButton', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('keeps the default labelled rendering unchanged', async () => {
    const { FeedbackButton } = await import('./FeedbackButton');
    const html = renderToStaticMarkup(createElement(FeedbackButton));
    expect(html).toContain('Feedback');
    expect(html).toContain('px-4');
  });

  it('uses the compact size when requested', async () => {
    const { FeedbackButton } = await import('./FeedbackButton');
    const html = renderToStaticMarkup(createElement(FeedbackButton, { compact: true }));
    expect(html).toContain('Feedback');
    expect(html).toContain('px-2.5');
  });
});
