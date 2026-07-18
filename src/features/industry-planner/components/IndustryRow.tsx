import Link from 'next/link';
import { TypeIcon } from '@/components/type-icon';
import type { EveImageDescriptor } from '@/data/eve-data/type-images';
import { initials } from '@/lib/format/names';

/**
 * A recents/favorites row for the industry dashboard (handoff §5): an EVE item
 * image with typographic fallback beside the name over an optional group
 * caption, linking to the blueprint planner page. Presentational and hook-free,
 * so it renders from both the client recents island and the server favorites
 * section. Favorites carry a small ★ name suffix. Green tint + a 2px green left
 * rule on hover.
 */
export function IndustryRow({
  name,
  href,
  icon,
  fav = false,
  group,
}: {
  name: string;
  href: string;
  icon?: EveImageDescriptor;
  fav?: boolean;
  group?: string;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-3 px-3.5 py-[11px] border-t border-border-soft first:border-t-0 border-l-2 border-l-transparent no-underline transition-colors hover:bg-isk-hover hover:border-l-isk"
    >
      {icon ? (
        <TypeIcon {...icon} size={26} mono={initials(name)} />
      ) : (
        <span className="industry-mono">{initials(name)}</span>
      )}
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5 text-ui font-semibold text-name">
          <span className="truncate">{name}</span>
          {fav && (
            <span className="shrink-0 text-label text-isk" aria-label="Favorite">
              ★
            </span>
          )}
        </span>
        {group && (
          <span className="block text-micro text-muted mt-0.5 tracking-copy truncate">
            {group}
          </span>
        )}
      </span>
    </Link>
  );
}
