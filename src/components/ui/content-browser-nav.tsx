'use client';

import Link from 'next/link';
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
      className="relative block py-1.5 pl-3 pr-2 font-ui text-ui tracking-optical text-muted no-underline transition-colors before:absolute before:-left-px before:top-1/2 before:h-4 before:w-px before:-translate-y-1/2 before:bg-transparent before:content-[''] hover:bg-row-hover hover:text-text aria-[current=page]:bg-row-hover aria-[current=page]:text-isk aria-[current=page]:before:bg-isk motion-reduce:transition-none"
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
