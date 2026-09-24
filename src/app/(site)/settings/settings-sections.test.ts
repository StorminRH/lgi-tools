import { expect, test } from 'vitest';
import {
  deriveActiveSettingsSection,
  SETTINGS_GROUPS,
  SETTINGS_LANDING_HREF,
  visibleSettingsGroups,
} from './settings-sections';

test('the rail hides administration for members, keeps every href unique, and lands on a real section', () => {
  const member = visibleSettingsGroups(false);
  expect(member.map((group) => group.id)).toEqual(['personal']);
  expect(member.some((group) => group.adminOnly)).toBe(false);

  const admin = visibleSettingsGroups(true);
  expect(admin.map((group) => group.id)).toEqual(['personal', 'administration']);

  const hrefs = SETTINGS_GROUPS.flatMap((group) => group.sections.map((section) => section.href));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  for (const href of hrefs) expect(href.startsWith('/settings/')).toBe(true);
  expect(hrefs).toContain(SETTINGS_LANDING_HREF);
});

test('the active section follows the pathname, including nested detail routes and trailing slashes', () => {
  const groups = visibleSettingsGroups(true);

  expect(deriveActiveSettingsSection('/settings/characters', groups)?.id).toBe('characters');
  expect(deriveActiveSettingsSection('/settings/characters/', groups)?.id).toBe('characters');
  expect(deriveActiveSettingsSection('/settings/access/user-123', groups)?.id).toBe('access');
  expect(deriveActiveSettingsSection('/settings/accessories', groups)).toBeNull();
  expect(deriveActiveSettingsSection('/settings', groups)).toBeNull();
  expect(deriveActiveSettingsSection('/atlas', groups)).toBeNull();

  const memberOnly = visibleSettingsGroups(false);
  expect(deriveActiveSettingsSection('/settings/access', memberOnly)).toBeNull();
});
