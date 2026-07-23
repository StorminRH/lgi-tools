'use client';

import { Button } from '@/components/ui/button';
import { startCharacterLink } from '@/platform/auth/link-character';

/** Starts the EVE OAuth character-link flow while preserving the current return path. */
export function LinkCharacterButton({
  label = 'Link another character',
  emphasis = 'primary',
  callbackURL = '/characters',
}: {
  label?: string;
  emphasis?: 'primary' | 'reconnect';
  // Where the OAuth round-trip returns to (success + error). Defaults to the
  // Characters page; the home roster points it back at `/`.
  callbackURL?: string;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => startCharacterLink(callbackURL)}
      className={
        emphasis === 'reconnect' ? 'text-tone-orange whitespace-nowrap' : 'text-isk'
      }
    >
      {label}
    </Button>
  );
}
