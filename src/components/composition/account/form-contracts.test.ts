import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { postedForm } from '@/lib/__tests__/posted-forms';
import {
  adminReassignFormSchema,
  adminRevokeSessionsFormSchema,
  adminRoleFormSchema,
  adminUnlinkFormSchema,
  switchCharacterFormSchema,
  unlinkCharacterFormSchema,
} from '@/platform/auth/api-contract';
import { AdminForceLogoutForm } from './AdminForceLogoutForm';
import { AdminReassignCharacterForm } from './AdminReassignCharacterForm';
import { AdminUnlinkCharacterForm } from './AdminUnlinkCharacterForm';
import { RoleToggleForm } from './RoleToggleForm';
import { SwitchCharacterForm } from './SwitchCharacterForm';
import { UnlinkCharacterForm } from './UnlinkCharacterForm';

// Each form's hidden fields go through its route's schema, made strict() so a
// stray or misspelled field fails as surely as a missing one.
function posted(element: ReactElement) {
  return postedForm(renderToStaticMarkup(element));
}

test('the character settings forms post what their routes parse', () => {
  const makeActive = posted(createElement(SwitchCharacterForm, { characterId: 9_000_001 }));
  expect(makeActive.action).toBe('/api/account/active-character');
  expect(switchCharacterFormSchema.strict().parse(makeActive.fields)).toEqual({ characterId: 9_000_001 });

  const unlink = posted(createElement(UnlinkCharacterForm, { characterId: 9_000_002, disabled: true }));
  expect(unlink.action).toBe('/api/account/characters/unlink');
  expect(unlinkCharacterFormSchema.strict().parse(unlink.fields)).toEqual({ characterId: 9_000_002 });
});

test('the role toggle posts the next role and carries back only a non-empty search', () => {
  const props = { targetUserId: 'user-2', currentRole: 'USER', viewerUserId: 'user-1' } as const;

  const searched = posted(createElement(RoleToggleForm, { ...props, currentQuery: 'pilot' }));
  expect(searched.action).toBe('/api/admin/role');
  expect(adminRoleFormSchema.strict().parse(searched.fields)).toEqual({ userId: 'user-2', nextRole: 'ADMIN', q: 'pilot' });

  const unsearched = posted(createElement(RoleToggleForm, { ...props, currentQuery: '' }));
  expect(unsearched.fields).not.toHaveProperty('q');
  expect(adminRoleFormSchema.strict().parse(unsearched.fields)).toEqual({ userId: 'user-2', nextRole: 'ADMIN' });
});

test('the admin character and session forms post what their routes parse', () => {
  const unlink = posted(
    createElement(AdminUnlinkCharacterForm, { userId: 'user-2', characterId: 9_000_003, characterName: 'Pilot' }),
  );
  expect(unlink.action).toBe('/api/admin/characters/unlink');
  expect(adminUnlinkFormSchema.strict().parse(unlink.fields)).toEqual({ userId: 'user-2', characterId: 9_000_003 });

  const reassign = posted(
    createElement(AdminReassignCharacterForm, { characterId: 9_000_004, characterName: 'Pilot', fromUserId: 'user-2' }),
  );
  expect(reassign.action).toBe('/api/admin/characters/reassign');
  expect(adminReassignFormSchema.strict().parse(reassign.fields)).toEqual({ characterId: 9_000_004, fromUserId: 'user-2' });

  const revoke = posted(createElement(AdminForceLogoutForm, { userId: 'user-2', userName: 'Pilot' }));
  expect(revoke.action).toBe('/api/admin/sessions/revoke');
  expect(adminRevokeSessionsFormSchema.strict().parse(revoke.fields)).toEqual({ userId: 'user-2' });
});
