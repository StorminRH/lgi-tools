'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavRailFrame, NavRailTree, navRailLink } from '@/components/ui/nav-rail';
import { cn } from '@/components/ui/cn';
import { useAuth } from '@/platform/auth/components/AuthProvider';
import {
  deriveActiveSettingsSection,
  visibleSettingsGroups,
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
      current={active?.title ?? 'Choose a section'}
      mobileProps={{ 'data-settings-nav-mobile': true }}
      panelProps={{ 'data-settings-nav-rail': true }}
    >
      {tree}
    </NavRailFrame>
  );
}

// The rail reads the client session rather than awaiting one on the server, so
// it prerenders into the static shell; only the admin group waits on sign-in.
export function SettingsNav() {
  const pathname = usePathname();
  const groups = visibleSettingsGroups(useAuth().isAdmin);
  return <SettingsNavFrame groups={groups} active={deriveActiveSettingsSection(pathname, groups)} />;
}

export function SettingsNavFallback() {
  return <SettingsNavFrame groups={visibleSettingsGroups(false)} active={null} />;
}
