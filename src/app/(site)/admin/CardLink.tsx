import Link from 'next/link';

export function CardLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="text-isk no-underline transition-colors hover:text-name">
      {children} →
    </Link>
  );
}
