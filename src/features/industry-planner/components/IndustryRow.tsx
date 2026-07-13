import Link from 'next/link';
import { initials } from '@/lib/format/names';

// A recents/favorites row for the industry dashboard (handoff §5): a typographic
// monogram (or a ★ for favorites) beside the name over an optional group
// caption, linking to the blueprint planner page. Presentational and hook-free,
// so it renders from both the client recents island and the server favorites
// section. Green tint + a 2px green left rule on hover.
export function IndustryRow({
  name,
  href,
  fav = false,
  group,
}: {
  name: string;
  href: string;
  fav?: boolean;
  group?: string;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-3 px-3.5 py-[11px] border-t border-border-soft first:border-t-0 border-l-2 border-l-transparent no-underline transition-colors hover:bg-isk-hover hover:border-l-isk"
    >
      <span className="industry-mono">{fav ? '★' : initials(name)}</span>
      <span className="min-w-0">
        <span className="block text-ui font-semibold text-name truncate">{name}</span>
        {group && (
          <span className="block text-micro text-muted mt-0.5 tracking-copy truncate">
            {group}
          </span>
        )}
      </span>
    </Link>
  );
}
