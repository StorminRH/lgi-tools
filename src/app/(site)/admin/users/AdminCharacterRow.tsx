import Link from 'next/link';
import type { ReactNode } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Pill } from '@/components/ui/pill';

/**
 * A character on the admin users pages: portrait, name, character ID and
 * status chips, then its actions. On a phone the actions drop under the
 * identity, in line with the name, and the chips wrap under a long name
 * rather than squeezing it; from `sm` up everything shares one line with the
 * actions at the end.
 */
export function AdminCharacterRow({
  name,
  characterId,
  portraitUrl,
  href,
  chips,
  actions,
}: {
  name: string;
  characterId: number | null;
  portraitUrl: string;
  /** Links the name, such as to the account's detail page. */
  href?: string;
  /** Status chips after the character ID, such as the role or "Selected". */
  chips?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-border-soft px-3.5 py-2.5 last:border-b-0 hover:bg-row-hover sm:flex-row sm:items-center sm:gap-4">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <CharacterPortrait characterId={characterId ?? undefined} name={name} size={28} src={portraitUrl} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="min-w-0 truncate font-ui text-ui text-name">
            {href === undefined ? (
              name
            ) : (
              <Link href={href} className="transition-colors hover:text-text hover:underline underline-offset-2">
                {name}
              </Link>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Pill tone="neutral" className="whitespace-nowrap">
              Character ID {characterId ?? '—'}
            </Pill>
            {chips}
          </span>
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2 pl-10 sm:shrink-0 sm:justify-end sm:pl-0">{actions}</div>
      )}
    </li>
  );
}
