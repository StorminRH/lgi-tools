'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ContentNavItem, ContentNavModel } from './content-browser-view';
import { contentBrowserHref, deriveActiveContentSlug } from './content-browser-view';

type ContentBrowserNavProps = {
  basePath: `/${string}`;
  navigationLabel: string;
  landingSlug: string | null;
  model: ContentNavModel;
};

function ContentItemLink({
  item,
  basePath,
  landingSlug,
  activeSlug,
}: {
  item: ContentNavItem;
  basePath: `/${string}`;
  landingSlug: string | null;
  activeSlug: string | null;
}) {
  const active = item.slug === activeSlug;
  // Partial Prefetching (Next 16.3) reuses one App Shell per route, so the old
  // "prefetch every slug in one burst" cost no longer applies. Leave the Link
  // default so soft navigations get the shared shell; document bodies stream
  // from Suspense around `params`.
  return (
    <Link
      href={contentBrowserHref(basePath, item.slug, landingSlug)}
      aria-current={active ? 'page' : undefined}
      data-content-browser-nav-item
      className="relative block py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none"
    >
      {item.title}
    </Link>
  );
}

/**
 * Renders the domain-neutral content browser nav tree with house behavior and tokens; callers own
 * semantic meaning and content while this primitive owns presentation.
 */
export function ContentBrowserNavTree({
  basePath,
  navigationLabel,
  landingSlug,
  model,
  activeSlug,
}: ContentBrowserNavProps & { activeSlug: string | null }) {
  return (
    <nav className="font-ui" aria-label={navigationLabel}>
      <ul className="mb-3.5 list-none border-l border-nav-guide">
        {model.items.map((item) => (
          <li key={item.slug}>
            <ContentItemLink
              item={item}
              basePath={basePath}
              landingSlug={landingSlug}
              activeSlug={activeSlug}
            />
          </li>
        ))}
      </ul>
      {model.groups.map((group) => (
        <details
          key={group.slug}
          data-collapsible
          data-content-browser-nav-group
          open
          className="group mb-1 rounded-ctl py-1 has-[[aria-current=page]]:bg-nav-wash"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 font-ui text-label tracking-label uppercase text-faint hover:text-muted [&::-webkit-details-marker]:hidden">
            <span
              data-chevron
              className="inline-block w-2 text-micro text-faint transition-transform group-open:rotate-90 motion-reduce:transition-none"
              aria-hidden
            >
              ▸
            </span>
            <span>{group.title}</span>
          </summary>
          <ul className="ml-4 list-none border-l border-nav-guide">
            {group.items.map((item) => (
              <li key={item.slug}>
                <ContentItemLink
                  item={item}
                  basePath={basePath}
                  landingSlug={landingSlug}
                  activeSlug={activeSlug}
                />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  );
}

/**
 * Renders the domain-neutral content browser nav with house behavior and tokens; callers own
 * semantic meaning and content while this primitive owns presentation.
 */
export function ContentBrowserNav(props: ContentBrowserNavProps) {
  const pathname = usePathname();
  return (
    <ContentBrowserNavTree
      {...props}
      activeSlug={deriveActiveContentSlug(pathname, props.basePath, props.landingSlug)}
    />
  );
}
