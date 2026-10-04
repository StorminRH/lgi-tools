import { sectionMatches } from '@/lib/section-path';
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
  let best: SettingsSection | null = null;
  for (const group of groups) {
    for (const section of group.sections) {
      if (sectionMatches(pathname, section.href) && (best === null || section.href.length > best.href.length)) {
        best = section;
      }
    }
  }
  return best;
}
