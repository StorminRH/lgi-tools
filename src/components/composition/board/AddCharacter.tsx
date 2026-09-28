'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { startCharacterLink } from '@/platform/auth/link-character';

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
      className={cn(
        'group relative shrink-0 gap-3 rounded-card font-data text-ui text-muted transition-colors hover:text-isk',
        placement === 'rail' ? 'w-16 flex-col lg:w-full lg:flex-row' : 'self-start py-1',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-active text-h3 transition-colors group-hover:border-isk-sub',
          placement === 'rail' ? 'size-12 lg:max-xl:size-14 xl:size-16' : 'size-7 text-ui',
        )}
      >
        +
      </span>
      <span className={placement === 'rail' ? 'max-lg:sr-only' : undefined}>Add character</span>
    </Button>
  );
}
