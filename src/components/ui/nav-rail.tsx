import type { ComponentProps, ReactNode } from 'react';
import { cardSurface } from './card';
import { cn } from './cn';
import { ContentBrowserDrawerNavigation } from './content-browser-drawer';
import { Drawer } from './drawer';
import { scrollArea } from './scroll-area';
import { eyebrow } from './type-roles';

/**
 * The sticky glass section rail beside a content column on desktop.
 * Hidden below lg, where NavRailDrawer takes over.
 */
function NavRailPanel({
  className,
  children,
  reveal = true,
  ...rest
}: Omit<ComponentProps<'div'>, 'title'> & {
  children: ReactNode;
  // False for a rail that replaces a Suspense fallback's rail: fading in
  // again would blink a rail that is already on screen.
  reveal?: boolean;
}) {
  return (
    <div
      {...rest}
      className={cn(
        cardSurface,
        reveal && 'reveal reveal-1',
        'hidden min-w-0 p-2 lg:sticky lg:top-24 lg:block lg:self-start',
        className,
      )}
    >
      <div
        data-nav-rail-body
        className={cn(
          scrollArea,
          'lg:max-h-[calc(100dvh-128px)] lg:overflow-y-auto lg:overscroll-y-auto',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The mobile counterpart to NavRailPanel: a glass bar naming the current
 * page that opens the same navigation in a bottom drawer.
 */
function NavRailDrawer({
  title,
  label,
  current,
  className,
  children,
  ...rest
}: Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  title: string;
  label: string;
  current: ReactNode;
  children: ReactNode;
}) {
  return (
    <div {...rest} className={cn('min-w-0 lg:hidden', className)}>
      <Drawer
        title={title}
        trigger={
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <span className="shrink-0 font-ui text-label font-semibold tracking-label uppercase text-faint">
              {label}
            </span>
            <span data-nav-rail-current className="min-w-0 flex-1 truncate text-left text-nav text-text">
              {current}
            </span>
            <span className="shrink-0 text-label text-muted" aria-hidden="true">
              ↑
            </span>
          </span>
        }
        triggerClassName={cn(
          cardSurface,
          'flex w-full cursor-pointer items-center px-3 py-2.5 text-muted transition-colors hover:border-border-active hover:text-name data-[popup-open]:border-border-active data-[popup-open]:text-name motion-reduce:transition-none',
        )}
      >
        <ContentBrowserDrawerNavigation>{children}</ContentBrowserDrawerNavigation>
      </Drawer>
    </div>
  );
}

/** Shared presentation; callers retain their link destination and contents. */
export const navRailLink =
  "relative rounded-r-ctl py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none";

export function NavRailGroup({
  label,
  children,
  className,
}: {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 last:mb-0', className)}>
      {label ? (
        <div
          className={eyebrow({
            size: 'micro',
            tone: 'faint',
            weight: 'semibold',
            emphasis: 'strong',
            className: 'mb-1.5 pl-3',
          })}
        >
          {label}
        </div>
      ) : null}
      <ul className="list-none border-l border-nav-guide">{children}</ul>
    </div>
  );
}

export function NavRailTree<T extends { id: string }>({ groups, label, renderSection }: {
  groups: readonly { id: string; label: ReactNode; sections: readonly T[] }[];
  label: string;
  renderSection: (section: T) => ReactNode;
}) {
  return (
    <nav className="font-ui" aria-label={label}>
      {groups.map((group) => (
        <NavRailGroup key={group.id} label={group.label}>
          {group.sections.map((section) => <li key={section.id}>{renderSection(section)}</li>)}
        </NavRailGroup>
      ))}
    </nav>
  );
}

export function NavRailFrame({
  title,
  label = 'Section',
  current,
  children,
  reveal = true,
  mobileProps,
  panelProps,
}: {
  title: string;
  label?: string;
  current: ReactNode;
  children: ReactNode;
  reveal?: boolean;
  mobileProps?: ComponentProps<'div'> & { [key: `data-${string}`]: string | boolean };
  panelProps?: ComponentProps<'div'> & { [key: `data-${string}`]: string | boolean };
}) {
  return (
    <>
      <NavRailDrawer {...mobileProps} title={title} label={label} current={current}>
        {children}
      </NavRailDrawer>
      <NavRailPanel {...panelProps} reveal={reveal}>
        {children}
      </NavRailPanel>
    </>
  );
}
