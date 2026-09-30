'use client';

import Link from 'next/link';
import { cn } from './cn';
import { NavRailGroup, navRailLink } from './nav-rail';
import { usePathname } from 'next/navigation';
import type { ContentNavItem, ContentNavModel } from './content-browser-view';
import { contentBrowserHref, deriveActiveContentSlug } from './content-browser-view';

export type ContentBrowserNavProps = {
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
  return (
    <Link
      href={contentBrowserHref(basePath, item.slug, landingSlug)}
      aria-current={active ? 'page' : undefined}
      data-content-browser-nav-item
      className={cn(navRailLink, 'block')}
    >
      {item.title}
    </Link>
  );
}

export function ContentBrowserNavTree({
  basePath,
  navigationLabel,
  landingSlug,
  model,
  activeSlug,
}: ContentBrowserNavProps & { activeSlug: string | null }) {
  return (
    <nav className="font-ui" aria-label={navigationLabel}>
      <NavRailGroup className="mb-3.5 last:mb-3.5">
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
      </NavRailGroup>
    </nav>
  );
}

export function ContentBrowserNav(props: ContentBrowserNavProps) {
  const pathname = usePathname();
  return (
    <ContentBrowserNavTree
      {...props}
      activeSlug={deriveActiveContentSlug(pathname, props.basePath, props.landingSlug)}
    />
  );
}
