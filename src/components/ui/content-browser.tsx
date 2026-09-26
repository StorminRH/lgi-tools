import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ContentBrowserChapterTitle } from './content-browser-drawer';
import { ContentBrowserNav, ContentBrowserNavTree } from './content-browser-nav';
import type { ContentNavModel } from './content-browser-view';
import { NavRailDrawer, NavRailPanel } from './nav-rail';

export type { ContentNavModel } from './content-browser-view';
export { landingContentSlug } from './content-browser-view';

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
  return (
    <div
      data-content-browser-layout
      className="grid items-start gap-5 pb-16 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10"
    >
      <NavRailDrawer
        data-content-browser-mobile
        title={railLabel}
        label={railLabel}
        current={
          <Suspense fallback={null}>
            <ContentBrowserChapterTitle
              basePath={basePath}
              landingSlug={landingSlug}
              model={model}
            />
          </Suspense>
        }
      >
        <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
          <ContentBrowserNav {...navProps} />
        </Suspense>
      </NavRailDrawer>
      <NavRailPanel data-content-browser-rail>
        <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
          <ContentBrowserNav {...navProps} />
        </Suspense>
      </NavRailPanel>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
