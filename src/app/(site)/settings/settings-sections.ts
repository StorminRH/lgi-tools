import { longestSectionMatch } from '@/lib/section-path';

export type SettingsSectionId =
  | 'characters'
  | 'corporations'
  | 'preferences'
  | 'account';

export type SettingsSection = {
  id: SettingsSectionId;
  href: `/settings/${string}`;
  title: string;
};

export type SettingsGroup = {
  id: 'personal';
  label: string;
  sections: readonly SettingsSection[];
};

export const SETTINGS_LANDING_HREF = '/settings/characters';

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'personal',
    label: 'Personal',
    sections: [
      {
        id: 'characters',
        href: '/settings/characters',
        title: 'Characters',
      },
      {
        id: 'corporations',
        href: '/settings/corporations',
        title: 'Corporations',
      },
      {
        id: 'preferences',
        href: '/settings/preferences',
        title: 'Preferences',
      },
      {
        id: 'account',
        href: '/settings/account',
        title: 'Account',
      },
    ],
  },
];

export function deriveActiveSettingsSection(
  pathname: string,
  groups: readonly SettingsGroup[],
): SettingsSection | null {
  return longestSectionMatch(
    pathname,
    groups.flatMap((group) => group.sections),
    (section) => section.href,
  );
}
