import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ContentBrowserChapterTitle } from './content-browser-drawer';
import { ContentBrowserNav, ContentBrowserNavTree } from './content-browser-nav';
import type { ContentNavModel } from './content-browser-view';
import { NavRailFrame, NavRailLayout } from './nav-rail';

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
    <NavRailLayout
      data-content-browser-layout
      columns="chapters"
      className="pb-16"
      rail={
        <NavRailFrame
          mobileProps={{ 'data-content-browser-mobile': true }}
          panelProps={{ 'data-content-browser-rail': true }}
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
        </NavRailFrame>
      }
    >
      {children}
    </NavRailLayout>
  );
}
