export type SettingsSectionId =
  | 'characters'
  | 'corporations'
  | 'preferences'
  | 'account'
  | 'access';

export type SettingsSection = {
  id: SettingsSectionId;
  href: `/settings/${string}`;
  title: string;
};

export type SettingsGroup = {
  id: 'personal' | 'administration';
  label: string;
  adminOnly: boolean;
  sections: readonly SettingsSection[];
};

export const SETTINGS_LANDING_HREF = '/settings/characters';

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'personal',
    label: 'Personal',
    adminOnly: false,
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
  {
    id: 'administration',
    label: 'Administration',
    adminOnly: true,
    sections: [
      {
        id: 'access',
        href: '/settings/access',
        title: 'Users & roles',
      },
    ],
  },
];

export function visibleSettingsGroups(isAdmin: boolean): readonly SettingsGroup[] {
  return SETTINGS_GROUPS.filter((group) => isAdmin || !group.adminOnly);
}

function sectionMatches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function deriveActiveSettingsSection(
  pathname: string,
  groups: readonly SettingsGroup[],
): SettingsSection | null {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  let best: SettingsSection | null = null;
  for (const group of groups) {
    for (const section of group.sections) {
      if (sectionMatches(trimmed, section.href) && (best === null || section.href.length > best.href.length)) {
        best = section;
      }
    }
  }
  return best;
}
