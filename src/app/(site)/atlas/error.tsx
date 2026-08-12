'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';

/**
 * Renders a viewport-filling recovery surface for unhandled atlas-route errors.
 */
export default function AtlasError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[atlas/error.tsx]', error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="font-data text-label uppercase tracking-eyebrow text-muted">
        Atlas signal lost
      </div>
      <h1 className="font-display text-display font-bold uppercase tracking-copy text-name">
        Map unavailable
      </h1>
      <div className="flex items-center gap-3">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Link href="/" className={cn(buttonVariants({ variant: 'secondary' }))}>
          Warp to home
        </Link>
      </div>
    </div>
  );
}
