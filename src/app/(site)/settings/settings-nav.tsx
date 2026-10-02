'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavRailFrame, NavRailTree, navRailLink } from '@/components/ui/nav-rail';
import { cn } from '@/components/ui/cn';
import {
  deriveActiveSettingsSection,
  SETTINGS_GROUPS,
  type SettingsGroup,
  type SettingsSection,
} from './settings-sections';

function SectionLink({ section, active }: { section: SettingsSection; active: boolean }) {
  return (
    <Link
      href={section.href}
      aria-current={active ? 'page' : undefined}
      data-settings-nav-item
      className={cn(navRailLink, 'block')}
    >
      {section.title}
    </Link>
  );
}

function SettingsNavTree({
  groups,
  active,
}: {
  groups: readonly SettingsGroup[];
  active: SettingsSection | null;
}) {
  return (
    <NavRailTree
      label="Settings sections"
      groups={groups}
      renderSection={(section) => (
        <SectionLink section={section} active={active?.id === section.id} />
      )}
    />
  );
}

function SettingsNavFrame({
  groups,
  active,
}: {
  groups: readonly SettingsGroup[];
  active: SettingsSection | null;
}) {
  const tree = <SettingsNavTree groups={groups} active={active} />;
  return (
    <NavRailFrame
      title="Settings"
      entrance="animate"
      current={active?.title ?? 'Choose a section'}
      mobileProps={{ 'data-settings-nav-mobile': true }}
      panelProps={{ 'data-settings-nav-rail': true }}
    >
      {tree}
    </NavRailFrame>
  );
}

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <SettingsNavFrame
      groups={SETTINGS_GROUPS}
      active={deriveActiveSettingsSection(pathname, SETTINGS_GROUPS)}
    />
  );
}

export function SettingsNavFallback() {
  return <SettingsNavFrame groups={SETTINGS_GROUPS} active={null} />;
}
