import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountMenu } from '@/components/composition/account/AccountMenu';
import { FeedbackButton } from '@/components/composition/FeedbackButton';

const mocks = vi.hoisted(() => ({
  anchorResult: vi.fn(),
  querySelector: vi.fn(),
}));

vi.mock('@/components/ui/menu', async () => {
  const { createElement: element } = await import('react');
  const Part = ({ children }: { children?: React.ReactNode }) =>
    element('div', null, children);
  return {
    Menu: ({
      trigger,
      children,
      anchor,
    }: {
      trigger: React.ReactNode;
      children?: React.ReactNode;
      anchor?: () => Element | null;
    }) => {
      mocks.anchorResult(anchor?.());
      return element('div', { 'data-account-menu': '' }, trigger, children);
    },
    MenuItem: Part,
    MenuLinkItem: Part,
    MenuSeparator: Part,
    menuRow: '',
    menuSeparator: '',
  };
});

vi.mock('@/components/character-portrait', () => ({
  CharacterPortrait: ({ name }: { name: string }) =>
    createElement('span', { 'data-character-portrait': '' }, name),
}));

vi.mock('@/components/composition/PageMenuSection', () => ({
  PageMenuSection: () => null,
}));

vi.mock('@/platform/auth/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock('@/platform/auth/link-character', () => ({
  startCharacterLink: vi.fn(),
}));

vi.mock('@/platform/auth/components/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false }),
}));

vi.mock('@/features/feedback/components/FeedbackModal', () => ({
  FeedbackModal: () => null,
}));

describe('map chrome variants', () => {
  beforeEach(() => {
    mocks.anchorResult.mockReset();
    mocks.querySelector.mockReset();
    mocks.querySelector.mockReturnValue({ id: 'site-header' });
    vi.stubGlobal('document', { querySelector: mocks.querySelector });
  });

  it('preserves account-menu anchoring, compact feedback, and contextual settings before logout', () => {
    const markup = renderToStaticMarkup(
      createElement(AccountMenu, {
        session: {
          characterId: 1,
          name: 'Mapper',
          portraitUrl: '/portrait.png',
          role: 'ADMIN',
        },
        contextualSection: createElement('div', { 'data-contextual-settings': '' }),
      }),
    );

    expect(markup).toContain('data-character-portrait');
    expect(mocks.querySelector).toHaveBeenCalledWith('.app-header');
    expect(mocks.anchorResult).toHaveBeenCalledWith({ id: 'site-header' });
    expect(markup).toContain('data-contextual-settings');
    expect(markup.indexOf('data-contextual-settings')).toBeLessThan(
      markup.indexOf('Log out'),
    );

    const standard = renderToStaticMarkup(createElement(FeedbackButton));
    const compact = renderToStaticMarkup(
      createElement(FeedbackButton, { compact: true }),
    );
    const embedded = renderToStaticMarkup(
      createElement(FeedbackButton, { compact: true, embedded: true }),
    );
    expect(standard).toContain('>Feedback</button>');
    expect(standard).not.toContain('aria-label=');
    expect(compact).toContain('aria-label="Send feedback"');
    expect(compact).toContain('>?</button>');
    expect(embedded).toContain('data-map-feedback-chip="true"');
    expect(embedded).not.toContain('fixed bottom-4 right-4');
  });
});
