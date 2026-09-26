'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cardSurface } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Pill } from '@/components/ui/pill';

/** The glass card shared by the route error boundaries; logs the error once. */
export function ErrorPanel({
  source,
  error,
  onRetry,
  eyebrow,
  title,
  children,
}: {
  source: string;
  error: Error & { digest?: string };
  onRetry: () => void;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  useEffect(() => {
    console.error(`[${source}]`, error);
  }, [source, error]);

  const digest = error.digest;
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-20">
      <div className={cn(cardSurface, 'reveal flex w-full max-w-[720px] flex-col items-center gap-8 rounded-panel px-6 py-12 text-center sm:px-12')}>
        <header className="flex flex-col items-center gap-3 max-w-[640px]">
          <div className="font-data text-label text-muted tracking-eyebrow uppercase">
            {eyebrow}
          </div>
          <h1 className="font-display font-bold text-hero leading-none tracking-copy uppercase text-name">
            {title}
          </h1>
          {children ? <p className="text-body text-text leading-relaxed">{children}</p> : null}
          {digest && (
            <div className="mt-2 inline-flex items-center gap-2">
              <span className="text-label text-muted tracking-eyebrow uppercase">
                Incident
              </span>
              <Pill tone="neutral">{digest}</Pill>
            </div>
          )}
        </header>

        <div className="flex items-center gap-3">
          <Button type="button" variant="primary" onClick={onRetry}>Try again</Button>
          <Link href="/" className={cn(buttonVariants({ variant: 'secondary' }))}>
            Warp to home
          </Link>
        </div>
      </div>
    </div>
  );
}
