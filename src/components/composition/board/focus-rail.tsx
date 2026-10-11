import { type ReactNode, ViewTransition } from 'react';
import { CharacterPortrait } from '@/components/character-portrait';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { pilotTransitionName } from './board-motion';

// The focus board's two layouts, shared by the home board and the industry
// workspace (and their skeletons): the rail beside the overview, and one
// character's sheet in its place.
export const FOCUS_OVERVIEW_GRID = 'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-10';
export const FOCUS_SHEET_GRID = 'grid gap-x-10 gap-y-6 xl:grid-cols-[280px_minmax(0,1fr)]';

/**
 * The portrait rail, frameless on the backdrop: a column beside the overview,
 * and on phones a horizontal strip of portraits that scrolls on its own.
 */
export function PortraitRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex min-w-0 gap-4 overflow-x-auto px-4 pb-2 sm:-mx-0 sm:px-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:pb-0"
    >
      {children}
    </nav>
  );
}

/**
 * One character on the rail. Opening it morphs the portrait into the sheet's,
 * and `tileAttribute` is what the focus view looks up to refocus this entry on
 * the way back. The main entry is large; the rest are compact rows. `children`
 * are the detail lines shown beside the portrait from lg up.
 */
export function RailEntry({
  characterId,
  name,
  portraitUrl,
  main = false,
  dimmed = false,
  tileAttribute,
  ariaLabel,
  nameAccessory,
  onSelect,
  children,
}: {
  characterId: number;
  name: string;
  portraitUrl?: string;
  main?: boolean;
  dimmed?: boolean;
  tileAttribute: 'data-pilot-id' | 'data-member-id';
  ariaLabel?: string;
  nameAccessory?: ReactNode;
  onSelect: (characterId: number) => void;
  children?: ReactNode;
}) {
  return (
    <Button
      variant="bare"
      aria-label={ariaLabel}
      {...{ [tileAttribute]: characterId }}
      onClick={() => onSelect(characterId)}
      className={cn(
        'group w-16 shrink-0 flex-col gap-1.5 rounded-card text-center lg:w-full lg:text-left',
        main ? 'lg:flex-col lg:items-start lg:gap-3' : 'lg:flex-row lg:items-start lg:gap-3',
      )}
    >
      <ViewTransition name={pilotTransitionName(characterId)} share="morph" default="none">
        <CharacterPortrait
          characterId={characterId}
          name={name}
          size={main ? 112 : 64}
          src={portraitUrl}
          className={cn(
            'transition-shadow duration-300 group-hover:shadow-cta-glow group-focus-visible:shadow-cta-glow max-lg:size-12 lg:max-xl:size-14',
            dimmed && 'opacity-50 grayscale',
          )}
        />
      </ViewTransition>
      <span className="flex w-full min-w-0 flex-col gap-1">
        <span className="flex min-w-0 items-center justify-center gap-1.5 lg:justify-start">
          <span
            className={cn(
              'truncate font-display font-bold leading-tight text-name transition-colors group-hover:text-isk-bright max-lg:text-micro',
              main ? 'lg:text-h3' : 'lg:text-nav',
            )}
          >
            {name}
          </span>
          {nameAccessory}
        </span>
        {children}
      </span>
    </Button>
  );
}

/** The trigger around a rail's last entry, the dashed "+" disc that adds a character. */
export const railAddTrigger =
  'group relative flex w-16 shrink-0 cursor-pointer flex-col items-center gap-1.5 rounded-card font-data text-ui text-muted outline-none transition-colors hover:text-isk focus-visible:text-isk lg:w-full lg:flex-row lg:gap-3';

/** The dashed "+" disc and its label, which phones read only to a screen reader. */
export function RailAddDisc() {
  return (
    <>
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border-active text-h3 transition-colors group-hover:border-isk-sub lg:size-14 xl:size-16"
      >
        +
      </span>
      <span className="max-lg:sr-only">Add character</span>
    </>
  );
}
