import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ContentBrowserNav, ContentBrowserNavTree } from './content-browser-nav';
import type { ContentNavModel } from './content-browser-view';

export type { ContentNavGroup, ContentNavItem, ContentNavModel } from './content-browser-view';
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
    <div className="content-browser-layout pb-16">
      <details className="content-browser-rail" open>
        <summary className="content-browser-rail-toggle list-none [&::-webkit-details-marker]:hidden">
          {railLabel}
        </summary>
        <div className="content-browser-rail-body">
          <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
            <ContentBrowserNav {...navProps} />
          </Suspense>
        </div>
      </details>
      <div className="content-browser-content">{children}</div>
    </div>
  );
}
