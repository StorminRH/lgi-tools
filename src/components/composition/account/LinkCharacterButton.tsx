'use client';

import { Button } from '@/components/ui/button';
import { startCharacterLink } from '@/platform/auth/link-character';

export function LinkCharacterButton({
  label = 'Link another character',
  emphasis = 'primary',
  callbackURL = '/characters',
}: {
  label?: string;
  emphasis?: 'primary' | 'reconnect';

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
