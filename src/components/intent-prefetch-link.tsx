'use client';

import Link from 'next/link';
import { type ComponentProps, useState } from 'react';

/**
 * A link that prefetches its whole destination, the page's own URL data
 * included, once the pilot points at it, focuses it or touches it. Until then
 * it prefetches only the route's shared shell: a list of links each
 * prefetching its full page on sight would cost a server call apiece.
 */
export function IntentPrefetchLink({
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={intent ? true : null}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
