import Link from 'next/link';
import type { ReactNode } from 'react';

/** A link inside helper copy: blue, underlined on hover. */
export const inlineLink = 'text-tone-blue hover:underline';

/**
 * The action link in a card header's hint slot. The arrow stays on the
 * label's line; the global `a:hover` rule in globals.css owns the hover.
 * `↗` marks a link that leaves the current console.
 */
export function CardLink({
  href,
  arrow = '→',
  children,
}: {
  href: string;
  arrow?: '→' | '↗';
  children: string;
}) {
  return (
    <Link href={href} className="whitespace-nowrap text-isk no-underline">
      {`${children} ${arrow}`}
    </Link>
  );
}

/** A link to another site, opened in a new tab without handing over this page. */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
