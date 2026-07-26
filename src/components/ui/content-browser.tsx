import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { ContentBrowserNav, ContentBrowserNavTree } from './content-browser-nav';
import type { ContentNavModel } from './content-browser-view';

export type { ContentNavGroup, ContentNavItem, ContentNavModel } from './content-browser-view';
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
  return (
    <div
      data-content-browser-layout
      className="grid items-start gap-5 pb-16 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10"
    >
      <details data-content-browser-rail className="min-w-0 lg:sticky lg:top-6" open>
        <summary
          data-content-browser-rail-toggle
          className="mb-3 flex cursor-pointer list-none items-center gap-2 rounded-card border border-border px-3 py-2.5 font-ui text-label tracking-label uppercase text-muted after:ml-auto after:text-micro after:content-['▾'] [&::-webkit-details-marker]:hidden lg:hidden"
        >
          {railLabel}
        </summary>
        <div
          data-content-browser-rail-body
          className="lg:max-h-[calc(100dvh-48px)] lg:overflow-y-auto lg:overscroll-y-auto"
        >
          <Suspense fallback={<ContentBrowserNavTree {...navProps} activeSlug={null} />}>
            <ContentBrowserNav {...navProps} />
          </Suspense>
        </div>
      </details>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
