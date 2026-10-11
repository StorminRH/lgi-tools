'use client';

import { Button } from '@/components/ui/button';
import { startCharacterLink } from '@/platform/auth/link-character';
import { RailAddDisc, railAddTrigger } from './focus-rail';

/**
 * Link another EVE character, quietly: the last entry of the pilot rail (a
 * "+" disc on the phone strip), or a plain line under a lone pilot's column.
 */
export function AddCharacter({ placement }: { placement: 'rail' | 'column' }) {
  return (
    <Button
      variant="bare"
      aria-label="Add character"
      onClick={() => startCharacterLink('/')}
      className={
        placement === 'rail'
          ? railAddTrigger
          : 'group shrink-0 gap-3 self-start rounded-card py-1 font-data text-ui text-muted transition-colors hover:text-isk'
      }
    >
      {placement === 'rail' ? (
        <RailAddDisc />
      ) : (
        <>
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-border-active text-ui transition-colors group-hover:border-isk-sub"
          >
            +
          </span>
          <span>Add character</span>
        </>
      )}
    </Button>
  );
}
