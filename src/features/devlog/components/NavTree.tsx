'use client';

import Link from 'next/link';
import { cn } from '@/components/ui/cn';
import type { DevlogNavModel, NavDoc } from '../types';

// The file-browser rail markup, driven only by props (no hooks) so it renders both
// as the static Suspense fallback (activeSlug=null) and, hydrated, inside the
// usePathname-aware DevlogNav. Folders are native <details> (open state persists
// across soft navigation because the layout never remounts); the active document
// is the only request-time bit, streamed in by DevlogNav.
function DocLink({
  doc,
  introSlug,
  activeSlug,
}: {
  doc: NavDoc;
  introSlug: string | undefined;
  activeSlug: string | null;
}) {
  const href = doc.slug === introSlug ? '/devlog' : `/devlog/${doc.slug}`;
  const active = doc.slug === activeSlug;
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn('devlog-nav-doc', active && 'devlog-nav-doc-active')}
    >
      {doc.title}
    </Link>
  );
}

export function NavTree({
  model,
  activeSlug,
}: {
  model: DevlogNavModel;
  activeSlug: string | null;
}) {
  const introSlug = model.looseDocuments[0]?.slug;
  return (
    <nav className="devlog-nav" aria-label="Dev log documents">
      <ul className="devlog-nav-loose">
        {model.looseDocuments.map((d) => (
          <li key={d.slug}>
            <DocLink doc={d} introSlug={introSlug} activeSlug={activeSlug} />
          </li>
        ))}
      </ul>
      {model.folders.map((folder) => (
        <details key={folder.slug} data-collapsible open className="devlog-nav-folder group">
          <summary className="devlog-nav-folder-summary list-none [&::-webkit-details-marker]:hidden">
            <span data-chevron className="devlog-nav-chevron" aria-hidden>
              ▸
            </span>
            <span className="devlog-nav-folder-name">{folder.title}</span>
          </summary>
          <ul className="devlog-nav-folder-docs">
            {folder.documents.map((d) => (
              <li key={d.slug}>
                <DocLink doc={d} introSlug={introSlug} activeSlug={activeSlug} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </nav>
  );
}
