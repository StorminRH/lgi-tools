import type { ComponentProps, ReactNode } from 'react';
import { cardSurface } from './card';
import { cn } from './cn';
import { ContentBrowserDrawerNavigation } from './content-browser-drawer';
import { Drawer } from './drawer';
import { scrollArea } from './scroll-area';

/**
 * The sticky glass section rail beside a content column on desktop.
 * Hidden below lg, where NavRailDrawer takes over.
 */
export function NavRailPanel({
  className,
  children,
  ...rest
}: Omit<ComponentProps<'div'>, 'title'> & { children: ReactNode }) {
  return (
    <div
      {...rest}
      className={cn(
        cardSurface,
        'reveal reveal-1 hidden min-w-0 p-2 lg:sticky lg:top-24 lg:block lg:self-start',
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
export function NavRailDrawer({
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
