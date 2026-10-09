import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminForceLogoutForm } from './AdminForceLogoutForm';

describe('disabled admin action explanations', () => {
  it('connects the force-logout button to its screen-reader explanation', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminForceLogoutForm, {
        userId: 'user-1',
        userName: 'Pilot',
        disabled: true,
      }),
    );

    const button = markup.match(/<button\b[^>]*>Force logout<\/button>/)?.[0];
    expect(button).toContain('disabled=""');
    const describedBy = button?.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeDefined();
    expect(markup).toContain(
      `<span id="${describedBy}" class="sr-only">Use the normal sign-out for your own session.</span>`,
    );
  });
});
