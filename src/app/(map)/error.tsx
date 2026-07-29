'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Map-group error boundary. Fills the viewport rather than falling through to
 * an unstyled default page outside the map frame.
 */
export default function MapError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error('[map/error.tsx]', error);
  }, [error]);

  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display font-bold text-hero uppercase tracking-copy text-name">
        Map signal lost
      </h1>
      <p className="text-body text-text">
        Something failed rendering the map. You can retry or leave this route.
      </p>
      <Button type="button" variant="primary" onClick={() => unstable_retry()}>
        Try again
      </Button>
    </div>
  );
}
