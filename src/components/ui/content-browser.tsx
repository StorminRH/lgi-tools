import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import {
  ContentBrowserChapterTitle,
  ContentBrowserDrawerNavigation,
} from './content-browser-drawer';
import { ContentBrowserNav, ContentBrowserNavTree } from './content-browser-nav';
import type { ContentNavModel } from './content-browser-view';
import { Drawer } from './drawer';
import { scrollArea } from './scroll-area';

export type { ContentNavModel } from './content-browser-view';
export { landingContentSlug } from './content-browser-view';

/**
 * Renders the domain-neutral content browser with house behavior and tokens; callers own semantic
 * meaning and content while this primitive owns presentation.
 */
export function ContentBrowser({
  basePath,
  railLabel,
  navigationLabel,
  landingSlug,
  model,
  children,
}: {
  basePath: `/${string}`;
  railLabel: string;
  navigationLabel: string;
  landingSlug: string | null;
  model: ContentNavModel;
  children: ReactNode;
}) {
  const navProps = { basePath, navigationLabel, landingSlug, model };
  const chapterBar = (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="shrink-0 font-ui text-label font-semibold tracking-label uppercase text-faint">
        {railLabel}
      </span>
      <Suspense
        fallback={
          <span
            data-content-drawer-current-title
            className="min-w-0 flex-1 truncate text-left text-nav text-text"
          />
        }
      >
        <ContentBrowserChapterTitle
          basePath={basePath}
          landingSlug={landingSlug}
          model={model}
        />
      </Suspense>
      <span className="shrink-0 text-label text-muted" aria-hidden="true">
        ↑
      </span>
    </span>
  );
  return (
    <div
      data-content-browser-layout
      className="grid items-start gap-5 pb-16 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10"
    >
      <div data-content-browser-mobile className="min-w-0 lg:hidden">
        <Drawer
          title={railLabel}
          trigger={chapterBar}
          triggerClassName="flex w-full cursor-pointer items-center rounded-card border border-border bg-section px-3 py-2.5 text-muted shadow-card-edge transition-colors hover:border-border-active hover:text-name data-[popup-open]:border-border-active data-[popup-open]:text-name motion-reduce:transition-none"
        >
          <ContentBrowserDrawerNavigation>
            <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
              <ContentBrowserNav {...navProps} />
            </Suspense>
          </ContentBrowserDrawerNavigation>
        </Drawer>
      </div>
      <div
        data-content-browser-rail
        className="hidden min-w-0 lg:sticky lg:top-6 lg:block"
      >
        <div
          data-content-browser-rail-body
          className={cn(
            scrollArea,
            'lg:max-h-[calc(100dvh-48px)] lg:overflow-y-auto lg:overscroll-y-auto',
          )}
        >
          <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
            <ContentBrowserNav {...navProps} />
          </Suspense>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
