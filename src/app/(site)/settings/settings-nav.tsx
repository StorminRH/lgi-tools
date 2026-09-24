'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
import { ContentBrowserDrawerNavigation } from '@/components/ui/content-browser-drawer';
import { Drawer } from '@/components/ui/drawer';
import { scrollArea } from '@/components/ui/scroll-area';
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
      className="relative block py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none"
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
      <div data-settings-nav-mobile className="min-w-0 lg:hidden">
        <Drawer
          title="Settings"
          trigger={
            <span className="flex min-w-0 flex-1 items-center gap-3">
              <span className="shrink-0 font-ui text-label font-semibold tracking-label uppercase text-faint">
                Section
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-nav text-text">
                {active?.title ?? 'Choose a section'}
              </span>
              <span className="shrink-0 text-label text-muted" aria-hidden="true">
                ↑
              </span>
            </span>
          }
          triggerClassName="flex w-full cursor-pointer items-center rounded-card border border-border bg-section px-3 py-2.5 text-muted shadow-card-edge transition-colors hover:border-border-active hover:text-name data-[popup-open]:border-border-active data-[popup-open]:text-name motion-reduce:transition-none"
        >
          <ContentBrowserDrawerNavigation>{tree}</ContentBrowserDrawerNavigation>
        </Drawer>
      </div>
      <div data-settings-nav-rail className="hidden min-w-0 lg:sticky lg:top-6 lg:block">
        <div
          className={cn(
            scrollArea,
            'lg:max-h-[calc(100dvh-48px)] lg:overflow-y-auto lg:overscroll-y-auto',
          )}
        >
          {tree}
        </div>
      </div>
    </>
  );
}

export function SettingsNav({ groups }: { groups: readonly SettingsGroup[] }) {
  const pathname = usePathname();
  return <SettingsNavFrame groups={groups} active={deriveActiveSettingsSection(pathname, groups)} />;
}
