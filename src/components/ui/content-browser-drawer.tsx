'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { DrawerClose } from './drawer';
import type { ContentNavModel } from './content-browser-view';
import { deriveActiveContentSlug, titleForSlug } from './content-browser-view';

/**
 * Resolves the live document title for the compact chapter bar while the server-rendered label
 * remains stable outside the request-time pathname boundary.
 */
export function ContentBrowserChapterTitle({
  basePath,
  landingSlug,
  model,
}: {
  basePath: `/${string}`;
  landingSlug: string | null;
  model: ContentNavModel;
}) {
  const pathname = usePathname();
  const slug = deriveActiveContentSlug(pathname, basePath, landingSlug);
  return (
    <span data-content-drawer-current-title className="min-w-0 flex-1 truncate text-left text-nav text-text">
      {titleForSlug(model, slug)}
    </span>
  );
}

/**
 * Closes the persistent content drawer after a document link, including browser-history
 * navigation. A real hidden Drawer.Close performs the close so focus returns to the chapter bar.
 */
export function ContentBrowserDrawerNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const priorPathname = useRef(pathname);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[data-content-drawer-close]')
      ?.click();
  };

  useEffect(() => {
    if (pathname !== priorPathname.current) close();
    priorPathname.current = pathname;
  }, [pathname]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('a')) close();
  };

  return (
    <div
      ref={rootRef}
      data-content-drawer-navigation
      onClick={onClick}
    >
      {children}
      <DrawerClose
        data-content-drawer-close
        type="button"
        tabIndex={-1}
        className="hidden"
      >
        Close contents
      </DrawerClose>
    </div>
  );
}
