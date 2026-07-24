import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminForceLogoutForm } from './AdminForceLogoutForm';
import { AdminReassignCharacterForm } from './AdminReassignCharacterForm';

describe('disabled admin action explanations', () => {
  it('connects the force-logout button to its screen-reader explanation', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminForceLogoutForm, {
        userId: 'user-1',
        userName: 'Pilot',
        disabled: true,
      }),
    );

    const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeDefined();
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup).toContain('Use the normal sign-out for your own session.');
  });

  it('connects the reassign button to its screen-reader explanation', () => {
    const markup = renderToStaticMarkup(
      createElement(AdminReassignCharacterForm, {
        characterId: 90_000_001,
        characterName: 'Pilot',
        fromUserId: 'user-1',
        disabled: true,
      }),
    );

    const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(describedBy).toBeDefined();
    expect(markup).toContain(`id="${describedBy}"`);
    expect(markup).toContain('This character is already on your account.');
  });
});
