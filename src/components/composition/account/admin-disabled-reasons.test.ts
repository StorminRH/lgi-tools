import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AdminForceLogoutForm } from './AdminForceLogoutForm';
import { AdminUnlinkCharacterForm } from './AdminUnlinkCharacterForm';
import { RoleToggleForm } from './RoleToggleForm';
import { UnlinkCharacterForm } from './UnlinkCharacterForm';

/** The sr-only reason a button's aria-describedby points at, and the button's own markup. */
function linkedReason(element: ReactElement, label: string) {
  const markup = renderToStaticMarkup(element);
  const button = markup.match(new RegExp(`<button\\b[^>]*>${label}</button>`))?.[0] ?? '';
  const describedBy = button.match(/aria-describedby="([^"]+)"/)?.[1];
  const reason = describedBy
    ? markup.match(new RegExp(`<span id="${describedBy}" class="sr-only">([^<]+)</span>`))?.[1]
    : undefined;
  return { button, reason };
}

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

  it('tells screen readers why unlink and the role toggle are disabled, not only the hover title', () => {
    const disabled = [
      linkedReason(createElement(UnlinkCharacterForm, { characterId: 9_000_001, disabled: true }), 'Unlink'),
      linkedReason(
        createElement(AdminUnlinkCharacterForm, {
          userId: 'user-1',
          characterId: 9_000_001,
          characterName: 'Pilot',
          disabled: true,
        }),
        'Unlink',
      ),
      linkedReason(
        createElement(RoleToggleForm, {
          targetUserId: 'user-1',
          currentRole: 'ADMIN',
          viewerUserId: 'user-1',
          currentQuery: undefined,
        }),
        'Revoke admin',
      ),
    ];
    for (const { button, reason } of disabled) {
      expect(button).toContain('disabled=""');
      expect(reason).toBeTruthy();
      expect(button).toContain(`title="${reason}"`);
    }

    const enabled = [
      linkedReason(createElement(UnlinkCharacterForm, { characterId: 9_000_001 }), 'Unlink'),
      linkedReason(
        createElement(RoleToggleForm, {
          targetUserId: 'user-2',
          currentRole: 'ADMIN',
          viewerUserId: 'user-1',
          currentQuery: undefined,
        }),
        'Revoke admin',
      ),
    ];
    for (const { button, reason } of enabled) {
      expect(button).not.toBe('');
      expect(button).not.toMatch(/disabled=|title=|aria-describedby=/);
      expect(reason).toBeUndefined();
    }
  });
});
