import Link from 'next/link';
import { TypeIcon } from '@/components/type-icon';
import { Chip } from '@/components/ui/chip';
import { EntityRow } from '@/components/ui/row';
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
      className="block border-l-2 border-l-transparent no-underline transition-colors hover:border-l-isk hover:bg-isk-hover"
    >
      <EntityRow
        colsClass="grid-cols-[26px_minmax(0,1fr)]"
        className="py-[11px]"
        leading={icon ? (
        <TypeIcon {...icon} size={26} mono={initials(name)} />
      ) : (
        <Chip tone="green" className="size-[26px] justify-center p-0 font-jb text-ui font-extrabold">
          {initials(name)}
        </Chip>
      )}
        name={<span className="min-w-0">
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
      </span>}
      />
    </Link>
  );
}
