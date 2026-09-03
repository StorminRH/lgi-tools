'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-20 gap-8 text-center">
      <header className="flex flex-col items-center gap-3 max-w-[640px]">
        <div className="font-data text-label text-muted tracking-eyebrow uppercase">
          500 · Containment breach
        </div>
        <h1 className="font-display font-bold text-hero leading-none tracking-copy uppercase text-name">
          Pod malfunction
        </h1>
        <p className="text-body text-text leading-relaxed">
          Something failed unexpectedly. The crash has been logged. You can try the same
          page again, or warp back to the home screen.
        </p>
        {error.digest && (
          <div className="mt-2 inline-flex items-center gap-2">
            <span className="text-label text-muted tracking-eyebrow uppercase">
              Incident
            </span>
            <Pill tone="neutral">{error.digest}</Pill>
          </div>
        )}
      </header>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => unstable_retry()}>Try again</Button>
        <Link href="/" className={cn(buttonVariants({ variant: 'secondary' }))}>
          Warp to home
        </Link>
      </div>
    </div>
  );
}
