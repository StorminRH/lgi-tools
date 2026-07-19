'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/components/ui/cn';
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
  // Both document browsers mount their full index; automatic viewport
  // prefetch would render every linked route segment in one burst.
  return (
    <Link
      href={contentBrowserHref(basePath, item.slug, landingSlug)}
      prefetch={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'content-browser-nav-item',
        active && 'content-browser-nav-item-active',
      )}
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
    <nav className="content-browser-nav" aria-label={navigationLabel}>
      <ul className="content-browser-nav-items">
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
          open
          className="content-browser-nav-group group"
        >
          <summary className="content-browser-nav-group-summary list-none [&::-webkit-details-marker]:hidden">
            <span data-chevron className="content-browser-nav-chevron" aria-hidden>
              ▸
            </span>
            <span className="content-browser-nav-group-name">{group.title}</span>
          </summary>
          <ul className="content-browser-nav-group-items">
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
