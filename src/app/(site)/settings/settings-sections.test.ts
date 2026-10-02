import { expect, test } from 'vitest';
import {
  deriveActiveSettingsSection,
  SETTINGS_GROUPS,
  SETTINGS_LANDING_HREF,
} from './settings-sections';

test('the rail holds only personal sections, keeps every href unique, and lands on a real section', () => {
  expect(SETTINGS_GROUPS.map((group) => group.id)).toEqual(['personal']);

  const hrefs = SETTINGS_GROUPS.flatMap((group) => group.sections.map((section) => section.href));
  expect(new Set(hrefs).size).toBe(hrefs.length);
  for (const href of hrefs) expect(href.startsWith('/settings/')).toBe(true);
  expect(hrefs).toContain(SETTINGS_LANDING_HREF);
  expect(hrefs).not.toContain('/settings/access');
});

test('the active section follows the pathname, including nested routes and trailing slashes', () => {
  expect(deriveActiveSettingsSection('/settings/characters', SETTINGS_GROUPS)?.id).toBe('characters');
  expect(deriveActiveSettingsSection('/settings/characters/', SETTINGS_GROUPS)?.id).toBe('characters');
  expect(deriveActiveSettingsSection('/settings/account/extra', SETTINGS_GROUPS)?.id).toBe('account');
  expect(deriveActiveSettingsSection('/settings/accounts', SETTINGS_GROUPS)).toBeNull();
  expect(deriveActiveSettingsSection('/settings', SETTINGS_GROUPS)).toBeNull();
  expect(deriveActiveSettingsSection('/atlas', SETTINGS_GROUPS)).toBeNull();
});
