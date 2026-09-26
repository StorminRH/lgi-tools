'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavRailDrawer, NavRailPanel } from '@/components/ui/nav-rail';
import { eyebrow } from '@/components/ui/type-roles';
import {
  deriveActiveSettingsSection,
  type SettingsGroup,
  type SettingsSection,
} from './settings-sections';

function SectionLink({ section, active }: { section: SettingsSection; active: boolean }) {
  return (
    <Link
      href={section.href}
      aria-current={active ? 'page' : undefined}
      data-settings-nav-item
      className="relative block rounded-r-ctl py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none"
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
    <nav className="font-ui" aria-label="Settings sections">
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-0">
          <div
            className={eyebrow({
              size: 'micro',
              tone: 'faint',
              weight: 'semibold',
              emphasis: 'strong',
              className: 'mb-1.5 pl-3',
            })}
          >
            {group.label}
          </div>
          <ul className="list-none border-l border-nav-guide">
            {group.sections.map((section) => (
              <li key={section.id}>
                <SectionLink section={section} active={active?.id === section.id} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function SettingsNavFrame({
  groups,
  active,
}: {
  groups: readonly SettingsGroup[];
  active: SettingsSection | null;
}) {
  const tree = <SettingsNavTree groups={groups} active={active} />;
  return (
    <>
      <NavRailDrawer
        data-settings-nav-mobile
        title="Settings"
        label="Section"
        current={active?.title ?? 'Choose a section'}
      >
        {tree}
      </NavRailDrawer>
      <NavRailPanel data-settings-nav-rail>{tree}</NavRailPanel>
    </>
  );
}

export function SettingsNav({ groups }: { groups: readonly SettingsGroup[] }) {
  const pathname = usePathname();
  return <SettingsNavFrame groups={groups} active={deriveActiveSettingsSection(pathname, groups)} />;
}
